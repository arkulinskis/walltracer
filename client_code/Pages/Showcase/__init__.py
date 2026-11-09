from anvil import *

from ._anvil_designer import ShowcaseTemplate
from ... import router, state
from ...Dialogs.PostView import PostView
from ...Dialogs.SharePost import SharePost


class Showcase(ShowcaseTemplate):
    """#showcase, #showcase/yours, #showcase/share/<projectId>: photos of finished walls. Everyone sees approved posts
    (Items/PostCard); members like them and share their own (Dialogs/SharePost; an admin approves new posts first).
    A post opens big in Dialogs/PostView. Posters show as "Maya C.", never by email."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        me = state.me()
        self.tab = "yours" if (args and args[0] == "yours" and me) else "all"
        self.sort = "new"
        self.posts = []
        self.share_button.visible = self.tabs.visible = bool(me)
        self.signup_link.visible = not me
        self.load()
        self._share_for = args[1] if (args and args[0] == "share" and me and len(args) > 1) else ""
        self._share_now = bool(args and args[0] == "share" and me)

    def load(self):
        d = state.call("my_showcase") if self.tab == "yours" else state.call("list_showcase", self.sort)
        self.posts = (d or {}).get("posts") or []
        self.draw()

    def draw(self):
        yours = self.tab == "yours"
        for el, on in ((self.tab_all, not yours), (self.tab_yours, yours), (self.sort_new, self.sort == "new"),
                       (self.sort_top, self.sort == "top")):
            el.role = ["seg", "on"] if on else ["seg"]
        self.sorts.visible = not yours
        self.posts_panel.items = [{"post": p, "yours": yours, "host": self} for p in self.posts]
        self.empty_box.visible = not self.posts
        self.dom_nodes["empty_title"].textContent = "You haven't shared a wall yet" if yours else "No walls yet"

    @handle("", "show")
    def form_show(self, **event_args):
        if self._share_now:
            self._share_now = False
            router.replace("showcase")
            self.share(self._share_for or None)

    # ---- tabs and order
    def _tab(self, tab):
        self.tab = tab
        router.replace("showcase", "yours" if tab == "yours" else "")
        self.load()

    @handle("tab_all", "click")
    def tab_all_click(self, **event_args):
        self._tab("all")

    @handle("tab_yours", "click")
    def tab_yours_click(self, **event_args):
        self._tab("yours")

    @handle("sort_new", "click")
    def sort_new_click(self, **event_args):
        self.sort = "new"
        self.load()

    @handle("sort_top", "click")
    def sort_top_click(self, **event_args):
        self.sort = "top"
        self.load()

    # ---- posts (Items/PostCard calls these)
    def like(self, post_id):
        """Like / unlike; returns the updated post (or None)."""
        if not state.me():
            state.toast("Sign in to like walls.")
            return None
        r = state.call_quiet("like_showcase", post_id)
        if not r or not r.get("post"):
            return None
        self.posts = [r["post"] if p["id"] == post_id else p for p in self.posts]
        self.draw()
        return r["post"]

    def open(self, post):
        action = alert(PostView(post=post), buttons=[], large=True, role="app-dialog", dismissible=True)
        if action == "like":
            np = self.like(post["id"])
            if np:
                self.open(np)
        elif action == "deleted":
            state.toast("Deleted")
            self.load()

    def share(self, preset=None):
        r = alert(SharePost(preset=preset or ""), buttons=[], role="app-dialog", dismissible=True)
        if r:
            state.toast("Shared! It's in the Showcase." if r.get("status") == "approved"
                        else "Thank you! It shows here once a moderator approves it.", "ok")
            self.tab = "yours"
            router.replace("showcase", "yours")
            self.load()

    @handle("share_button", "click")
    def share_button_click(self, **event_args):
        self.share(None)
