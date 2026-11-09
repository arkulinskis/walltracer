from anvil import *

from ._anvil_designer import AdminTemplate
from ... import state, wt
from ...Dialogs.StencilForm import StencilForm

TABS = ["overview", "showcase", "stencils", "feedback", "users", "demo"]


class Admin(AdminTemplate):
    """#admin/<tab>: overview numbers, Showcase moderation (Items/AdminPost), the stencil library (Items/AdminStencil +
    Dialogs/StencilForm), the old feedback inbox, users (admin / active switches) and the demo data.
    Each tab is its own address, so the browser's back button works."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.tab = args[0] if args and args[0] in TABS else "overview"
        self._filter = "new"
        self._sc_filter = "pending"
        self.stencil_data = {"stencils": [], "categories": [], "levels": []}
        parts = {"overview": self.overview_part, "showcase": self.showcase_part, "stencils": self.stencils_part,
                 "feedback": self.feedback_part, "users": self.users_part, "demo": self.demo_part}
        tabs = {"overview": self.tab_overview, "showcase": self.tab_showcase, "stencils": self.tab_stencils,
                "feedback": self.tab_feedback, "users": self.tab_users, "demo": self.tab_demo}
        for name in TABS:
            parts[name].visible = name == self.tab
            tabs[name].classes["on"] = name == self.tab
        self.feedback_panel.add_event_handler("x-changed", self._feedback_changed)
        getattr(self, "_" + self.tab)()

    # ---- overview
    def _overview(self):
        d = state.call("admin_overview")
        self.s_users.text, self.s_admins.text = str(d["users"]), str(d["admins"])
        self.s_admins_label.text = "admin" if d["admins"] == 1 else "admins"
        self.s_feedback.text, self.s_pending.text = str(d["feedback_new"]), str(d["showcase_pending"])
        pr = d["projects"] or {}
        self.s_projects.text = str(pr.get("projects") or 0)
        self.s_minutes.text = wt.fmt_minutes(pr.get("minutes") or 0)
        self.s_finished.text = str(pr.get("finished") or 0)
        self.s_stencils.text = str(d["stencils"] or 0)
        self.demo_line.text = "Demo data is %s (%d demo people). Manage it in the Demo data tab." % (
            d["demo"]["state"], d["demo"]["counts"].get("users", 0))

    # ---- showcase moderation
    def _showcase(self):
        d: dict = state.call("admin_showcase", self._sc_filter) or {"posts": [], "counts": {}}
        labels = {"pending": "To approve", "approved": "Public", "rejected": "Rejected"}
        for key, el in (("pending", self.sc_pending), ("approved", self.sc_approved), ("rejected", self.sc_rejected)):
            el.text = "%s (%d)" % (labels[key], d["counts"].get(key, 0))
            el.role = ["seg", "on"] if key == self._sc_filter else ["seg"]
        self.posts_panel.items = [{"post": p, "host": self} for p in d["posts"]]
        self.no_posts.visible = not d["posts"]
        self.dom_nodes["no_posts_title"].textContent = "Nothing to approve" if self._sc_filter == "pending" else "Nothing here"

    def _sc(self, value):
        self._sc_filter = value
        self._showcase()

    @handle("sc_pending", "click")
    def sc_pending_click(self, **event_args):
        self._sc("pending")

    @handle("sc_approved", "click")
    def sc_approved_click(self, **event_args):
        self._sc("approved")

    @handle("sc_rejected", "click")
    def sc_rejected_click(self, **event_args):
        self._sc("rejected")

    def set_post(self, post, status):
        if state.call("admin_set_showcase", post["id"], status) is not None:
            state.toast("Saved", "ok")
            self._showcase()

    def delete_post(self, post):
        if confirm("", title="Delete this post?", buttons=[("Cancel", False), ("Delete", True)], role="app-dialog"):
            if state.call("delete_showcase", post["id"]) is not None:
                self._showcase()

    # ---- the stencil library
    def _stencils(self):
        d: dict = state.call("admin_stencils") or {"stencils": [], "categories": [], "levels": []}
        self.stencil_data = d
        n = len(d["stencils"])
        self.stencils_count.text = "%d stencils. Hidden ones don't show in the library. Built-in ones come from StencilArt.py." % n
        self.stencils_panel.items = [{"s": s, "first": i == 0, "last": i == n - 1, "host": self} for i, s in enumerate(d["stencils"])]

    def stencil_form(self, stencil=None):
        if alert(StencilForm(stencil=stencil, categories=self.stencil_data.get("categories") or [],
                             levels=self.stencil_data.get("levels") or []),
                 buttons=[], role="app-dialog", dismissible=True):
            state.toast("Saved", "ok")
            self._stencils()

    @handle("add_stencil_button", "click")
    def add_stencil_button_click(self, **event_args):
        self.stencil_form(None)

    def update_stencil(self, stencil, patch):
        if state.call("admin_update_stencil", stencil["id"], patch) is not None:
            self._stencils()

    def delete_stencil(self, stencil):
        if confirm("Projects made from it keep their copy.", title='Delete "%s"?' % stencil.get("title"),
                   buttons=[("Cancel", False), ("Delete", True)], role="app-dialog"):
            if state.call("admin_delete_stencil", stencil["id"]) is not None:
                self._stencils()

    # ---- feedback
    def _feedback(self):
        d = state.call("list_feedback", None)
        self._fb = d
        items = [i for i in d["items"] if self._filter == "all" or i["status"] == self._filter]
        self.feedback_panel.items = items
        self.no_feedback.visible = not items
        labels = {"new": "New", "read": "Read", "done": "Done", "all": "All"}
        for key, el in (("new", self.f_new), ("read", self.f_read), ("done", self.f_done), ("all", self.f_all)):
            n = len(d["items"]) if key == "all" else d["counts"].get(key, 0)
            el.text = "%s (%d)" % (labels[key], n)
            el.role = ["seg", "on"] if key == self._filter else ["seg"]

    def _set_filter(self, value):
        self._filter = value
        self._feedback()

    @handle("f_new", "click")
    def f_new_click(self, **event_args):
        self._set_filter("new")

    @handle("f_read", "click")
    def f_read_click(self, **event_args):
        self._set_filter("read")

    @handle("f_done", "click")
    def f_done_click(self, **event_args):
        self._set_filter("done")

    @handle("f_all", "click")
    def f_all_click(self, **event_args):
        self._set_filter("all")

    def _feedback_changed(self, **event_args):
        self._feedback()

    # ---- users
    def _users(self, query=None):
        d = state.call("list_users", query or None)
        self.users_panel.items = d["users"]
        self.users_count.text = state.plural(d["total"], "person", "people")

    @handle("search_box", "pressed_enter")
    def search_box_pressed_enter(self, **event_args):
        self._users(self.search_box.text)

    @handle("search_button", "click")
    def search_button_click(self, **event_args):
        self._users(self.search_box.text)

    # ---- demo data
    def _demo(self):
        d = state.call("admin_overview")["demo"]
        counts = ", ".join("%s %s" % (v, k) for k, v in d["counts"].items())
        self.demo_status.text = "Status: %s · %s" % (d["state"], counts)
        self.demo_load_button.text = "Reload demo data" if d["state"] == "loaded" else "Load demo data"

    @handle("demo_load_button", "click")
    def demo_load_button_click(self, **event_args):
        if confirm("Demo people and content are added (any old demo rows are replaced).", title="Load the demo data?",
                   buttons=[("Cancel", False), ("Load", True)], role="app-dialog"):
            if state.call("demo_load"):
                state.toast("Done", "ok")
                self._demo()

    @handle("demo_remove_button", "click")
    def demo_remove_button_click(self, **event_args):
        if confirm("Every demo row is deleted. Real data stays.", title="Remove the demo data?",
                   buttons=[("Cancel", False), ("Remove", True)], role="app-dialog"):
            if state.call("demo_remove"):
                state.toast("Done", "ok")
                self._demo()
