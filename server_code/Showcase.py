"""Showcase: photos of finished walls. Members post one; an admin approves it before everyone sees it.
Others see the poster's first name + initial only, never their email.
"""
import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from . import DemoData

STATUSES = ("pending", "approved", "rejected")


def _post(r, me, admin=False):
    liked = r["liked_by"] or []
    d = {"id": r.get_id(), "title": r["title"], "caption": r["caption"] or "", "thumb": r["thumb"], "by": C.short_name(r["user"]),
         "likes": r["likes"] or 0, "liked": bool(me is not None and me.get_id() in liked), "minutes": r["minutes"] or 0,
         "width_cm": r["width_cm"] or 0, "created": C.iso(r["created"]), "status": r["status"], "demo": bool(r["is_demo"]),
         "mine": me is not None and r["user"] == me}
    if admin:
        d["email"] = r["user"]["email"] if r["user"] is not None else ""
    return d


@anvil.server.callable
def list_showcase(sort="new"):
    """Approved posts for everyone. sort: 'new' or 'top'."""
    DemoData.ensure_loaded()
    me = C.me()
    rows = list(app_tables.showcase.search(tables.order_by("created", ascending=False), status="approved"))
    if sort == "top":
        rows.sort(key=lambda r: -(r["likes"] or 0))
    return {"posts": [_post(r, me) for r in rows[:120]], "total": len(rows)}


@anvil.server.callable
def get_showcase_photo(post_id):
    me = C.me()
    r = C.row_by_id(app_tables.showcase, post_id)
    if r is None or not (r["status"] == "approved" or (me is not None and (r["user"] == me or C.is_admin(me)))):
        return C.fail("That photo isn't available.")
    return C.ok(photo=C.data_url(r["photo"]), post=_post(r, me))


@anvil.server.callable(require_user=True)
def post_showcase(data):
    """data: title, caption, photo (data URL), thumb, minutes, width_cm."""
    me = C.require_user()
    if not isinstance(data, dict):
        return C.fail("Nothing to post.")
    title = C.text(data.get("title"), 80)
    if len(title) < 2:
        return C.fail("Give your wall a title.")
    photo = C.media_from_data_url(data.get("photo"), name="wall")
    if photo is None:
        return C.fail("Add a photo of your wall (JPEG, PNG or WebP).")
    if C.rate_limited("post_showcase", 5, 86400):
        return C.fail("You can share up to 5 walls a day. Thank you for all the art!")
    try:
        minutes = max(0, min(100000, int(float(data.get("minutes") or 0))))
        width = max(0, min(1000, int(float(data.get("width_cm") or 0))))
    except (TypeError, ValueError):
        minutes, width = 0, 0
    r = app_tables.showcase.add_row(user=me, title=title, caption=C.text(data.get("caption"), 600, multiline=True), photo=photo,
                                    thumb=C.clean_thumb(data.get("thumb")), status="approved" if C.is_admin(me) else "pending",
                                    likes=0, liked_by=[], minutes=minutes, width_cm=width, created=C.now(), is_demo=False)
    return C.ok(post=_post(r, me))


@anvil.server.callable(require_user=True)
def my_showcase():
    me = C.require_user()
    rows = app_tables.showcase.search(tables.order_by("created", ascending=False), user=me)
    return {"posts": [_post(r, me) for r in rows]}


@anvil.server.callable(require_user=True)
def like_showcase(post_id):
    me = C.require_user()
    r = C.row_by_id(app_tables.showcase, post_id)
    if r is None or r["status"] != "approved":
        return C.fail("That post isn't available.")
    liked = list(r["liked_by"] or [])
    uid = me.get_id()
    if uid in liked:
        liked.remove(uid)
        r.update(liked_by=liked, likes=max(0, (r["likes"] or 0) - 1))
    else:
        liked.append(uid)
        r.update(liked_by=liked, likes=(r["likes"] or 0) + 1)
    return C.ok(post=_post(r, me))


@anvil.server.callable(require_user=True)
def delete_showcase(post_id):
    me = C.require_user()
    r = C.row_by_id(app_tables.showcase, post_id)
    if r is None:
        return C.ok()
    if r["user"] != me and not C.is_admin(me):
        return C.fail("You can only delete your own posts.")
    r.delete()
    return C.ok()


# ------------------------------------------------------------------------------------------------ admin
@anvil.server.callable(require_user=True)
def admin_showcase(status="pending"):
    me = C.require_admin()
    status = status if status in STATUSES else "pending"
    rows = app_tables.showcase.search(tables.order_by("created", ascending=False), status=status)
    counts = {s: len(app_tables.showcase.search(status=s)) for s in STATUSES}
    return {"posts": [_post(r, me, admin=True) for r in rows], "counts": counts}


@anvil.server.callable(require_user=True)
def admin_set_showcase(post_id, status):
    me = C.require_admin()
    if status not in STATUSES:
        return C.fail("Unknown status.")
    r = C.row_by_id(app_tables.showcase, post_id)
    if r is None:
        return C.fail("That post no longer exists.")
    r["status"] = status
    return C.ok(post=_post(r, me, admin=True))


def pending_count():
    return len(app_tables.showcase.search(status="pending"))
