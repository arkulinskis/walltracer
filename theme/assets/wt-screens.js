/* wt-screens.js: the two full-screen engines, moved unchanged from the JavaScript version (web/pages/edit.html and
   trace.html). UI.page(name, opts, mount) only registers them (wt-kit.js); Components/Screen mounts one into a page:
   - edit  (#edit/<id>):  live preview + every display setting, autosaves through WT.store
   - trace (#trace/<id>): the tracing session: WebXR passthrough (Quest) or the practice room, shared actions, anchors,
     progress log. Test hooks: window.WT_TRACE. */
(function () {
  var esc = UI.esc;

  function slider(key, label, min, max, step, val, fmt) {
    return '<label class="ed-sl"><span>' + esc(label) + '</span><input class="ui-range" type="range" data-set="' + key + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '">' +
      '<output data-out="' + key + '">' + esc(fmt ? fmt(val) : val) + '</output></label>';
  }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function signed(v) { v = Math.round(v); return (v > 0 ? '+' : '') + v; }

  /* A 170 cm person next to the picture at its real size. */
  function scaleSvg(p) {
    var z = WT.sizeCm(p), w = z.w, h = z.h;
    var bottom = Math.max(40, 150 - h / 2), top = bottom + h;
    var W = 70 + w + 40, H = Math.max(200, top + 20);
    var ax = 70, ay = H - top;
    var person = 'M30,' + (H - 170) + 'a11,11 0 1 1 0.1,0 M30,' + (H - 148) + 'v62 M18,' + (H - 140) + 'l12,-2 12,2 M30,' + (H - 86) + 'l-9,86 M30,' + (H - 86) + 'l9,86 M18,' + (H - 140) + 'l-5,48 M42,' + (H - 140) + 'l5,48';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMax meet" aria-label="The picture next to a 170 cm person">' +
      '<path d="M0,' + H + 'H' + W + '" stroke="var(--c-faint)" stroke-width="' + (W / 200) + '"/>' +
      '<path d="' + person + '" fill="none" stroke="var(--c-muted)" stroke-width="' + Math.max(2, W / 160) + '" stroke-linecap="round"/>' +
      '<rect x="' + ax + '" y="' + ay + '" width="' + w + '" height="' + h + '" rx="' + (Math.min(w, h) / 30) + '" fill="color-mix(in srgb, var(--c-accent) 22%, transparent)" stroke="var(--c-accent)" stroke-width="' + Math.max(1.5, W / 220) + '" stroke-dasharray="' + (W / 60) + ' ' + (W / 90) + '"/>' +
      '</svg>';
  }

  UI.page('edit', { title: 'Adjust' }, function (view, ctx) {
    var id = ctx.args[0], P = null, S = null, img = null, saveT = null, drawT = null, cache = {}, alive = true, pending = null;
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:520px"></div></div>';
    if (!id) { UI.go('studio'); return Promise.resolve(); }

    function layout() {
      var lk = WT.LOOKS.filter(function (l) { return l.key === S.look; })[0];
      var detailLabel = { lines: 'Darkness', outline: 'Detail', zones: 'Smoothness', stencil: 'Darkness' }[S.look];
      view.innerHTML = '<div class="ui-wrap">' +
        '<div class="ed-top"><a class="ui-btn ghost icon" href="#studio" data-go="studio" aria-label="Back to the studio">' + UI.icon('back') + '</a>' +
        '<input class="title" value="' + esc(P.title) + '" maxlength="80" data-title aria-label="Project name"><span class="ed-saved" data-saved></span>' +
        '<a class="ui-btn primary lg" href="#trace/' + esc(P.id) + '" data-go="trace/' + esc(P.id) + '">' + UI.icon('headset') + 'Trace on the wall</a></div>' +
        (WT.isDevice(P.id) && UI.me ? '<p class="ui-note" style="margin-bottom:14px">This project is only in this browser. <button class="ui-btn sm" data-move>' + UI.icon('upload') + 'Save it to my account</button></p>' : '') +
        '<div class="ed-main"><div class="ed-stage-wrap"><div class="ed-stage" data-stage><canvas data-cv></canvas><span class="size" data-size></span><span class="busy" data-busy hidden>Drawing…</span></div>' +
        '<div class="ed-under"><span class="small muted">Wall colour (preview only)</span><div class="wt-swatches">' + WT.WALLS.map(function (w) {
          return '<button class="wt-swatch' + (S.wall === w[0] ? ' on' : '') + '" style="background:' + w[0] + '" data-wall="' + w[0] + '" title="' + esc(w[1]) + '" aria-label="' + esc(w[1]) + '"></button>';
        }).join('') + '</div></div></div>' +
        '<div class="ed-panel">' +
        '<div class="ui-card"><h3>' + UI.icon('sparkle') + 'Look</h3><div class="ed-looks">' + WT.LOOKS.map(function (l) {
          return '<button data-look="' + l.key + '" class="' + (l.key === S.look ? 'on' : '') + '"><canvas data-lookcv="' + l.key + '" width="120" height="120"></canvas>' + esc(l.label) + '</button>';
        }).join('') + '</div><p class="small muted" style="margin:0 0 8px">' + esc(lk.hint) + '</p>' +
        (S.look !== 'photo' ? slider('detail', detailLabel, 0, 100, 1, S.detail) : '') +
        (S.look === 'zones' ? slider('levels', 'Tones', 2, 8, 1, S.levels) : '') +
        slider('contrast', 'Contrast', -100, 100, 1, S.contrast, signed) + slider('brightness', 'Brightness', -100, 100, 1, S.brightness, signed) +
        '<div class="ed-checks"><label class="ui-check"><input type="checkbox" data-set="invert"' + (S.invert ? ' checked' : '') + '> Swap dark and light (for pale pictures)</label></div></div>' +

        '<div class="ui-card"><h3>' + UI.icon('palette') + 'In the headset</h3>' +
        (S.look !== 'photo' ? '<div class="wt-swatches" style="margin-bottom:10px">' + WT.COLORS.map(function (c) {
          return '<button class="wt-swatch' + (S.color === c[0] ? ' on' : '') + '" style="background:' + c[0] + '" data-color="' + c[0] + '" title="' + esc(c[1]) + '" aria-label="' + esc(c[1]) + '"></button>';
        }).join('') + '</div>' + slider('thickness', 'Line width', 1, 6, 1, S.thickness) +
        '<div class="ed-checks"><label class="ui-check"><input type="checkbox" data-set="halo"' + (S.halo ? ' checked' : '') + '> Dark edge round the lines (easier to see on light walls)</label></div>' : '') +
        slider('opacity', 'Opacity', 0.1, 1, 0.05, S.opacity, pct) +
        '<p class="small muted" style="margin:6px 0 0">Bright neon colours read best through passthrough. Opacity can be changed in the headset too (B button).</p></div>' +

        '<div class="ui-card"><h3>' + UI.icon('ruler') + 'Size on the wall</h3><div class="ed-size">' +
        '<label class="ui-field"><span>Width</span><input type="number" min="1" step="1" data-width value="' + esc(S.unit === 'in' ? Math.round(S.width_cm / 2.54 * 10) / 10 : Math.round(S.width_cm)) + '"></label>' +
        '<div class="ui-field"><span>Height</span><div class="h" data-height></div></div>' +
        '<div class="ui-seg" style="margin-bottom:4px">' + ['cm', 'in'].map(function (u) { return '<button data-unit="' + u + '" class="' + (S.unit === u ? 'on' : '') + '">' + u + '</button>'; }).join('') + '</div></div>' +
        '<div class="ed-presets">' + [30, 60, 100, 150, 240].map(function (c) { return '<button class="wt-chip" data-preset="' + c + '">' + esc(WT.fmtLen(c, S.unit)) + '</button>'; }).join('') + '</div>' +
        '<div class="ed-scale" data-scale></div><p class="small muted" style="margin:8px 0 0">It shows at exactly this size on your wall. You can still resize it in the headset with the right stick.</p></div>' +

        '<div class="ui-card"><h3>' + UI.icon('grid') + 'Tracing helpers</h3>' +
        '<div class="ed-checks"><label class="ui-check"><input type="checkbox" data-set="grid"' + (S.grid ? ' checked' : '') + '> Grid, so you can trace one square at a time and tick it off</label></div>' +
        (S.grid ? slider('cols', 'Columns', 1, 12, 1, S.cols) + '<div class="ed-checks"><label class="ui-check"><input type="checkbox" data-set="labels"' + (S.labels ? ' checked' : '') + '> Square names (A1, B2…)</label></div>' : '') +
        '<div class="ed-checks"><label class="ui-check"><input type="checkbox" data-set="marks"' + (S.marks ? ' checked' : '') + '> Registration crosses at the corners and centre</label>' +
        (S.marks ? '<label class="ui-check"><input type="checkbox" data-set="marks_hidden"' + (S.marks_hidden ? ' checked' : '') + '> Keep the crosses when the picture is hidden</label>' : '') + '</div>' +
        '<p class="small muted" style="margin:8px 0 12px">Tip: mark the crosses on the wall first. Next time, line the picture up with them and carry on exactly where you stopped.</p>' +
        '<div class="ed-two"><label class="ui-field"><span>Blink check</span><select data-set="blink">' + [[0, 'Off'], [3, 'Every 3 s'], [5, 'Every 5 s'], [10, 'Every 10 s']].map(function (o) {
          return '<option value="' + o[0] + '"' + (S.blink === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('') + '</select></label>' +
        '<label class="ui-field"><span>Pencil in my</span><select data-set="pencil"><option value="right"' + (S.pencil === 'right' ? ' selected' : '') + '>Right hand</option><option value="left"' + (S.pencil === 'left' ? ' selected' : '') + '>Left hand</option></select></label></div>' +
        '<p class="small muted" style="margin:8px 0 0">Blink hides the picture for a moment now and then, so you see what you\'ve drawn. A pinch with your free hand shows or hides it.</p></div>' +

        '<div class="ui-card"><h3>' + UI.icon('image') + 'Picture</h3><div class="ui-row">' +
        '<button class="ui-btn sm" data-turn="-90">' + UI.icon('rotate') + 'Turn left</button><button class="ui-btn sm" data-turn="90">' + UI.icon('rotate') + 'Turn right</button>' +
        '<button class="ui-btn sm' + (S.mirror ? ' primary' : '') + '" data-mirror>' + UI.icon('mirror') + 'Mirror</button></div>' +
        '<label class="ui-field" style="margin-top:14px"><span>Notes <em>(paint, brushes, which wall…)</em></span><textarea data-notes maxlength="2000" rows="3" placeholder="e.g. Sage green 0.5 L, angled brush, painter\'s tape">' + esc(P.notes || '') + '</textarea></label>' +
        '<div class="ui-row" style="margin-top:12px"><button class="ui-btn sm danger" data-del>' + UI.icon('trash') + 'Delete project</button></div></div>' +
        '</div></div></div>';
      sizeInfo();
      drawLookThumbs();
      schedule(0);
    }

    function sizeInfo() {
      var z = WT.sizeCm({ w: P.w, h: P.h, settings: S });
      var hEl = view.querySelector('[data-height]'); if (hEl) hEl.textContent = WT.fmtLen(z.h, S.unit);
      var sz = view.querySelector('[data-size]'); if (sz) sz.textContent = WT.fmtSize({ w: P.w, h: P.h, settings: S });
      var sc = view.querySelector('[data-scale]'); if (sc) sc.innerHTML = scaleSvg({ w: P.w, h: P.h, settings: S });
    }

    function processed(maxSide) {
      var key = JSON.stringify([S.look, S.detail, S.levels, S.contrast, S.brightness, S.color, S.thickness, S.halo, S.invert, S.mirror, S.rotate, maxSide]);
      if (!cache[key]) { cache = {}; cache[key] = WT.process(img, S, maxSide); }
      return cache[key];
    }
    function render() {
      var cv = view.querySelector('[data-cv]'), stage = view.querySelector('[data-stage]');
      if (!cv) return;
      var busy = view.querySelector('[data-busy]');
      var art = processed(900);
      var a = art.width / art.height, mg = 0.09;
      var cw = Math.min(1400, Math.round((stage.clientWidth || 600) * Math.min(2, window.devicePixelRatio || 1)));
      var aw = cw / (1 + mg * 2), ah = aw / a, ch = Math.round(ah + aw * mg * 2);
      if (ch > cw * 1.25) { ch = Math.round(cw * 1.25); ah = ch - aw * mg * 2; aw = ah * a; }
      cv.width = cw; cv.height = ch;
      var g = cv.getContext('2d'), X = (cw - aw) / 2, Y = (ch - ah) / 2;
      g.fillStyle = S.wall; g.fillRect(0, 0, cw, ch);
      // a soft light across the wall
      var gr = g.createRadialGradient(cw * 0.3, 0, 0, cw * 0.3, 0, cw * 1.1);
      gr.addColorStop(0, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(0,0,0,.08)');
      g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
      g.globalAlpha = S.opacity; g.drawImage(art, X, Y, aw, ah); g.globalAlpha = 1;
      WT.drawOverlay(g, X, Y, aw, ah, { w: P.w, h: P.h, settings: S }, { grid: S.grid, labels: S.labels, marks: S.marks, done: P.done || [] });
      stage.style.background = S.wall;
      if (busy) busy.hidden = true;
    }
    function schedule(ms) {
      clearTimeout(drawT);
      var busy = view.querySelector('[data-busy]'); if (busy) busy.hidden = false;
      drawT = setTimeout(function () { if (alive) render(); }, ms == null ? 90 : ms);
    }
    function drawLookThumbs() {
      WT.LOOKS.forEach(function (l, i) {
        setTimeout(function () {
          var c = view.querySelector('[data-lookcv="' + l.key + '"]');
          if (!c || !alive) return;
          var t = WT.process(img, Object.assign({}, S, { look: l.key, thickness: 3, halo: false }), 420), g = c.getContext('2d');
          g.fillStyle = '#3a3f44'; g.fillRect(0, 0, 120, 120);
          var k = Math.min(110 / t.width, 110 / t.height);
          g.drawImage(t, (120 - t.width * k) / 2, (120 - t.height * k) / 2, t.width * k, t.height * k);
        }, 40 + i * 30);
      });
    }
    function save(patch, quick) {
      var saved = view.querySelector('[data-saved]');
      if (saved) saved.textContent = 'Saving…';
      clearTimeout(saveT);
      pending = Object.assign(pending || {}, patch || { settings: S });
      saveT = setTimeout(function () {
        var send = pending; pending = null; saveT = null;
        WT.store.update(P.id, send).then(function (np) {
          if (np && np.updated) P.updated = np.updated;
          var el = view.querySelector('[data-saved]'); if (el) el.textContent = 'Saved';
        }, function (e) { var el = view.querySelector('[data-saved]'); if (el) el.textContent = ''; UI.toast(e.message, 'error'); });
      }, quick ? 0 : 600);
    }
    function set(k, v, relayout) {
      S[k] = v;
      save();
      if (relayout) { var y = window.scrollY; layout(); window.scrollTo(0, y); return; }
      sizeInfo(); schedule();
    }

    view.addEventListener('input', function (e) {
      var t = e.target, k = t.getAttribute('data-set');
      if (k && t.type === 'range') {
        var v = parseFloat(t.value);
        var out = view.querySelector('[data-out="' + k + '"]');
        if (out) out.textContent = k === 'opacity' ? pct(v) : (k === 'contrast' || k === 'brightness') ? signed(v) : v;
        set(k, v);
        if (k === 'contrast' || k === 'brightness' || k === 'detail') { clearTimeout(t._lt); t._lt = setTimeout(drawLookThumbs, 400); }
      } else if (t.matches('[data-width]')) {
        var n = parseFloat(t.value);
        if (n > 0) { S.width_cm = Math.max(5, Math.min(1000, S.unit === 'in' ? n * 2.54 : n)); save(); sizeInfo(); }
      } else if (t.matches('[data-notes]')) {
        P.notes = t.value; save({ notes: t.value });
      }
    });
    view.addEventListener('change', function (e) {
      var t = e.target, k = t.getAttribute('data-set');
      if (k && t.type === 'checkbox') set(k, t.checked, ['grid', 'marks', 'halo'].indexOf(k) >= 0);
      else if (k && t.tagName === 'SELECT') set(k, k === 'blink' ? parseInt(t.value, 10) : t.value);
      else if (t.matches('[data-title]')) {
        var v = t.value.trim();
        if (!v) { t.value = P.title; return; }
        P.title = v; save({ title: v }, true);
      }
    });
    view.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.matches('[data-title]')) e.target.blur(); });
    view.addEventListener('click', function (e) {
      var b;
      if ((b = e.target.closest('[data-look]'))) { set('look', b.getAttribute('data-look'), true); return; }
      if ((b = e.target.closest('[data-color]'))) { set('color', b.getAttribute('data-color'), true); return; }
      if ((b = e.target.closest('[data-wall]'))) { set('wall', b.getAttribute('data-wall'), true); return; }
      if ((b = e.target.closest('[data-unit]'))) { set('unit', b.getAttribute('data-unit'), true); return; }
      if ((b = e.target.closest('[data-preset]'))) { set('width_cm', +b.getAttribute('data-preset'), true); return; }
      if ((b = e.target.closest('[data-turn]'))) { set('rotate', (S.rotate + parseInt(b.getAttribute('data-turn'), 10) + 360) % 360, true); return; }
      if (e.target.closest('[data-mirror]')) { set('mirror', !S.mirror, true); return; }
      if ((b = e.target.closest('[data-move]'))) {
        UI.busy(b, WT.store.moveToAccount(P.id)).then(function (np) { UI.toast('Saved to your account', 'ok'); if (np) UI.go('edit', np.id); });
        return;
      }
      if (e.target.closest('[data-del]')) {
        UI.confirm({ title: 'Delete "' + P.title + '"?', text: 'The picture, its settings and your progress are deleted.', ok: 'Delete', danger: true }).then(function (yes) {
          if (yes) WT.store.remove(P.id).then(function () { UI.toast('Deleted'); UI.go('studio'); });
        });
      }
    });
    function onResize() { schedule(150); }
    window.addEventListener('resize', onResize);

    var ready = WT.store.get(id).then(function (p) {
      P = p; S = WT.settings(p.settings);
      document.title = p.title + ' · ' + UI.config.name;
      return WT.loadImage(p.image);
    }).then(function (im) { img = im; layout(); render(); });
    return {
      ready: ready,
      destroy: function () {
        alive = false; window.removeEventListener('resize', onResize);
        if (pending) { clearTimeout(saveT); WT.store.update(P.id, pending).catch(function () {}); }
      }
    };
  });
})();

(function () {
  'use strict';
  var esc = UI.esc;
  var PANEL_W = 1024;  // menu canvas px
  var AKEY = 'walltracer.anchor.', PKEY = 'walltracer.anchorphase.';  // this browser: saved wall spot + its step

  UI.page('trace', { title: 'Trace', chrome: false }, function (view, ctx) {
    var id = ctx.args[0];
    var T, P, S, img, renderer, scene, camera, V3, Q;
    var alive = true, listeners = [], last = 0;
    function on(t, ev, fn, o) { t.addEventListener(ev, fn, o); listeners.push([t, ev, fn, o]); }

    var st = {
      mode: 'intro',        // intro | flat | xr
      kind: null,           // ar | vr (in the headset)
      phase: 'place',       // place | adjust | locked
      method: 'aim',        // aim | touch | float
      shown: true, blinkOff: false, blinkT: 0,
      spot: null, panel: false, touchPts: [],
      activeMs: 0, loggedMs: 0, newSession: true, sessionMs: 0, sessionCells: 0,
      surface: null,        // {normal, point, horizontal, free}
      pencil: true, hover: null, toastT: 0
    };
    var art, artMesh, ovMesh, room = null, reticle, tipDot, touchDots = [];
    var C = { art: null, comp: null, ov: null, margin: 0 }, TX = { art: null, ov: null };
    var looks = {};
    var xr = { session: null, inputs: {}, hitSources: new Map(), pendingHit: new Set(), viewerHit: null, anchor: null, wantAnchor: false,
      buttons: {}, grab: null, selStart: new Map(), hasHitTest: false, panelMesh: null, panelCanvas: null, panelButtons: [], toastMesh: null,
      toastCanvas: null, rays: {}, head: null, headQ: null, needPanel: false, restoring: false, stickLatch: {},
      poseGen: 0, moveT: 0, anchorPending: false, lostT: 0, yDown: 0, yWarned: false, tips: {}, tipsUntil: 0, panelWorld: null };
    var flat = { yaw: 0, pitch: -0.08, fov: 58, drag: null, ptr: null, raycaster: null, ndc: null, lastDraw: null };

    view.innerHTML = '<div class="tr"><canvas class="tr-cv" tabindex="0" aria-label="Tracing view"></canvas><div class="tr-ov" data-ov></div></div>';
    var cv = view.querySelector('.tr-cv'), ov = view.querySelector('[data-ov]');

    /* ================================================================== textures */
    var pseudo = function () { return { w: P.w, h: P.h, settings: S }; };
    function lookCanvas() {
      var key = [S.look, S.detail, S.levels, S.contrast, S.brightness, S.color, S.thickness, S.halo, S.invert, S.mirror, S.rotate].join('|');
      if (!looks[key]) looks[key] = WT.process(img, S, 2048);
      return looks[key];
    }
    function buildTextures() {
      C.art = lookCanvas();
      var aw = C.art.width, ah = C.art.height, m = Math.round(Math.max(aw, ah) * 0.06);
      C.margin = m;
      C.comp = WT.canvas(aw, ah);
      C.ov = WT.canvas(aw + 2 * m, ah + 2 * m);
      TX.art = new T.CanvasTexture(C.art); TX.ov = new T.CanvasTexture(C.ov);
      [TX.art, TX.ov].forEach(function (t) {
        t.colorSpace = T.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
        t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true;
      });
    }
    function refreshArt() {
      var src = lookCanvas();
      if (src.width !== C.art.width || src.height !== C.art.height) { C.art = src; TX.art.dispose(); }
      C.art = src;
      if (st.spot && S.grid) {
        var g = C.comp.getContext('2d'), gr = WT.grid(pseudo()), cw = C.art.width / gr.cols, ch = C.art.height / gr.rows;
        if (C.comp.width !== C.art.width) { C.comp.width = C.art.width; C.comp.height = C.art.height; }
        g.clearRect(0, 0, C.comp.width, C.comp.height);
        g.globalAlpha = 0.12; g.drawImage(C.art, 0, 0); g.globalAlpha = 1;
        g.save(); g.beginPath(); g.rect(st.spot[0] * cw, st.spot[1] * ch, cw, ch); g.clip(); g.drawImage(C.art, 0, 0); g.restore();
        TX.art.image = C.comp;
      } else TX.art.image = C.art;
      TX.art.needsUpdate = true;
    }
    function artVisible() { return st.phase === 'place' || (st.shown && !st.blinkOff && !st.peek); }
    function refreshOverlay() {
      var g = C.ov.getContext('2d'), m = C.margin;
      g.clearRect(0, 0, C.ov.width, C.ov.height);
      var vis = artVisible();
      WT.drawOverlay(g, m, m, C.art.width, C.art.height, pseudo(), {
        grid: S.grid && vis, labels: S.labels, marks: S.marks && (vis || S.marks_hidden), done: P.done || [], spot: vis && S.grid ? st.spot : null, onlyMarks: !vis });
      TX.ov.needsUpdate = true;
    }
    function applyVis() {
      if (!artMesh) return;
      artMesh.visible = artVisible();
      artMesh.material.opacity = st.phase === 'place' ? Math.min(0.55, S.opacity) : S.opacity;
      refreshOverlay();
    }
    function applySize() {
      var wm = S.width_cm / 100, hm = wm * C.art.height / C.art.width;
      artMesh.scale.set(wm, hm, 1);
      var k = (C.art.width + 2 * C.margin) / C.art.width;
      ovMesh.scale.set(wm * k, hm * (C.art.height + 2 * C.margin) / C.art.height, 1);
    }

    /* ================================================================== the scene */
    function init3D() {
      V3 = T.Vector3; Q = T.Quaternion;
      renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.xr.enabled = true;
      renderer.xr.setReferenceSpaceType('local-floor');
      scene = new T.Scene();
      camera = new T.PerspectiveCamera(flat.fov, 1, 0.02, 60);
      camera.position.set(0, 1.55, 1.1);
      scene.add(camera);
      buildTextures();
      art = new T.Group();
      var mat = new T.MeshBasicMaterial({ map: TX.art, transparent: true, opacity: S.opacity, depthWrite: false, side: T.DoubleSide, toneMapped: false });
      artMesh = new T.Mesh(new T.PlaneGeometry(1, 1), mat);
      artMesh.position.z = 0.0008; artMesh.renderOrder = 10;
      ovMesh = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: TX.ov, transparent: true, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
      ovMesh.position.z = 0.0016; ovMesh.renderOrder = 11;
      art.add(artMesh); art.add(ovMesh);
      art.visible = false;
      scene.add(art);
      reticle = new T.Mesh(new T.RingGeometry(0.035, 0.05, 40), new T.MeshBasicMaterial({ color: 0x00e5ff, side: T.DoubleSide, depthTest: false, transparent: true, opacity: 0.9 }));
      reticle.renderOrder = 20; reticle.visible = false; reticle.matrixAutoUpdate = true;
      scene.add(reticle);
      tipDot = new T.Mesh(new T.SphereGeometry(0.008, 16, 12), new T.MeshBasicMaterial({ color: 0xff5d3a, depthTest: false }));
      tipDot.renderOrder = 21; tipDot.visible = false; scene.add(tipDot);
      buildRoom();
      refreshArt(); applySize(); applyVis();
      flat.raycaster = new T.Raycaster(); flat.ndc = new T.Vector2();
      resize();
      on(window, 'resize', resize);
      renderer.setAnimationLoop(frame);
    }

    /* A small room for the flat preview (and VR without passthrough): a wall you can draw on, a floor, a table, a plant. */
    function surfaceCanvas(w, h, color, grain) {
      var c = WT.canvas(w, h), g = c.getContext('2d');
      g.fillStyle = color; g.fillRect(0, 0, w, h);
      for (var i = 0; i < w * h / 260; i++) {
        g.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '0,0,0' : '255,255,255') + ',' + (Math.random() * grain).toFixed(3) + ')';
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      return c;
    }
    function drawable(mesh, canvas, wm, hm) {
      var t = new T.CanvasTexture(canvas); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
      mesh.material.map = t; mesh.material.needsUpdate = true;
      mesh.userData.draw = { canvas: canvas, g: canvas.getContext('2d'), tex: t, wm: wm, hm: hm, base: null };
      mesh.userData.draw.base = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    }
    function buildRoom() {
      room = new T.Group();
      var wall = new T.Mesh(new T.PlaneGeometry(6, 3.4), new T.MeshBasicMaterial({ color: 0xf6f2ec }));
      wall.position.set(0, 1.7, -2.2); wall.userData.surface = true;
      drawable(wall, surfaceCanvas(2400, 1360, S.wall, 0.05), 6, 3.4);
      var side = new T.Mesh(new T.PlaneGeometry(5, 3.4), new T.MeshLambertMaterial({ color: new T.Color(S.wall).multiplyScalar(0.86) }));
      side.position.set(-3, 1.7, 0.3); side.rotation.y = Math.PI / 2; side.userData.surface = true;
      var floorC = WT.canvas(1024, 1024), fg = floorC.getContext('2d');
      fg.fillStyle = '#b58b62'; fg.fillRect(0, 0, 1024, 1024);
      for (var y = 0; y < 1024; y += 64) { fg.fillStyle = 'rgba(80,50,30,.25)'; fg.fillRect(0, y, 1024, 3); for (var x = (y / 64 % 2) * 180; x < 1024; x += 360) fg.fillRect(x, y, 3, 64); }
      var floorT = new T.CanvasTexture(floorC); floorT.colorSpace = T.SRGBColorSpace; floorT.wrapS = floorT.wrapT = T.RepeatWrapping; floorT.repeat.set(3, 3);
      var floor = new T.Mesh(new T.PlaneGeometry(8, 8), new T.MeshLambertMaterial({ map: floorT }));
      floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 0.6); floor.userData.surface = true;
      var skirt = new T.Mesh(new T.BoxGeometry(6, 0.1, 0.02), new T.MeshLambertMaterial({ color: 0xf4efe6 }));
      skirt.position.set(0, 0.05, -2.19);
      var top = new T.Mesh(new T.PlaneGeometry(1.3, 0.75), new T.MeshLambertMaterial({ color: 0xffffff }));
      top.rotation.x = -Math.PI / 2; top.position.set(1.75, 0.761, -1.15); top.userData.surface = true;
      drawable(top, surfaceCanvas(1040, 600, '#e8d9c2', 0.06), 1.3, 0.75);
      var slab = new T.Mesh(new T.BoxGeometry(1.3, 0.04, 0.75), new T.MeshLambertMaterial({ color: 0xc9a77d }));
      slab.position.set(1.75, 0.74, -1.15);
      room.add(wall, side, floor, skirt, top, slab);
      [[-0.6, -0.33], [0.6, -0.33], [-0.6, 0.33], [0.6, 0.33]].forEach(function (l) {
        var leg = new T.Mesh(new T.BoxGeometry(0.05, 0.72, 0.05), new T.MeshLambertMaterial({ color: 0x8b6a4a }));
        leg.position.set(1.75 + l[0], 0.36, -1.15 + l[1]); room.add(leg);
      });
      var pot = new T.Mesh(new T.CylinderGeometry(0.16, 0.12, 0.34, 24), new T.MeshLambertMaterial({ color: 0xc4552d }));
      pot.position.set(-2.2, 0.17, -1.7); room.add(pot);
      for (var i = 0; i < 7; i++) {
        var leaf = new T.Mesh(new T.ConeGeometry(0.06, 0.7 + Math.random() * 0.4, 6), new T.MeshLambertMaterial({ color: 0x3b7a57 }));
        leaf.position.set(-2.2 + Math.cos(i) * 0.08, 0.6 + Math.random() * 0.2, -1.7 + Math.sin(i) * 0.08);
        leaf.rotation.set(Math.sin(i * 2) * 0.5, 0, Math.cos(i * 2) * 0.5); room.add(leaf);
      }
      room.add(new T.HemisphereLight(0xfff8ee, 0x8a6f55, 1.25));
      var sun = new T.DirectionalLight(0xffffff, 0.7); sun.position.set(2, 4, 3); room.add(sun);
      scene.add(room);
      scene.background = new T.Color(0x1d1a17);
    }
    function surfaces() { var out = []; if (room && room.visible) room.traverse(function (o) { if (o.userData && o.userData.surface) out.push(o); }); return out; }
    function applyEnv() {
      var ar = st.mode === 'xr' && st.kind === 'ar';
      room.visible = !ar;
      scene.background = ar ? null : new T.Color(0x1d1a17);
      renderer.setClearColor(0x000000, ar ? 0 : 1);
    }
    function resize() {
      if (!renderer || renderer.xr.isPresenting) return;
      var w = view.clientWidth || window.innerWidth, h = view.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }

    /* ================================================================== placing + orienting */
    var UP = null;
    function headPos() {
      if (st.mode === 'xr' && xr.head) return xr.head.clone();
      return camera.position.clone();
    }
    function orientation(normal, rotDeg, point) {
      UP = UP || new V3(0, 1, 0);
      var n = normal.clone().normalize(), y;
      if (Math.abs(n.dot(UP)) > 0.85) {           // table / floor: the picture's top points away from you
        y = point.clone().sub(headPos()).projectOnPlane(n);
        if (y.lengthSq() < 1e-6) y = new V3(0, 0, -1).projectOnPlane(n);
        y.normalize();
      } else y = UP.clone().projectOnPlane(n).normalize();  // wall: upright
      var x = new V3().crossVectors(y, n).normalize();
      var q = new Q().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, n));
      return q.multiply(new Q().setFromAxisAngle(new V3(0, 0, 1), (rotDeg || 0) * Math.PI / 180));
    }
    function applyOrientation() {
      if (!st.surface) return;
      art.quaternion.copy(orientation(st.surface.normal, S.rot, st.surface.point));
    }
    function setPose(pos, normal, free) {
      var n = normal.clone().normalize(), toHead = headPos().sub(pos);
      if (n.dot(toHead) < 0) n.negate();
      st.surface = { normal: n, point: pos.clone(), horizontal: Math.abs(n.y) > 0.85, free: !!free };
      art.position.copy(pos).addScaledVector(n, 0.001);
      applyOrientation();
      art.visible = true;
      moved();
    }
    /* In the headset the picture is held by a real-world anchor as soon as it's placed (not only once locked), so
       it stays on the wall when the headset recentres, e.g. after you step out of the boundary and back. Any move
       drops the anchor; a new one is made once the picture has been still for a moment. */
    function moved() {
      xr.poseGen++; xr.moveT = performance.now();
      if (xr.anchor) { try { xr.anchor.delete(); } catch (e) {} xr.anchor = null; }
    }
    function placeAt(pos, normal, free) {
      setPose(pos, normal, free);
      st.phase = 'adjust'; st.shown = true; st.touchPts = []; clearTouchDots();
      applyVis(); changed();
      say(st.mode === 'xr' ? 'Stuck! Pull the trigger anywhere on the wall to move it there. Click the right stick to lock.' : 'Placed. Drag it to move, scroll to resize, Q / E to turn. Then lock it.');
      if (st.mode === 'xr') haptic(null, 0.6, 60);
    }
    /* adjust phase: pull the trigger at another spot and the picture jumps there, keeping its size and turn */
    function stickAt(hit) {
      setPose(hit.pos, hit.normal, false); st.surface.fromHit = true;
      st.shown = true; applyVis(); changed(); haptic(null, 0.5, 40);
      say('Moved here. Click the right stick to lock it.');
    }
    function placeFloat() {
      var h = headPos(), fwd = new V3(0, 0, -1);
      if (st.mode === 'xr' && xr.headQ) fwd.applyQuaternion(xr.headQ); else fwd.applyQuaternion(camera.quaternion);
      fwd.y = 0; if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1); fwd.normalize();
      var pos = h.clone().addScaledVector(fwd, 1.1); pos.y = Math.max(0.6, h.y - 0.1);
      placeAt(pos, fwd.clone().negate(), true);
    }
    function addTouchPoint(p) {
      st.touchPts.push(p.clone());
      var dot = new T.Mesh(new T.SphereGeometry(0.01, 14, 10), new T.MeshBasicMaterial({ color: 0x00e5ff, depthTest: false }));
      dot.position.copy(p); dot.renderOrder = 22; scene.add(dot); touchDots.push(dot);
      haptic(null, 0.6, 60);
      var n = st.touchPts.length;
      if (n < 3) { say(n === 1 ? 'Point 1 is the centre of your picture. Now touch the wall a hand-width to the side.' : 'Now one more spot, a hand-width above or below.'); changed(); return; }
      var a = st.touchPts[0], b = st.touchPts[1], c = st.touchPts[2];
      var nrm = new V3().crossVectors(b.clone().sub(a), c.clone().sub(a));
      if (nrm.length() < 1e-4) { say('Those points are in a line. Let\'s try again: touch the centre first.'); st.touchPts = []; clearTouchDots(); return; }
      placeAt(a, nrm.normalize(), false);
    }
    function clearTouchDots() { touchDots.forEach(function (d) { scene.remove(d); d.geometry.dispose(); }); touchDots = []; }

    /* ================================================================== actions (toolbar + headset menu) */
    function actions() {
      var a = [], inXR = st.mode === 'xr', locked = st.phase === 'locked';
      if (st.phase === 'place') {
        if (!inXR || xr.hasHitTest) a.push({ id: 'm-aim', label: inXR ? 'Aim at wall' : 'Click to place', icon: 'target', on: st.method === 'aim' });
        if (inXR) a.push({ id: 'm-touch', label: 'Touch 3 points', icon: 'hand', on: st.method === 'touch' });
        a.push({ id: 'm-float', label: 'Float in front', icon: 'image' });
        a.push({ id: 'look', label: 'Look: ' + WT.lookLabel(S.look), icon: 'sparkle', key: 'M' });
      } else if (st.phase === 'adjust') {
        a.push({ id: 'lock', label: 'Lock in place', icon: 'lock', primary: true, key: 'L' });
        if (inXR) a.push({ id: 'toggle', label: st.shown ? 'Hide picture' : 'Show picture', icon: st.shown ? 'eyeoff' : 'eye' });
        a.push({ id: 'replace', label: 'Place again', icon: 'target' });
        a.push({ id: 'smaller', label: 'Smaller', icon: 'chevron', key: '-' }, { id: 'bigger', label: 'Bigger', icon: 'plus', key: '+' });
        a.push({ id: 'turnL', label: 'Turn left', icon: 'rotate', key: 'Q' }, { id: 'turnR', label: 'Turn right', icon: 'rotate', key: 'E' }, { id: 'level', label: 'Level', icon: 'ruler' });
        a.push({ id: 'out', label: 'Pull out', icon: 'arrow' }, { id: 'in', label: 'Push in', icon: 'back' });
        a.push({ id: 'look', label: WT.lookLabel(S.look), icon: 'sparkle', key: 'M' }, { id: 'opacity', label: Math.round(S.opacity * 100) + '%', icon: 'eye', key: 'O' });
        a.push({ id: 'grid', label: 'Grid', icon: 'grid', on: S.grid, key: 'G' }, { id: 'marks', label: 'Crosses', icon: 'cross', on: S.marks, key: 'C' });
      } else {
        a.push({ id: 'toggle', label: st.shown ? 'Hide picture' : 'Show picture', icon: st.shown ? 'eyeoff' : 'eye', primary: true, key: 'H' });
        a.push({ id: 'look', label: WT.lookLabel(S.look), icon: 'sparkle', key: 'M' }, { id: 'opacity', label: Math.round(S.opacity * 100) + '%', icon: 'eye', key: 'O' });
        a.push({ id: 'grid', label: 'Grid', icon: 'grid', on: S.grid, key: 'G' }, { id: 'spot', label: 'Spotlight', icon: 'spot', on: !!st.spot, key: 'S' });
        if (st.spot) a.push({ id: 'prev', label: 'Prev square', icon: 'back' }, { id: 'next', label: 'Next square', icon: 'arrow' }, { id: 'cell', label: 'Square done', icon: 'check', key: 'D' });
        a.push({ id: 'blink', label: S.blink ? 'Blink ' + S.blink + ' s' : 'Blink off', icon: 'blink', on: !!S.blink, key: 'B' }, { id: 'marks', label: 'Crosses', icon: 'cross', on: S.marks, key: 'C' });
        if (!inXR || st.kind === 'vr') a.push({ id: 'pencil', label: 'Pencil', icon: 'pencil', on: st.pencil, key: 'P' }, { id: 'clear', label: 'Rub out', icon: 'refresh' });
        a.push({ id: 'unlock', label: 'Unlock', icon: 'lockopen', key: 'L' });
      }
      if (window.ArkMusic) a.push({ id: 'music', label: musicOn() ? 'Music on' : 'Music', icon: 'music', on: musicOn() });
      if (inXR) a.push({ id: 'tips', label: 'Button labels', icon: 'info', on: tipsOn() }, { id: 'close', label: 'Close menu', icon: 'x' });
      a.push({ id: 'exit', label: inXR ? 'Leave VR' : 'Finish', icon: 'flag', danger: inXR });
      return a;
    }
    /* Focus music while you trace: lo-fi tracks streamed by ArkMusic (web/pages/_arkmusic.html). Off until you
       press Music (remembered in this browser); it keeps playing inside the headset. */
    var MUSIC = ['cosmic', 'bright-road', 'toulouse', 'high-notes'];
    function musicOn() { return !!UI.store.get('trace_music', false); }
    function tipsOn() { return UI.store.get('trace_tips', true) !== false; }
    function syncMusic() {
      if (!window.ArkMusic) return;
      if (musicOn() && alive) ArkMusic.play(MUSIC, { volume: 0.4, shuffle: true, fade: 2 }); else ArkMusic.stop(1);
    }
    var RUN = {
      music: function () { UI.store.set('trace_music', !musicOn()); syncMusic(); },
      'm-aim': function () { st.method = 'aim'; say(st.mode === 'xr' ? 'Point at the wall and pull the trigger.' : 'Click the wall or the table.'); },
      'm-touch': function () { st.method = 'touch'; st.touchPts = []; clearTouchDots(); say('Touch the wall with the tip of a controller where the centre goes, and pull the trigger.'); },
      'm-float': function () { st.method = 'float'; placeFloat(); },
      lock: function () { lock(); }, unlock: function () { unlock(); },
      tips: function () { UI.store.set('trace_tips', !tipsOn()); xr.tipsUntil = performance.now() + 8000; say(tipsOn() ? 'Button labels on' : 'Button labels off'); },
      replace: function () { dropAnchor(true); st.phase = 'place'; st.shown = true; st.method = st.mode === 'xr' && !xr.hasHitTest ? 'touch' : 'aim'; art.visible = false; applyVis(); say('Choose a new spot.'); },
      smaller: function () { resizeBy(1 / 1.04); }, bigger: function () { resizeBy(1.04); },
      turnL: function () { turnBy(-1); }, turnR: function () { turnBy(1); }, level: function () { S.rot = 0; applyOrientation(); moved(); say('Level'); },
      out: function () { nudge(0.002); }, 'in': function () { nudge(-0.002); },
      look: cycleLook, opacity: cycleOpacity,
      grid: function () { S.grid = !S.grid; if (!S.grid) st.spot = null; refreshArt(); applyVis(); say(S.grid ? 'Grid on' : 'Grid off'); },
      marks: function () { S.marks = !S.marks; applyVis(); say(S.marks ? 'Crosses on' : 'Crosses off'); },
      toggle: toggleShown,
      spot: function () {
        if (st.spot) st.spot = null; else { S.grid = true; st.spot = firstOpenCell(); }
        refreshArt(); applyVis(); say(st.spot ? 'Spotlight on ' + WT.cellName(st.spot[0], st.spot[1]) : 'Spotlight off');
      },
      prev: function () { moveSpot(-1); }, next: function () { moveSpot(1); }, cell: markSpotDone,
      blink: function () { var o = [0, 3, 5, 10]; S.blink = o[(o.indexOf(S.blink) + 1) % o.length]; st.blinkT = 0; st.blinkOff = false; applyVis(); say(S.blink ? 'Blink every ' + S.blink + ' s' : 'Blink off'); },
      pencil: function () { st.pencil = !st.pencil; say(st.pencil ? 'Pencil ready: draw on the wall' : 'Pencil away'); },
      clear: clearPencil,
      close: function () { closePanel(); },
      exit: function () { finish(); }
    };
    function act(idv) { if (RUN[idv]) { RUN[idv](); st.dirty = true; changed(); } }
    function changed() { if (st.mode === 'flat') drawBar(); if (st.panel) drawPanel(); }

    function lock() {
      if (!st.surface) return;
      st.phase = 'locked'; st.shown = true; st.blinkT = 0;
      applyVis();
      if (st.mode === 'xr') { savePhase(); xr.tipsUntil = performance.now() + 6000; setTimeout(function () { if (st.phase === 'locked') closePanel(); }, 900); }
      say(st.mode === 'xr' ? 'Locked. Put the controllers down and trace. A / X or a pinch of your free hand hides it.' : 'Locked. Draw on the wall with the pencil; press H to hide the picture and check.');
      haptic(null, 0.8, 90);
    }
    function unlock() { st.phase = 'adjust'; st.shown = true; st.peek = false; st.blinkOff = false; applyVis(); savePhase(); say('Unlocked. Pull the trigger on the wall to move it, or hold grip to drag.'); }
    function resizeBy(k) { S.width_cm = Math.max(5, Math.min(1000, S.width_cm * k)); applySize(); say(WT.fmtSize(pseudo())); }
    function turnBy(d) { S.rot = Math.max(-180, Math.min(180, Math.round((S.rot + d) * 10) / 10)); applyOrientation(); moved(); say('Turned ' + S.rot + '°'); }
    function nudge(m) {
      if (!st.surface) return;
      art.position.addScaledVector(st.surface.normal, m); st.surface.point.copy(art.position); moved();
      if (st.surface.fromHit) saveDepthFix(depthFix + m);
      say(m > 0 ? 'Pulled out 2 mm' : 'Pushed in 2 mm');
    }
    /* Depth fix. Quest's room scan can put the wall a few cm off the real one, which shows as parallax.
       Touching the real wall with a controller tip measures the error; it's kept (per browser) and added to
       every later wall hit, so moving the picture doesn't bring the error back. + = towards you. */
    var depthFix = Math.max(-0.2, Math.min(0.2, +UI.store.get('trace_depth_fix', 0) || 0));
    function saveDepthFix(v) { depthFix = Math.max(-0.2, Math.min(0.2, Math.round(v * 10000) / 10000)); UI.store.set('trace_depth_fix', depthFix); }
    function wallHit(m) {
      var pos = new V3().setFromMatrixPosition(m), n = new V3(m.elements[4], m.elements[5], m.elements[6]).normalize();
      if (depthFix) { var toYou = n.clone(); if (toYou.dot(headPos().sub(pos)) < 0) toYou.negate(); pos.addScaledVector(toYou, depthFix); }
      return { pos: pos, normal: n };
    }
    /* Both controller tips held against the real wall near the picture, then a trigger: the picture snaps onto
       the plane through the two tips. That sets the depth and also straightens it to the wall's angle.
       One tip alone only gets a nudge to add the other, so a stray tip can't throw it off. */
    function tipOnWall(i) {
      if (!i || i.isHand || !st.surface) return null;
      var n = st.surface.normal, off = i.origin.clone().sub(art.position), d = off.dot(n);
      var side = off.clone().addScaledVector(n, -d).length();
      return Math.abs(d) <= 0.12 && side <= Math.max(1, S.width_cm / 100) ? d : null;
    }
    function touchDepth(inp) {
      if (tipOnWall(inp) === null) return false;            // this tip isn't at the wall: a normal trigger
      var L = xr.inputs.left, R = xr.inputs.right, dl = tipOnWall(L), dr = tipOnWall(R);
      if (dl === null || dr === null) { say('Put the other controller tip on the wall too, then pull the trigger.'); haptic(inp.src, 0.3, 40); return true; }
      var n = st.surface.normal, n2 = n.clone(), u = R.origin.clone().sub(L.origin), len = u.length();
      if (len > 0.08) {                                    // tips far enough apart to read the wall's angle
        u.divideScalar(len); n2.addScaledVector(u, -n2.dot(u)).normalize();
        if (n2.angleTo(n) > 0.26) { say('The two tips don\'t agree. Hold both flat against the wall and try again.'); haptic(inp.src, 0.3, 40); return true; }
      }
      var turn = n2.angleTo(n) * 180 / Math.PI, mid = L.origin.clone().add(R.origin).multiplyScalar(0.5);
      var before = art.position.clone();
      art.position.addScaledVector(n2, mid.clone().sub(art.position).dot(n2));
      var d = art.position.clone().sub(before).dot(n2);
      st.surface.normal = n2; st.surface.point.copy(art.position); applyOrientation(); moved();
      if (st.surface.fromHit) saveDepthFix(depthFix + (dl + dr) / 2);
      haptic(L.src, 0.7, 70); haptic(R.src, 0.7, 70); changed();
      say((Math.abs(d) < 0.003 ? 'Snapped: it was already on the wall' : 'Snapped to the wall: ' + (d > 0 ? 'pulled out ' : 'pushed in ') + (Math.abs(d) * 100).toFixed(1) + ' cm')
        + (turn >= 0.5 ? ', straightened ' + turn.toFixed(1) + '°' : '') + '. Moving it keeps the depth.');
      return true;
    }
    function cycleLook() {
      var keys = WT.LOOKS.map(function (l) { return l.key; });
      S.look = keys[(keys.indexOf(S.look) + 1) % keys.length];
      say('Look: ' + WT.lookLabel(S.look) + '…');
      setTimeout(function () { if (!alive) return; refreshArt(); say('Look: ' + WT.lookLabel(S.look)); changed(); }, 30);
    }
    function cycleOpacity() {
      var o = WT.OPACITIES, i = 0, best = 9;
      o.forEach(function (v, k) { if (Math.abs(v - S.opacity) < best) { best = Math.abs(v - S.opacity); i = k; } });
      S.opacity = o[(i + 1) % o.length]; applyVis(); say('Opacity ' + Math.round(S.opacity * 100) + '%');
    }
    function toggleShown() {
      if (st.phase === 'place') { say('Place the picture first.'); return; }
      st.shown = !st.shown; st.blinkOff = false; st.blinkT = 0; applyVis(); haptic(null, 0.35, 35);
      say(st.shown ? 'Picture on' : st.phase === 'locked' ? 'Picture hidden: check your lines' : 'Picture hidden. A / X brings it back.');
      changed();
    }
    function firstOpenCell() {
      var g = WT.grid(pseudo()), done = P.done || [];
      for (var r = 0; r < g.rows; r++) for (var c = 0; c < g.cols; c++) if (done.indexOf(c + ',' + r) < 0) return [c, r];
      return [0, 0];
    }
    function moveSpot(d) {
      if (!st.spot) return;
      var g = WT.grid(pseudo()), i = st.spot[1] * g.cols + st.spot[0];
      i = (i + d + g.cells) % g.cells;
      st.spot = [i % g.cols, Math.floor(i / g.cols)];
      refreshArt(); applyVis(); say('Square ' + WT.cellName(st.spot[0], st.spot[1]));
    }
    function toggleCell(c, r) {
      var k = c + ',' + r, done = (P.done || []).slice(), i = done.indexOf(k);
      if (i >= 0) done.splice(i, 1); else { done.push(k); st.sessionCells++; }
      P.done = done; st.dirty = true; applyVis();
      var g = WT.grid(pseudo());
      say(WT.cellName(c, r) + (i >= 0 ? ' not done' : ' done') + ' · ' + done.length + ' of ' + g.cells);
      if (done.length === g.cells && i < 0) say('Every square traced! Hide the picture and admire it.');
    }
    function markSpotDone() {
      if (!st.spot) return;
      var k = st.spot[0] + ',' + st.spot[1];
      if ((P.done || []).indexOf(k) < 0) toggleCell(st.spot[0], st.spot[1]);
      var g = WT.grid(pseudo());
      if ((P.done || []).length < g.cells) { st.spot = firstOpenCell(); refreshArt(); applyVis(); }
    }

    /* ================================================================== feedback: toast (DOM) + floating text (headset) */
    var toastEl = null, toastTimer = null;
    function say(msg) {
      if (st.mode === 'xr') { drawToast(msg); return; }
      if (st.mode !== 'flat') return;
      if (!toastEl || !toastEl.parentNode) { toastEl = document.createElement('div'); toastEl.className = 'tr-toast'; ov.appendChild(toastEl); }
      toastEl.textContent = msg; toastEl.style.opacity = 1;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { if (toastEl) toastEl.style.opacity = 0; }, 2600);
    }
    function haptic(src, v, ms) {
      Object.keys(xr.inputs).forEach(function (h) {
        var inp = xr.inputs[h];
        if (src && inp.src !== src) return;
        try { var ha = inp.src.gamepad && inp.src.gamepad.hapticActuators && inp.src.gamepad.hapticActuators[0]; if (ha && ha.pulse) ha.pulse(v, ms); } catch (e) {}
      });
    }

    /* ================================================================== flat mode: HUD, toolbar, mouse + keys */
    function hint() {
      if (st.phase === 'place') return 'Click the wall (or the table) to put your picture there.';
      if (st.phase === 'adjust') return 'Drag to move · scroll to resize · Q / E to turn · then Lock.';
      return st.pencil ? 'Draw on the wall to trace · H hides the picture · scroll to zoom.' : 'H hides the picture · drag to look around.';
    }
    function drawHud() {
      ov.innerHTML = '<div class="tr-hud"><button class="tr-x" data-x aria-label="Leave">' + UI.icon('x') + '</button>' +
        '<div class="ttl"><b>' + esc(P.title) + '</b><span data-hint>' + esc(hint()) + '</span></div></div><div class="tr-bar" data-bar></div>';
      drawBar();
    }
    function drawBar() {
      var bar = ov.querySelector('[data-bar]');
      if (!bar) return;
      bar.innerHTML = actions().filter(function (a) { return a.id !== 'close'; }).map(function (a) {
        return '<button data-act="' + a.id + '" class="' + (a.primary ? 'primary' : a.on ? 'on' : '') + '" title="' + esc(a.label + (a.key ? ' (' + a.key + ')' : '')) + '">' +
          UI.icon(a.icon) + '<span>' + esc(a.label) + '</span></button>';
      }).join('');
      var h = ov.querySelector('[data-hint]'); if (h) h.textContent = hint();
    }
    function pickFlat(clientX, clientY, objs) {
      var r = cv.getBoundingClientRect();
      flat.ndc.set((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      flat.raycaster.setFromCamera(flat.ndc, camera);
      return flat.raycaster.intersectObjects(objs, false)[0] || null;
    }
    function hitNormal(hit) { return hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize(); }
    function onPointerDown(e) {
      if (st.mode !== 'flat') return;
      cv.focus();
      flat.ptr = { x: e.clientX, y: e.clientY, moved: 0 };
      var hitArt = art.visible ? pickFlat(e.clientX, e.clientY, [artMesh]) : null;
      if (st.phase === 'adjust' && hitArt) {
        flat.drag = { kind: 'art', plane: new T.Plane().setFromNormalAndCoplanarPoint(st.surface.normal, art.position), off: art.position.clone().sub(hitArt.point) };
      } else if (st.phase === 'locked' && st.pencil) {
        var h = pickFlat(e.clientX, e.clientY, surfaces().filter(function (o) { return o.userData.draw; }));
        flat.drag = h ? { kind: 'pencil', mesh: h.object, last: h.uv.clone() } : { kind: 'look', x: e.clientX, y: e.clientY, yaw: flat.yaw, pitch: flat.pitch };
        if (h) pencilDot(h.object, h.uv);
      } else flat.drag = { kind: 'look', x: e.clientX, y: e.clientY, yaw: flat.yaw, pitch: flat.pitch };
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    }
    function onPointerMove(e) {
      if (st.mode !== 'flat') return;
      if (flat.ptr) flat.ptr.moved = Math.max(flat.ptr.moved, Math.abs(e.clientX - flat.ptr.x) + Math.abs(e.clientY - flat.ptr.y));
      var d = flat.drag;
      if (d && d.kind === 'look') {
        flat.yaw = d.yaw + (e.clientX - d.x) * 0.004; flat.pitch = Math.max(-0.9, Math.min(0.6, d.pitch + (e.clientY - d.y) * 0.003));
        flat.yaw = Math.max(-1.2, Math.min(1.2, flat.yaw));
      } else if (d && d.kind === 'art') {
        var r = cv.getBoundingClientRect();
        flat.ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        flat.raycaster.setFromCamera(flat.ndc, camera);
        var p = new V3();
        if (flat.raycaster.ray.intersectPlane(d.plane, p)) art.position.copy(p.add(d.off));
      } else if (d && d.kind === 'pencil') {
        var h = pickFlat(e.clientX, e.clientY, [d.mesh]);
        if (h) { pencilLine(d.mesh, d.last, h.uv); d.last = h.uv.clone(); }
      } else if (st.phase === 'place') {
        flat.hover = pickFlat(e.clientX, e.clientY, surfaces());
      }
    }
    function onPointerUp(e) {
      if (st.mode !== 'flat') return;
      var d = flat.drag, click = flat.ptr && flat.ptr.moved < 6;
      flat.drag = null; flat.ptr = null;
      if (!click) return;
      if (st.phase === 'place') {
        var h = pickFlat(e.clientX, e.clientY, surfaces());
        if (h) placeAt(h.point, hitNormal(h), false); else say('Click on the wall or the table.');
      } else if (st.phase === 'locked' && S.grid && !(d && d.kind === 'pencil')) {
        var ha = pickFlat(e.clientX, e.clientY, [artMesh]);
        if (ha) cellAtUv(ha.uv);
      }
    }
    function cellAtUv(uv) {
      var g = WT.grid(pseudo());
      toggleCell(Math.min(g.cols - 1, Math.floor(uv.x * g.cols)), Math.min(g.rows - 1, Math.floor((1 - uv.y) * g.rows)));
    }
    function onWheel(e) {
      if (st.mode !== 'flat') return;
      e.preventDefault();
      if (st.phase === 'adjust') resizeBy(e.deltaY < 0 ? 1.03 : 1 / 1.03);
      else { flat.fov = Math.max(22, Math.min(75, flat.fov + (e.deltaY > 0 ? 3 : -3))); camera.fov = flat.fov; camera.updateProjectionMatrix(); }
    }
    var KEYS = { h: 'toggle', ' ': 'toggle', g: 'grid', l: null, o: 'opacity', m: 'look', s: 'spot', d: 'cell', b: 'blink', c: 'marks', p: 'pencil', q: 'turnL', e: 'turnR', '+': 'bigger', '=': 'bigger', '-': 'smaller', arrowright: 'next', arrowleft: 'prev' };
    function onKey(e) {
      if (st.mode !== 'flat' || e.target.matches && e.target.matches('input, textarea, select')) return;
      var k = (e.key || '').toLowerCase();
      if (k === 'escape') { finish(); return; }
      if (k === 'l') { act(st.phase === 'locked' ? 'unlock' : st.phase === 'adjust' ? 'lock' : ''); return; }
      var a = KEYS[k];
      if (!a) return;
      if (actions().some(function (x) { return x.id === a; }) || a === 'toggle') { e.preventDefault(); act(a); }
    }
    function pencilPx(mesh, uv) { var d = mesh.userData.draw; return [uv.x * d.canvas.width, (1 - uv.y) * d.canvas.height]; }
    function pencilDot(mesh, uv) { pencilLine(mesh, uv, uv); }
    function pencilLine(mesh, a, b) {
      var d = mesh.userData.draw, p = pencilPx(mesh, a), q = pencilPx(mesh, b);
      d.g.strokeStyle = 'rgba(52, 48, 46, .88)'; d.g.lineWidth = Math.max(1.6, d.canvas.width / d.wm / 260); d.g.lineCap = 'round';
      d.g.beginPath(); d.g.moveTo(p[0], p[1]); d.g.lineTo(q[0] + 0.01, q[1]); d.g.stroke();
      d.tex.needsUpdate = true;
      st.drawn = true;
    }
    function clearPencil() {
      surfaces().forEach(function (o) { var d = o.userData.draw; if (d) { d.g.putImageData(d.base, 0, 0); d.tex.needsUpdate = true; } });
      say('Pencil rubbed out');
    }

    /* ================================================================== the headset */
    function enterXR(kind) {
      if (xr.session || xr.entering) return;  // already in, or on the way in
      xr.entering = true;
      var init = { optionalFeatures: ['local-floor', 'hand-tracking', 'hit-test', 'anchors', 'plane-detection', 'dom-overlay'] };
      // Passthrough also asks for an "unbounded" space: on Quest 3 that turns the boundary off, so you can walk
      // anywhere along the wall. Headsets without it (Quest 2) fall back to local-floor as before.
      if (kind === 'ar') { init.domOverlay = { root: ov }; init.optionalFeatures.unshift('unbounded'); }
      navigator.xr.requestSession(kind === 'ar' ? 'immersive-ar' : 'immersive-vr', init).then(function (s) {
        if (!alive) { s.end(); return; }
        var feats = s.enabledFeatures;
        renderer.xr.setReferenceSpaceType(kind === 'ar' && feats && feats.indexOf('unbounded') >= 0 ? 'unbounded'
          : (!feats || feats.indexOf('local-floor') >= 0 ? 'local-floor' : 'local'));
        return renderer.xr.setSession(s).then(function () { xr.entering = false; startXR(s, kind); });
      }).catch(function (e) {
        xr.entering = false;
        UI.toast('Couldn\'t start the headset view: ' + (e && e.message || 'the browser said no'), 'error');
      });
    }
    function startXR(s, kind) {
      xr.session = s; st.mode = 'xr'; st.kind = kind; st.newSession = true; st.sessionMs = 0; st.sessionCells = 0;
      syncMusic();
      applyEnv();
      var feats = s.enabledFeatures;
      xr.hasHitTest = !!s.requestHitTestSource && (!feats || feats.indexOf('hit-test') >= 0);
      xr.hitSources = new Map(); xr.pendingHit = new Set(); xr.inputs = {}; xr.buttons = {}; xr.head = null;
      xr.grab = null; xr.anchor = null; xr.anchorPending = false; xr.anchorFail = 0; xr.lostT = 0; xr.yDown = 0; xr.panelWorld = null;
      xr.startT = performance.now(); xr.tipsUntil = xr.startT + 15000; st.peek = false; st.shown = true;
      if (xr.hasHitTest) {
        s.requestReferenceSpace('viewer').then(function (v) { return s.requestHitTestSource({ space: v }); })
          .then(function (hs) { if (s === xr.session) xr.viewerHit = hs; else hs.cancel(); }).catch(function () {});
      }
      st.method = xr.hasHitTest ? 'aim' : 'touch';
      ov.innerHTML = '<div class="tr-hud"><button class="tr-x" data-endxr aria-label="Leave the headset view">' + UI.icon('x') + '</button>' +
        '<div class="ttl"><b>' + esc(P.title) + '</b><span>In the headset. Y opens the menu; hold Y to come back here.</span></div></div>' +
        (kind === 'ar' ? '<div class="tr-bar" data-bar></div>' : '');
      if (kind === 'ar') drawBar();
      on(ov, 'beforexrselect', function (e) { if (e.target.closest && e.target.closest('.tr-bar, .tr-hud')) e.preventDefault(); });
      s.addEventListener('selectstart', function (e) { xr.selStart.set(e.inputSource, performance.now()); });
      s.addEventListener('select', function (e) { onSelect(e.inputSource); });
      s.addEventListener('end', onXREnd);
      // Back on the same wall: a saved anchor puts the picture where it was (locked, or still being lined up).
      var handle = null, phase = null;
      try { handle = localStorage.getItem(AKEY + P.id); phase = localStorage.getItem(PKEY + P.id); } catch (e) {}
      if (handle && s.restorePersistentAnchor) {
        xr.restoring = true; st.phase = phase === 'adjust' ? 'adjust' : 'locked'; art.visible = false;
        // every reply below checks it still belongs to this session: a late one from a session you already left
        // would hand three.js objects from the old session
        s.restorePersistentAnchor(handle).then(function (a) {
          if (s !== xr.session) { try { a.delete(); } catch (e) {} return; }
          xr.anchor = a; xr.anchorFresh = true;
        }, function () {
          if (s !== xr.session) return;
          xr.restoring = false; st.phase = 'place'; forgetHandle(); xr.needPanel = true;
        });
        setTimeout(function () {  // a different room, or the headset forgot it
          if (!xr.restoring || st.mode !== 'xr' || s !== xr.session) return;
          xr.restoring = false; dropAnchor(true); st.phase = 'place'; art.visible = false; applyVis(); openPanel();
          say('Could not find your last spot. Place the picture again and line it up with your crosses.');
        }, 6000);
      } else { st.phase = 'place'; art.visible = false; }
      applyVis();
      xr.needPanel = st.phase === 'place';
      var ref = renderer.xr.getReferenceSpace();
      // The headset recentred (stepping out of the boundary and back can do it). An anchored picture stays on the
      // wall by itself; one without an anchor (the headset has no anchors) is stuck back with one trigger pull.
      if (ref && ref.addEventListener) ref.addEventListener('reset', function () {
        if (s !== xr.session || xr.anchor || xr.restoring || st.phase === 'place') return;
        st.phase = 'adjust'; st.shown = true; applyVis(); changed();
        say('The view moved. Point where the middle of the picture goes and pull the trigger to stick it back.');
      });
    }
    function onXREnd() {
      logProgress(true);
      xr.session = null; xr.viewerHit = null; xr.anchor = null; xr.anchorPending = false; xr.hitSources = new Map(); xr.inputs = {};
      xr.grab = null; xr.yDown = 0; st.peek = false;
      st.panel = false;
      if (xr.panelMesh) xr.panelMesh.visible = false;
      if (xr.toastMesh) xr.toastMesh.visible = false;
      Object.keys(xr.tips).forEach(function (h) { xr.tips[h].mesh.visible = false; });
      Object.keys(xr.rays).forEach(function (h) { xr.rays[h].visible = false; });
      reticle.visible = false; tipDot.visible = false; clearTouchDots();
      if (!alive) return;
      st.mode = 'intro'; applyEnv(); resize();
      camera.position.set(0, 1.55, 1.1); camera.quaternion.identity();
      showSummary();
    }
    function forgetHandle() { try { localStorage.removeItem(AKEY + P.id); localStorage.removeItem(PKEY + P.id); } catch (e) {} }
    function savePhase() { try { if (localStorage.getItem(AKEY + P.id)) localStorage.setItem(PKEY + P.id, st.phase); } catch (e) {} }
    function dropAnchor(forget) {
      if (xr.anchor) { try { xr.anchor.delete(); } catch (e) {} xr.anchor = null; }
      if (forget) {
        var old = null;
        try { old = localStorage.getItem(AKEY + P.id); } catch (e) {}
        if (old && xr.session && xr.session.deletePersistentAnchor) xr.session.deletePersistentAnchor(old).catch(function () {});
        forgetHandle();
      }
    }
    /* pins the picture where it is now; kept (persistent) so the next visit finds the same spot */
    function makeAnchor(frame, ref) {
      if (!frame.createAnchor || typeof XRRigidTransform === 'undefined') { xr.anchorFail = 9; return; }
      var s = frame.session, gen = xr.poseGen, p = art.position, q = art.quaternion;
      xr.anchorPending = true;
      frame.createAnchor(new XRRigidTransform({ x: p.x, y: p.y, z: p.z }, { x: q.x, y: q.y, z: q.z, w: q.w }), ref).then(function (a) {
        if (s !== xr.session) { try { a.delete(); } catch (e) {} return; }
        xr.anchorPending = false; xr.anchorFail = 0;
        if (gen !== xr.poseGen || st.phase === 'place' || xr.anchor) { try { a.delete(); } catch (e) {} return; }  // it moved meanwhile
        xr.anchor = a;
        if (a.requestPersistentHandle) a.requestPersistentHandle().then(function (h) {
          if (a !== xr.anchor || s !== xr.session) { if (s.deletePersistentAnchor) s.deletePersistentAnchor(h).catch(function () {}); return; }
          var old = null;
          try { old = localStorage.getItem(AKEY + P.id); } catch (e) {}
          if (old && old !== h && s.deletePersistentAnchor) s.deletePersistentAnchor(old).catch(function () {});
          try { localStorage.setItem(AKEY + P.id, h); localStorage.setItem(PKEY + P.id, st.phase); } catch (e) {}
        }).catch(function () {});
      }).catch(function () {
        if (s !== xr.session) return;
        xr.anchorPending = false; xr.anchorFail = (xr.anchorFail || 0) + 1; xr.moveT = performance.now();
      });
    }

    function rayLine(h) {
      if (xr.rays[h]) return xr.rays[h];
      var g = new T.BufferGeometry().setFromPoints([new V3(0, 0, 0), new V3(0, 0, -1)]);
      var l = new T.Line(g, new T.LineBasicMaterial({ color: h === 'left' ? 0xffb347 : 0x00e5ff, transparent: true, opacity: 0.85, depthTest: false }));
      l.renderOrder = 30; l.frustumCulled = false; scene.add(l);
      xr.rays[h] = l; return l;
    }
    /* how far the wall is straight ahead of you (Infinity if unknown): menus and messages stay in front of it */
    function wallDist(fwd) {
      var best = Infinity;
      if (st.surface && art.visible) {
        var den = fwd.dot(st.surface.normal);
        if (den < -0.15) { var t = art.position.clone().sub(xr.head).dot(st.surface.normal) / den; if (t > 0) best = t; }
      }
      if (xr.lastBest && st.phase === 'place') best = Math.min(best, xr.lastBest.pos.distanceTo(xr.head));
      return best;
    }
    function headFwd(flatY) {
      var f = new V3(0, 0, -1).applyQuaternion(xr.headQ);
      if (flatY) { f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); }
      return f.normalize();
    }
    var tmpM = null, rc = null, ZAX = null;
    function xrFrame(frame, dt) {
      var ref = renderer.xr.getReferenceSpace(), s = frame.session, now = performance.now();
      if (s !== xr.session) return;
      tmpM = tmpM || new T.Matrix4(); rc = rc || new T.Raycaster(); ZAX = ZAX || new V3(0, 0, 1);
      var vp = frame.getViewerPose(ref);
      if (vp) {
        var tp = vp.transform.position, to = vp.transform.orientation;
        xr.head = new V3(tp.x, tp.y, tp.z); xr.headQ = new Q(to.x, to.y, to.z, to.w);
      }
      if (!xr.head) return;
      // the anchor holds the picture on the wall; a new one is made once it has been still for a moment
      if (!xr.anchor && !xr.anchorPending && !xr.restoring && st.surface && st.phase !== 'place' && !xr.grab &&
          (xr.anchorFail || 0) < 3 && now - xr.moveT > 700) makeAnchor(frame, ref);
      if (xr.anchor) {
        var ap = frame.getPose(xr.anchor.anchorSpace, ref);
        if (ap) {
          var m = tmpM.fromArray(ap.transform.matrix);
          art.position.setFromMatrixPosition(m); art.quaternion.setFromRotationMatrix(m);
          var nrm = new V3(0, 0, 1).applyQuaternion(art.quaternion);
          if (!st.surface) st.surface = { free: false };
          st.surface.normal = nrm; st.surface.point = art.position.clone(); st.surface.horizontal = Math.abs(nrm.y) > 0.85;
          if (!art.visible) art.visible = true;
          if (xr.lostT > 0.4 && !xr.anchorFresh) say('Found your wall again.');
          xr.lostT = 0;
          if (xr.anchorFresh) {
            xr.anchorFresh = false; xr.restoring = false;
            S.rot = S.rot || 0; applyVis(); changed();
            say(st.phase === 'locked' ? 'Back where you left it. Press A or X to hide or show.' : 'Back where you left it. Click the right stick to lock it.');
          }
        } else if (!xr.restoring) {
          xr.lostT += dt;
          if (xr.lostT > 0.4 && art.visible) { art.visible = false; say('Looking for your wall… look at it for a moment.'); }
        }
      }
      // inputs: rays, hit-tests, buttons, sticks, grab
      var seen = {};
      for (var i = 0; i < s.inputSources.length; i++) {
        var src = s.inputSources[i], h = src.handedness || 'none';
        var rp = src.targetRaySpace && frame.getPose(src.targetRaySpace, ref);
        if (!rp) continue;
        seen[h] = true;
        var mm = tmpM.fromArray(rp.transform.matrix);
        var origin = new V3().setFromMatrixPosition(mm), dir = new V3(0, 0, -1).applyQuaternion(new Q().setFromRotationMatrix(mm)).normalize();
        var inp = xr.inputs[h] = { src: src, origin: origin, dir: dir, isHand: !!src.hand, hit: null, panelHit: null, artHit: null, grip: null };
        var gpz = src.gripSpace && frame.getPose(src.gripSpace, ref);
        if (gpz) inp.grip = new V3().setFromMatrixPosition(new T.Matrix4().fromArray(gpz.transform.matrix));
        // the real surface under this ray (placing, and while lining up so the trigger can move it)
        if (xr.hasHitTest && st.phase !== 'locked') {
          var hs = xr.hitSources.get(src);
          if (!hs && !xr.pendingHit.has(src)) {
            xr.pendingHit.add(src);
            s.requestHitTestSource({ space: src.targetRaySpace }).then(function (srcRef) { return function (x) { if (s === xr.session) xr.hitSources.set(srcRef, x); else x.cancel(); }; }(src)).catch(function () {});
          }
          var res = hs ? frame.getHitTestResults(hs) : [];
          if (res.length) {
            var hp = res[0].getPose(ref);
            if (hp) {
              inp.hit = wallHit(new T.Matrix4().fromArray(hp.transform.matrix));
            }
          }
        }
        rc.set(origin, dir);
        if (st.panel && xr.panelMesh) {
          var ph = rc.intersectObject(xr.panelMesh, false)[0];
          if (ph && panelButtonAt(ph.uv) !== undefined) inp.panelHit = { uv: ph.uv, dist: ph.distance };
        }
        if (art.visible && artMesh.visible) {
          var ah = rc.intersectObject(artMesh, false)[0];
          if (ah) inp.artHit = { uv: ah.uv, dist: ah.distance };
        }
        // the ray: while placing / lining up, with the menu open, or aiming at a grid square; hands only with the menu open
        var ray = rayLine(h), showRay = st.panel || (!inp.isHand && (st.phase !== 'locked' || (S.grid && inp.artHit)));
        ray.visible = showRay;
        if (showRay) {
          var len = inp.panelHit ? inp.panelHit.dist : inp.hit ? origin.distanceTo(inp.hit.pos) : inp.artHit ? inp.artHit.dist : 1.5;
          ray.position.copy(origin); ray.quaternion.setFromUnitVectors(new V3(0, 0, -1), dir); ray.scale.set(1, 1, len);
        }
        if (src.gamepad && !inp.isHand) { pad(src, h, inp, dt); if (s !== xr.session) return; }
      }
      Object.keys(xr.rays).forEach(function (h) { if (!seen[h]) xr.rays[h].visible = false; });
      Object.keys(xr.inputs).forEach(function (h) { if (!seen[h]) delete xr.inputs[h]; });
      // the first menu waits a moment for the controllers, so it can sit on the left one
      if (xr.needPanel && (xr.inputs.left || now - (xr.startT || now) > 1500)) { xr.needPanel = false; openPanel(); say(st.method === 'aim' ? 'Point at the wall and pull the trigger to stick your picture there.' : 'Touch the wall with a controller tip where the centre goes, and pull the trigger.'); }
      // the ring shows where the trigger would put the picture (right hand first, then left, then gaze)
      var aim = (xr.inputs.right && xr.inputs.right.hit && !xr.inputs.right.panelHit) ? xr.inputs.right
        : (xr.inputs.left && xr.inputs.left.hit && !xr.inputs.left.panelHit) ? xr.inputs.left : null;
      if (st.phase === 'place') {
        var best = aim ? aim.hit : null;
        if (!best && xr.viewerHit && st.method === 'aim') {
          var vr = frame.getHitTestResults(xr.viewerHit);
          if (vr.length) { var vpz = vr[0].getPose(ref); if (vpz) best = wallHit(new T.Matrix4().fromArray(vpz.transform.matrix)); }
        }
        if (st.method === 'aim' && best) {
          reticle.visible = true; reticle.scale.setScalar(1); reticle.position.copy(best.pos);
          reticle.quaternion.setFromUnitVectors(ZAX, best.normal);
          setPose(best.pos, best.normal, false); artMesh.visible = true;
          xr.lastBest = best;
        } else { reticle.visible = false; if (st.method !== 'float') art.visible = false; }
        var tipSrc = xr.inputs.right || xr.inputs.left;
        tipDot.visible = st.method === 'touch' && !!tipSrc && !tipSrc.isHand;
        if (tipDot.visible) tipDot.position.copy(tipSrc.origin);
      } else if (st.phase === 'adjust' && aim && !xr.grab) {
        reticle.visible = true; reticle.scale.setScalar(0.6); reticle.position.copy(aim.hit.pos);
        reticle.quaternion.setFromUnitVectors(ZAX, aim.hit.normal); tipDot.visible = false;
      } else { reticle.visible = false; tipDot.visible = false; }
      if (st.panel) { placePanel(); hoverPanel(); }
      updateTips();
      followToast(dt);
    }
    /* Every controller button does something; the floating labels over the controllers say what, step by step.
       Buttons (xr-standard): 0 trigger (handled by 'select'), 1 grip, 3 stick click, 4 A / X, 5 B / Y. */
    function pad(src, h, inp, dt) {
      var gp = src.gamepad, prev = xr.buttons[h] || [], now = [], b = gp.buttons, L = h === 'left', t = performance.now();
      for (var i = 0; i < b.length; i++) now[i] = !!(b[i] && b[i].pressed);
      xr.buttons[h] = now;
      function down(k) { return now[k] && !prev[k]; }
      function up(k) { return !now[k] && prev[k]; }
      // A / X: hide / show (while placing: float it in front of you)
      if (down(4)) { if (st.phase === 'place') act('m-float'); else { toggleShown(); changed(); } }
      // Y: tap = menu, hold = leave VR · B: opacity
      if (L) {
        if (down(5)) { xr.yDown = t; xr.yWarned = false; }
        if (now[5] && xr.yDown) {
          var held = t - xr.yDown;
          if (held > 450 && !xr.yWarned) { xr.yWarned = true; say('Keep holding Y to leave VR…'); haptic(src, 0.25, 40); }
          if (held > 1600) { xr.yDown = 0; haptic(src, 0.8, 120); finish(); return; }
        }
        if (up(5) && xr.yDown) { if (t - xr.yDown < 450) togglePanel(); else say('Staying in VR'); xr.yDown = 0; }
      } else if (down(5)) { cycleOpacity(); changed(); }
      // stick click: right = lock / unlock, left = grid
      if (down(3)) {
        if (L) act('grid');
        else if (st.phase === 'adjust') act('lock');
        else if (st.phase === 'locked') act('unlock');
        else say('Place it first: point at the wall and pull the trigger.');
      }
      // grip: placing = grab it out of the air · lining up = drag it · locked = hold to peek behind it
      if (down(1)) {
        if (st.phase === 'place' && inp.grip) {
          var n = headPos().sub(inp.grip); n.y = 0; if (n.lengthSq() < 1e-4) n.set(0, 0, 1);
          placeAt(inp.grip.clone(), n.normalize(), true);
          xr.grab = { h: h, start: inp.origin.clone(), from: art.position.clone() };
        } else if (st.phase === 'adjust' && st.surface) {
          xr.grab = { h: h, start: inp.origin.clone(), from: art.position.clone() }; moved();
        } else if (st.phase === 'locked') { st.peek = h; applyVis(); }
      }
      if (st.peek === h && !now[1]) { st.peek = false; applyVis(); }
      if (xr.grab && xr.grab.h === h) {
        if (!now[1] || st.phase !== 'adjust') { xr.grab = null; if (st.surface) st.surface.point.copy(art.position); xr.moveT = t; }
        else {
          var dlt = inp.origin.clone().sub(xr.grab.start);
          if (st.surface && !st.surface.free) dlt.projectOnPlane(st.surface.normal);
          art.position.copy(xr.grab.from).add(dlt); moved();
        }
      }
      var ax = gp.axes.length >= 4 ? gp.axes[2] : (gp.axes[0] || 0), ay = gp.axes.length >= 4 ? gp.axes[3] : (gp.axes[1] || 0);
      if (Math.abs(ax) < 0.2) ax = 0; if (Math.abs(ay) < 0.2) ay = 0;
      var latch = xr.stickLatch[h];
      if (!ax && !ay) {
        xr.stickLatch[h] = false;
        if (xr.opDirty && !L) { xr.opDirty = false; applyVis(); changed(); }
      }
      if (st.phase !== 'locked') {
        if (!L && (ax || ay)) {                                   // right stick: size ↕, turn ↔
          st.dirty = true;
          if (ay) { S.width_cm = Math.max(5, Math.min(1000, S.width_cm * (1 - ay * dt * 0.7))); applySize(); }
          if (ax && st.phase === 'adjust') { S.rot = Math.max(-180, Math.min(180, S.rot + ax * dt * 20)); if (Math.abs(S.rot) < 0.6) S.rot = 0; applyOrientation(); moved(); }
          throttleSay(WT.fmtSize(pseudo()) + (S.rot ? ' · turned ' + Math.round(S.rot) + '°' : ''));
        } else if (L && (ax || ay) && st.phase === 'adjust' && st.surface) {   // left stick: slide it along the wall
          var q0 = orientation(st.surface.normal, 0, art.position);
          art.position.addScaledVector(new V3(1, 0, 0).applyQuaternion(q0), ax * dt * 0.25)
            .addScaledVector(new V3(0, 1, 0).applyQuaternion(q0), -ay * dt * 0.25);
          moved(); throttleSay('Sliding it along the wall');
        }
      } else if (!L) {                                            // locked, right stick: opacity ↕, look ↔
        if (ay) { S.opacity = Math.max(0.1, Math.min(1, S.opacity - ay * dt * 0.8)); artMesh.material.opacity = S.opacity; st.dirty = true; xr.opDirty = true; throttleSay('Opacity ' + Math.round(S.opacity * 100) + '%'); }
        if (!latch && Math.abs(ax) > 0.7) { cycleLook(); xr.stickLatch[h] = true; }
      } else if (!latch && (Math.abs(ax) > 0.7 || Math.abs(ay) > 0.7)) {   // locked, left stick: the spotlight square
        xr.stickLatch[h] = true;
        if (!st.spot) act('spot');
        else if (Math.abs(ax) > 0.7) moveSpot(ax > 0 ? 1 : -1);
        else moveSpot((ay > 0 ? 1 : -1) * WT.grid(pseudo()).cols);
        changed();
      }
    }
    var sayT = 0;
    function throttleSay(m) { var n = performance.now(); if (n - sayT > 250) { sayT = n; say(m); } }
    function onSelect(src) {
      if (st.mode !== 'xr') return;
      var h = src.handedness || 'none', inp = xr.inputs[h];
      var held = performance.now() - (xr.selStart.get(src) || performance.now());
      if (src.hand && h === S.pencil) return;                       // the pencil hand's pinches are ignored
      if (inp && st.panel && inp.panelHit) { pressPanel(inp.panelHit.uv); return; }
      if (src.hand && held > 650) { togglePanel(); return; }       // long pinch: menu
      if (st.phase === 'place') {
        if (st.method === 'aim') {
          var hit = (inp && inp.hit) || (src.hand ? xr.lastBest : null) || (xr.viewerHit ? xr.lastBest : null);
          if (hit) { placeAt(hit.pos, hit.normal, false); st.surface.fromHit = true; } else say('No wall found there. Aim at the wall, hold grip to grab it from the air, or choose Touch 3 points in the menu.');
        } else if (st.method === 'touch' && inp && !inp.isHand) addTouchPoint(inp.origin);
        else if (st.method === 'float') placeFloat();
        return;
      }
      if (st.phase === 'adjust') {
        if (touchDepth(inp)) return;
        if (inp && inp.hit) { stickAt(inp.hit); return; }
        say(xr.hasHitTest ? 'No wall found there. Aim at the wall, or hold grip and drag it.' : 'Hold grip and drag it, or choose Place again in the menu.');
        return;
      }
      if (src.hand) { toggleShown(); return; }
      if (S.grid && inp && inp.artHit) { cellAtUv(inp.artHit.uv); return; }
      say('It\'s locked. Click the right stick to unlock it and move it.');
    }

    /* the menu: a tablet above your left controller (or floating in front of you, never inside the wall).
       The canvas is a fixed size (this three.js can't grow a texture): fewer buttons leave the top see-through. */
    var PANEL_ROWS = 5, PANEL_HAND = 0.34, PANEL_FLOAT = 0.46;
    function panelLayout(list) {
      var cols = 4, bw = 228, bh = 92, gap = 14, top = 196, foot = 58, rows = Math.max(1, Math.ceil(list.length / cols));
      var H = top + PANEL_ROWS * (bh + gap) + foot, used = top + rows * (bh + gap) + foot;
      return { cols: cols, bw: bw, bh: bh, gap: gap, top: top, H: H, oy: Math.max(0, H - used), left: (PANEL_W - (cols * bw + (cols - 1) * gap)) / 2 };
    }
    function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    function drawPanel(hover) {
      var list = actions().slice(0, PANEL_ROWS * 4), L = panelLayout(list), oy = L.oy;
      if (!xr.panelCanvas) xr.panelCanvas = WT.canvas(PANEL_W, L.H);
      var c = xr.panelCanvas, g = c.getContext('2d');
      g.clearRect(0, 0, PANEL_W, L.H);
      g.fillStyle = 'rgba(250, 247, 242, .97)'; roundRect(g, 4, oy + 4, PANEL_W - 8, L.H - oy - 8, 40); g.fill();
      g.fillStyle = '#2a2522'; g.font = '600 42px Fraunces, Georgia, serif'; g.textBaseline = 'alphabetic';
      g.fillText(P.title.length > 26 ? P.title.slice(0, 25) + '…' : P.title, 40, oy + 62);
      g.fillStyle = '#6c6158'; g.font = '500 26px Inter, Arial, sans-serif'; g.textAlign = 'right';
      g.fillText(WT.fmtSize(pseudo()), PANEL_W - 40, oy + 60); g.textAlign = 'left';
      // where you are: 1 place, 2 line up, 3 trace
      var sx = 40;
      [['place', '1  Place'], ['adjust', '2  Line up'], ['locked', '3  Trace']].forEach(function (sp) {
        var cur = st.phase === sp[0];
        g.font = (cur ? '700' : '500') + ' 26px Inter, Arial, sans-serif';
        var w = g.measureText(sp[1]).width + 40;
        g.fillStyle = cur ? '#2f8f83' : '#ebe3d7'; roundRect(g, sx, oy + 84, w, 46, 23); g.fill();
        g.fillStyle = cur ? '#ffffff' : '#6c6158'; g.fillText(sp[1], sx + 20, oy + 116);
        sx += w + 12;
      });
      g.fillStyle = '#4a413a'; g.font = '500 25px Inter, Arial, sans-serif';
      var sub = st.phase === 'place' ? (st.method === 'touch' ? 'Touch the wall with a controller tip: centre first, then 2 more spots.' : 'Point at the wall and pull the trigger. Grip grabs it from the air.')
        : st.phase === 'adjust' ? 'Trigger on the wall: move it there · grip: drag · right stick click: lock'
          : 'A / X or a free-hand pinch: hide / show · grip: peek · right stick click: unlock';
      g.fillText(sub, 40, oy + 170);
      xr.panelButtons = [];
      list.forEach(function (a, i) {
        var col = i % L.cols, row = Math.floor(i / L.cols), x = L.left + col * (L.bw + L.gap), y = oy + L.top + row * (L.bh + L.gap);
        var isHover = hover === a.id;
        g.fillStyle = a.danger ? (isHover ? '#8a2614' : '#a8321c') : a.primary ? '#c4552d' : a.on ? '#d8ece8' : isHover ? '#ece4d8' : '#f1ebe2';
        roundRect(g, x, y, L.bw, L.bh, 24); g.fill();
        if (isHover) { g.lineWidth = 5; g.strokeStyle = a.primary || a.danger ? '#5c1d0c' : '#2f8f83'; g.stroke(); }
        g.fillStyle = a.primary || a.danger ? '#ffffff' : a.on ? '#1f6b62' : '#2a2522';
        g.font = '600 ' + (a.label.length > 14 ? 25 : 29) + 'px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(a.label, x + L.bw / 2, y + L.bh / 2 + 1);
        g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        xr.panelButtons.push({ id: a.id, x: x, y: y, w: L.bw, h: L.bh });
      });
      g.fillStyle = '#8a7e73'; g.font = '500 24px Inter, Arial, sans-serif'; g.textAlign = 'center';
      g.fillText('Y: close the menu  ·  hold Y: leave VR and go back to the website', PANEL_W / 2, L.H - 26); g.textAlign = 'left';
      if (!xr.panelMesh) {
        var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
        xr.panelMesh = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, toneMapped: false }));
        xr.panelMesh.renderOrder = 40; scene.add(xr.panelMesh);
      }
      xr.panelMesh.material.map.needsUpdate = true;
      xr.panelTop = oy;
      xr.panelHover = hover || null;
    }
    function leftController() { var l = xr.inputs.left; return l && l.grip && !l.isHand ? l : null; }
    function openPanel() {
      if (st.mode !== 'xr' || !xr.head) { xr.needPanel = true; return; }
      st.panel = true; drawPanel(); xr.panelWorld = null;
      if (!leftController()) {
        var fwd = headFwd(true), d = Math.max(0.32, Math.min(0.55, wallDist(fwd) - 0.1));
        xr.panelWorld = xr.head.clone().addScaledVector(fwd, d); xr.panelWorld.y = xr.head.y - 0.14;
      }
      placePanel();
      xr.panelMesh.visible = true;
      changed();
    }
    function placePanel() {
      if (!xr.panelMesh || !xr.head) return;
      var lc = xr.panelWorld ? null : leftController(), H = xr.panelCanvas.height, w;
      if (lc) {
        w = PANEL_HAND;
        var hgt = w * H / PANEL_W, toHead = xr.head.clone().sub(lc.grip); toHead.y = 0;
        if (toHead.lengthSq() < 1e-4) toHead.set(0, 0, 1);
        xr.panelMesh.position.copy(lc.grip).addScaledVector(toHead.normalize(), 0.03);
        xr.panelMesh.position.y += 0.06 + hgt / 2;
      } else {
        if (!xr.panelWorld) xr.panelWorld = xr.panelMesh.position.clone();   // the controller went away: leave it there
        w = PANEL_FLOAT;
        xr.panelMesh.position.copy(xr.panelWorld);
      }
      xr.panelMesh.scale.set(w, w * H / PANEL_W, 1);
      xr.panelMesh.lookAt(xr.head);
    }
    function closePanel() { st.panel = false; if (xr.panelMesh) xr.panelMesh.visible = false; }
    function togglePanel() { if (st.panel) closePanel(); else openPanel(); }
    /* the button under a point of the menu; null on the menu but not on a button, undefined off the drawn card */
    function panelButtonAt(uv) {
      var c = xr.panelCanvas; if (!c) return undefined;
      var x = uv.x * PANEL_W, y = (1 - uv.y) * c.height;
      if (y < (xr.panelTop || 0)) return undefined;
      return xr.panelButtons.filter(function (b) { return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; })[0] || null;
    }
    function hoverPanel() {
      var hov = null;
      ['right', 'left', 'none'].forEach(function (h) { var i = xr.inputs[h]; if (!hov && i && i.panelHit) { var b = panelButtonAt(i.panelHit.uv); if (b) hov = b.id; } });
      if (hov !== xr.panelHover) drawPanel(hov);
    }
    function pressPanel(uv) {
      var b = panelButtonAt(uv);
      if (!b) return;
      haptic(null, 0.3, 30);
      act(b.id);
    }
    /* small labels floating over each controller: what every button does right now */
    function tipLines(h) {
      var ph = st.phase, hit = xr.hasHitTest;
      if (h === 'right') {
        if (ph === 'place') return [hit ? 'Trigger: stick it where you point' : 'Trigger: mark a point on the wall', 'Grip: grab it from the air', 'Stick up / down: size', 'A: float in front  ·  B: opacity'];
        if (ph === 'adjust') return [hit ? 'Trigger: move it where you point' : 'Trigger: menu buttons', 'Grip (hold): drag it', 'Stick: size ↕  turn ↔', 'Click stick: LOCK', 'A: hide / show  ·  B: opacity'];
        return [S.grid ? 'Trigger: tick a grid square' : 'Trigger: menu buttons', 'Grip (hold): peek behind it', 'Stick: opacity ↕  look ↔', 'Click stick: unlock', 'A: hide / show  ·  B: opacity'];
      }
      var l = ['Y: menu  ·  hold Y: leave VR'];
      if (ph === 'place') return l.concat(['X: float in front', 'Click stick: grid']);
      if (ph === 'adjust') return ['Stick: slide it on the wall', 'Grip (hold): drag it', '2 tips on wall + trigger: snap'].concat(l, ['X: hide / show  ·  click stick: grid']);
      return ['Stick: move the spotlight square', 'Grip (hold): peek behind it'].concat(l, ['X: hide / show  ·  click stick: grid']);
    }
    var TIP_W = 560, TIP_H = 250, TIP_M = 0.16;
    function drawTip(m, lines) {
      var g = m.c.getContext('2d'), lh = 42, bh = 22 + lines.length * lh, y0 = TIP_H - bh;
      g.clearRect(0, 0, TIP_W, TIP_H);
      g.fillStyle = 'rgba(24, 21, 19, .82)'; roundRect(g, 2, y0, TIP_W - 4, bh - 2, 22); g.fill();
      g.font = '600 28px Inter, Arial, sans-serif'; g.textBaseline = 'middle';
      lines.forEach(function (ln, i) {
        var k = ln.indexOf(':');
        g.fillStyle = '#7fe3d6'; g.fillText(k > 0 ? ln.slice(0, k + 1) : '', 22, y0 + 32 + i * lh);
        var w = k > 0 ? g.measureText(ln.slice(0, k + 1) + ' ').width : 0;
        g.fillStyle = '#ffffff'; g.fillText(k > 0 ? ln.slice(k + 2) : ln, 22 + w, y0 + 32 + i * lh);
      });
      m.mesh.material.map.needsUpdate = true;
    }
    function updateTips() {
      var show = tipsOn() && (st.phase !== 'locked' || performance.now() < xr.tipsUntil);
      ['left', 'right'].forEach(function (h) {
        var inp = xr.inputs[h], m = xr.tips[h];
        var vis = show && inp && inp.grip && !inp.isHand && !(h === 'left' && st.panel && !xr.panelWorld);
        if (!vis) { if (m) m.mesh.visible = false; return; }
        if (!m) {
          var c = WT.canvas(TIP_W, TIP_H), t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
          var mesh = new T.Mesh(new T.PlaneGeometry(TIP_M, TIP_M * TIP_H / TIP_W), new T.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, toneMapped: false }));
          mesh.renderOrder = 45; scene.add(mesh);
          m = xr.tips[h] = { c: c, mesh: mesh, key: '' };
        }
        var lines = tipLines(h), key = lines.join('|');
        if (m.key !== key) { drawTip(m, lines); m.key = key; }
        var toHead = xr.head.clone().sub(inp.grip).normalize();
        m.mesh.position.copy(inp.grip).addScaledVector(toHead, 0.03);
        m.mesh.position.y += 0.05 + TIP_M * TIP_H / TIP_W / 2;
        m.mesh.lookAt(xr.head); m.mesh.visible = true;
      });
    }
    /* a line of text that floats below your view for a moment (always in front of the wall) */
    function drawToast(msg) {
      if (!xr.toastCanvas) xr.toastCanvas = WT.canvas(1024, 150);
      var c = xr.toastCanvas, g = c.getContext('2d');
      g.clearRect(0, 0, 1024, 150);
      g.font = '600 38px Inter, Arial, sans-serif';
      var lines = [], words = String(msg).split(' '), line = '';
      words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (g.measureText(t).width > 930 && line) { lines.push(line); line = w; } else line = t; });
      lines.push(line); lines = lines.slice(0, 2);
      var hgt = 40 + lines.length * 48;
      g.fillStyle = 'rgba(24, 21, 19, .86)'; roundRect(g, 512 - 490, 75 - hgt / 2, 980, hgt, 30); g.fill();
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      lines.forEach(function (l, i) { g.fillText(l, 512, 75 + (i - (lines.length - 1) / 2) * 48); });
      g.textAlign = 'left';
      if (!xr.toastMesh) {
        var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
        xr.toastMesh = new T.Mesh(new T.PlaneGeometry(0.5, 0.5 * 150 / 1024), new T.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, toneMapped: false }));
        xr.toastMesh.renderOrder = 50; scene.add(xr.toastMesh); xr.toastFresh = true;
      }
      xr.toastMesh.material.map.needsUpdate = true;
      xr.toastMesh.material.opacity = 1;
      xr.toastMesh.visible = true; st.toastT = 3.2;
    }
    function followToast(dt) {
      if (!xr.toastMesh || !xr.toastMesh.visible || !xr.head) return;
      st.toastT -= dt;
      var fwd = headFwd(false), d = Math.max(0.3, Math.min(0.75, wallDist(fwd) - 0.08));
      var want = xr.head.clone().addScaledVector(fwd, d);
      want.y += (st.panel && xr.panelWorld ? 0.16 : -0.22) * d / 0.75;   // above a floating menu, else just below your view
      if (xr.toastFresh) { xr.toastMesh.position.copy(want); xr.toastFresh = false; } else xr.toastMesh.position.lerp(want, Math.min(1, dt * 4));
      xr.toastMesh.scale.setScalar(d / 0.75);   // same size to your eye, however close the wall is
      xr.toastMesh.lookAt(xr.head);
      xr.toastMesh.material.opacity = Math.max(0, Math.min(1, st.toastT));
      if (st.toastT <= 0) { xr.toastMesh.visible = false; xr.toastFresh = true; }
    }

    /* ================================================================== the loop */
    function frame(t, xf) {
      var dt = last ? Math.min(0.1, (t - last) / 1000) : 0.016; last = t;
      if (st.mode === 'xr' && xf) xrFrame(xf, dt);
      else if (st.mode !== 'xr') {
        camera.position.set(0, 1.55, 1.1);
        camera.rotation.set(flat.pitch, flat.yaw, 0, 'YXZ');
        if (st.mode === 'flat' && st.phase === 'place' && st.method === 'aim') {
          var h = flat.hover;
          if (h) { setPose(h.point, hitNormal(h), false); artMesh.visible = true; reticle.visible = true; reticle.position.copy(h.point).addScaledVector(st.surface.normal, 0.002); reticle.quaternion.copy(art.quaternion); }
          else { art.visible = false; reticle.visible = false; }
        } else reticle.visible = false;
      }
      // blink: hide for a moment every few seconds
      if (st.phase === 'locked' && S.blink && st.shown && st.mode !== 'intro') {
        st.blinkT += dt;
        var off = st.blinkT % (S.blink + 1.2) > S.blink;
        if (off !== st.blinkOff) { st.blinkOff = off; applyVis(); }
      } else if (st.blinkOff) { st.blinkOff = false; applyVis(); }
      // tracing time
      if (st.phase === 'locked' && (st.mode === 'flat' || (st.mode === 'xr' && (!xr.session || xr.session.visibilityState !== 'hidden')))) {
        st.activeMs += dt * 1000; st.sessionMs += dt * 1000;
        if (st.activeMs - st.loggedMs > 60000) logProgress(false);
      }
      renderer.render(scene, camera);
    }
    function logProgress(final) {
      var mins = (st.activeMs - st.loggedMs) / 60000;
      if (mins < 0.05 && !(final && st.dirty)) return;
      st.loggedMs = st.activeMs; st.dirty = false;
      var s = { width_cm: Math.round(S.width_cm * 10) / 10, rot: Math.round(S.rot * 10) / 10, opacity: S.opacity, look: S.look, grid: S.grid, marks: S.marks, blink: S.blink };
      var ns = st.newSession && mins >= 0.05;
      if (ns) st.newSession = false;
      return WT.store.log(P.id, Math.round(mins * 100) / 100, P.done || [], ns, s).catch(function () {});
    }

    /* ================================================================== intro + summary screens */
    function keysHtml(headset) {
      return '<div class="tr-keys"><div><h4>' + UI.icon('headset') + 'Controllers</h4><ul>' +
        '<li><b>Trigger</b>: stick it where you point (again any time to move it) · press menu buttons</li>' +
        '<li><b>Grip</b> (hold): drag it · once locked: peek behind it</li>' +
        '<li><b>Right stick</b>: size ↕, turn ↔ · <b>click</b>: lock / unlock</li>' +
        '<li><b>Left stick</b>: slide it on the wall · <b>click</b>: grid</li>' +
        '<li><b>A or X</b>: hide / show · <b>B</b>: opacity</li><li><b>Y</b>: menu · <b>hold Y</b>: leave VR, back to this page</li></ul></div>' +
        '<div><h4>' + UI.icon('hand') + 'Hands (controllers down)</h4><ul><li><b>Pinch</b> with your free hand: hide / show</li>' +
        '<li><b>Pinch and hold</b>: menu</li><li>Your pencil hand\'s pinches are ignored</li><li>Blink mode peeks for you</li></ul></div>' +
        (headset ? '' : '<div><h4>' + UI.icon('grid') + 'Keyboard (this screen)</h4><ul><li><span class="wt-kbd">H</span> hide · <span class="wt-kbd">L</span> lock</li>' +
        '<li><span class="wt-kbd">G</span> grid · <span class="wt-kbd">S</span> spotlight · <span class="wt-kbd">D</span> square done</li>' +
        '<li><span class="wt-kbd">Q</span> <span class="wt-kbd">E</span> turn · scroll: size / zoom</li><li><span class="wt-kbd">M</span> look · <span class="wt-kbd">O</span> opacity</li></ul></div>') +
        '</div>' + (headset ? '<p class="ui-note" style="margin-top:10px">No keyboard needed: every step works with the controllers, and labels over them show what each button does.</p>' : '');
    }
    function showIntro(sup) {
      st.mode = 'intro';
      var p = pseudo();
      ov.innerHTML = '<div class="tr-intro"><div class="ui-card tr-card">' +
        '<div class="head">' + WT.thumbHtml(P) + '<div><h1>' + esc(P.title) + '</h1>' +
        '<div class="ui-row"><span class="ui-badge">' + UI.icon('ruler') + esc(WT.fmtSize(p)) + '</span><span class="ui-badge">' + esc(WT.lookLabel(S.look)) + '</span>' +
        (P.minutes ? '<span class="ui-badge">' + UI.icon('clock') + esc(WT.fmtMinutes(P.minutes)) + ' so far</span>' : '') + '</div></div></div>' +
        '<div class="tr-go">' +
        (sup.ar ? '<button class="ui-btn primary lg" data-xr="ar">' + UI.icon('headset') + '<span>Start on the wall<small>Passthrough: your real wall with the picture on it.</small></span></button>' : '') +
        (sup.vr && !sup.ar ? '<button class="ui-btn primary lg" data-xr="vr">' + UI.icon('headset') + '<span>Start in VR<small>This headset has no passthrough here, so you\'ll see the practice room.</small></span></button>' : '') +
        '<button class="ui-btn lg' + (sup.ar || sup.vr ? '' : ' primary') + '" data-flat>' + UI.icon('play') + '<span>Practise in the virtual room<small>Place, lock and trace with the mouse or your finger, right here.</small></span></button>' +
        '</div>' +
        (!sup.ar && !sup.vr ? '<p class="ui-note" style="margin-top:12px">To trace a real wall, open this page on a <b>Meta Quest</b> (3, 3S, Pro or 2) in the Meta Quest Browser and sign in. Android phones with AR work too, on a tripod.</p>' : '') +
        keysHtml(sup.ar || sup.vr) +
        '<div class="ui-row" style="margin-top:18px"><a class="ui-btn ghost sm" href="#edit/' + esc(P.id) + '" data-go="edit/' + esc(P.id) + '">' + UI.icon('sliders') + 'Adjust look and size</a>' +
        '<a class="ui-btn ghost sm" href="#studio" data-go="studio">' + UI.icon('back') + 'Studio</a><a class="ui-btn ghost sm" href="#guide" data-go="guide">' + UI.icon('info') + 'Guide</a></div>' +
        '</div></div>';
    }
    function showSummary() {
      st.mode = 'intro';
      var mins = st.sessionMs / 60000, g = WT.grid(pseudo());
      ov.innerHTML = '<div class="tr-intro"><div class="ui-card tr-card"><div class="tr-sum"><h2 class="tr-done">Session done</h2>' +
        '<div class="big">' + (mins >= 1 ? esc(WT.fmtMinutes(mins)) : 'A quick one') + '</div><p class="muted">' +
        (S.grid ? (P.done || []).length + ' of ' + g.cells + ' squares traced' : 'traced on ' + esc(P.title)) + ' · ' + esc(WT.fmtMinutes((P.minutes || 0) + st.activeMs / 60000)) + ' in total</p></div>' +
        '<div class="tr-go"><button class="ui-btn primary lg" data-again>' + UI.icon('refresh') + 'Keep tracing</button>' +
        (P.status !== 'done' ? '<button class="ui-btn lg" data-finished>' + UI.icon('flag') + 'It\'s finished!</button>' : '') +
        '<a class="ui-btn lg" href="#studio" data-go="studio">' + UI.icon('back') + 'Back to the studio</a></div></div></div>';
    }
    function startFlat() {
      st.mode = 'flat'; st.newSession = true; st.sessionMs = 0; st.sessionCells = 0;
      syncMusic();
      if (!st.surface) { st.phase = 'place'; st.method = 'aim'; art.visible = false; }
      applyEnv(); applyVis(); drawHud(); resize(); cv.focus();
      say(st.phase === 'place' ? 'Click the wall (or the table) to put your picture there.' : hint());
    }
    function finish() {
      if (st.mode === 'xr' && xr.session) { xr.session.end(); return; }
      logProgress(true);
      showSummary();
    }

    on(ov, 'click', function (e) {
      var b = e.target.closest('[data-act]');
      if (b) { act(b.getAttribute('data-act')); return; }
      var x = e.target.closest('[data-xr]');
      if (x) { enterXR(x.getAttribute('data-xr')); return; }   // must stay synchronous (browser rule for VR)
      if (e.target.closest('[data-flat]') || e.target.closest('[data-again]')) {
        if (e.target.closest('[data-again]') && st.supXR) { showIntro(st.sup); return; }
        startFlat(); return;
      }
      if (e.target.closest('[data-endxr]')) { if (xr.session) xr.session.end(); return; }
      if (e.target.closest('[data-x]')) { finish(); return; }
      var f = e.target.closest('[data-finished]');
      if (f) {
        UI.busy(f, WT.store.update(P.id, { status: 'done' })).then(function () {
          P.status = 'done'; WT.confetti(); UI.toast('Finished! Lovely work.', 'ok');
          if (UI.me && !WT.isDevice(P.id)) UI.go('showcase', 'share', P.id); else UI.go('studio');
        });
      }
    });
    on(cv, 'pointerdown', onPointerDown); on(cv, 'pointermove', onPointerMove); on(cv, 'pointerup', onPointerUp);
    on(cv, 'wheel', onWheel, { passive: false }); on(window, 'keydown', onKey);
    on(cv, 'pointerleave', function () { flat.hover = null; });

    window.WT_TRACE = {
      state: function () { return { mode: st.mode, phase: st.phase, shown: st.shown, spot: st.spot, grid: S.grid, width: S.width_cm, opacity: S.opacity, look: S.look, done: (P.done || []).slice(), activeMs: st.activeMs, visible: !!(artMesh && art.visible && artMesh.visible),
        anchored: !!xr.anchor, panel: st.panel, rot: S.rot, pos: art ? art.position.toArray().map(function (v) { return Math.round(v * 1000) / 1000; }) : null }; },
      act: act,
      /* place at a point of the screen (fractions of width/height), as a click would */
      placeAt: function (fx, fy) {
        var r = cv.getBoundingClientRect(), h = pickFlat(r.left + r.width * fx, r.top + r.height * fy, surfaces());
        if (h) placeAt(h.point, hitNormal(h), false);
        return !!h;
      },
      draw: function (pts) {  // pencil strokes, in screen fractions
        var r = cv.getBoundingClientRect(), mesh = null, lastUv = null;
        pts.forEach(function (p) {
          var h = pickFlat(r.left + r.width * p[0], r.top + r.height * p[1], surfaces().filter(function (o) { return o.userData.draw; }));
          if (!h) return;
          if (mesh === h.object && lastUv) pencilLine(mesh, lastUv, h.uv);
          mesh = h.object; lastUv = h.uv.clone();
        });
        return !!st.drawn;
      },
      addTime: function (ms) { st.activeMs += ms; st.sessionMs += ms; },
      log: function () { return logProgress(true); }
    };

    var ready = Promise.all([WT.store.get(id), WT.three(), WT.xrSupport()]).then(function (r) {
      P = r[0]; T = r[1]; S = WT.settings(P.settings); st.sup = r[2]; st.supXR = r[2].ar || r[2].vr;
      document.title = 'Trace: ' + P.title + ' · ' + UI.config.name;
      return WT.loadImage(P.image);
    }).then(function (im) {
      img = im;
      if (!alive) return;
      init3D();
      showIntro(st.sup);
    });
    return {
      ready: ready,
      destroy: function () {
        if (st.mode === 'flat' || st.mode === 'xr') logProgress(true);
        alive = false;
        syncMusic();
        if (xr.session) { try { xr.session.end(); } catch (e) {} }
        listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
        if (renderer) { renderer.setAnimationLoop(null); renderer.dispose(); }
        clearTimeout(toastTimer);
        if (window.WT_TRACE) delete window.WT_TRACE;
      }
    };
  });
})();
