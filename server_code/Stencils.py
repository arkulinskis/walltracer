"""The stencil library: ready-to-trace pictures anyone can start a project from.

Built-in stencils come from StencilArt.py (SVG, seeded by ensure_builtin()); admins can add their own pictures,
edit titles and categories, hide (unpublish) or delete them in Admin -> Stencils.
"""
import anvil
import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from . import StencilArt

CATEGORIES = ["Botanical", "Animals", "Kids", "Patterns", "Landscapes", "Objects", "Lettering", "Templates", "Other"]
LEVELS = ["Easy", "Medium", "Detailed"]


def ensure_builtin():
    """Store (or refresh) the built-in stencils once per StencilArt.VERSION. Admin edits to title/category/published stay."""
    if C.get_setting("stencils_version") == StencilArt.VERSION:
        return
    for i, s in enumerate(StencilArt.STENCILS):
        art = s["draw"]()
        media = anvil.BlobMedia("image/svg+xml", art.encode("utf-8"), name=s["key"] + ".svg")
        w, h = _svg_size(art)
        row = app_tables.stencils.get(key=s["key"])
        if row is None:
            app_tables.stencils.add_row(key=s["key"], title=s["title"], category=s["category"], level=s["level"], cm=s["cm"],
                                        blurb=s["blurb"], credit="WallTracer originals", image=media, thumb=C.svg_data_url(art),
                                        width_px=w, height_px=h, published=True, builtin=True, uses=0, order=i, created=C.now())
        else:
            row.update(image=media, thumb=C.svg_data_url(art), width_px=w, height_px=h, builtin=True)
    C.set_setting("stencils_version", StencilArt.VERSION)


def _svg_size(art):
    import re
    m = re.search(r'viewBox="0 0 (\d+) (\d+)"', art)
    return (int(m.group(1)), int(m.group(2))) if m else (1000, 1000)


def _stencil(r, admin=False):
    d = {"id": r.get_id(), "key": r["key"], "title": r["title"], "category": r["category"] or "Other", "level": r["level"] or "Medium",
         "cm": r["cm"] or 100, "blurb": r["blurb"] or "", "credit": r["credit"] or "", "thumb": r["thumb"],
         "w": r["width_px"] or 1000, "h": r["height_px"] or 1000, "uses": r["uses"] or 0, "builtin": bool(r["builtin"])}
    if admin:
        d["published"] = bool(r["published"])
    return d


@anvil.server.callable
def list_stencils():
    """The public library (published stencils), in display order."""
    ensure_builtin()
    rows = app_tables.stencils.search(tables.order_by("order"), published=True)
    return {"stencils": [_stencil(r) for r in rows], "categories": CATEGORIES}


@anvil.server.callable
def get_stencil(stencil_id):
    """One stencil with its full picture (a data URL), for previews and for starting a project."""
    r = C.row_by_id(app_tables.stencils, stencil_id)
    if r is None or not (r["published"] or C.is_admin(C.me())):
        return C.fail("That stencil isn't in the library any more.")
    d = _stencil(r)
    d["image"] = C.data_url(r["image"])
    return C.ok(stencil=d)


# ------------------------------------------------------------------------------------------------ admin
@anvil.server.callable(require_user=True)
def admin_stencils():
    C.require_admin()
    ensure_builtin()
    rows = app_tables.stencils.search(tables.order_by("order"))
    return {"stencils": [_stencil(r, admin=True) for r in rows], "categories": CATEGORIES, "levels": LEVELS}


def _clean_meta(data):
    title = C.text(data.get("title"), 80)
    if len(title) < 2:
        return None, "Give the stencil a title."
    category = data.get("category") if data.get("category") in CATEGORIES else "Other"
    level = data.get("level") if data.get("level") in LEVELS else "Medium"
    try:
        cm = max(5, min(1000, int(float(data.get("cm") or 100))))
    except (TypeError, ValueError):
        cm = 100
    return {"title": title, "category": category, "level": level, "cm": cm, "blurb": C.text(data.get("blurb"), 400),
            "credit": C.text(data.get("credit"), 120)}, None


@anvil.server.callable(require_user=True)
def admin_add_stencil(data):
    """data: title, category, level, cm, blurb, credit, image (data URL, PNG/JPEG/WebP), thumb, w, h."""
    C.require_admin()
    if not isinstance(data, dict):
        return C.fail("Nothing to save.")
    meta, err = _clean_meta(data)
    if err:
        return C.fail(err)
    media = C.media_from_data_url(data.get("image"), name="stencil")
    if media is None:
        return C.fail("Choose a PNG, JPEG or WebP picture (up to about 4 MB).")
    last = [r["order"] or 0 for r in app_tables.stencils.search()]
    r = app_tables.stencils.add_row(key="custom-%s" % C.now().strftime("%Y%m%d%H%M%S%f"), image=media,
                                    thumb=C.clean_thumb(data.get("thumb")), width_px=int(data.get("w") or 1000),
                                    height_px=int(data.get("h") or 1000), published=True, builtin=False, uses=0,
                                    order=(max(last) + 1) if last else 0, created=C.now(), **meta)
    return C.ok(stencil=_stencil(r, admin=True))


@anvil.server.callable(require_user=True)
def admin_update_stencil(stencil_id, data):
    C.require_admin()
    r = C.row_by_id(app_tables.stencils, stencil_id)
    if r is None:
        return C.fail("That stencil no longer exists.")
    if not isinstance(data, dict):
        return C.fail("Nothing to save.")
    changes = {}
    if "published" in data:
        changes["published"] = bool(data["published"])
    if "title" in data:
        meta, err = _clean_meta(dict({"title": r["title"], "category": r["category"], "level": r["level"], "cm": r["cm"],
                                      "blurb": r["blurb"], "credit": r["credit"]}, **data))
        if err:
            return C.fail(err)
        changes.update(meta)
    if "move" in data and data["move"] in (-1, 1):
        rows = list(app_tables.stencils.search(tables.order_by("order")))
        i = rows.index(r)
        j = i + data["move"]
        if 0 <= j < len(rows):
            rows[i], rows[j] = rows[j], rows[i]
            for k, row in enumerate(rows):
                row["order"] = k
    if changes:
        r.update(**changes)
    return C.ok(stencil=_stencil(r, admin=True))


@anvil.server.callable(require_user=True)
def admin_delete_stencil(stencil_id):
    C.require_admin()
    r = C.row_by_id(app_tables.stencils, stencil_id)
    if r is None:
        return C.ok()
    if r["builtin"]:
        return C.fail("Built-in stencils can't be deleted (they come back with updates). Hide it instead.")
    r.delete()
    return C.ok()


def bump_uses(stencil_row):
    stencil_row["uses"] = (stencil_row["uses"] or 0) + 1
