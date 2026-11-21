from anvil import *

from ._anvil_designer import PrintTemplate


class Print(PrintTemplate):
    """#print/<id>: Print at real size. Tiles on A4 / Letter with overlap and page names, a map page, and a grid sheet
    with every square's real size: theme/assets/wt-flat.js, screen "print"."""

    waits = True  # router: the screen sets UI_READY itself once the project has loaded

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.screen.mount(list(args))
