from anvil import *

from ._anvil_designer import LandingTemplate
from ... import state

# The app's video on the Addanapp YouTube channel (APP_MAKER/youtube/manifest.json), shown in the Watch section.
YT_VIDEO = "TavbKRtrFuw"


class Landing(LandingTemplate):
    """#landing (also "About" for members): the promise, the hero drawing (inline SVG: a person in a headset tracing a
    projected leaf), the Watch section (the YouTube video), how it works, projector comparison, features, the most-loved
    walls from the Showcase, questions. Static copy lives in the template."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        me = state.me()
        self.guest_cta.visible = self.band_guest.visible = not me
        self.member_cta.visible = self.band_member.visible = bool(me)
        self.dom_nodes["yt_cover"].addEventListener("click", self._play)
        self.show_section.visible = False
        d = state.call_quiet("list_showcase", "top")
        posts = (d or {}).get("posts") or []
        if posts:
            self.show_panel.items = posts[:4]
            self.show_section.visible = True

    def _play(self, event):
        """Swap the video's cover for YouTube's player (privacy-enhanced); nothing loads from YouTube before this click."""
        self.dom_nodes["yt_frame"].innerHTML = (
            '<iframe src="https://www.youtube-nocookie.com/embed/' + YT_VIDEO + '?autoplay=1&rel=0&playsinline=1" '
            'title="WallTracer video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen '
            'referrerpolicy="strict-origin-when-cross-origin"></iframe>')
