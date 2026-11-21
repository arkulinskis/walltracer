/* wt-flat.js: the no-headset ways to get a picture onto a wall (improvement round 2026-11-20). Three engine screens,
   registered with UI.page (wt-kit.js) and mounted by Components/Screen, like wt-screens.js:
   - project (#project/<id>): Projector & lightbox mode. Full screen, the picture with a 4-corner keystone pin (drag
     the corners until it sits square on the wall), hide/show, lock, fullscreen, the screen kept awake. Lightbox =
     dark lines on white for tracing on paper laid over a tablet. Saved per project in this browser (UI.store
     'pin.<id>' = localStorage walltracer.pin.<id>).
   - mockup (#mockup/<id>): See it on my wall. A photo of the wall (this browser only: IndexedDB walltracer-mockups)
     with the picture pinned on it by its corners, opacity, real-size placement from the wall's width, Download PNG.
     Doubles as the doodle-grid helper. Settings in UI.store 'mock.<id>'.
   - print (#print/<id>): Print at real size. Tiles on A4 / Letter with overlap, page names and alignment marks, a map
     page first, and a grid sheet with every square's real size for the grid method. Printing goes through the
     browser's print dialog (a .wt-print-sheets block appended to <body>, shown only by @media print).
   Shared: WT.pin (homography from the unit square to 4 corners, CSS matrix3d, warped canvas drawing, corner handles).
   Test hooks: window.WT_FLAT (state of the open screen). */
