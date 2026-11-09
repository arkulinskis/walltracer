from anvil import *

from ._anvil_designer import ProjectMenuTemplate
from ... import state, wt


class ProjectMenu(ProjectMenuTemplate):
    """A project's More menu in the studio. Closes with the chosen action: "done", "share", "dup" or "del"
    (Pages/Studio.more does it)."""

    def __init__(self, project, **properties):
        self.project = project
        super().__init__(**properties)
        p = project
        state.heading(self.title, 2)
        self.title.text = p.get("title") or ""
        self.meta.text = "%s · %supdated %s" % (wt.fmt_size(p), (wt.fmt_minutes(p["minutes"]) + " traced · ") if p.get("minutes") else "",
                                               state.ago(p.get("updated")))
        if p.get("status") == "done":
            self.done_button.text = "Back to tracing"
            self.done_button.role = ["btn", "btn-block", "ic-refresh"]
        self.share_button.visible = bool(state.me()) and not wt.is_device(p.get("id"))

    def _close(self, value):
        self.raise_event("x-close-alert", value=value)

    @handle("done_button", "click")
    def done_button_click(self, **event_args):
        self._close("done")

    @handle("share_button", "click")
    def share_button_click(self, **event_args):
        self._close("share")

    @handle("dup_button", "click")
    def dup_button_click(self, **event_args):
        self._close("dup")

    @handle("del_button", "click")
    def del_button_click(self, **event_args):
        self._close("del")
