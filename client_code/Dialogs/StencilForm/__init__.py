from anvil import *

from ._anvil_designer import StencilFormTemplate
from ... import state, wt


class StencilForm(StencilFormTemplate):
    """Admin -> Stencils: add a stencil (from an uploaded picture) or edit one's details. Closes with True once saved."""

    def __init__(self, stencil, categories, levels, **properties):
        self.stencil = stencil
        self.categories = categories
        self.levels = levels
        self.pic = None
        super().__init__(**properties)
        s = stencil or {}
        self.heading.text = "Edit stencil" if stencil else "Add a stencil"
        state.heading(self.heading, 2)
        self.pick_part.visible = not stencil
        self.preview.visible = False
        self.category_box.items = list(categories)
        self.level_box.items = list(levels)
        if s.get("category") in categories:
            self.category_box.selected_value = s["category"]
        if s.get("level") in levels:
            self.level_box.selected_value = s["level"]
        self.title_box.text = s.get("title") or ""
        self.cm_box.text = str(s.get("cm") or 100)
        self.blurb_box.text = s.get("blurb") or ""
        self.credit_box.text = s.get("credit") or ""

    @handle("pick_button", "click")
    def pick_button_click(self, **event_args):
        wt.pick_file(self._picked)

    def _picked(self, file):
        pic = wt.read_picture(file)
        if pic:
            self.pic = pic
            state.set_attr(self.preview, "src", pic.get("thumb") or "")
            self.preview.visible = True
            if not self.title_box.text:
                self.title_box.text = pic.get("title") or ""

    @handle("cancel_button", "click")
    def cancel_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=False)

    @handle("save_button", "click")
    def save_button_click(self, **event_args):
        v = {"title": self.title_box.text or "", "category": self.category_box.selected_value,
             "level": self.level_box.selected_value, "cm": self.cm_box.text or 100,
             "blurb": self.blurb_box.text or "", "credit": self.credit_box.text or ""}
        if self.stencil:
            r = state.call("admin_update_stencil", self.stencil["id"], v)
        else:
            if not self.pic:
                state.toast("Choose a picture first.", "error")
                return
            v.update({"image": self.pic["image"], "thumb": self.pic["thumb"], "w": self.pic["w"], "h": self.pic["h"]})
            r = state.call("admin_add_stencil", v)
        if r is not None:
            self.raise_event("x-close-alert", value=True)
