"""WallTracer's JavaScript engines (theme/assets/wt.js = window.WT, wt-screens.js = the editor and the tracing session)
seen from Python.

The engines turn pictures into coloured lines, keep visitors' projects in the browser (WT.store: IndexedDB for guests,
server calls for members), draw thumbnails and run the editor + WebXR tracing screens. Python reaches them only here:

    wt.setup()              once at start-up: the server bridge (UI.api in the engines) and WT.host (toasts, dialogs)
    wt.store(name, *args)   one WT.store call (list, get, create, update, duplicate, remove, moveToAccount) as a
                            plain Python value; an expected problem shows a toast and gives None
    wt.py_value / js_value  JS <-> plain Python (dicts, lists) through JSON
    wt.fmt_size(p) ...      the engines' formatters, so cards say exactly what the old pages said
"""
import json

import anvil
import anvil.js
from anvil import confirm
import anvil.server
from anvil.js import window

from . import router, state

WT = window.WT
UI = window.UI
NULL = anvil.js.call(window.Function("return null"))  # "no JS object yet", typed for the validator


def py_value(x):
    """JS -> plain Python (dicts, lists, str, numbers). None stays None."""
    if x is None:
        return None
    return json.loads(window.JSON.stringify(x))


def js_value(x):
    """Python -> a real JS object (not a proxy of a Python dict)."""
    return window.JSON.parse(json.dumps(x))


def settle(promise):
    """Wait for an engine promise: {"ok": True, "value": ...} or {"ok": False, "error": "..."} (never raises)."""
    return json.loads(WT.settle(promise))


def attempt(promise, quiet=False):
    """An engine promise's value, or None after showing its error as a toast."""
    r = settle(promise)
    if r.get("ok"):
        return r.get("value")
    if not quiet:
        state.toast(r.get("error") or "That didn't work.", "error")
    return None


# ---------------------------------------------------------------- WT.store (account or this browser)
def store(name, *args):
    fn = getattr(WT.store, name)
    return attempt(fn(*[js_value(a) for a in args]))


def is_device(project_id):
    return str(project_id or "").startswith("d_")


# ---------------------------------------------------------------- formatters (the engines' own, for identical wording)
def settings(p):
    return py_value(WT.settings(js_value((p or {}).get("settings") or {})))


def fmt_size(p):
    return str(WT.fmtSize(js_value(p)))


def fmt_len(cm, unit="cm"):
    return str(WT.fmtLen(cm or 0, unit))


def fmt_minutes(m):
    return str(WT.fmtMinutes(m or 0))


def look_label(key):
    return str(WT.lookLabel(key))


def progress(p):
    """0..1 share of grid cells traced, or None without a grid."""
    v = WT.progress(js_value(p))
    return None if v is None else float(v)


def cells(p):
    return int(py_value(WT.grid(js_value(p))).get("cells") or 0)


def is_dark(hex_colour):
    return bool(WT.isDark(hex_colour or "#ffffff"))


def confetti():
    WT.confetti()


# ---------------------------------------------------------------- engine dialogs that stay JavaScript
def pick_and_create(file=None):
    """Choose a picture (or use a dropped File) and create a project from it. Returns the project or None."""
    return attempt(WT.pickAndCreate(file) if file is not None else WT.pickAndCreate())


def lettering():
    """The lettering maker (a live canvas preview; WT.letteringModal). Returns the new project or None."""
    return attempt(WT.letteringModal(), quiet=True)


def read_picture(file, max_side=None):
    """A File -> {image, thumb, w, h, title} (shrunk in the browser), or None after a toast."""
    return attempt(WT.readPicture(file, max_side) if max_side else WT.readPicture(file))


def pick_file(callback):
    """Open the browser's file picker for one image; callback(file) runs when one is chosen."""
    inp = anvil.js.call(window.Function("var i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; return i;"))

    def changed(event):
        f = WT.firstFile(inp)
        if f:
            callback(f)
    inp.addEventListener("change", anvil.js.report_exceptions(changed))
    getattr(inp, "click")()


def share_photo(file):
    """A photo File -> {image (JPEG data URL), thumb, title} for the Showcase, or None after a toast."""
    return attempt(WT.sharePhoto(file))


# ---------------------------------------------------------------- server calls for the engines (UI.api)
def _bridge(kind, payload_json):
    """Called from JS. Always returns a JSON string: {"result": ...} or {"error": ...}."""
    p = json.loads(payload_json) if payload_json else {}
    try:
        if kind == "call":
            call = anvil.server.call_s if p.get("quiet") else anvil.server.call
            return json.dumps({"result": call(p["fn"], *(p.get("args") or []))})
        return json.dumps({"error": "Unknown request: %s" % kind})
    except Exception as e:
        kind_of = type(e).__name__  # (some of Anvil's exception classes aren't in the validator's stubs)
        if kind_of == "SessionExpiredError":
            return json.dumps({"error": "Your session expired. Reload the page and sign in again.", "reload": True})
        if kind_of == "AppOfflineError":
            return json.dumps({"error": "You seem to be offline. Check your connection and try again."})
        if kind_of == "PermissionDenied":
            return json.dumps({"error": str(e) or "You don't have access to that.", "denied": True})
        print("bridge %s %s failed: %r" % (kind, p.get("fn", ""), e))
        return json.dumps({"error": "Something went wrong. Please try again.", "detail": repr(e)[:300]})


# ---------------------------------------------------------------- WT.host: what the engines ask Python to show
def _toast(message, kind=""):
    state.toast(message, kind or None)


def _confirm(options_json):
    o = json.loads(options_json or "{}")
    return bool(confirm(o.get("text") or "", title=o.get("title") or "Are you sure?",
                        buttons=[(o.get("cancel") or "Cancel", False), (o.get("ok") or "OK", True)], role="app-dialog"))


def _go(target_hash):
    router.show()


def setup():
    window.WT_BRIDGE = _bridge
    WT.host = js_value({})
    for name, fn in (("toast", _toast), ("confirm", _confirm), ("go", _go)):
        WT.host[name] = fn
