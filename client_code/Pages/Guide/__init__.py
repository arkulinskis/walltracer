from anvil import *
from anvil.js import window

from ._anvil_designer import GuideTemplate


class Guide(GuideTemplate):
    """#guide, #guide/<section>: how to trace a wall (what you need, headset setup, the steps, the controller map as an
    inline SVG, hands-free, tips, troubleshooting). Static copy in the template; the side menu scrolls to a section."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.section = args[0] if args else ""
        self.dom_nodes["toc"].addEventListener("click", self._toc_click)

    def _toc_click(self, event):
        link = event.target.closest("[data-sec]")
        if not link:
            return
        event.preventDefault()
        self._scroll(link.getAttribute("data-sec"), True)

    def _scroll(self, section, smooth=False):
        el = self.dom_nodes["body"].querySelector("#gd-" + section)
        if el:
            el.scrollIntoView({"behavior": "smooth"} if smooth else {})

    @handle("", "show")
    def form_show(self, **event_args):
        if self.section:
            window.setTimeout(lambda: self._scroll(self.section), 60)
