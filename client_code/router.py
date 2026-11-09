"""Page addresses: #name/arg1/arg2 -> a page Form (open_form), with sign-in rules. Same addresses as the JavaScript
version, so links people shared (#trace/<id>, #library/<category>, #showcase/share/<id>) keep working.

Links in templates are plain <a href="#studio">; code calls router.go("edit", project_id).

    PAGES[name] = (who may open it, browser-tab title)   who: None = anyone, "guest" = signed out only, "user", "admin"
    NAV = the main menu (header + phone tab bar): (page, label, icon). Visitors see it too (they can trace without an
          account), except on the sign-in page.
    CHROMELESS = pages that fill the screen with no header, footer or tab bar (the tracing session)
New page: add it to PAGES, to _form() and (if it belongs in the menu) to NAV.
"""
import anvil
import anvil.js
from anvil.js import window

from . import state

PAGES = {
    "landing": (None, "Trace any picture onto your wall"),
    "auth": ("guest", "Sign in"),
    "studio": (None, "Studio"),
    "library": (None, "Stencil library"),
    "showcase": (None, "Showcase"),
    "guide": (None, "Guide"),
    "edit": (None, "Adjust"),
    "trace": (None, "Trace"),
    "profile": ("user", "Your profile"),
    "admin": ("admin", "Admin"),
}
NAV = [("studio", "Studio", "image"), ("library", "Library", "layers"), ("showcase", "Showcase", "heart"),
       ("guide", "Guide", "info")]
CHROMELESS = {"trace"}
APP_NAME = "WallTracer"
_r: dict = {"after": "", "listening": False, "page": ""}


def _form(name):
    """The page's Form class (imported when first needed, so start-up stays quick)."""
    if name == "landing":
        from .Pages.Landing import Landing
        return Landing
    if name == "auth":
        from .Pages.Auth import Auth
        return Auth
    if name == "studio":
        from .Pages.Studio import Studio
        return Studio
    if name == "library":
        from .Pages.Library import Library
        return Library
    if name == "showcase":
        from .Pages.Showcase import Showcase
        return Showcase
    if name == "guide":
        from .Pages.Guide import Guide
        return Guide
    if name == "edit":
        from .Pages.Edit import Edit
        return Edit
    if name == "trace":
        from .Pages.Trace import Trace
        return Trace
    if name == "profile":
        from .Pages.Profile import Profile
        return Profile
    from .Pages.Admin import Admin
    return Admin


def parse(hash_text):
    h = (hash_text or "").lstrip("#").lstrip("!").lstrip("/").split("?")[0]
    parts = [window.decodeURIComponent(p) for p in h.split("/") if p]
    return (parts[0] if parts else ""), parts[1:]


def href(name, *args):
    """'#name/arg1/arg2' with every part URL-encoded (row ids contain brackets and commas)."""
    return "#" + "/".join([name] + [window.encodeURIComponent(str(a)) for a in args if a not in (None, "")])


def home_page():
    return "studio" if state.me() else "landing"


def current():
    """The name of the page on screen."""
    return _r["page"]


def show():
    """Open the page for the current address."""
    name, args = parse(window.location.hash)
    if name not in PAGES:
        name, args = home_page(), []
    who = PAGES[name][0]
    if who == "guest" and state.me():
        name, args = "studio", []
    elif who in ("user", "admin") and not state.me():
        _r["after"] = window.location.hash
        name, args = "auth", []
    elif who == "admin" and not state.is_admin():
        state.toast("That page is for admins only.", "error")
        name, args = "studio", []
    _r["page"] = name
    window.document.title = PAGES[name][1] + " · " + APP_NAME
    window.UI_READY = False
    page = _form(name)(args=args)
    anvil.open_form(page)
    shell = getattr(page, "layout", None)
    if shell is not None and hasattr(shell, "refresh"):
        shell.refresh(name)  # Anvil reuses the layout between pages: tell it who is signed in and which page is open
    window.scrollTo(0, 0)
    if not getattr(page, "waits", False):
        window.UI_READY = True  # tests and screenshots wait for this (engine pages set it when their screen is ready)


def go(name, *args):
    """Go to a page. Same address again = reload the page."""
    target = href(name, *args)
    if window.location.hash == target:
        show()
    else:
        window.location.hash = target


def replace(name, *args):
    """Change the address without opening anything (a page that switches its own view)."""
    window.history.replaceState(None, "", href(name, *args))


def after_sign_in():
    """Where to go once someone signs in: the page they were heading for, or the studio."""
    target = _r["after"]
    _r["after"] = ""
    if target and target != window.location.hash:
        window.location.hash = target
    else:
        go("studio")


def remember_after(target):
    _r["after"] = target


def _on_hash(event):
    show()


def start():
    if not _r["listening"]:
        window.addEventListener("hashchange", anvil.js.report_exceptions(_on_hash))
        _r["listening"] = True
    show()
