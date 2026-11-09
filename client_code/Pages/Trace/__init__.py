from anvil import *

from ._anvil_designer import TraceTemplate


class Trace(TraceTemplate):
    """#trace/<id>: the tracing session, full screen (router.CHROMELESS hides the header and footer). WebXR passthrough
    on a Quest (place, adjust, lock, hide with A/X or a pinch) or the practice room on any screen: a JavaScript engine
    in Components/Screen (theme/assets/wt-screens.js, screen "trace"; test hooks window.WT_TRACE)."""

    waits = True  # router: the screen sets UI_READY itself once the project and three.js have loaded

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.screen.mount(list(args))
