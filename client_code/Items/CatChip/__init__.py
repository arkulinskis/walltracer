from anvil import *

from ._anvil_designer import CatChipTemplate
from ... import state


class CatChip(CatChipTemplate):
    """A category filter chip in the stencil library. item = {cat, on, host}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        on = bool(self.item.get("on"))
        self.chip.role = ["wt-chip", "on"] if on else ["wt-chip"]
        state.set_control_attr(self.chip, "aria-pressed", "true" if on else "false")
        state.set_control_attr(self.chip, "data-key", "cat-" + self.item["cat"])

    @handle("chip", "click")
    def chip_click(self, **event_args):
        self.item["host"].pick_cat(self.item["cat"])
