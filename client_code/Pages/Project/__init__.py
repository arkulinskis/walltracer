from anvil import *

from ._anvil_designer import ProjectTemplate


class Project(ProjectTemplate):
    """#project/<id>: Projector & lightbox mode, full screen (router.CHROMELESS). The picture with a 4-corner keystone pin
    for a projector, TV or tablet: a JavaScript engine in Components/Screen (theme/assets/wt-flat.js, screen "project")."""

    waits = True  # router: the screen sets UI_READY itself once the project has loaded

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.screen.mount(list(args))
