"""Demo content, so the app never looks empty: a few demo painters and their finished walls in the Showcase
(drawn as illustrations from the built-in stencils). Loaded automatically the first time anyone opens the Showcase
(ensure_loaded), removed or reloaded from Admin -> Demo data. Removing it is remembered: it doesn't come back.

Demo users have is_demo=True and @example.com emails; they can't sign in (no password). Every demo row
is flagged is_demo=True, so remove() deletes exactly what load() added.
"""
import datetime as dt
import re

from anvil.tables import app_tables

from . import common as C
from . import StencilArt

DEMO_USERS = [
    ("Maya Chen", "maya.demo@example.com"),
    ("Theo Martin", "theo.demo@example.com"),
    ("Ines Ozola", "ines.demo@example.com"),
    ("Kofi Mensah", "kofi.demo@example.com"),
]
# (who, stencil key, title, caption, wall colour, paint colour, minutes, width cm, likes, days ago)
DEMO_POSTS = [
    (0, "mountains", "Mountains over our bed", "Traced over two evenings with the grid on, then painted with a small roller and one brush. "
     "The registration crosses saved me on day two.", "#dfe7e4", "#2f5d62", 210, 240, 41, 2),
    (1, "fox", "A fox for Leo's room", "Straight lines only, so I traced it with a long ruler. My son picked the orange.", "#f1e3c8", "#c4552d", 75, 60, 28, 4),
    (2, "bicycle", "Café chalkboard bike", "Chalk pen on our café's blackboard wall. White lines in the headset were easy to see on black.",
     "#2d3436", "#f5f0e6", 95, 110, 33, 7),
    (3, "monstera", "Monstera above the desk", "My first try. 40 minutes with a pencil, then a fine liner. Blink mode every 5 s helped me catch the slits I missed.",
     "#e9e4da", "#3b7a57", 40, 70, 19, 9),
    (0, "mandala", "Mandala on the patio table", "Projected flat on the table. Painted with outdoor enamel, sealed after.", "#c9b79c", "#7a3e2a", 120, 100, 25, 13),
    (1, "gallery-wall", "Gallery wall, no extra holes", "Traced the nail crosses only, hung six frames in 20 minutes. Never measuring again.",
     "#f4f1ec", "#555555", 25, 240, 52, 16),
    (2, "rainbow", "Nursery rainbow", "Traced at 6 months pregnant, sitting down. Painted by her dad.", "#f7efe6", "#d98b6a", 60, 140, 37, 21),
]
# Tables that hold demo rows (each has an is_demo column). Children before parents.
DEMO_TABLES = ["showcase", "projects"]


def wall_scene(key, wall, paint):
    """An illustration of a painted wall (SVG text): the stencil in `paint` on a `wall`, with a floor and a plant for scale."""
    st = [s for s in StencilArt.STENCILS if s["key"] == key][0]
    art = st["draw"]().replace("#ffffff", wall).replace(StencilArt.INK, paint)
    m = re.search(r'viewBox="0 0 (\d+) (\d+)"', art)
    aw, ah = int(m.group(1)), int(m.group(2))
    W, H, floor = 1200, 900, 760
    box_w, box_h = 760, 560
    s = min(box_w / float(aw), box_h / float(ah))
    w, h = aw * s, ah * s
    x, y = (W - w) / 2, 70 + (box_h - h) / 2
    inner = re.sub(r'^<svg[^>]*>', '<svg x="%.0f" y="%.0f" width="%.0f" height="%.0f" viewBox="0 0 %d %d">' % (x, y, w, h, aw, ah), art)
    inner = re.sub(r'stroke-width="([\d.]+)"', lambda mm: 'stroke-width="%.2f"' % (float(mm.group(1)) * 1.4), inner, count=1)
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">' % (W, H, W, H) +
            '<defs><radialGradient id="light" cx=".3" cy=".1" r="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".22"/>'
            '<stop offset="1" stop-color="#000000" stop-opacity=".12"/></radialGradient></defs>'
            '<rect width="%d" height="%d" fill="%s"/>' % (W, H, wall) +
            inner +
            '<rect width="%d" height="%d" fill="url(#light)"/>' % (W, floor) +
            '<rect y="%d" width="%d" height="22" fill="#f4efe6"/><rect y="%d" width="%d" height="%d" fill="#b58b62"/>' % (floor - 22, W, floor, W, H - floor) +
            ''.join('<path d="M0,%d L%d,%d" stroke="#9c7552" stroke-width="3"/>' % (floor + k * 36, W, floor + k * 36) for k in range(1, 4)) +
            '<path d="M1040,%d l18,-110 h64 l18,110 z" fill="#c4552d"/>' % floor +
            '<path d="M1090,650 C1040,560 1000,520 960,500 M1090,650 C1100,540 1120,480 1160,440 M1090,650 C1070,560 1080,500 1060,430" '
            'stroke="#3b7a57" stroke-width="14" fill="none" stroke-linecap="round"/>' +
            '</svg>')


def state():
    return C.get_setting("demo", "never")  # "never" | "loaded" | "removed"


def ensure_loaded():
    """Call from the app's main public callables: loads the demo once, unless an admin removed it."""
    if state() == "never":
        load()


def load():
    import anvil
    remove(remember=False)
    users = []
    for name, email in DEMO_USERS:
        u = app_tables.users.get(email=email) or app_tables.users.add_row(email=email, enabled=False)
        u.update(display_name=name, is_demo=True, signed_up=C.now() - dt.timedelta(days=40))
        users.append(u)
    for (who, key, title, caption, wall, paint, minutes, width, likes, days) in DEMO_POSTS:
        art = wall_scene(key, wall, paint)
        app_tables.showcase.add_row(user=users[who], title=title, caption=caption,
                                    photo=anvil.BlobMedia("image/svg+xml", art.encode("utf-8"), name=key + "-wall.svg"),
                                    thumb=C.svg_data_url(art), status="approved", likes=likes, liked_by=[], minutes=minutes,
                                    width_cm=width, created=C.now() - dt.timedelta(days=days, hours=who * 3), is_demo=True)
    C.set_setting("demo", "loaded")
    return counts()


def remove(remember=True):
    for name in DEMO_TABLES:
        for r in getattr(app_tables, name).search(is_demo=True):
            r.delete()
    for u in app_tables.users.search(is_demo=True):
        u.delete()
    if remember:
        C.set_setting("demo", "removed")
    return counts()


def counts():
    out = {"users": len(app_tables.users.search(is_demo=True))}
    for name in DEMO_TABLES:
        out[name] = len(getattr(app_tables, name).search(is_demo=True))
    return out
