from anvil import *

from ._anvil_designer import ScreenTemplate
from ... import wt


class Screen(ScreenTemplate):
    """An engine screen (wt-screens.js) in a page: UI.mountScreen(name, element, args) on show, destroy() on hide.
    The engine draws its own markup, saves by itself (WT.store) and shows toasts / confirms through WT.host."""

    def __init__(self, **properties):
        self.screen = ""
        self._args = []
        self.ctl = wt.NULL
        super().__init__(**properties)

    def mount(self, args):
        self._args = [str(a) for a in (args or [])]

    @handle("", "show")
    def form_show(self, **event_args):
        self.destroy()
        self.ctl = wt.UI.mountScreen(self.screen, self.dom_nodes["host"], wt.js_value(self._args))

    @handle("", "hide")
    def form_hide(self, **event_args):
        self.destroy()

    def destroy(self):
        if self.ctl is not None:
            self.ctl.destroy()
            self.ctl = wt.NULL
