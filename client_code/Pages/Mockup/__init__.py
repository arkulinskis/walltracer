from anvil import *

from ._anvil_designer import MockupTemplate


class Mockup(MockupTemplate):
    """#mockup/<id>: See it on my wall. A photo of the wall (kept in this browser) with the picture pinned on it by its
    corners, real-size placement, opacity, Download picture: theme/assets/wt-flat.js, screen "mockup"."""

    waits = True  # router: the screen sets UI_READY itself once the project has loaded

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.screen.mount(list(args))
