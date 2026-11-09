from anvil import *

from ._anvil_designer import AdminStencilTemplate
from ... import state


class AdminStencil(AdminStencilTemplate):
    """Admin -> Stencils: one stencil with reorder, edit, show / hide and delete (built-in ones can't be deleted).
    item = {s, first, last, host: the Admin page}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        s = self.item["s"]
        state.set_attr(self.pic, "src", s.get("thumb") or "")
        self.row.classes["off"] = not s.get("published")
        self.meta.text = "%s · %s · %s cm · used %sx%s" % (s.get("category"), s.get("level"), s.get("cm"), s.get("uses") or 0,
                                                       " · built-in" if s.get("builtin") else "")
        self.up_button.enabled = not self.item.get("first")
        self.down_button.enabled = not self.item.get("last")
        self.pub_button.text = "Hide" if s.get("published") else "Show"
        self.delete_button.visible = not s.get("builtin")
        title = s.get("title") or ""
        for btn, label in ((self.up_button, "Move %s up"), (self.down_button, "Move %s down"), (self.edit_button, "Edit %s"),
                           (self.delete_button, "Delete %s")):
            state.set_control_attr(btn, "aria-label", label % title)

    @handle("up_button", "click")
    def up_button_click(self, **event_args):
        self.item["host"].update_stencil(self.item["s"], {"move": -1})

    @handle("down_button", "click")
    def down_button_click(self, **event_args):
        self.item["host"].update_stencil(self.item["s"], {"move": 1})

    @handle("edit_button", "click")
    def edit_button_click(self, **event_args):
        self.item["host"].stencil_form(self.item["s"])

    @handle("pub_button", "click")
    def pub_button_click(self, **event_args):
        self.item["host"].update_stencil(self.item["s"], {"published": not self.item["s"].get("published")})

    @handle("delete_button", "click")
    def delete_button_click(self, **event_args):
        self.item["host"].delete_stencil(self.item["s"])
