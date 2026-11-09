from anvil import *
from anvil.js import window

from ._anvil_designer import LibraryTemplate
from ... import router, state, wt
from ...Dialogs.StencilPreview import StencilPreview


class Library(LibraryTemplate):
    """#library, #library/<category>: ready-made stencils (server_code/StencilArt.py + admin uploads). Category chips
    (Items/CatChip), search, the Lettering maker card and the stencils (Items/StencilCard). Preview one
    (Dialogs/StencilPreview), then "Trace this" creates a project (account, or this browser) and opens the editor."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.cat = args[0] if args else "All"
        self.all = []
        self.cats = []
        state.set_control_attr(self.search_box, "aria-label", "Search stencils")
        d = state.call("list_stencils") or {"stencils": [], "categories": []}
        self.all, self.cats = d.get("stencils") or [], d.get("categories") or []
        self.draw()
        window.WT.loadFonts()

    def draw(self):
        q = (self.search_box.text or "").strip().lower()
        cat = self.cat
        shown = [s for s in self.all if (cat == "All" or s.get("category") == cat) and
                 (not q or q in ("%s %s %s" % (s.get("title"), s.get("blurb"), s.get("category"))).lower())]
        used = ["All"] + [c for c in self.cats if c == "Lettering" or any(s.get("category") == c for s in self.all)]
        key = state.focus_key()
        self.cats_panel.items = [{"cat": c, "on": c == cat, "host": self} for c in used]
        state.refocus(self.cats_panel, key)
        items = []
        if cat in ("All", "Lettering") and not q:
            items.append({"letter": True, "host": self})
        items += [{"s": s, "host": self} for s in shown]
        self.stencils_panel.items = items
        self.none_box.visible = bool(q) and not shown
        self.dom_nodes["none_q"].textContent = q

    def pick_cat(self, cat):
        self.cat = cat
        router.replace("library", "" if cat == "All" else cat)
        self.draw()

    @handle("search_box", "change")
    def search_box_change(self, **event_args):
        self.draw()

    def lettering(self):
        p = wt.lettering()
        if p:
            router.go("edit", p["id"])

    def preview(self, stencil):
        if alert(StencilPreview(stencil=stencil), buttons=[], large=True, role="app-dialog", dismissible=True) == "use":
            p = wt.store("create", {"stencil_id": stencil["id"], "title": stencil.get("title")})
            if p:
                state.toast("Added to your studio", "ok")
                router.go("edit", p["id"])
