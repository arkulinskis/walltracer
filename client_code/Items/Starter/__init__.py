from anvil import *

from ._anvil_designer import StarterTemplate
from ... import state


class Starter(StarterTemplate):
    """An easy stencil on the empty studio ("Or start with one of these"). item = {s: the stencil, host: the page}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        s = self.item["s"]
        state.set_attr(self.pic, "src", s.get("thumb") or "")
        self.dom_nodes["label"].textContent = s.get("title") or ""

    def pick_click(self, event):
        self.item["host"].start_from(self.item["s"])
