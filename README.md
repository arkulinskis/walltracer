# WallTracer

A virtual projector for tracing pictures onto real walls. You prepare a picture (your own, a stencil from the library, or
lettering), open it in a Meta Quest headset with passthrough, pin it to the wall at its real size, lock it, put the controllers
down and trace it with a pencil. One button (A/X) or a pinch of your free hand hides it so you can check your lines.
For DIY muralists, parents painting a kid's room, sign painters, and anyone hanging a gallery wall. Built on [Anvil](https://anvil.works).

- **App repo:** github.com/arkulinskis/walltracer (branch `master`). Anvil pulls `master`.
- **Live:** https://walltracer.anvil.app

## What it does

**For everyone (no account needed):**
- **Landing page:** the promise, an illustrated hero, how it works, "better than a projector", features, the most-loved Showcase walls, FAQ.
- **Studio** (`#studio`, home): your projects as cards (preview on the project's wall colour, real size, look, minutes traced,
  grid progress, Trace / Adjust / more: finished, share, duplicate, delete). New from a picture (button or drag-and-drop anywhere),
  from the library, or lettering. Visitors' projects live in the browser (IndexedDB); once signed in, "Save to my account" moves them.
- **Stencil library** (`#library`): 17 original line-art stencils drawn in code (botanical, animals, kids, patterns, landscapes,
  objects, templates: gallery-wall planner with nail spots, lettering guidelines, a true-size growth chart), search, categories,
  preview with real size, "Trace this". Plus the **Lettering maker**: text in 8 Google fonts, outlined, as a picture.
- **Editor** (`#edit/<id>`): live preview on a choice of wall colours; six **looks** (Lines, Outline = edge detection joined into
  smooth lines, Tones = posterised zones with borders, Shapes = colour vector trace in Logo / Photo / Pixel art style,
  Silhouette, Photo) with darkness/detail, tones, contrast, brightness, invert; **smooth vector lines** (Outline, Lines and
  Silhouette drawn as curves, `theme/assets/wt-vector.js`) and **Download SVG** at the real size in cm;
  headset line colour (neon swatches), line width, dark halo, opacity; **real size** in cm or inches with presets and a 170 cm person
  for scale; turn and mirror; **grid** with square names and done squares; **registration crosses** (kept when hidden); blink check;
  pencil hand; notes. Saves by itself.
- **Trace** (`#trace/<id>`): the session. In a headset (WebXR `immersive-ar` passthrough on Quest, AR on Android, or VR):
  place by **aiming** at the wall (hit-test ring + ghost preview), **touching 3 points** with a controller tip, or **floating** it;
  three steps (click the right stick = next, left stick = back): **1 place & size** (trigger moves it, grip drags, right stick
  size/turn, left stick slides); **2 fit corners** (dots on the 4 corners, 4 edges and middle: left stick or trigger picks one,
  right stick pushes it into / out of the wall, a controller tip on the wall + trigger snaps it there; the picture bends
  smoothly between the corners); **3 look & trace** (right stick opacity/look, a button per look, More tools for grid,
  spotlight, blink, crosses). Held by a spatial anchor, persisted on Quest with the step and corner depths, so the next
  session restores the spot; then hands-free: **A/X or a free-hand pinch hides/shows**, B opacity,
  Y or a long pinch opens the floating menu, blink peeks automatically, **spotlight** one grid square at a time, mark squares done.
  On any screen: the same steps in a 3D **practice room** (click to place, drag/scroll/Q/E to adjust, a pencil that draws on the
  virtual wall, keyboard shortcuts). Minutes, squares and size are saved every minute and at the end; a summary offers
  "It's finished!" (confetti, then share).
- **No headset? Other ways onto the wall** (`theme/assets/wt-flat.js`, linked from the editor and the trace intro):
  **Projector or tablet** (`#project/<id>`, full screen: the picture with a 4-corner keystone pin for any projector or TV,
  hide (H), lock (L), full screen (F), screen kept awake, **Lightbox** = dark lines on white for paper over a tablet; corners
  saved per project in this browser); **See it on my wall** (`#mockup/<id>`: a photo of your wall, kept in this browser only,
  with the picture pinned by its corners, "place at real size" from the wall's width, tracing lines or finished picture,
  opacity, Download picture; also the doodle-grid helper); **Print at real size** (`#print/<id>`: A4 / Letter tiles with
  overlap, page names, corner ticks and a 5 cm check bar, a map page first; plus a one-page **grid sheet** with each square's
  real size and where every chalk line goes).
