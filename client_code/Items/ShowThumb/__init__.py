from anvil import *

from ._anvil_designer import ShowThumbTemplate
from ... import state


class ShowThumb(ShowThumbTemplate):
    """One wall in the landing page's "Fresh from the showcase" strip. item = a Showcase post {id, title, thumb, ...}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        state.set_attr(self.photo, "src", self.item.get("thumb") or "")