(function () {
  'use strict';
  var esc = UI.esc;
  var PIN = WT.pin = {};
  var CORNERS = ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left'];

  /* ------------------------------------------------------------------ geometry */
  /* Homography from the unit square (0,0)(1,0)(1,1)(0,1) to q = [[x, y] TL, TR, BR, BL] -> [a, b, c, d, e, f, g, h]:
     x = (a u + b v + c) / (g u + h v + 1), y = (d u + e v + f) / (g u + h v + 1). */
  PIN.homography = function (q) {
    var x0 = q[0][0], y0 = q[0][1], x1 = q[1][0], y1 = q[1][1], x2 = q[2][0], y2 = q[2][1], x3 = q[3][0], y3 = q[3][1];
    var dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    var g = 0, h = 0, den = dx1 * dy2 - dx2 * dy1;
    if ((Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) && Math.abs(den) > 1e-12) {
      g = (dx3 * dy2 - dx2 * dy3) / den; h = (dx1 * dy3 - dx3 * dy1) / den;
    }
    return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h];
  };
  PIN.map = function (H, u, v) { var w = H[6] * u + H[7] * v + 1; return [(H[0] * u + H[1] * v + H[2]) / w, (H[3] * u + H[4] * v + H[5]) / w]; };
  /* CSS transform (transform-origin 0 0) for an element whose picture rectangle is aw x ah px at (ox, oy) inside it. */
  PIN.css = function (q, aw, ah, ox, oy) {
    var H = PIN.homography(q);
    ox = ox || 0; oy = oy || 0;
    var m = [H[0] / aw, H[3] / aw, 0, H[6] / aw, H[1] / ah, H[4] / ah, 0, H[7] / ah, 0, 0, 1, 0,
      H[2] - H[0] * ox / aw - H[1] * oy / ah, H[5] - H[3] * ox / aw - H[4] * oy / ah, 0, 1 - H[6] * ox / aw - H[7] * oy / ah];
    return 'matrix3d(' + m.map(function (v) { return +v.toFixed(9); }).join(',') + ')';
  };
  /* The 4 corners make a proper (convex, not folded) shape. */
  PIN.convex = function (q) {
    var s = 0;
    for (var i = 0; i < 4; i++) {
      var a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
      var z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(z) < 1e-9) return false;
      if (!s) s = z > 0 ? 1 : -1; else if ((z > 0 ? 1 : -1) !== s) return false;
    }
    return true;
  };
  /* A rectangle of aspect a (w / h) centred in a W x H box with a margin, as corner fractions of the box. */
  PIN.fit = function (a, W, H, margin) {
    var m = margin == null ? 0.1 : margin, bw = W * (1 - 2 * m), bh = H * (1 - 2 * m), w = bw, h = w / a;
    if (h > bh) { h = bh; w = h * a; }
    var x = (W - w) / 2, y = (H - h) / 2;
    return [[x / W, y / H], [(x + w) / W, y / H], [(x + w) / W, (y + h) / H], [x / W, (y + h) / H]];
  };
  /* Draw src warped onto the quad q (pixels of g), as n x n cells of two affine triangles each. */
  PIN.draw = function (g, src, q, n) {
    n = n || 16;
    var H = PIN.homography(q), sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight, i, j;
    for (j = 0; j < n; j++) for (i = 0; i < n; i++) {
      var u0 = i / n, u1 = (i + 1) / n, v0 = j / n, v1 = (j + 1) / n;
      var p00 = PIN.map(H, u0, v0), p10 = PIN.map(H, u1, v0), p11 = PIN.map(H, u1, v1), p01 = PIN.map(H, u0, v1);
      tri(g, src, [u0 * sw, v0 * sh, u1 * sw, v0 * sh, u1 * sw, v1 * sh], [p00, p10, p11]);
      tri(g, src, [u0 * sw, v0 * sh, u1 * sw, v1 * sh, u0 * sw, v1 * sh], [p00, p11, p01]);
    }
  };
  function tri(g, src, s, d) {
    var sx0 = s[0], sy0 = s[1], sx1 = s[2], sy1 = s[3], sx2 = s[4], sy2 = s[5];
    var dx0 = d[0][0], dy0 = d[0][1], dx1 = d[1][0], dy1 = d[1][1], dx2 = d[2][0], dy2 = d[2][1];
    var den = (sx1 - sx0) * (sy2 - sy0) - (sx2 - sx0) * (sy1 - sy0);
    if (!den) return;
    var a = ((dx1 - dx0) * (sy2 - sy0) - (dx2 - dx0) * (sy1 - sy0)) / den;
    var c = ((dx2 - dx0) * (sx1 - sx0) - (dx1 - dx0) * (sx2 - sx0)) / den;
    var b = ((dy1 - dy0) * (sy2 - sy0) - (dy2 - dy0) * (sy1 - sy0)) / den;
    var e = ((dy2 - dy0) * (sx1 - sx0) - (dy1 - dy0) * (sx2 - sx0)) / den;
    var cx = (dx0 + dx1 + dx2) / 3, cy = (dy0 + dy1 + dy2) / 3;
    g.save();
    g.beginPath();
    [[dx0, dy0], [dx1, dy1], [dx2, dy2]].forEach(function (p, k) {   // clip a hair bigger than the triangle: no seams
      var vx = p[0] - cx, vy = p[1] - cy, L = Math.hypot(vx, vy) || 1, gx = p[0] + vx / L * 0.7, gy = p[1] + vy / L * 0.7;
      if (k) g.lineTo(gx, gy); else g.moveTo(gx, gy);
    });
    g.closePath(); g.clip();
    g.transform(a, b, c, e, dx0 - a * sx0 - c * sy0, dy0 - b * sx0 - e * sy0);
    g.drawImage(src, 0, 0);
    g.restore();
  }

  /* The picture as drawn for a flat screen or paper: the look (lines in `color`) + grid/crosses, on a transparent or
     filled canvas. pad = room round the picture for the corner crosses (fraction of the short side). */
  function artCanvas(P, img, S, maxSide, opts) {
    opts = opts || {};
    var s = Object.assign({}, S, opts.settings || {});
    var art = opts.original ? WT.process(img, Object.assign({}, s, { look: 'photo', contrast: 0, brightness: 0, invert: false }), maxSide) : WT.process(img, s, maxSide);
    var pad = opts.pad || 0, px = Math.round(Math.min(art.width, art.height) * pad);
    var c = WT.canvas(art.width + px * 2, art.height + px * 2), g = c.getContext('2d');
    if (opts.bg) { g.fillStyle = opts.bg; g.fillRect(0, 0, c.width, c.height); }
    if (opts.alpha != null) g.globalAlpha = opts.alpha;
    g.drawImage(art, px, px);
    g.globalAlpha = 1;
    if (!opts.noOverlay) WT.drawOverlay(g, px, px, art.width, art.height, { w: P.w, h: P.h, settings: s }, { grid: s.grid, labels: s.labels, marks: s.marks, done: [] });
    return { canvas: c, ox: px, oy: px, aw: art.width, ah: art.height };
  }

  /* Corner handles over a stage element. get() -> quad in px, set(quad) after a move. Dragging the picture itself
     moves all four corners. Arrow keys nudge the focused corner (Shift = 10 px). */
  function handles(stage, artEl, get, set) {
    var hs = CORNERS.map(function (name, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'pin-h'; b.setAttribute('data-corner', i);
      b.setAttribute('aria-label', name + ' corner: drag, or use the arrow keys');
      b.innerHTML = '<span>' + (i + 1) + '</span>';
      stage.appendChild(b);
      return b;
    });
    var drag = null;
    function place() {
      var q = get();
      hs.forEach(function (b, i) { b.style.transform = 'translate(' + q[i][0] + 'px,' + q[i][1] + 'px)'; });
    }
    function local(e) { var r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    function move(to) {
      var r = stage.getBoundingClientRect(), q = get().map(function (p) { return p.slice(); });
      if (drag.corner >= 0) q[drag.corner] = [Math.max(-r.width * 0.5, Math.min(r.width * 1.5, to[0])), Math.max(-r.height * 0.5, Math.min(r.height * 1.5, to[1]))];
      else q = drag.q0.map(function (p) { return [p[0] + to[0] - drag.p0[0], p[1] + to[1] - drag.p0[1]]; });
      if (PIN.convex(q)) { set(q); place(); }
    }
    function down(e) {
      var b = e.target.closest('.pin-h'), artNow = artEl || stage.querySelector('[data-art]');
      if (!b && e.target !== artNow) return;
      if (e.button != null && e.button > 0) return;
      e.preventDefault();
      drag = { corner: b ? +b.getAttribute('data-corner') : -1, p0: local(e), q0: get(), id: e.pointerId };
      if (b) b.focus({ preventScroll: true });
      try { (b || artNow).setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
      stage.classList.add('dragging');
    }
    function moveEv(e) { if (drag && e.pointerId === drag.id) { e.preventDefault(); move(local(e)); } }
    function up(e) { if (drag && e.pointerId === drag.id) { drag = null; stage.classList.remove('dragging'); set(get(), true); } }
    function key(e) {
      var b = e.target.closest && e.target.closest('.pin-h');
      if (!b) return;
      var k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!k) return;
      e.preventDefault();
      var st = e.shiftKey ? 10 : 1, i = +b.getAttribute('data-corner'), q = get();
      drag = { corner: i };
      move([q[i][0] + k[0] * st, q[i][1] + k[1] * st]);
      drag = null; set(get(), true);
    }
    stage.addEventListener('pointerdown', down);
    stage.addEventListener('pointermove', moveEv);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('keydown', key);
    return { place: place, els: hs };
  }

  function loadProject(id) {
    return WT.store.get(id).then(function (p) {
      return WT.loadImage(p.image).then(function (img) { return { P: p, S: WT.settings(p.settings), img: img }; });
    });
  }
  function errorView(view, e) {
    view.innerHTML = '<div class="ui-wrap"><div class="ui-empty">' + UI.icon('info') + '<h2>This project didn\'t open</h2><p class="muted">' +
      esc(e && e.message || 'It may have been deleted, or it lives in another browser.') + '</p><a class="ui-btn" href="#studio" data-go="studio">' + UI.icon('back') + 'Back to the studio</a></div></div>';
  }
  function slug(t) { return String(t || 'walltracer').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'walltracer'; }
  function download(blob, name) {
    var a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* ================================================================== project: projector & lightbox */
  UI.page('project', { title: 'Projector', chrome: false }, function (view, ctx) {
    var id = ctx.args[0], P = null, S = null, img = null, alive = true, wake = null, art = null, ui = null, hideT = null;
    if (!id) { UI.go('studio'); return Promise.resolve(); }
    var st = Object.assign({ q: null, mode: 'projector', hidden: false, locked: false }, UI.store.get('pin.' + id, null) || {});
    view.innerHTML = '<div class="pj"><div class="pj-load">' + UI.icon('sparkle') + 'Getting the picture ready…</div></div>';

    function save() { UI.store.set('pin.' + id, { q: st.q, mode: st.mode, hidden: st.hidden, locked: st.locked }); }
    function stage() { return view.querySelector('[data-stage]'); }
    function size() { var s = stage(); return [s.clientWidth || window.innerWidth, s.clientHeight || window.innerHeight]; }
    function quadPx() { var z = size(); return st.q.map(function (p) { return [p[0] * z[0], p[1] * z[1]]; }); }
    function setPx(q, done) { var z = size(); st.q = q.map(function (p) { return [p[0] / z[0], p[1] / z[1]]; }); apply(); if (done) save(); }
    function draw() {
      var lb = st.mode === 'lightbox';
      art = artCanvas(P, img, S, 2048, { pad: 0.05, settings: lb ? { color: '#111111', halo: false } : {} });
      var el = view.querySelector('[data-art]');
      el.replaceWith(art.canvas);
      art.canvas.className = 'pin-art'; art.canvas.setAttribute('data-art', '');
      art.canvas.setAttribute('aria-label', P.title);
      if (!st.q) st.q = PIN.fit(art.aw / art.ah, size()[0], size()[1], 0.08);
      apply();
    }
    function apply() {
      var el = view.querySelector('[data-art]'), root = view.querySelector('.pj');
      if (!el || !art) return;
      el.style.transform = PIN.css(quadPx(), art.aw, art.ah, art.ox, art.oy);
      el.style.visibility = st.hidden ? 'hidden' : '';
      root.classList.toggle('lightbox', st.mode === 'lightbox');
      root.classList.toggle('locked', st.locked);
      if (ui) ui.place();
      view.querySelectorAll('[data-act]').forEach(function (b) {
        var a = b.getAttribute('data-act');
        var on = (a === 'hide' && st.hidden) || (a === 'lightbox' && st.mode === 'lightbox') || (a === 'lock' && st.locked);
        b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
      });
      var hb = view.querySelector('[data-act="hide"] b'); if (hb) hb.textContent = st.hidden ? 'Show' : 'Hide';
    }
    function layout() {
      view.innerHTML = '<div class="pj">' +
        '<div class="pj-stage" data-stage><canvas class="pin-art" data-art></canvas></div>' +
        '<div class="pj-tip" data-tip><b>' + esc(P.title) + '</b> · ' + esc(WT.fmtSize({ w: P.w, h: P.h, settings: S })) +
        '<span>Drag the four corners until the picture sits square on the wall (the crosses help). Drag the middle to move it. Then lock it and trace.</span></div>' +
        '<div class="pj-bar" role="toolbar" aria-label="Projector tools">' +
        '<button data-act="back" aria-label="Back to the editor">' + UI.icon('back') + '<b>Back</b></button>' +
        '<button data-act="hide" aria-keyshortcuts="H">' + UI.icon('eye') + '<b>Hide</b></button>' +
        '<button data-act="lightbox" title="Dark lines on white: lay paper over a tablet and trace">' + UI.icon('sun') + '<b>Lightbox</b></button>' +
        '<button data-act="full" aria-keyshortcuts="F">' + UI.icon('external') + '<b>Full screen</b></button>' +
        '<button data-act="reset">' + UI.icon('refresh') + '<b>Reset</b></button>' +
        '<button data-act="lock" class="primary" aria-keyshortcuts="L">' + UI.icon('lock') + '<b>Lock</b></button></div>' +
        '<button class="pj-unlock" data-act="unlock" aria-label="Unlock the corners">' + UI.icon('lockopen') + '</button>' +
        '</div>';
      ui = handles(stage(), null, quadPx, setPx);
      // handles() looks for the picture element on each press, so keep it in sync after a redraw
      stage().addEventListener('pointerdown', function (e) { if (st.locked) e.stopImmediatePropagation(); }, true);
      draw();
    }
    function act(a) {
      if (a === 'back') { UI.go('edit', id); return; }
      if (a === 'hide') st.hidden = !st.hidden;
      else if (a === 'lightbox') { st.mode = st.mode === 'lightbox' ? 'projector' : 'lightbox'; draw(); }
      else if (a === 'lock') st.locked = true;
      else if (a === 'unlock') st.locked = false;
      else if (a === 'reset') st.q = PIN.fit(art.aw / art.ah, size()[0], size()[1], 0.08);
      else if (a === 'full') {
        var d = document;
        if (d.fullscreenElement) { if (d.exitFullscreen) d.exitFullscreen(); }
        else if (d.documentElement.requestFullscreen) d.documentElement.requestFullscreen().catch(function () { UI.toast('This browser won\'t go full screen here: use its own full-screen key (F11).'); });
        return;
      }
      save(); apply();
      if (a === 'lock') UI.toast('Locked. Press L or the small lock to change the corners again.');
    }
    function onClick(e) { var b = e.target.closest('[data-act]'); if (b && view.contains(b)) act(b.getAttribute('data-act')); }
    function onKey(e) {
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      var k = e.key.toLowerCase();
      if (k === 'h' || (k === ' ' && !(e.target.closest && e.target.closest('button')))) { e.preventDefault(); act('hide'); }
      else if (k === 'l') act(st.locked ? 'unlock' : 'lock');
      else if (k === 'f') act('full');
      else if (/^[1-4]$/.test(k) && !st.locked) { var hb = view.querySelectorAll('.pin-h')[+k - 1]; if (hb) hb.focus(); }
    }
    function onResize() { apply(); }
    function poke() {   // when locked, the toolbar stays out of the way; the unlock button wakes up on a touch or mouse move
      var root = view.querySelector('.pj'); if (!root) return;
      root.classList.add('awake'); clearTimeout(hideT); hideT = setTimeout(function () { root.classList.remove('awake'); }, 2500);
    }
    function keepAwake() {
      if (!alive || !navigator.wakeLock || document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(function (w) { wake = w; }, function () { /* not allowed here: fine */ });
    }

    view.addEventListener('click', onClick);
    view.addEventListener('pointermove', poke);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', keepAwake);
    window.WT_FLAT = { screen: 'project', state: function () { return { q: st.q, mode: st.mode, hidden: st.hidden, locked: st.locked }; }, act: act };

    var ready = loadProject(id).then(function (r) {
      if (!alive) return;
      P = r.P; S = r.S; img = r.img;
      document.title = 'Projector · ' + P.title + ' · ' + UI.config.name;
      layout(); keepAwake();
    }).catch(function (e) { errorView(view, e); });
    return {
      ready: ready,
      destroy: function () {
        alive = false; clearTimeout(hideT);
        window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', keepAwake);
        if (wake) { wake.release().catch(function () {}); wake = null; }
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
      }
    };
  });

  /* ================================================================== mockup: see it on my wall */
  var MDB = null;
  function mdb() {
    if (MDB) return MDB;
    MDB = new Promise(function (resolve, reject) {
      try {
        var r = indexedDB.open('walltracer-mockups', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('photos'); };
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error || new Error('This browser can\'t keep photos.')); };
      } catch (e) { reject(e); }
    });
    MDB.catch(function () { MDB = null; });
    return MDB;
  }
  function photoOp(mode, id, value) {
    return mdb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('photos', mode === 'get' ? 'readonly' : 'readwrite'), os = tx.objectStore('photos');
        var rq = mode === 'get' ? os.get(id) : mode === 'put' ? os.put(value, id) : os.delete(id);
        rq.onsuccess = function () { resolve(rq.result); };
        rq.onerror = function () { reject(rq.error); };
      });
    });
  }

  UI.page('mockup', { title: 'See it on my wall' }, function (view, ctx) {
    var id = ctx.args[0], P = null, S = null, img = null, photo = null, photoEl = null, art = null, ui = null, alive = true;
    if (!id) { UI.go('studio'); return Promise.resolve(); }
    var st = Object.assign({ q: null, opacity: 0.85, wall_cm: 300, show: 'lines' }, UI.store.get('mock.' + id, null) || {});
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:520px"></div></div>';

    function save() { UI.store.set('mock.' + id, st); }
    function stage() { return view.querySelector('[data-stage]'); }
    function size() { var s = stage(); return s ? [s.clientWidth || 1, s.clientHeight || 1] : [1, 1]; }
    function quadPx() { var z = size(); return st.q.map(function (p) { return [p[0] * z[0], p[1] * z[1]]; }); }
    function setPx(q, done) { var z = size(); st.q = q.map(function (p) { return [p[0] / z[0], p[1] / z[1]]; }); apply(); if (done) save(); }
    function realSize() {
      var z = size(), frac = S.width_cm / Math.max(10, st.wall_cm), w = frac * z[0], h = w / (art.aw / art.ah);
      var x = (z[0] - w) / 2, y = Math.max(0, (z[1] - h) / 2);
      st.q = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(function (p) { return [p[0] / z[0], p[1] / z[1]]; });
      if (frac > 1) UI.toast('The picture (' + WT.fmtLen(S.width_cm, S.unit) + ') is wider than this part of the wall.', 'error');
    }
    function makeArt() {
      art = artCanvas(P, img, S, 1400, { pad: 0.05, original: st.show === 'picture', noOverlay: st.show === 'picture' });
      var el = view.querySelector('[data-art]');
      if (el) {
        el.replaceWith(art.canvas);
        art.canvas.className = 'pin-art'; art.canvas.setAttribute('data-art', '');
        art.canvas.setAttribute('aria-label', P.title + ' on the wall photo');
      }
    }
    function apply() {
      var el = view.querySelector('[data-art]');
      if (!el || !art || !st.q) return;
      el.style.transform = PIN.css(quadPx(), art.aw, art.ah, art.ox, art.oy);
      el.style.opacity = st.opacity;
      if (ui) ui.place();
    }
    function layout() {
      var has = !!photo;
      view.innerHTML = '<div class="ui-wrap">' +
        '<div class="ed-top"><a class="ui-btn ghost icon" href="#edit/' + esc(id) + '" data-go="edit/' + esc(id) + '" aria-label="Back to the editor">' + UI.icon('back') + '</a>' +
        '<div class="fl-head"><h1>See it on my wall</h1><p class="muted small">' + esc(P.title) + ' · ' + esc(WT.fmtSize({ w: P.w, h: P.h, settings: S })) + '</p></div></div>' +
        '<div class="ed-main"><div class="ed-stage-wrap">' +
        (has ? '<div class="mk-stage" data-stage><img data-photo alt="Your wall" src="' + photo + '"><canvas class="pin-art" data-art></canvas></div>' +
          '<p class="small muted" style="margin:10px 0 0">Drag the four corners onto the spot you want (or onto the marks you drew on the wall). Drag the middle to move it.</p>'
          : '<label class="mk-empty"><input type="file" accept="image/*" data-file hidden>' + UI.icon('camera') +
          '<b>Add a photo of your wall</b><span>Stand straight in front of it. The photo stays in this browser and is never uploaded.</span><span class="ui-btn primary">' + UI.icon('upload') + 'Choose a photo</span></label>') +
        '</div><div class="ed-panel">' +
        '<div class="ui-card"><h3>' + UI.icon('camera') + 'Wall photo</h3><div class="ui-row">' +
        '<label class="ui-btn sm"><input type="file" accept="image/*" data-file hidden>' + UI.icon('upload') + (has ? 'Another photo' : 'Choose a photo') + '</label>' +
        (has ? '<button class="ui-btn sm ghost" data-mk="remove">' + UI.icon('trash') + 'Remove</button>' : '') + '</div>' +
        '<p class="small muted" style="margin:10px 0 0">Doodle-grid painters: draw your squiggles on the wall first, photograph them, then line the picture up here and copy what sits over each squiggle.</p></div>' +
        (has ? '<div class="ui-card"><h3>' + UI.icon('ruler') + 'Real size</h3>' +
          '<label class="ui-field"><span>How wide is the wall in the photo? (cm)</span><input type="number" min="10" max="5000" step="1" data-wallcm value="' + esc(st.wall_cm) + '"></label>' +
          '<button class="ui-btn sm" data-mk="real" style="margin-top:10px">' + UI.icon('target') + 'Place at real size</button>' +
          '<p class="small muted" style="margin:8px 0 0">It puts the picture (' + esc(WT.fmtLen(S.width_cm, S.unit)) + ' wide) in the middle at the right scale. Change the size in the editor.</p></div>' +
          '<div class="ui-card"><h3>' + UI.icon('eye') + 'Show</h3><div class="ui-seg" style="margin-bottom:10px">' +
          [['lines', 'Tracing lines'], ['picture', 'Finished picture']].map(function (o) {
            return '<button data-show="' + o[0] + '" class="' + (st.show === o[0] ? 'on' : '') + '" aria-pressed="' + (st.show === o[0]) + '">' + o[1] + '</button>';
          }).join('') + '</div>' +
          '<label class="ed-sl"><span>Opacity</span><input class="ui-range" type="range" min="0.1" max="1" step="0.05" value="' + st.opacity + '" data-opacity><output data-out>' + Math.round(st.opacity * 100) + '%</output></label>' +
          '<div class="ui-row" style="margin-top:12px"><button class="ui-btn sm primary" data-mk="png">' + UI.icon('download') + 'Download picture</button>' +
          '<button class="ui-btn sm ghost" data-mk="reset">' + UI.icon('refresh') + 'Reset corners</button></div>' +
          '<p class="small muted" style="margin:8px 0 0">Send the picture to whoever shares the wall with you, or to a client, before a drop of paint.</p></div>' : '') +
        '</div></div></div>';
      art = null; ui = null;
      if (!has) return;
      photoEl = view.querySelector('[data-photo]');
      var go = function () {
        if (!alive) return;
        makeArt();
        if (!st.q || !PIN.convex(st.q)) realSize();
        ui = handles(stage(), null, quadPx, setPx);
        apply();
      };
      if (photoEl.complete && photoEl.naturalWidth) go(); else photoEl.addEventListener('load', go, { once: true });
    }
    function exportPng() {
      var W = photoEl.naturalWidth, H = photoEl.naturalHeight;
      var big = artCanvas(P, img, S, 2048, { pad: 0.05, original: st.show === 'picture', noOverlay: st.show === 'picture' });
      var q = st.q.map(function (p) { return [p[0] * W, p[1] * H]; });
      // the picture rectangle sits inside big.canvas at (ox, oy): warp the whole canvas so its picture corners land on q
      var H0 = PIN.homography(q), u0 = -big.ox / big.aw, v0 = -big.oy / big.ah, u1 = 1 + big.ox / big.aw, v1 = 1 + big.oy / big.ah;
      var outer = [PIN.map(H0, u0, v0), PIN.map(H0, u1, v0), PIN.map(H0, u1, v1), PIN.map(H0, u0, v1)];
      var c = WT.canvas(W, H), g = c.getContext('2d'), layer = WT.canvas(W, H);
      g.drawImage(photoEl, 0, 0, W, H);
      PIN.draw(layer.getContext('2d'), big.canvas, outer, 18);
      g.globalAlpha = st.opacity; g.drawImage(layer, 0, 0); g.globalAlpha = 1;
      var fs = Math.max(12, Math.round(W / 70)), label = P.title + ' · ' + WT.fmtSize({ w: P.w, h: P.h, settings: S }) + ' · WallTracer';
      g.font = '600 ' + fs + 'px Inter, Arial, sans-serif'; g.textBaseline = 'bottom';
      var tw = g.measureText(label).width;
      g.fillStyle = 'rgba(20,18,16,.72)'; g.fillRect(fs * 0.8, H - fs * 2.6, tw + fs * 1.2, fs * 1.8);
      g.fillStyle = '#fff'; g.fillText(label, fs * 1.4, H - fs * 1.15);
      c.toBlob(function (b) {
        if (!b) { UI.toast('That picture could not be made.', 'error'); return; }
        download(b, slug(P.title) + '-on-my-wall.png'); UI.toast('Saved to your downloads', 'ok');
      }, 'image/png');
    }
    function setPhoto(file) {
      return WT.readPicture(file, 2000).then(function (pic) {
        photo = pic.image; st.q = null; save();
        return photoOp('put', id, photo).catch(function () { UI.toast('This browser won\'t keep the photo, so it is gone after a reload.'); });
      }).then(function () { layout(); }, function (e) { UI.toast(e.message, 'error'); });
    }

    view.addEventListener('change', function (e) {
      var t = e.target;
      if (t.matches('[data-file]')) { var f = WT.firstFile(t); t.value = ''; if (f) setPhoto(f); }
      else if (t.matches('[data-wallcm]')) { var n = parseFloat(t.value); if (n >= 10) { st.wall_cm = Math.min(5000, n); save(); } }
    });
    view.addEventListener('input', function (e) {
      var t = e.target;
      if (t.matches('[data-opacity]')) { st.opacity = parseFloat(t.value); var o = view.querySelector('[data-out]'); if (o) o.textContent = Math.round(st.opacity * 100) + '%'; apply(); save(); }
    });
    view.addEventListener('click', function (e) {
      var b;
      if ((b = e.target.closest('[data-show]'))) {
        st.show = b.getAttribute('data-show'); save();
        view.querySelectorAll('[data-show]').forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
        makeArt(); apply(); return;
      }
      if (!(b = e.target.closest('[data-mk]'))) return;
      var a = b.getAttribute('data-mk');
      if (a === 'real') { var inp = view.querySelector('[data-wallcm]'), n = parseFloat(inp && inp.value); if (n >= 10) st.wall_cm = Math.min(5000, n); realSize(); save(); apply(); }
      else if (a === 'reset') { st.q = PIN.fit(art.aw / art.ah, size()[0], size()[1], 0.2); save(); apply(); }
      else if (a === 'png') { try { exportPng(); } catch (err) { UI.toast('That picture could not be made: ' + err.message, 'error'); } }
      else if (a === 'remove') {
        UI.confirm({ title: 'Remove the wall photo?', text: 'It is only in this browser, so it is gone for good.', ok: 'Remove', danger: true }).then(function (yes) {
          if (!yes) return;
          photo = null; st.q = null; save();
          photoOp('delete', id).catch(function () {}).then(layout);
        });
      }
    });
    function onResize() { apply(); }
    window.addEventListener('resize', onResize);
    window.WT_FLAT = { screen: 'mockup', state: function () { return { q: st.q, opacity: st.opacity, wall_cm: st.wall_cm, show: st.show, photo: !!photo }; },
      setPhotoUrl: function (url) { photo = url; st.q = null; layout(); } };

    var ready = loadProject(id).then(function (r) {
      if (!alive) return;
      P = r.P; S = r.S; img = r.img;
      document.title = 'See it on my wall · ' + P.title + ' · ' + UI.config.name;
      return photoOp('get', id).catch(function () { return null; }).then(function (ph) { photo = ph || null; layout(); });
    }).catch(function (e) { errorView(view, e); });
    return { ready: ready, destroy: function () { alive = false; window.removeEventListener('resize', onResize); } };
  });

  /* ================================================================== print: real size on paper */
  var PAPERS = { a4: { label: 'A4', w: 210, h: 297 }, letter: { label: 'Letter', w: 215.9, h: 279.4 } };
  var MARGIN = 8, MAX_PAGES = 120;   // mm round each page (printers can't print to the edge); most pages we prepare
  function colName(i) { return i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + i % 26); }

  UI.page('print', { title: 'Print at real size' }, function (view, ctx) {
    var id = ctx.args[0], P = null, S = null, img = null, alive = true, comp = null, busy = false;
    if (!id) { UI.go('studio'); return Promise.resolve(); }
    var st = Object.assign({ paper: 'a4', orient: 'portrait', overlap: 1, cols: 0 }, UI.store.get('print', null) || {});
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:520px"></div></div>';

    function save() { UI.store.set('print', { paper: st.paper, orient: st.orient, overlap: st.overlap }); }
    function sizeMm() { var z = WT.sizeCm({ w: P.w, h: P.h, settings: S }); return { w: z.w * 10, h: z.h * 10 }; }
    function paper() {
      var p = PAPERS[st.paper] || PAPERS.a4, land = st.orient === 'landscape';
      var W = land ? p.h : p.w, H = land ? p.w : p.h;
      return { W: W, H: H, cw: W - 2 * MARGIN, ch: H - 2 * MARGIN, label: p.label };
    }
    function plan() {
      var pp = paper(), z = sizeMm(), ov = st.overlap * 10;
      var sx = pp.cw - ov, sy = pp.ch - ov;
      var cols = Math.max(1, Math.ceil((z.w - ov) / sx - 1e-6)), rows = Math.max(1, Math.ceil((z.h - ov) / sy - 1e-6));
      return { pp: pp, z: z, ov: ov, sx: sx, sy: sy, cols: cols, rows: rows, pages: cols * rows };
    }
    function gridPlan() {
      var cols = st.cols || (S.grid ? S.cols : 6);
      var gr = WT.grid({ w: P.w, h: P.h, settings: Object.assign({}, S, { cols: cols }) }), z = WT.sizeCm({ w: P.w, h: P.h, settings: S });
      return { cols: gr.cols, rows: gr.rows, sw: z.w / gr.cols, sh: z.h / gr.rows, z: z };
    }
    /* The picture on white with dark lines, at k px per mm (at most 4000 px on the long side). */
    function composite() {
      var z = sizeMm(), k = Math.min(6, 4000 / Math.max(z.w, z.h));
      var key = [k, S.look, S.detail, S.levels, S.contrast, S.brightness, S.invert, S.mirror, S.rotate, S.smooth, S.trace, S.thickness].join('|');
      if (comp && comp.key === key) return comp;
      var art = WT.process(img, Object.assign({}, S, { color: '#1a1a1a', halo: false }), Math.round(Math.max(z.w, z.h) * k));
      var c = WT.canvas(z.w * k, z.h * k), g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(art, 0, 0, c.width, c.height);
      comp = { key: key, canvas: c, k: c.width / z.w };
      return comp;
    }
    function fmt(cm) { return WT.fmtLen(cm, S.unit); }
    function num(cm) { return WT.fmtLen(cm, S.unit).replace(/ (cm|in)$/, ''); }

    function layout() {
      var pl = plan(), gp = gridPlan(), unit = S.unit === 'in' ? 'in' : 'cm';
      var tooMany = pl.pages > MAX_PAGES;
      view.innerHTML = '<div class="ui-wrap">' +
        '<div class="ed-top"><a class="ui-btn ghost icon" href="#edit/' + esc(id) + '" data-go="edit/' + esc(id) + '" aria-label="Back to the editor">' + UI.icon('back') + '</a>' +
        '<div class="fl-head"><h1>Print at real size</h1><p class="muted small">' + esc(P.title) + ' · ' + esc(WT.fmtSize({ w: P.w, h: P.h, settings: S })) + '</p></div></div>' +
        '<div class="ed-main"><div class="ed-stage-wrap"><div class="pr-stage"><canvas data-prev aria-label="The picture split into pages"></canvas></div>' +
        '<p class="small muted" style="margin:10px 0 0">Each box is one sheet; the shaded strips overlap so you can line the sheets up. Tape them together on the wall, then trace with carbon paper or pounce the lines.</p></div>' +
        '<div class="ed-panel">' +
        '<div class="ui-card"><h3>' + UI.icon('print') + 'Pages</h3>' +
        '<div class="pr-opts"><div class="ui-seg" role="group" aria-label="Paper">' + Object.keys(PAPERS).map(function (k) {
          return '<button data-paper="' + k + '" class="' + (st.paper === k ? 'on' : '') + '" aria-pressed="' + (st.paper === k) + '">' + PAPERS[k].label + '</button>';
        }).join('') + '</div><div class="ui-seg" role="group" aria-label="Orientation">' + [['portrait', 'Portrait'], ['landscape', 'Landscape']].map(function (o) {
          return '<button data-orient="' + o[0] + '" class="' + (st.orient === o[0] ? 'on' : '') + '" aria-pressed="' + (st.orient === o[0]) + '">' + o[1] + '</button>';
        }).join('') + '</div></div>' +
        '<label class="ed-sl"><span>Overlap</span><input class="ui-range" type="range" min="0" max="3" step="0.5" value="' + st.overlap + '" data-overlap><output data-ovout>' + st.overlap + ' cm</output></label>' +
        '<p class="pr-sum" data-sum><b>' + UI.plural(pl.pages, 'page') + '</b> · ' + pl.cols + ' across × ' + pl.rows + ' down, plus a map page</p>' +
        (tooMany ? '<p class="ui-note">That is a lot of paper. Make it smaller in the editor, use the projector mode, or the grid sheet below (one page).</p>' : '') +
        '<button class="ui-btn primary" data-print="tiles"' + (tooMany ? ' disabled' : '') + '>' + UI.icon('print') + 'Print ' + UI.plural(pl.pages + 1, 'page') + '</button>' +
        '<p class="small muted" style="margin:10px 0 0">In the print dialog choose <b>Actual size / 100%</b>, not "Fit to page". Each sheet has a 5 cm bar: check it with a ruler.</p></div>' +
        '<div class="ui-card"><h3>' + UI.icon('grid') + 'Grid sheet</h3>' +
        '<p class="small muted" style="margin:0 0 8px">For the grid method: one page with the picture in squares and where to draw each chalk line on the wall.</p>' +
        '<label class="ed-sl"><span>Columns</span><input class="ui-range" type="range" min="2" max="16" step="1" value="' + gp.cols + '" data-cols><output data-colsout>' + gp.cols + '</output></label>' +
        '<div class="pr-grid" data-gridinfo>' + gridInfo(gp, unit) + '</div>' +
        '<button class="ui-btn" data-print="grid">' + UI.icon('print') + 'Print the grid sheet</button></div>' +
        '</div></div></div>';
      preview();
    }
    function gridInfo(gp, unit) {
      var xs = [], ys = [], i;
      for (i = 0; i <= gp.cols; i++) xs.push(num(gp.sw * i));
      for (i = 0; i <= gp.rows; i++) ys.push(num(gp.sh * i));
      return '<p><b>' + gp.cols + ' × ' + gp.rows + ' squares</b>, each ' + esc(num(gp.sw)) + ' × ' + esc(fmt(gp.sh)) + ' on the wall.</p>' +
        '<p class="small"><b>Lines from the left edge (' + unit + '):</b> ' + esc(xs.join(', ')) + '</p>' +
        '<p class="small"><b>Lines from the top edge (' + unit + '):</b> ' + esc(ys.join(', ')) + '</p>';
    }
    function preview() {
      var cv = view.querySelector('[data-prev]'); if (!cv) return;
      var pl = plan(), c = composite(), wrap = cv.parentNode;
      var W = Math.min(1400, Math.round((wrap.clientWidth || 600) * Math.min(2, window.devicePixelRatio || 1)));
      var totW = pl.cols * pl.sx + pl.ov, totH = pl.rows * pl.sy + pl.ov;
      var k = Math.min(W / totW, (W * 1.2) / totH), H;
      W = Math.round(totW * k); H = Math.round(totH * k);
      cv.width = W; cv.height = H;
      var g = cv.getContext('2d');
      g.fillStyle = '#f4f1ec'; g.fillRect(0, 0, W, H);
      g.drawImage(c.canvas, 0, 0, pl.z.w * k, pl.z.h * k);
      var lw = Math.max(1, W / 500), fs = Math.max(11, Math.min(pl.sx, pl.sy) * k * 0.16);
      g.font = '700 ' + fs + 'px Inter, Arial, sans-serif'; g.textBaseline = 'top';
      for (var r = 0; r < pl.rows; r++) for (var col = 0; col < pl.cols; col++) {
        var x = col * pl.sx * k, y = r * pl.sy * k, w = pl.pp.cw * k, h = pl.pp.ch * k;
        if (pl.ov) {
          g.fillStyle = 'rgba(47,143,131,.13)';
          if (col < pl.cols - 1) g.fillRect(x + w - pl.ov * k, y, pl.ov * k, h);
          if (r < pl.rows - 1) g.fillRect(x, y + h - pl.ov * k, w, pl.ov * k);
        }
        g.strokeStyle = 'rgba(196,85,45,.9)'; g.lineWidth = lw; g.setLineDash([lw * 5, lw * 3]);
        g.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw); g.setLineDash([]);
        var t = colName(col) + (r + 1);
        g.fillStyle = 'rgba(196,85,45,.92)'; g.fillRect(x + lw * 3, y + lw * 3, g.measureText(t).width + fs * 0.6, fs * 1.3);
        g.fillStyle = '#fff'; g.fillText(t, x + lw * 3 + fs * 0.3, y + lw * 3 + fs * 0.18);
      }
    }
    function blobUrl(c, type) {
      return new Promise(function (resolve) { c.toBlob(function (b) { resolve(b ? URL.createObjectURL(b) : c.toDataURL()); }, type || 'image/png'); });
    }
    function rulerSvg() {
      return '<svg class="pr-ruler" viewBox="0 0 50 5" aria-hidden="true"><path d="M0.2 0v5M10 2.5v2.5M20 2.5v2.5M30 2.5v2.5M40 2.5v2.5M49.8 0v5M0 4.8h50" stroke="#555" stroke-width=".35" fill="none"/></svg>' +
        '<span class="pr-rtext">5 cm</span>';
    }
    /* One sheet per tile + a map page first. Images are made one by one so a big job doesn't freeze the page. */
    function makeTiles(progress) {
      var pl = plan(), c = composite(), k = c.k, out = [], pp = pl.pp;
      var mapCv = WT.canvas(1600, 1600 * (pl.rows * pl.sy + pl.ov) / (pl.cols * pl.sx + pl.ov));
      var prev = view.querySelector('[data-prev]');
      if (prev) mapCv.getContext('2d').drawImage(prev, 0, 0, mapCv.width, mapCv.height);
      var jobs = [], r, col;
      for (r = 0; r < pl.rows; r++) for (col = 0; col < pl.cols; col++) jobs.push([col, r]);
      return blobUrl(mapCv).then(function (mapUrl) {
        out.push('<div class="pr-sheet" style="width:' + pp.W + 'mm;height:' + pp.H + 'mm;padding:' + MARGIN + 'mm">' +
          '<h1>' + esc(P.title) + '</h1><p>' + esc(WT.fmtSize({ w: P.w, h: P.h, settings: S })) + ' on the wall · ' + UI.plural(pl.pages, 'sheet') + ' (' + pl.cols + ' across × ' + pl.rows + ' down) · ' +
          esc(pp.label) + ' ' + esc(st.orient) + ' · overlap ' + st.overlap + ' cm</p>' +
          '<img class="pr-map" src="' + mapUrl + '" alt="">' +
          '<p>Print at <b>Actual size / 100%</b>. Lay the sheets out by their names (A1 top-left), overlap them so the dashed lines meet, and tape them. Made with WallTracer.</p>' +
          '<div class="pr-cal">' + rulerSvg() + '</div></div>');
        var i = 0;
        function next() {
          if (i >= jobs.length) return Promise.resolve(out);
          var j = jobs[i++], cx = j[0], cy = j[1];
          var tw = Math.round(pp.cw * k), th = Math.round(pp.ch * k), t = WT.canvas(tw, th), g = t.getContext('2d');
          g.fillStyle = '#ffffff'; g.fillRect(0, 0, tw, th);
          var x0 = cx * pl.sx, y0 = cy * pl.sy;   // mm in the picture
          var sw = Math.min(pp.cw, pl.z.w - x0), sh = Math.min(pp.ch, pl.z.h - y0);
          if (sw > 0 && sh > 0) g.drawImage(c.canvas, x0 * k, y0 * k, sw * k, sh * k, 0, 0, sw * k, sh * k);
          var lw = Math.max(1, k * 0.3);
          g.strokeStyle = '#9a9a9a'; g.lineWidth = lw; g.setLineDash([k * 2, k * 1.5]);
          g.beginPath();
          if (pl.ov && cx < pl.cols - 1) { g.moveTo(tw - pl.ov * k, 0); g.lineTo(tw - pl.ov * k, th); }
          if (pl.ov && cy < pl.rows - 1) { g.moveTo(0, th - pl.ov * k); g.lineTo(tw, th - pl.ov * k); }
          if (pl.ov && cx > 0) { g.moveTo(pl.ov * k, 0); g.lineTo(pl.ov * k, th); }
          if (pl.ov && cy > 0) { g.moveTo(0, pl.ov * k); g.lineTo(tw, pl.ov * k); }
          g.stroke(); g.setLineDash([]);
          g.strokeStyle = '#555'; g.lineWidth = lw;   // corner ticks
          [[0, 0, 1, 1], [tw, 0, -1, 1], [tw, th, -1, -1], [0, th, 1, -1]].forEach(function (p) {
            g.beginPath(); g.moveTo(p[0], p[1] + p[3] * k * 6); g.lineTo(p[0], p[1]); g.lineTo(p[0] + p[2] * k * 6, p[1]); g.stroke();
          });
          var name = colName(cx) + (cy + 1), fs = k * 5;
          g.font = '700 ' + fs + 'px Inter, Arial, sans-serif'; g.textBaseline = 'top';
          var label = name + '  ·  column ' + colName(cx) + ' of ' + colName(pl.cols - 1) + ', row ' + (cy + 1) + ' of ' + pl.rows;
          g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(k * 3, k * 3, g.measureText(label).width + k * 4, fs * 1.4);
          g.fillStyle = '#333'; g.fillText(label, k * 5, k * 3 + fs * 0.2);
          if (progress) progress(i, jobs.length);
          return blobUrl(t, 'image/png').then(function (url) {
            out.push('<div class="pr-sheet" style="width:' + pp.W + 'mm;height:' + pp.H + 'mm;padding:' + MARGIN + 'mm">' +
              '<img src="' + url + '" alt="" style="width:' + pp.cw + 'mm;height:' + pp.ch + 'mm"><div class="pr-cal in">' + rulerSvg() + '</div></div>');
            return new Promise(function (res) { setTimeout(res, 0); }).then(next);
          });
        }
        return next();
      });
    }
    function makeGridSheet() {
      var gp = gridPlan(), pp = paper(), c = composite(), unit = S.unit === 'in' ? 'in' : 'cm';
      var maxW = 1800, k = maxW / c.canvas.width, gc = WT.canvas(c.canvas.width * k, c.canvas.height * k), g = gc.getContext('2d');
      g.drawImage(c.canvas, 0, 0, gc.width, gc.height);
      var cw = gc.width / gp.cols, ch = gc.height / gp.rows, lw = Math.max(1.5, gc.width / 700), fs = Math.max(14, Math.min(cw, ch) * 0.16);
      g.strokeStyle = 'rgba(196,85,45,.85)'; g.lineWidth = lw;
      g.beginPath();
      for (var i = 0; i <= gp.cols; i++) { g.moveTo(i * cw, 0); g.lineTo(i * cw, gc.height); }
      for (var j = 0; j <= gp.rows; j++) { g.moveTo(0, j * ch); g.lineTo(gc.width, j * ch); }
      g.stroke();
      g.font = '700 ' + fs + 'px Inter, Arial, sans-serif'; g.textBaseline = 'top'; g.fillStyle = 'rgba(196,85,45,.95)';
      for (i = 0; i < gp.cols; i++) for (j = 0; j < gp.rows; j++) g.fillText(WT.cellName(i, j), i * cw + fs * 0.3, j * ch + fs * 0.25);
      return blobUrl(gc).then(function (url) {
        return ['<div class="pr-sheet" style="width:' + pp.W + 'mm;height:' + pp.H + 'mm;padding:' + MARGIN + 'mm">' +
          '<h1>' + esc(P.title) + ': grid sheet</h1><p>' + esc(WT.fmtSize({ w: P.w, h: P.h, settings: S })) + ' on the wall. Made with WallTracer.</p>' +
          '<img class="pr-map" src="' + url + '" alt="">' + gridInfo(gp, unit) +
          '<p>Draw the lines lightly with chalk or a pencil and a level, name the squares like the sheet, then copy one square at a time.</p></div>'];
      });
    }
    function doPrint(sheets) {
      var pp = paper();
      var old = document.querySelector('.wt-print-sheets'); if (old) old.remove();
      var box = document.createElement('div'); box.className = 'wt-print-sheets'; box.innerHTML = sheets.join('');
      document.body.appendChild(box);
      var style = document.createElement('style'); style.className = 'wt-print-page';
      style.textContent = '@page { size: ' + pp.W + 'mm ' + pp.H + 'mm; margin: 0; }';
      document.head.appendChild(style);
      document.documentElement.classList.add('wt-printing');
      var imgs = Array.prototype.slice.call(box.querySelectorAll('img'));
      return Promise.all(imgs.map(function (im) { return im.decode ? im.decode().catch(function () {}) : null; })).then(function () {
        var cleaned = false;
        function clean() {
          if (cleaned) return; cleaned = true;
          document.documentElement.classList.remove('wt-printing');
          imgs.forEach(function (im) { if (/^blob:/.test(im.src)) URL.revokeObjectURL(im.src); });
          box.remove(); style.remove(); window.removeEventListener('afterprint', clean);
        }
        window.addEventListener('afterprint', clean);
        window.print();
        setTimeout(clean, 1500);
      });
    }
    function run(btn, kind) {
      if (busy) return;
      busy = true;
      var label = btn.innerHTML;
      btn.disabled = true; btn.textContent = 'Getting the pages ready…';
      var job = kind === 'grid' ? makeGridSheet() : makeTiles(function (i, n) { btn.textContent = 'Page ' + i + ' of ' + n + '…'; });
      job.then(doPrint).catch(function (e) { UI.toast('The pages could not be made: ' + (e && e.message || e), 'error'); }).then(function () {
        busy = false;
        if (btn.isConnected) { btn.disabled = false; btn.innerHTML = label; }
      });
    }

    view.addEventListener('click', function (e) {
      var b;
      if ((b = e.target.closest('[data-paper]'))) { st.paper = b.getAttribute('data-paper'); save(); layout(); return; }
      if ((b = e.target.closest('[data-orient]'))) { st.orient = b.getAttribute('data-orient'); save(); layout(); return; }
      if ((b = e.target.closest('[data-print]'))) run(b, b.getAttribute('data-print'));
    });
    view.addEventListener('input', function (e) {
      var t = e.target;
      if (t.matches('[data-overlap]')) {
        st.overlap = parseFloat(t.value); save();
        var pl = plan(), o = view.querySelector('[data-ovout]'); if (o) o.textContent = st.overlap + ' cm';
        var sum = view.querySelector('[data-sum]'); if (sum) sum.innerHTML = '<b>' + UI.plural(pl.pages, 'page') + '</b> · ' + pl.cols + ' across × ' + pl.rows + ' down, plus a map page';
        var pb = view.querySelector('[data-print="tiles"]');
        if (pb && !busy) { pb.disabled = pl.pages > MAX_PAGES; pb.innerHTML = UI.icon('print') + 'Print ' + UI.plural(pl.pages + 1, 'page'); }
        preview();
      } else if (t.matches('[data-cols]')) {
        st.cols = parseInt(t.value, 10);
        var co = view.querySelector('[data-colsout]'); if (co) co.textContent = st.cols;
        var gi = view.querySelector('[data-gridinfo]'); if (gi) gi.innerHTML = gridInfo(gridPlan(), S.unit === 'in' ? 'in' : 'cm');
      }
    });
    var rT = null;
    function onResize() { clearTimeout(rT); rT = setTimeout(preview, 150); }
    window.addEventListener('resize', onResize);
    window.WT_FLAT = { screen: 'print', state: function () { var pl = plan(); return { pages: pl.pages, cols: pl.cols, rows: pl.rows, paper: st.paper, orient: st.orient, overlap: st.overlap }; } };

    var ready = loadProject(id).then(function (r) {
      if (!alive) return;
      P = r.P; S = r.S; img = r.img;
      document.title = 'Print · ' + P.title + ' · ' + UI.config.name;
      layout();
    }).catch(function (e) { errorView(view, e); });
    return { ready: ready, destroy: function () { alive = false; clearTimeout(rT); window.removeEventListener('resize', onResize); } };
  });
})();
