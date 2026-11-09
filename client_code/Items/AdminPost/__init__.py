from anvil import *

from ._anvil_designer import AdminPostTemplate
from ... import state


class AdminPost(AdminPostTemplate):
    """Admin -> Showcase: one shared wall to approve / reject / delete. item = {post, host: the Admin page}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        p = self.item["post"]
        state.set_attr(self.photo, "src", p.get("thumb") or "")
        self.demo_badge.visible = bool(p.get("demo"))
        self.who.text = "%s · %s · %s" % (p.get("by") or "", p.get("email") or "", state.ago(p.get("created")))
        self.caption.text = p.get("caption") or ""
        self.caption.visible = bool(p.get("caption"))
        self.approve_button.visible = p.get("status") != "approved"
        self.reject_button.visible = p.get("status") != "rejected"
        state.set_control_attr(self.delete_button, "aria-label", "Delete %s" % p.get("title"))

    @handle("approve_button", "click")
    def approve_button_click(self, **event_args):
        self.item["host"].set_post(self.item["post"], "approved")

    @handle("reject_button", "click")
    def reject_button_click(self, **event_args):
        self.item["host"].set_post(self.item["post"], "rejected")

    @handle("delete_button", "click")
    def delete_button_click(self, **event_args):
        self.item["host"].delete_post(self.item["post"])
