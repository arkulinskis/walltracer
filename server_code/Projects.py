"""Tracing projects: a picture + how to show it (look, colour, size, grid...) + tracing progress. Private to their owner.

Signed-out visitors keep projects in their browser instead (web/pages/_wt.html, WT.store); the same shapes are used, so
"Save to my account" just calls create_project with what the browser has.
"""
import re

import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from . import Stencils

MAX_PROJECTS = 80
LOOKS = ("photo", "lines", "outline", "zones", "stencil")
STATUSES = ("tracing", "done")

# Every project setting: default, then a (min, max) range, a [list] of allowed values, bool, or "color".
SETTINGS = {
    "look": ("lines", list(LOOKS)),
    "detail": (50, (0, 100)),          # outline: edge sensitivity; lines/stencil: darkness threshold
    "levels": (4, (2, 8)),             # zones: how many tones
    "contrast": (0, (-100, 100)),
    "brightness": (0, (-100, 100)),
    "color": ("#00e5ff", "color"),     # line colour in the headset
    "thickness": (2, (1, 6)),
    "halo": (True, bool),              # dark edge round light lines (reads on any wall)
    "invert": (False, bool),
    "mirror": (False, bool),
    "rotate": (0, [0, 90, 180, 270]),
    "opacity": (0.85, (0.1, 1.0)),
    "grid": (False, bool),
    "cols": (4, (1, 16)),
    "labels": (True, bool),
    "marks": (True, bool),             # registration crosses at the corners and centre
    "marks_hidden": (True, bool),      # keep the crosses when the picture is hidden
    "width_cm": (100, (5, 1000)),
    "unit": ("cm", ["cm", "in"]),
    "pencil": ("right", ["right", "left"]),
    "blink": (0, [0, 3, 5, 10]),       # seconds between automatic peeks (0 = off)
    "wall": ("#f3efe8", "color"),      # wall colour for the flat preview
    "rot": (0, (-180, 180)),           # extra turn on the wall, degrees
}
COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def clean_settings(raw, base=None):
    """Merge `raw` over `base` (or the defaults), keeping only known keys with sane values."""
    out = {k: v[0] for k, v in SETTINGS.items()}
    if isinstance(base, dict):
        out.update({k: v for k, v in base.items() if k in SETTINGS})
    if not isinstance(raw, dict):
        return out
    for k, v in raw.items():
        if k not in SETTINGS:
            continue
        default, rule = SETTINGS[k]
        if rule is bool:
            out[k] = bool(v)
        elif rule == "color":
            if isinstance(v, str) and COLOR.match(v):
                out[k] = v.lower()
        elif isinstance(rule, list):
            if v in rule:
                out[k] = v
        else:
            try:
                n = float(v)
            except (TypeError, ValueError):
                continue
            n = max(rule[0], min(rule[1], n))
            out[k] = round(n, 3) if isinstance(default, float) else int(round(n))
    return out


def clean_done(done):
    if not isinstance(done, list):
        return []
    cells = []
    for c in done[:400]:
        if isinstance(c, str) and re.match(r"^\d{1,2},\d{1,2}$", c) and c not in cells:
            cells.append(c)
    return cells


def _count(v):
    try:
        return max(0, min(100000, int(v or 0)))
    except (TypeError, ValueError):
        return 0


def _summary(r):
    return {"id": r.get_id(), "title": r["title"], "thumb": r["thumb"], "w": r["width_px"] or 1000, "h": r["height_px"] or 1000,
            "settings": clean_settings(None, r["settings"]), "done": r["done"] or [], "minutes": round(r["minutes"] or 0, 1),
            "sessions": r["sessions"] or 0, "status": r["status"] or "tracing", "notes": r["notes"] or "", "source": r["source"] or "",
            "created": C.iso(r["created"]), "updated": C.iso(r["updated"]), "last_traced": C.iso(r["last_traced"])}


def _mine(project_id):
    me = C.require_user()
    r = C.row_by_id(app_tables.projects, project_id)
    if r is None or r["user"] != me:
        return me, None
    return me, r


@anvil.server.callable(require_user=True)
def list_projects():
    me = C.require_user()
    rows = list(app_tables.projects.search(tables.order_by("updated", ascending=False), user=me))
    return {"projects": [_summary(r) for r in rows],
            "stats": {"count": len(rows), "minutes": round(sum(r["minutes"] or 0 for r in rows)),
                      "done": len([r for r in rows if r["status"] == "done"])}}


@anvil.server.callable(require_user=True)
def get_project(project_id):
    """One project with its full picture (a data URL)."""
    me, r = _mine(project_id)
    if r is None:
        return C.fail("That project isn't yours, or it was deleted.")
    d = _summary(r)
    d["image"] = C.data_url(r["image"])
    return C.ok(project=d)


