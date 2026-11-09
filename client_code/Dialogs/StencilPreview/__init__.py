from anvil import *
import anvil.js

from ._anvil_designer import StencilPreviewTemplate
from ... import state, wt
from ...Items.StencilCard import LEVEL


class StencilPreview(StencilPreviewTemplate):
    """A stencil, big, with its level, category, real size and credit. Closes with "use" (Trace this) or None."""

    def __init__(self, stencil, **properties):
        self.stencil = stencil
        super().__init__(**properties)
        s = stencil
        state.set_attr(self.pic, "src", s.get("thumb") or "")
        state.set_attr(self.pic, "alt", s.get("title") or "")
        state.heading(self.title, 2)
        self.title.text = s.get("title") or ""
        anvil.js.get_dom_node(self.level).textContent = s.get("level") or ""
        if LEVEL.get(s.get("level")):
            self.level.classes[LEVEL[s["level"]]] = True
        self.dom_nodes["category"].textContent = s.get("category") or ""
        w, h = s.get("w") or 1, s.get("h") or 1
        self.dom_nodes["size"].textContent = "%s × %s" % (wt.fmt_len(s.get("cm"), "cm"), wt.fmt_len((s.get("cm") or 0) * h / w, "cm"))
        self.blurb.text = s.get("blurb") or ""
        self.credit.text = ("By " + s["credit"]) if s.get("credit") else ""
        self.credit.visible = bool(s.get("credit"))

    @handle("close_button", "click")
    def close_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("use_button", "click")
    def use_button_click(self, **event_args):
        self.raise_event("x-close-alert", value="use")
