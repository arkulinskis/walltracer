from anvil import *
import anvil.js

from ._anvil_designer import PostCardTemplate
from ... import state, wt

STATUS = {"pending": ("warn", "Waiting for approval"), "approved": ("good", "Public"), "rejected": ("bad", "Not approved")}


class PostCard(PostCardTemplate):
    """A finished wall in the Showcase. item = {post, yours (your own posts show their status), host: the page}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        p, yours = self.item["post"], self.item.get("yours")
        state.heading(self.title, 2)
        state.set_attr(self.photo, "src", p.get("thumb") or "")
        state.set_attr(self.photo_button, "aria-label", "Open %s" % p.get("title"))
        mins = (" · " + wt.fmt_minutes(p["minutes"])) if p.get("minutes") else ""
        if yours:
            tone, label = STATUS.get(p.get("status"), ("", p.get("status") or ""))
            anvil.js.get_dom_node(self.status).textContent = label
            if tone:
                self.status.classes[tone] = True
            self.dom_nodes["by"].textContent = mins
        else:
            self.status.visible = False
            self.dom_nodes["by"].textContent = "by %s%s" % (p.get("by") or "", mins)
        self.like_button.visible = not yours
        self.like_button.text = str(p.get("likes") or 0)
        if p.get("liked"):
            self.like_button.role = ["sc-like", "on", "ic-heart"]
        state.set_control_attr(self.like_button, "aria-label", "Like (%d)" % (p.get("likes") or 0))
        state.set_control_attr(self.like_button, "aria-pressed", "true" if p.get("liked") else "false")

    def open_click(self, event):
        self.item["host"].open(self.item["post"])

    @handle("like_button", "click")
    def like_button_click(self, **event_args):
        self.item["host"].like(self.item["post"]["id"])
