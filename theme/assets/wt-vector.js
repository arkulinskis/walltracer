/* wt-vector.js: vector tracing for WallTracer's looks (window.WT.vector). Loaded after wt.js and imagetracer.js.
   Pixels -> smooth curves, drawn crisp at any size (the headset texture is 2048 px, the editor 900 px, both from the
   same geometry so they look alike).
   - Outline: Canny edges (blur, Sobel, thin, two thresholds + hysteresis so edges join up), short bits dropped,
     each edge walked into a polyline, simplified (Ramer-Douglas-Peucker) and drawn as smooth curves.
   - Lines / Silhouette (setting "smooth"): the dark mask traced into filled vector shapes (ImageTracer, 2 colours).
   - Shapes: colour trace (ImageTracer: k-means colours -> region outlines -> lines and curves), styles logo/photo/pixel.
   - WT.vector.svg(img, settings): the same geometry as an SVG file at the picture's real size (Download SVG).
   ImageTracer (imagetracer.js 1.2.6, András Jankovics) is public domain (Unlicense). */
(function () {
  'use strict';
  var WT = window.WT = window.WT || {};
  var V = WT.vector = {};
  V.SIDE = 1024;         // analysis size for edges and line art
  V.SHAPES_SIDE = 640;   // colour tracing is the slow one; vectors scale up cleanly
  V.LOOKS = ['outline', 'lines', 'stencil', 'shapes'];
  V.TRACES = [['logo', 'Logo'], ['photo', 'Photo'], ['pixel', 'Pixel art']];

  /* Does this look draw as vectors with these settings? */
  V.applies = function (s) {
    if (s.look === 'shapes') return !!window.ImageTracer;
    if (s.smooth === false || V.LOOKS.indexOf(s.look) < 0) return false;
    return s.look === 'outline' || !!window.ImageTracer;
  };

  /* ------------------------------------------------------------------ edges */
  /* Canny: L = blurred luminance. Pixels above hi are edges; pixels above lo join them when they touch one. */
  V.canny = function (L, W, H, hi, lo) {
    var n = W * H, M = new Float32Array(n), D = new Uint8Array(n), S = new Uint8Array(n), out = new Uint8Array(n), x, y, i;
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
      i = y * W + x;
      var gx = -L[i - W - 1] - 2 * L[i - 1] - L[i + W - 1] + L[i - W + 1] + 2 * L[i + 1] + L[i + W + 1];
      var gy = -L[i - W - 1] - 2 * L[i - W] - L[i - W + 1] + L[i + W - 1] + 2 * L[i + W] + L[i + W + 1];
      M[i] = Math.sqrt(gx * gx + gy * gy);
      var a = Math.atan2(gy, gx) * 57.2958; if (a < 0) a += 180;
      D[i] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3;
    }
    var stack = [];
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
      i = y * W + x;
      var m = M[i]; if (m < lo) continue;
      var d = D[i], a1, a2;
      if (d === 0) { a1 = M[i - 1]; a2 = M[i + 1]; }
      else if (d === 1) { a1 = M[i - W - 1]; a2 = M[i + W + 1]; }
      else if (d === 2) { a1 = M[i - W]; a2 = M[i + W]; }
      else { a1 = M[i - W + 1]; a2 = M[i + W - 1]; }
      if (m >= a1 && m > a2) {
        S[i] = m >= hi ? 2 : 1;
        if (S[i] === 2) { out[i] = 1; stack.push(i); }
      }
    }
    while (stack.length) {  // hysteresis: grow strong edges through touching weak ones
      i = stack.pop();
      var nb = [i - W - 1, i - W, i - W + 1, i - 1, i + 1, i + W - 1, i + W, i + W + 1];
      for (var k = 0; k < 8; k++) { var j = nb[k]; if (S[j] === 1 && !out[j]) { out[j] = 1; stack.push(j); } }
    }
    return out;
  };

  var NB = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
  /* A 1-px edge map -> polylines [x0, y0, x1, y1, ...] (pixel centres), dropping ones shorter than minLen pixels. */
  V.chains = function (E, W, H, minLen) {
    var seen = new Uint8Array(W * H), out = [], i;
    function nbrs(i, fn) {
      var x = i % W, y = (i / W) | 0;
      for (var k = 0; k < 8; k++) {
        var xx = x + NB[k][0], yy = y + NB[k][1];
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        var j = yy * W + xx;
        if (E[j] && fn(j) === false) return;
      }
    }
    function degree(i) { var c = 0; nbrs(i, function () { c++; }); return c; }
    function joined(i, not) { var f = -1; nbrs(i, function (j) { if (seen[j] && j !== not) { f = j; return false; } }); return f; }
    function walk(start) {
      var pts = [start], cur = start; seen[start] = 1;
      var before = joined(start, -1);            // touch an earlier chain: join it, no gap at the junction
      for (;;) {
        var nx = -1;
        nbrs(cur, function (j) { if (!seen[j]) { nx = j; return false; } });
        if (nx < 0) break;
        seen[nx] = 1; pts.push(nx); cur = nx;
      }
      if (pts.length >= minLen) {
        var after = joined(cur, pts.length > 1 ? pts[pts.length - 2] : -1);
        if (before >= 0) pts.unshift(before);
        if (after >= 0 && after !== pts[pts.length - 2]) pts.push(after);
        var flat = new Array(pts.length * 2);
        for (var k = 0; k < pts.length; k++) { flat[2 * k] = pts[k] % W + 0.5; flat[2 * k + 1] = ((pts[k] / W) | 0) + 0.5; }
        out.push(flat);
      }
    }
    for (i = 0; i < W * H; i++) if (E[i] && !seen[i] && degree(i) <= 1) walk(i);  // open lines, end to end
    for (i = 0; i < W * H; i++) if (E[i] && !seen[i]) walk(i);                    // what's left: loops
    return out;
  };

  /* Ramer-Douglas-Peucker on a flat [x, y, ...] list. */
  V.simplify = function (p, eps) {
    var n = p.length / 2;
    if (n < 3) return p;
    var keep = new Uint8Array(n), st = [0, n - 1], e2 = eps * eps;
    keep[0] = keep[n - 1] = 1;
    while (st.length) {
      var b = st.pop(), a = st.pop(), ax = p[2 * a], ay = p[2 * a + 1], bx = p[2 * b], by = p[2 * b + 1];
      var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, best = -1, bi = -1;
      for (var i = a + 1; i < b; i++) {
        var px = p[2 * i] - ax, py = p[2 * i + 1] - ay, d;
        if (L2 === 0) d = px * px + py * py;
        else { var c = px * dy - py * dx; d = c * c / L2; }
        if (d > best) { best = d; bi = i; }
      }
      if (best > e2) { keep[bi] = 1; st.push(a, bi, bi, b); }
    }
    var out = [];
    for (var k = 0; k < n; k++) if (keep[k]) out.push(p[2 * k], p[2 * k + 1]);
    return out;
  };

  /* Path commands, shared by canvas drawing and SVG: ['M', x, y], ['L', x, y], ['Q', cx, cy, x, y], ['Z']. */
  function smoothCmds(cmds, p) {  // a polyline drawn through the midpoints, so corners become soft curves
    var n = p.length / 2;
    if (n < 2) return;
    cmds.push(['M', p[0], p[1]]);
    if (n === 2) { cmds.push(['L', p[2], p[3]]); return; }
    for (var i = 1; i < n - 1; i++) cmds.push(['Q', p[2 * i], p[2 * i + 1], (p[2 * i] + p[2 * i + 2]) / 2, (p[2 * i + 1] + p[2 * i + 3]) / 2]);
    cmds.push(['L', p[2 * n - 2], p[2 * n - 1]]);
  }
  function toPath2D(cmds, k) {
    var P = new Path2D();
    for (var i = 0; i < cmds.length; i++) {
      var c = cmds[i];
      if (c[0] === 'M') P.moveTo(c[1] * k, c[2] * k);
      else if (c[0] === 'L') P.lineTo(c[1] * k, c[2] * k);
      else if (c[0] === 'Q') P.quadraticCurveTo(c[1] * k, c[2] * k, c[3] * k, c[4] * k);
      else P.closePath();
    }
    return P;
  }
  function r2(v) { return Math.round(v * 100) / 100; }
  function toD(cmds) {
    var s = [];
    for (var i = 0; i < cmds.length; i++) {
      var c = cmds[i];
      s.push(c[0] === 'Z' ? 'Z' : c[0] + c.slice(1).map(r2).join(' '));
    }
    return s.join('');
  }

  /* ------------------------------------------------------------------ ImageTracer results -> path commands */
  function segCmds(cmds, segs, from, reverse, skipBorder, W, H) {
    var penUp = true, i, sg;
    function onEdge(x, y) { return x <= 1.6 || y <= 1.6 || x >= W - 1.6 || y >= H - 1.6; }  // blur leaves a thin strip at the frame
    function border(sg) {  // a segment lying along the picture's frame (not a real line in the picture)
      var x1 = sg.x1, y1 = sg.y1, x2 = sg.x3 != null ? sg.x3 : sg.x2, y2 = sg.x3 != null ? sg.y3 : sg.y2;
      return onEdge(x1, y1) && onEdge(x2, y2) && (Math.abs(x1 - x2) < 1.6 || Math.abs(y1 - y2) < 1.6);
    }
    if (!reverse) {
      for (i = 0; i < segs.length; i++) {
        sg = segs[i];
        if (skipBorder && border(sg)) { penUp = true; continue; }
        if (penUp) { cmds.push(['M', sg.x1, sg.y1]); penUp = false; }
        if (sg.type === 'Q') cmds.push(['Q', sg.x2, sg.y2, sg.x3, sg.y3]); else cmds.push(['L', sg.x2, sg.y2]);
      }
      if (!skipBorder) cmds.push(['Z']);
    } else {  // hole children run backwards so a nonzero fill leaves them empty
      sg = segs[segs.length - 1];
      cmds.push(['M', sg.x3 != null ? sg.x3 : sg.x2, sg.x3 != null ? sg.y3 : sg.y2]);
      for (i = segs.length - 1; i >= 0; i--) {
        sg = segs[i];
        if (sg.type === 'Q') cmds.push(['Q', sg.x2, sg.y2, sg.x1, sg.y1]); else cmds.push(['L', sg.x1, sg.y1]);
      }
      cmds.push(['Z']);
    }
  }
  /* One filled shape: a layer's outer path plus its holes. */
  function shapeCmds(layer, path) {
    var cmds = [];
    segCmds(cmds, path.segments, 0, false, false);
    (path.holechildren || []).forEach(function (h) { if (layer[h] && layer[h].segments.length) segCmds(cmds, layer[h].segments, 0, true, false); });
    return cmds;
  }

  /* ------------------------------------------------------------------ geometry per look (cached per picture) */
  var CACHE = typeof WeakMap === 'function' ? new WeakMap() : null;
  function cached(img, key, make) {
    if (!CACHE) return make();
    var m = CACHE.get(img);
    if (!m) { m = { keys: [], vals: {} }; CACHE.set(img, m); }
    if (m.vals[key]) return m.vals[key];
    var v = make();
    m.vals[key] = v; m.keys.push(key);
    if (m.keys.length > 10) delete m.vals[m.keys.shift()];
    return v;
  }

  function lineArtMask(L, W, H, thr) {
    var id = new ImageData(W, H), d = id.data;
    for (var i = 0, n = W * H; i < n; i++) { var v = L[i] < thr ? 0 : 255; d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = v; d[4 * i + 3] = 255; }
    return id;
  }
  function traceMask(id, pathomit) {
    var td = ImageTracer.imagedataToTracedata(id, {
      pal: [{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }], numberofcolors: 2, colorsampling: 0,
      colorquantcycles: 1, pathomit: pathomit, ltres: 1, qtres: 1, rightangleenhance: false, blurradius: 0 });
    return { layer: td.layers[0] || [], W: td.width, H: td.height };
  }

  /* {w, h, strokes: cmds, solid: cmds|null, fills: [{cmds, rgb|null, alpha}], kind} in analysis pixels. */
  V.geometry = function (img, s, maxSide) {
    s = WT.settings(s);
    var shapes = s.look === 'shapes', side = Math.min(shapes ? V.SHAPES_SIDE : V.SIDE, maxSide || 2048);
    if (shapes && s.trace === 'pixel') side = Math.min(maxSide || 2048, Math.max(32, Math.min(384, Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height))));  // pixel art is small; big photos would make huge files
    var key = [s.look, s.detail, s.contrast, s.brightness, s.invert, s.mirror, s.rotate, shapes ? s.trace : '', side].join('|');
    return cached(img, key, function () {
      var cv = WT.base(img, s, side, shapes && s.trace === 'pixel'), W = cv.width, H = cv.height, geo = { w: W, h: H, strokes: [], solid: null, fills: [], kind: s.look };
      if (shapes) return shapesGeo(cv, s, geo);
      var L = WT.luma(cv, s), thrDark = 40 + s.detail * 1.8;
      if (s.look === 'outline') {
        var r = Math.round(1 + (100 - s.detail) / 34), bl = WT.boxBlur(WT.boxBlur(L, W, H, r), W, H, r);  // two box passes ~ a Gaussian
        var hi = 8 + (100 - s.detail) * 0.65, E = V.canny(bl, W, H, hi, hi * 0.4);
        V.chains(E, W, H, Math.round(6 + (100 - s.detail) * 0.3)).forEach(function (c) { smoothCmds(geo.strokes, V.simplify(c, 0.9)); });
      } else if (s.look === 'lines') {
        var t = traceMask(lineArtMask(L, W, H, thrDark), 4);
        geo.solid = [];
        t.layer.forEach(function (p) { if (!p.isholepath && p.segments.length) Array.prototype.push.apply(geo.solid, shapeCmds(t.layer, p)); });
      } else {  // stencil / silhouette: filled shapes with a line round them
        var ts = traceMask(lineArtMask(WT.boxBlur(L, W, H, 1), W, H, thrDark), 8), fill = [];
        ts.layer.forEach(function (p) {
          if (!p.segments.length) return;
          if (!p.isholepath) Array.prototype.push.apply(fill, shapeCmds(ts.layer, p));
          segCmds(geo.strokes, p.segments, 0, false, true, ts.W, ts.H);
        });
        geo.fills.push({ cmds: fill, rgb: null, alpha: 95 / 255 });
      }
      return geo;
    });
  };

  function shapesGeo(cv, s, geo) {
    var W = cv.width, H = cv.height, g = cv.getContext('2d', { willReadFrequently: true }), id = g.getImageData(0, 0, W, H), d = id.data, i;
    var cf = Math.pow((s.contrast + 100) / 100, 2), br = s.brightness * 1.28;
    for (i = 0; i < d.length; i += 4) for (var c = 0; c < 3; c++) {
      var v = (d[i + c] - 128) * cf + 128 + br; v = v < 0 ? 0 : v > 255 ? 255 : v;
      d[i + c] = s.invert ? 255 - v : v;
    }
    var dt = s.detail, o;
    if (s.trace === 'photo') o = { numberofcolors: 4 + Math.round(dt * 0.28), pathomit: Math.round(12 + (100 - dt) * 0.5), blurradius: 3, blurdelta: 24, ltres: 1, qtres: 1, rightangleenhance: false, colorsampling: 2, colorquantcycles: 3 };
    else if (s.trace === 'pixel') o = { numberofcolors: 2 + Math.round(dt * 0.14), pathomit: 1, blurradius: 0, ltres: 0.01, qtres: 0.01, rightangleenhance: true, colorsampling: 2, colorquantcycles: 3 };
    else o = { numberofcolors: 2 + Math.round(dt * 0.14), pathomit: Math.round(8 + (100 - dt) * 0.3), blurradius: 0, ltres: 1, qtres: 1, rightangleenhance: true, colorsampling: 2, colorquantcycles: 3 };
    var td = ImageTracer.imagedataToTracedata(id, o);
    geo.palette = td.palette;
    td.layers.forEach(function (layer, li) {
      var pc = td.palette[li] || { r: 0, g: 0, b: 0, a: 255 };
      if (pc.a < 128) return;
      var lum = 0.299 * pc.r + 0.587 * pc.g + 0.114 * pc.b;
      layer.forEach(function (p) {
        if (p.isholepath || !p.segments.length) return;
        geo.fills.push({ cmds: shapeCmds(layer, p), rgb: [pc.r, pc.g, pc.b], alpha: lum > 235 ? 0 : 0.28 });
        segCmds(geo.strokes, p.segments, 0, false, true, td.width, td.height);
      });
    });
    return geo;
  }

  /* ------------------------------------------------------------------ drawing */
  function widths(s, W, H) {
    var unit = Math.max(1, Math.max(W, H) / 1024);
    return { unit: unit, line: unit * (1.2 + 1.8 * (s.thickness - 1)), grow: unit * 1.6 * (s.thickness - 1), halo: 3.2 * unit };
  }
  /* Draw the look into cv (a canvas already sized like WT.base(img, s, maxSide)). */
  V.render = function (img, s, cv, maxSide) {
    s = WT.settings(s);
    var geo = V.geometry(img, s, maxSide), W = cv.width, H = cv.height, k = W / geo.w, w = widths(s, W, H);
    var g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
    g.lineCap = 'round'; g.lineJoin = 'round';
    var col = s.color, hc = WT.isDark(col) ? '255,255,255' : '0,0,0', rgb = WT.rgb(col);
    geo.fills.forEach(function (f) {
      if (!f.alpha || !f.cmds.length) return;
      var c = f.rgb || rgb;
      g.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + f.alpha + ')';
      g.fill(toPath2D(f.cmds, k));
    });
    var strokes = geo.strokes.length ? toPath2D(geo.strokes, k) : null, solid = geo.solid && geo.solid.length ? toPath2D(geo.solid, k) : null;
    if (s.halo) {
      g.strokeStyle = 'rgba(' + hc + ',0.59)';
      if (strokes) { g.lineWidth = w.line + w.halo; g.stroke(strokes); }
      if (solid) { g.lineWidth = w.grow + w.halo; g.stroke(solid); }
    }
    g.strokeStyle = col; g.fillStyle = col;
    if (solid) { g.fill(solid); if (w.grow > 0) { g.lineWidth = w.grow; g.stroke(solid); } }
    if (strokes) { g.lineWidth = w.line; g.stroke(strokes); }
    return cv;
  };

  /* ------------------------------------------------------------------ SVG file */
  /* The look as an SVG at its real size on the wall (width in cm). Shapes keep their real colours. */
  V.svg = function (img, s, title) {
    s = WT.settings(s);
    var geo = V.geometry(img, s, 2048), W = geo.w, H = geo.h, w = widths(s, W, H), col = s.color;
    var wcm = Math.max(1, s.width_cm), hcm = wcm * H / W, out = [];
    out.push('<?xml version="1.0" encoding="UTF-8"?>');
    out.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + r2(wcm) + 'cm" height="' + r2(hcm) + 'cm" viewBox="0 0 ' + W + ' ' + H + '">');
    out.push('<title>' + String(title || 'WallTracer picture').replace(/[<>&"]/g, '') + '</title>');
    out.push('<desc>Made with WallTracer (walltracer.anvil.app), look: ' + WT.lookLabel(s.look) + '</desc>');
    if (s.look === 'shapes') {
      geo.fills.forEach(function (f) { out.push('<path fill="rgb(' + f.rgb.join(',') + ')" d="' + toD(f.cmds) + '"/>'); });
    } else {
      geo.fills.forEach(function (f) { if (f.cmds.length) out.push('<path fill="' + col + '" fill-opacity="' + r2(f.alpha) + '" d="' + toD(f.cmds) + '"/>'); });
      if (geo.solid && geo.solid.length) out.push('<path fill="' + col + '"' + (w.grow > 0 ? ' stroke="' + col + '" stroke-width="' + r2(w.grow) + '" stroke-linejoin="round"' : '') + ' d="' + toD(geo.solid) + '"/>');
      if (geo.strokes.length) out.push('<path fill="none" stroke="' + col + '" stroke-width="' + r2(w.line) + '" stroke-linecap="round" stroke-linejoin="round" d="' + toD(geo.strokes) + '"/>');
    }
    out.push('</svg>');
    return out.join('\n');
  };
  V.download = function (img, s, title) {
    var blob = new Blob([V.svg(img, s, title)], { type: 'image/svg+xml' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = String(title || 'walltracer').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) + '.svg';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  };
})();
