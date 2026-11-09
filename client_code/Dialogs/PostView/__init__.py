from anvil import *

from ._anvil_designer import PostViewTemplate
from ... import state, wt


class PostView(PostViewTemplate):
    """A Showcase post, big (the full photo loads after the thumbnail). Closes with "like", "deleted" or None."""

    def __init__(self, post, **properties):
        self.post = post
        super().__init__(**properties)
        p, me = post, state.me()
        state.set_attr(self.photo, "src", p.get("thumb") or "")
        state.set_attr(self.photo, "alt", p.get("caption") or p.get("title") or "")
        state.heading(self.title, 2)
        self.title.text = p.get("title") or ""
        bits = ["by " + (p.get("by") or ""), state.short_date(p.get("created"))]
        if p.get("minutes"):
            bits.append(wt.fmt_minutes(p["minutes"]) + " of tracing")
        if p.get("width_cm"):
            bits.append(wt.fmt_len(p["width_cm"], "cm") + " wide")
        self.meta.text = " · ".join(b for b in bits if b)
        self.caption.text = p.get("caption") or ""
        self.caption.visible = bool(p.get("caption"))
        self.delete_button.visible = bool(p.get("mine") or (me and me.get("is_admin")))
        self.like_button.visible = p.get("status") == "approved"
        self.like_button.text = str(p.get("likes") or 0)
        if p.get("liked"):
            self.like_button.role = ["sc-like", "on", "ic-heart"]
        state.set_control_attr(self.like_button, "aria-label", "Like (%d)" % (p.get("likes") or 0))

    @handle("", "show")
    def form_show(self, **event_args):
        r = state.call_quiet("get_showcase_photo", self.post["id"])
        if r and r.get("photo"):
            state.set_attr(self.photo, "src", r["photo"])

    @handle("like_button", "click")
    def like_button_click(self, **event_args):
        self.raise_event("x-close-alert", value="like")

    @handle("delete_button", "click")
    def delete_button_click(self, **event_args):
        if confirm("", title="Delete this post?", buttons=[("Cancel", False), ("Delete", True)], role="app-dialog"):
            if state.call("delete_showcase", self.post["id"]) is not None:
                self.raise_event("x-close-alert", value="deleted")
