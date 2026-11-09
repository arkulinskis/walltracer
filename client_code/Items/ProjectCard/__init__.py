from anvil import *
import anvil.js

from ._anvil_designer import ProjectCardTemplate
from ... import router, state, wt


class ProjectCard(ProjectCardTemplate):
    """A tracing project in the studio. item = {p: the project summary, device: kept in this browser?, host: the page}.
    The picture (black lines on white) sits on the project's wall colour; Trace / Adjust are links, More opens
    Dialogs/ProjectMenu through the page."""

    def __init__(self, **properties):
        super().__init__(**properties)
        p = self.item["p"]
        s = wt.settings(p)
        state.heading(self.title, 3)
        state.set_attr(self.open_link, "href", router.href("edit", p["id"]))
        state.set_attr(self.open_link, "aria-label", "Adjust %s" % p.get("title"))
        state.set_attr(self.trace_link, "href", router.href("trace", p["id"]))
        state.set_attr(self.edit_link, "href", router.href("edit", p["id"]))
        thumb = anvil.js.get_dom_node(self.thumb)
        thumb.style.setProperty("--wt-wall", s.get("wall") or "#f3efe8")
        self.thumb.classes["dark"] = wt.is_dark(s.get("wall"))
        if p.get("thumb"):
            state.set_attr(self.thumb_img, "src", p["thumb"])
            self.thumb_icon.visible = False
        else:
            self.thumb_img.visible = False
        self.done_badge.visible = p.get("status") == "done"
        self.size.text = wt.fmt_size(p)
        self.look.text = wt.look_label(s.get("look"))
        self.minutes_box.visible = bool(p.get("minutes"))
        self.minutes.text = wt.fmt_minutes(p.get("minutes") or 0)
        prog = wt.progress(p)
        self.progress_box.visible = prog is not None
        if prog is not None:
            anvil.js.get_dom_node(self.bar).style.width = "%d%%" % round(prog * 100)
            self.progress_text.text = ("All traced" if p.get("status") == "done"
                                       else "%d of %d cells traced" % (len(p.get("done") or []), wt.cells(p)))
        self.move_button.visible = bool(self.item.get("device") and state.me())
        state.set_control_attr(self.more_button, "aria-label", "More for %s" % p.get("title"))
        state.set_control_attr(self.move_button, "aria-label", "Save %s to my account" % p.get("title"))

    @handle("move_button", "click")
    def move_button_click(self, **event_args):
        self.item["host"].move(self.item["p"])

    @handle("more_button", "click")
    def more_button_click(self, **event_args):
        self.item["host"].more(self.item["p"])
