from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import StudioTemplate
from ... import router, state, wt
from ...Dialogs.ProjectMenu import ProjectMenu


def first_file(files):
    return anvil.js.call(window.Function("f", "return f[0]"), files)


class Studio(StudioTemplate):
    """#studio (home): your tracing projects (in the account, or in this browser for visitors: WT.store), new from a
    picture / the library / lettering, drop a picture anywhere on the page, move this browser's projects into the
    account. Cards are Items/ProjectCard (item = {p, device, host}); their More menu is Dialogs/ProjectMenu."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.drop = wt.NULL
        self._drag = anvil.js.report_exceptions(self._drag_over)
        self._leave = anvil.js.report_exceptions(self._drag_end)
        self._dropped = anvil.js.report_exceptions(self._on_drop)
        self.data: dict = {"projects": [], "device": [], "stats": {}, "local": True}
        self.load()

    # ---- data
    def load(self):
        d: dict = wt.store("list") or {"projects": [], "device": [], "stats": {"count": 0, "minutes": 0, "done": 0}, "local": True}
        st = state.call_quiet("list_stencils") or {"stencils": []}
        self.data = d
        stencils = st.get("stencils") or []
        starters = [s for s in stencils if s.get("level") == "Easy" and s.get("category") != "Templates"][:3]
        self.draw(len(stencils), starters)

    def draw(self, n_stencils, starters):
        d: dict = self.data
        me = state.me()
        projects = d.get("projects") or []
        self.h_member.visible = bool(me)
        self.h_guest.visible = not me
        if me:
            self.dom_nodes["first_name"].textContent = (me.get("name") or "").split(" ")[0]
        s = d.get("stats") or {}
        self.stats.visible = bool(projects)
        self.dom_nodes["n_count"].textContent = str(s.get("count") or 0)
        self.dom_nodes["n_count_word"].textContent = "wall" if s.get("count") == 1 else "walls"
        self.dom_nodes["n_minutes"].textContent = wt.fmt_minutes(s.get("minutes") or 0)
        self.dom_nodes["n_done"].textContent = str(s.get("done") or 0)
        self.dom_nodes["n_stencils"].textContent = str(n_stencils or 18)
        self.guest_banner.visible = not me
        local = bool(d.get("local"))
        self.projects_panel.items = [{"p": p, "device": local, "host": self} for p in projects]
        self.projects_panel.visible = bool(projects)
        self.empty_box.visible = not projects
        self.starters_panel.items = [{"s": s, "host": self} for s in starters]
        device = d.get("device") or []
        self.device_part.visible = bool(device)
        self.device_panel.items = [{"p": p, "device": True, "host": self} for p in device]
        self.move_all_button.text = "Save all %d to my account" % len(device)

    # ---- new projects
    def opened(self, p):
        if p:
            state.toast("Project created", "ok")
            router.go("edit", p["id"])

    def new_upload_click(self, event):
        self.opened(wt.pick_and_create())

    def new_library_click(self, event):
        router.go("library")

    def new_lettering_click(self, event):
        self.opened(wt.lettering())

    def start_from(self, stencil):
        self.opened(wt.store("create", {"stencil_id": stencil["id"]}))

    # ---- card actions (Items/ProjectCard calls these)
    def move(self, p):
        if wt.store("moveToAccount", p["id"]) is not None:
            state.toast("Saved to your account", "ok")
            self.load()

    def more(self, p):
        action = alert(ProjectMenu(project=p), buttons=[], role="app-dialog", dismissible=True)
        if action == "done":
            finished = p.get("status") != "done"
            if wt.store("update", p["id"], {"status": "done" if finished else "tracing"}) is not None:
                if finished:
                    wt.confetti()
                    state.toast("Finished! Lovely work.", "ok")
                self.load()
        elif action == "dup":
            if wt.store("duplicate", p["id"]) is not None:
                state.toast("Copied", "ok")
                self.load()
        elif action == "share":
            router.go("showcase", "share", p["id"])
        elif action == "del":
            if confirm("The picture, its settings and your progress are deleted. This can't be undone.",
                       title='Delete "%s"?' % p.get("title"), buttons=[("Cancel", False), ("Delete", True)],
                       role="app-dialog"):
                wt.store("remove", p["id"])
                state.toast("Deleted")
                self.load()

    @handle("move_all_button", "click")
    def move_all_button_click(self, **event_args):
        ok = True
        for p in list(self.data.get("device") or []):
            if wt.store("moveToAccount", p["id"]) is None:
                ok = False
                break
        if ok:
            state.toast("All saved to your account", "ok")
        self.load()

    # ---- drop a picture anywhere on the page
    def _drag_over(self, e):
        types = e.dataTransfer.types if e.dataTransfer else None
        if not types or not anvil.js.call(window.Function("t", "return Array.prototype.indexOf.call(t, 'Files') >= 0"), types):
            return
        e.preventDefault()
        if self.drop is None:
            self.drop = window.document.createElement("div")
            self.drop.className = "ui wt-drop"
            self.drop.textContent = "Drop your picture to start a wall"
            body = window.document.body
            if body:
                body.appendChild(self.drop)

    def _drag_end(self, e):
        if self.drop is not None and (not e.relatedTarget or e.type == "drop"):
            self.drop.remove()
            self.drop = wt.NULL

    def _on_drop(self, e):
        files = e.dataTransfer.files if e.dataTransfer else None
        if not files or not files.length:
            return
        e.preventDefault()
        self._drag_end(e)
        self.opened(wt.pick_and_create(first_file(files)))

    @handle("", "show")
    def form_show(self, **event_args):
        window.addEventListener("dragover", self._drag)
        window.addEventListener("dragleave", self._leave)
        window.addEventListener("drop", self._dropped)

    @handle("", "hide")
    def form_hide(self, **event_args):
        window.removeEventListener("dragover", self._drag)
        window.removeEventListener("dragleave", self._leave)
        window.removeEventListener("drop", self._dropped)
        if self.drop is not None:
            self.drop.remove()
            self.drop = wt.NULL
