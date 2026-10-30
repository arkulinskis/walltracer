"""Shared server helpers: time, permissions, input cleaning, rate limits, app settings.

Every other server module imports this as `from . import common as C`.
Rules every callable follows:
  - check who is calling (C.me() / C.require_user() / C.require_admin()) before touching data
  - return JSON-friendly values only (dicts, lists, str, numbers, bools, None); dates via C.iso()
  - expected problems return C.fail("Message the user can read"); the page shows it
"""
import datetime as dt
import re

import anvil.server
import anvil.users
from anvil.tables import app_tables


def now():
    return dt.datetime.now(dt.timezone.utc)


def iso(v):
    """date/datetime -> ISO string (datetimes in UTC), anything else unchanged."""
    if isinstance(v, dt.datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=dt.timezone.utc)
        return v.astimezone(dt.timezone.utc).isoformat()
    if isinstance(v, dt.date):
        return v.isoformat()
    return v


def fail(message):
    return {"ok": False, "error": message}


def ok(**data):
    data["ok"] = True
    return data


def text(value, limit=200, multiline=False):
    """Clean user text: str, trimmed, length-capped; single-line unless multiline."""
    s = "" if value is None else str(value)
    s = s.replace("\r\n", "\n").strip()
    if not multiline:
        s = re.sub(r"\s+", " ", s)
    else:
        s = re.sub(r"\n{3,}", "\n\n", s)
    return s[:limit]


def me():
    return anvil.users.get_user()


def require_user():
    u = anvil.users.get_user()
    if u is None:
        raise anvil.server.PermissionDenied("Please sign in first.")
    return u


def is_admin(user):
    return bool(user is not None and user["is_admin"])


def require_admin():
    u = require_user()
    if not is_admin(u):
        raise anvil.server.PermissionDenied("Only admins can do that.")
    return u


def name_of(user):
    if user is None:
        return "Someone"
    return user["display_name"] or (user["email"] or "Someone").split("@")[0].capitalize()


def row_by_id(table, row_id):
    """get_by_id that returns None for a missing or malformed id (ids come from the browser)."""
    if not isinstance(row_id, str) or not row_id:
        return None
    try:
        return table.get_by_id(row_id)
    except Exception:
        return None


def rate_limited(key, limit, seconds):
    """True if this browser session already did `key` `limit` times in the last `seconds`."""
    stamp = now()
    store = "rate_" + key
    recent = [t for t in (anvil.server.session.get(store) or [])
              if (stamp - dt.datetime.fromisoformat(t)).total_seconds() < seconds]
    if len(recent) >= limit:
        return True
    anvil.server.session[store] = recent + [stamp.isoformat()]
    return False


def get_setting(key, default=None):
    row = app_tables.app_settings.get(key=key)
    return default if row is None else row["value"]


def set_setting(key, value):
    row = app_tables.app_settings.get(key=key)
    if row is None:
        app_tables.app_settings.add_row(key=key, value=value)
    else:
        row["value"] = value


# ----------------------------------------------------------------------------------------------- pictures
# Pictures travel between the browser and the server as data URLs ("data:image/png;base64,...").
# The browser always shrinks them first (max 2400 px), so they stay a few hundred KB.
import base64 as _b64

PHOTO_TYPES = ("image/jpeg", "image/png", "image/webp")
MAX_IMAGE_CHARS = 6 * 1024 * 1024    # a data URL longer than this is refused (about 4.5 MB of picture)
MAX_THUMB_CHARS = 160 * 1024


def media_from_data_url(data_url, allowed=PHOTO_TYPES, name="picture"):
    """A data URL from the browser -> anvil.BlobMedia, or None when it isn't an allowed picture."""
    import anvil
    if not isinstance(data_url, str) or not data_url.startswith("data:") or len(data_url) > MAX_IMAGE_CHARS:
        return None
    head, _, body = data_url.partition(",")
    ctype = head[5:].split(";")[0].lower()
    if ctype not in allowed or ";base64" not in head:
        return None
    try:
        raw = _b64.b64decode(body, validate=True)
    except Exception:
        return None
    if len(raw) < 32:
        return None
    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg"}.get(ctype, "bin")
    return anvil.BlobMedia(ctype, raw, name="%s.%s" % (name, ext))


def data_url(media):
    """anvil Media -> data URL string (or None)."""
    if media is None:
        return None
    raw = media.get_bytes()
    if not raw:
        return None
    return "data:%s;base64,%s" % (media.content_type or "application/octet-stream", _b64.b64encode(raw).decode("ascii"))


def svg_data_url(svg_text):
    return "data:image/svg+xml;base64," + _b64.b64encode(svg_text.encode("utf-8")).decode("ascii")


def clean_thumb(thumb, allow_svg=False):
    """A small preview picture (data URL) from the browser, or None. SVG only for pictures the server made itself."""
    if isinstance(thumb, str) and thumb.startswith("data:image/") and len(thumb) <= MAX_THUMB_CHARS and ";base64," in thumb[:40]:
        ctype = thumb[5:thumb.index(";")]
        if ctype in PHOTO_TYPES or (allow_svg and ctype == "image/svg+xml"):
            return thumb
    return None


def short_name(user):
    """'Maya C.': what other people see of someone (never their email)."""
    n = name_of(user).split()
    if not n:
        return "Someone"
    return n[0] if len(n) == 1 else "%s %s." % (n[0], n[-1][0].upper())
