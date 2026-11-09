from anvil import *
import anvil.js

from ._anvil_designer import StencilCardTemplate
from ... import state, wt

LEVEL = {"Easy": "good", "Medium": "warn", "Detailed": "brand"}


class StencilCard(StencilCardTemplate):
    """A stencil in the library (item = {s, host}), or the Lettering maker card (item = {letter: True, host})."""

    def __init__(self, **properties):
        super().__init__(**properties)
        if self.item.get("letter"):
            self.card.classes["letter"] = True
            self.pic.visible = False
            self.dom_nodes["title"].textContent = "Lettering maker"
            self._badge(self.level, "Your words", "accent")
            self.dom_nodes["width"].textContent = "8 fonts"
            self.uses_badge.visible = False
            return
        s = self.item["s"]
        self.letter_art.visible = False
        state.set_attr(self.pic, "src", s.get("thumb") or "")
        self.dom_nodes["title"].textContent = s.get("title") or ""
        self._badge(self.level, s.get("level") or "", LEVEL.get(s.get("level"), ""))
        self.dom_nodes["width"].textContent = wt.fmt_len(s.get("cm"), "cm") + " wide"
        self.uses_badge.visible = bool(s.get("uses"))
        self.dom_nodes["uses"].textContent = str(s.get("uses") or 0)

    def _badge(self, el, text, tone):
        node = anvil.js.get_dom_node(el)
        node.textContent = text
        if tone:
            el.classes[tone] = True

    def card_click(self, event):
        host = self.item["host"]
        if self.item.get("letter"):
            host.lettering()
        else:
            host.preview(self.item["s"])
