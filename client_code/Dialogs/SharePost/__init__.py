from anvil import *

from ._anvil_designer import SharePostTemplate
from ... import state, wt


class SharePost(SharePostTemplate):
    """Share a photo of a finished wall in the Showcase. preset = the project it came from (adds its time and size).
    Closes with the new post (dict) or None."""

    def __init__(self, preset="", **properties):
        self.preset = preset or ""
        self.photo = None
        super().__init__(**properties)
        self.pick_full.visible = False
        state.set_control_attr(self.title_box, "maxlength", 80)
        state.set_control_attr(self.caption_box, "maxlength", 600)
        d = wt.store("list") or {}
        projects = sorted(d.get("projects") or [], key=lambda p: p.get("status") != "done")
        self.projects = {p["id"]: p for p in projects}
        self.project_box.items = [("None", "")] + [
            ((p.get("title") or "") + (" (finished)" if p.get("status") == "done" else ""), p["id"]) for p in projects]
        if self.preset in self.projects:
            self.project_box.selected_value = self.preset
            self.title_box.text = self.projects[self.preset].get("title") or ""
        state.set_control_attr(self.project_box, "aria-label", "Which project?")

    def pick_click(self, event):
        wt.pick_file(self._picked)

    def _picked(self, file):
        pic = wt.share_photo(file)
        if pic:
            self.photo = pic
            state.set_attr(self.preview, "src", pic["image"])
            self.pick_empty.visible = False
            self.pick_full.visible = True

    @handle("cancel_button", "click")
    def cancel_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("share_button", "click")
    def share_button_click(self, **event_args):
        if not self.photo:
            state.toast("Add a photo of your wall first.", "error")
            return
        if not (self.title_box.text or "").strip():
            state.toast("Give your wall a title.", "error")
            return
        pr = self.projects.get(self.project_box.selected_value or "")
        data = {"title": self.title_box.text, "caption": self.caption_box.text or "", "photo": self.photo["image"],
                "thumb": self.photo["thumb"], "minutes": pr.get("minutes") or 0 if pr else 0,
                "width_cm": wt.settings(pr).get("width_cm") if pr else 0}
        self.share_button.enabled = False
        r = state.call("post_showcase", data)
        self.share_button.enabled = True
        if r:
            self.raise_event("x-close-alert", value=r.get("post"))
