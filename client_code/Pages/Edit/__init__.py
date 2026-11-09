from anvil import *

from ._anvil_designer import EditTemplate


class Edit(EditTemplate):
    """#edit/<id>: the picture editor (live preview + every display setting, autosave), a JavaScript engine in
    Components/Screen (theme/assets/wt-screens.js, screen "edit")."""

    waits = True  # router: the screen sets UI_READY itself once the project has loaded

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.screen.mount(list(args))
