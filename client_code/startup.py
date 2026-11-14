"""The app starts here (anvil.yaml: startup module). One server call to learn who is signed in (Anvil's loading
spinner shows meanwhile), the Privacy & Terms kit, the engines' bridge (wt.setup), then the page for the address."""
import anvil.server

from . import legal, router, state, wt
from . import session_guard

session_guard.start()  # an expired server session reloads quietly instead of "Session expired, refresh now"

LEGAL_THEME = {"accent": "#c4552d"}  # colours for the Privacy & Terms page (match --c-brand in app.css)

legal.setup(LEGAL_THEME)
wt.setup()
state.set_me(anvil.server.call("get_me"))
if state.me():
    legal.refresh_soon()
router.start()