- **Showcase** (`#showcase`): photos of finished walls (newest / most loved), likes, big view; members share their own
  (photo, title, caption, linked project's time and size), approved by an admin first; "Yours" tab with statuses.
- **Guide** (`#guide`): what you need, headset setup (Space Setup, boundary, hand tracking), the steps, an illustrated controller
  map, hands-free gestures, tips, troubleshooting.
- Sign-up with email and password or Google, a feedback form, and the Privacy & Terms page (footer link, `#legal`).

**For admins** (`#admin`; your admin email (App Secret `admin_emails`) becomes an admin on first sign-in):
- **Overview:** people, feedback, walls to approve, projects, minutes traced, finished walls, stencils.
- **Showcase:** approve / reject / delete shared walls (with the poster's email).
- **Stencils:** add your own (PNG/JPEG/WebP), edit title/category/level/size/credit, hide/show, reorder, delete (built-ins can only be hidden).
- **Feedback inbox:** New / Read / Done, private notes.
- **Users:** search, make admin, disable an account.
- **Demo data:** four demo painters and seven illustrated Showcase walls so the app never looks empty; remove or reload it.

## Setting it up in Anvil (once)

1. In the Anvil editor: **Create app → Clone from GitHub**, and paste `https://github.com/arkulinskis/walltracer`.
2. **Users** service: email + password and "Continue with Google", sign-up allowed (already set in `anvil.yaml`; check it).
3. Open the app in the editor. If it shows a **Schema Mismatch** alert, choose **"The schema of the source code is correct"** so Anvil creates the tables.
4. **Run** it and sign up with **your admin email** (App Secret `admin_emails`) straight away (that account becomes the admin).
5. **Publish** (Publish → public URL, or your own domain).

<!-- libraries:start -->
## Libraries and outside services

What this project uses besides its own code. Generated by `APP_MAKER/tools/libraries.py`; to change it, edit `APP_MAKER/libraries/catalog.py` and re-run the script.

| Name | How it gets in | Used here for |
|---|---|---|
| [three.js](https://threejs.org) r158 | Copied into the app | Draws 3D scenes in the browser: shapes, lights, cameras, textures and VR. |
| [ImageTracer (imagetracer.js)](https://github.com/jankovicsandras/imagetracerjs) | Copied into the app | the Shapes look, smooth Lines and Silhouette edges, and Download SVG (wt-vector.js) |
| [Arkvital music library (ArkMusic)](https://arkvital-media.addanapp.workers.dev) | Outside web service | Background music: the user's licensed Audiio tracks, streamed from our own Cloudflare R2 bucket by a small shared player. |
| [YouTube embeds](https://developers.google.com/youtube/player_parameters) | Outside web service | Plays a YouTube video inside the page (the privacy-friendlier youtube-nocookie address). |
| [Google Fonts](https://fonts.google.com) | Loaded from a CDN | Fraunces, Inter |

**Built into the browser:** Canvas 2D, WebGL, WebXR, Web Audio API, Screen Wake Lock, localStorage, File downloads (Blob), Fullscreen, IndexedDB.

**Anvil platform:** Anvil, Anvil Data Tables, Anvil Email, Anvil JS bridge (anvil.js), Anvil Secrets, Anvil Users, Anvil Google service, Anvil HTTP, Anvil timezones (anvil.tz).

**Build and test tools (not shipped):** axe-core, Node.js, Headless Chrome (DevTools Protocol), PyYAML.

<!-- libraries:end -->

## Working on it

See `.claude/skills/walltracer/SKILL.md`. In short:

```
python -I tools/check.py --ui                    # syntax, server tests, headless UI tests → ALL CHECKS PASSED
python -I tools/preview/devserver.py 8765        # the app on in-memory data: http://localhost:8765/  (?as=ana#studio, ?as=admin#admin)
python tools/deploy.py                           # dry run (needs PyYAML, so no -I)
python tools/deploy.py --push "Message"          # deploy: commit + push to GitHub, Anvil pulls it
```

## Project layout

```
web/            the interface: core.js/core.css (shared engine + design tokens), app.js (header, footer), pages/*.html
client_code/    Main.py (the only Anvil form: bridge to the server, sign-in), legal.py
server_code/    common.py, Accounts.py, Feedback.py, Admin.py, DemoData.py, legal_server.py, Projects.py, Stencils.py, StencilArt.py, Showcase.py
assets/         icon.svg + generated PNG icons, three.min.js (r158, loaded on the trace page), served at _/theme/<name>
tools/          sync_to_anvil.py (settings + table schema), deploy.py, check.py, preview/ (dev server, UI tests, screenshots), testing/
```