@anvil.server.callable(require_user=True)
def create_project(data):
    """data: title, settings, and either stencil_id (start from the library) or image + thumb + w + h (an upload)."""
    me = C.require_user()
    if not isinstance(data, dict):
        return C.fail("Nothing to save.")
    if len(app_tables.projects.search(user=me)) >= MAX_PROJECTS:
        return C.fail("You have %d projects, the most we keep per person. Delete a finished one first." % MAX_PROJECTS)
    if C.rate_limited("create_project", 40, 3600):
        return C.fail("That's a lot of new projects in one hour. Please try again a bit later.")
    title = C.text(data.get("title"), 80) or "Untitled wall"
    settings = clean_settings(data.get("settings"))
    if data.get("stencil_id"):
        st = C.row_by_id(app_tables.stencils, data.get("stencil_id"))
        if st is None or not st["published"]:
            return C.fail("That stencil isn't in the library any more.")
        image, thumb, w, h, source = st["image"], st["thumb"], st["width_px"], st["height_px"], "stencil:" + (st["key"] or "")
        if not data.get("settings"):
            settings = clean_settings({"look": "lines", "width_cm": st["cm"] or 100})
        Stencils.bump_uses(st)
    else:
        image = C.media_from_data_url(data.get("image"), name="project")
        if image is None:
            return C.fail("Choose a JPEG, PNG or WebP picture (up to about 4 MB).")
        thumb = C.clean_thumb(data.get("thumb"))
        try:
            w, h = int(data.get("w") or 0), int(data.get("h") or 0)
        except (TypeError, ValueError):
            w, h = 0, 0
        if not (8 <= w <= 8000 and 8 <= h <= 8000):
            return C.fail("That picture's size looks wrong. Try another picture.")
        source = C.text(data.get("source"), 40) or "upload"
    stamp = C.now()
    r = app_tables.projects.add_row(user=me, title=title, image=image, thumb=thumb, width_px=w, height_px=h, settings=settings,
                                    done=clean_done(data.get("done")), minutes=float(_count(data.get("minutes"))),
                                    sessions=_count(data.get("sessions")),
                                    status="done" if data.get("status") == "done" else "tracing", notes=C.text(data.get("notes"), 2000, multiline=True),
                                    source=source, created=stamp, updated=stamp, last_traced=None, is_demo=False)
    return C.ok(project=_summary(r))


@anvil.server.callable(require_user=True)
def update_project(project_id, patch):
    """patch may hold: title, settings (merged), notes, status, done."""
    me, r = _mine(project_id)
    if r is None:
        return C.fail("That project isn't yours, or it was deleted.")
    if not isinstance(patch, dict):
        return C.fail("Nothing to save.")
    changes = {}
    if "title" in patch:
        t = C.text(patch["title"], 80)
        if len(t) < 1:
            return C.fail("Give the project a name.")
        changes["title"] = t
    if "settings" in patch:
        changes["settings"] = clean_settings(patch["settings"], r["settings"])
    if "notes" in patch:
        changes["notes"] = C.text(patch["notes"], 2000, multiline=True)
    if "status" in patch:
        if patch["status"] not in STATUSES:
            return C.fail("Unknown status.")
        changes["status"] = patch["status"]
    if "done" in patch:
        changes["done"] = clean_done(patch["done"])
    changes["updated"] = C.now()
    r.update(**changes)
    return C.ok(project=_summary(r))


@anvil.server.callable(require_user=True)
def log_session(project_id, minutes, done=None, new_session=False, settings=None):
    """Called from the tracing page every minute or so, and when the session ends."""
    me, r = _mine(project_id)
    if r is None:
        return C.fail("That project isn't yours, or it was deleted.")
    try:
        add = max(0.0, min(240.0, float(minutes or 0)))
    except (TypeError, ValueError):
        return C.fail("Minutes must be a number.")
    changes = {"minutes": round((r["minutes"] or 0) + add, 2), "last_traced": C.now(), "updated": C.now()}
    if new_session:
        changes["sessions"] = (r["sessions"] or 0) + 1
    if done is not None:
        changes["done"] = clean_done(done)
    if isinstance(settings, dict):
        changes["settings"] = clean_settings(settings, r["settings"])
    r.update(**changes)
    return C.ok(project=_summary(r))


@anvil.server.callable(require_user=True)
def duplicate_project(project_id):
    me, r = _mine(project_id)
    if r is None:
        return C.fail("That project isn't yours, or it was deleted.")
    if len(app_tables.projects.search(user=me)) >= MAX_PROJECTS:
        return C.fail("You have %d projects, the most we keep per person." % MAX_PROJECTS)
    stamp = C.now()
    copy = app_tables.projects.add_row(user=me, title=(r["title"] + " (copy)")[:80], image=r["image"], thumb=r["thumb"],
                                       width_px=r["width_px"], height_px=r["height_px"], settings=clean_settings(None, r["settings"]),
                                       done=[], minutes=0, sessions=0, status="tracing", notes=r["notes"], source=r["source"],
                                       created=stamp, updated=stamp, last_traced=None, is_demo=False)
    return C.ok(project=_summary(copy))


@anvil.server.callable(require_user=True)
def delete_project(project_id):
    me, r = _mine(project_id)
    if r is not None:
        r.delete()
    return C.ok()


def stats():
    rows = [r for r in app_tables.projects.search() if not r["is_demo"]]
    return {"projects": len(rows), "minutes": round(sum(r["minutes"] or 0 for r in rows)),
            "finished": len([r for r in rows if r["status"] == "done"])}
