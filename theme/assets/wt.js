/* wt.js: WallTracer's drawing kit (window.WT), moved unchanged from the JavaScript version (web/pages/_wt.html).
   - WT.settings / DEFAULTS / LOOKS / COLORS / WALLS: a project's display settings (mirror of Projects.SETTINGS on the server)
   - WT.process(img, settings, maxSide): the picture -> a transparent canvas of coloured lines (the "look")
   - WT.drawOverlay(...): grid, cell names, done cells, spotlight frame, registration crosses
   - WT.readPicture(file), WT.thumb, WT.lettering + WT.letteringModal: pictures from files and from text
   - WT.store: projects in the account (server, through UI.api) or on this device (IndexedDB, ids start with "d_")
   - WT.three(): three.js on demand. Python reaches all of this through client_code/wt.py. */
(function () {
  'use strict';
  var WT = window.WT = window.WT || {};  // wt-kit.js already put WT.host and WT.settle here

  /* ------------------------------------------------------------------ icons this app adds */
  var more = {
    headset: '<path d="M3 9.5C3 8 4 7 5.5 7h13C20 7 21 8 21 9.5v4c0 1.6-1.2 2.5-2.6 2.5h-2.6c-1 0-1.6-.6-2-1.4l-.5-1a1.5 1.5 0 0 0-2.6 0l-.5 1c-.4.8-1 1.4-2 1.4H5.6C4.2 16 3 15.1 3 13.5z"/><path d="M7 7l1.5-2.5h7L17 7"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M4 4l16 16"/><path d="M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8M6.3 7.6A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1"/><path d="M10 10.2a3 3 0 0 0 4 4"/>',
    pencil: '<path d="M4 20l1-4.5L16 4.5a2 2 0 0 1 3 0l.5.5a2 2 0 0 1 0 3L8.5 19z"/><path d="M14 6.5l3.5 3.5"/><path d="M4 20l4.5-1"/>',
    layers: '<path d="M12 3 3 8l9 5 9-5z"/><path d="m3 13 9 5 9-5"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    type: '<path d="M5 6V4h14v2"/><path d="M12 4v16M9 20h6"/>',
    ruler: '<rect x="2.5" y="8" width="19" height="8" rx="1.5"/><path d="M6 8v3M9.5 8v4.5M13 8v3M16.5 8v4.5"/>',
    hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5"/><path d="M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6.5 7-2.8 0-4.4-1.5-5.6-3.6L3.4 14.6a1.5 1.5 0 0 1 2.5-1.6L8 15"/>',
    target: '<circle cx="12" cy="12" r="8"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
    lockopen: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    blink: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12"/><path d="M4 13.5l-1.5 2M8 16l-.8 2.4M12 17v2.5M16 16l.8 2.4M20 13.5l1.5 2"/>',
    spot: '<rect x="3.5" y="3.5" width="17" height="17" rx="2" stroke-dasharray="3 3"/><rect x="8" y="8" width="8" height="8" rx="1.5"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    mirror: '<path d="M12 3v18" stroke-dasharray="2 2.5"/><path d="M9 6 3 18h6zM15 6l6 12h-6z"/>',
    rotate: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/>',
    cross: '<circle cx="12" cy="12" r="4"/><path d="M12 3v18M3 12h18"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.6-2.2-.5-1.3.3-2.3 1.6-2.3H18a3 3 0 0 0 3-3C21 7 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>'
  };
  Object.keys(more).forEach(function (k) { UI.ICONS[k] = more[k]; });

  /* ------------------------------------------------------------------ settings */
  WT.DEFAULTS = { look: 'lines', detail: 50, levels: 4, contrast: 0, brightness: 0, color: '#00e5ff', thickness: 2, halo: true, invert: false,
    mirror: false, rotate: 0, opacity: 0.85, grid: false, cols: 4, labels: true, marks: true, marks_hidden: true, width_cm: 100, unit: 'cm',
    pencil: 'right', blink: 0, wall: '#f3efe8', rot: 0 };
  WT.settings = function (s) {
    var o = {};
    Object.keys(WT.DEFAULTS).forEach(function (k) { o[k] = s && s[k] != null ? s[k] : WT.DEFAULTS[k]; });
    return o;
  };
  WT.LOOKS = [
    { key: 'lines', label: 'Lines', hint: 'The dark lines of the picture; everything else is see-through. Best for line art and the library.' },
    { key: 'outline', label: 'Outline', hint: 'Finds the edges in a photo and draws them as thin lines.' },
    { key: 'zones', label: 'Tones', hint: 'Splits the picture into a few tones with lines between them, like paint-by-numbers.' },
    { key: 'stencil', label: 'Silhouette', hint: 'Dark areas become see-through shapes with a crisp edge.' },
    { key: 'photo', label: 'Photo', hint: 'The picture as it is. Lower the opacity to see your pencil through it.' }];
  WT.lookLabel = function (k) { return (WT.LOOKS.filter(function (l) { return l.key === k; })[0] || WT.LOOKS[0]).label; };
  WT.COLORS = [['#00e5ff', 'Neon cyan'], ['#ff4fd8', 'Magenta'], ['#ffe14d', 'Lemon'], ['#7dff6a', 'Lime'], ['#ff5d3a', 'Coral'], ['#ffffff', 'White'], ['#1f1c1a', 'Charcoal']];
  WT.WALLS = [['#f3efe8', 'Warm white'], ['#e3ddd3', 'Greige'], ['#cfd8d3', 'Sage'], ['#dcc7ab', 'Sand'], ['#b9c7d6', 'Dusty blue'], ['#3a3f44', 'Charcoal'], ['#262b2c', 'Blackboard']];
  WT.OPACITIES = [1, 0.85, 0.6, 0.35, 0.15];

  WT.isDark = function (hex) {
    var c = WT.rgb(hex); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) < 110;
  };
  WT.rgb = function (hex) {
    var h = String(hex || '#000000').replace('#', '');
    return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
  };
  /* Picture proportions after turning it. */
  WT.aspect = function (p) {
    var s = WT.settings(p.settings), w = p.w || 1000, h = p.h || 1000;
    return (s.rotate === 90 || s.rotate === 270) ? h / w : w / h;
  };
  WT.sizeCm = function (p) { var s = WT.settings(p.settings); return { w: s.width_cm, h: s.width_cm / WT.aspect(p) }; };
  WT.fmtLen = function (cm, unit) {
    if (unit === 'in') { var inch = cm / 2.54; return (inch >= 24 ? Math.round(inch) : Math.round(inch * 10) / 10) + ' in'; }
    return (cm >= 20 ? Math.round(cm) : Math.round(cm * 10) / 10) + ' cm';
  };
  WT.fmtSize = function (p) {
    var s = WT.settings(p.settings), z = WT.sizeCm(p);
    return WT.fmtLen(z.w, s.unit).replace(/ (cm|in)$/, '') + ' × ' + WT.fmtLen(z.h, s.unit);
  };
  WT.grid = function (p) {
    var s = WT.settings(p.settings), a = WT.aspect(p);
    var cols = Math.max(1, Math.min(16, s.cols | 0)), rows = Math.max(1, Math.min(16, Math.round(cols / a)));
    return { cols: cols, rows: rows, cells: cols * rows };
  };
  WT.cellName = function (c, r) { return String.fromCharCode(65 + c) + (r + 1); };
  WT.progress = function (p) {
    var s = WT.settings(p.settings);
    if (p.status === 'done') return 1;
    if (!s.grid) return null;
    var g = WT.grid(p);
    return Math.min(1, (p.done || []).length / g.cells);
  };
  WT.fmtMinutes = function (m) {
    m = Math.round(m || 0);
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
  };

  /* ------------------------------------------------------------------ pictures */
  WT.loadImage = function (src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('That picture could not be opened.')); };
      img.src = src;
    });
  };
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  WT.canvas = canvas;
  WT.thumb = function (src, max, bg) {
    var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height, k = Math.min(1, (max || 360) / Math.max(w, h));
    var c = canvas(w * k, h * k), g = c.getContext('2d');
    g.fillStyle = bg || '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  };
  /* A file from the computer or phone -> {image (data URL, at most 2400 px), w, h, thumb, title}. */
  WT.readPicture = function (file, maxSide) {
    if (!file) return Promise.reject(new Error('No picture chosen.'));
    if (!/^image\/(jpeg|png|webp|gif|bmp|svg\+xml)$/.test(file.type || '')) {
      return Promise.reject(new Error(/hei[cf]/i.test(file.type + file.name) ? 'iPhone HEIC pictures can\'t be read here. Share it as JPEG (or take a screenshot) and try again.' : 'Choose a JPEG, PNG or WebP picture.'));
    }
    if (file.size > 30 * 1024 * 1024) return Promise.reject(new Error('That picture is over 30 MB. Choose a smaller one.'));
    var url = URL.createObjectURL(file);
    return WT.loadImage(url).then(function (img) {
      URL.revokeObjectURL(url);
      var w = img.naturalWidth || 1000, h = img.naturalHeight || 1000, k = Math.min(1, (maxSide || 2400) / Math.max(w, h));
      var c = canvas(w * k, h * k), g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      var png = file.type === 'image/png' || file.type === 'image/svg+xml' || file.type === 'image/gif';
      var data = png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9);
      if (data.length > 5.5 * 1024 * 1024) data = c.toDataURL('image/jpeg', 0.85);
      return { image: data, w: c.width, h: c.height, thumb: WT.thumb(c, 360), title: (file.name || 'My picture').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').slice(0, 60) };
    }, function (e) { URL.revokeObjectURL(url); throw e; });
  };

  /* ------------------------------------------------------------------ the "look": picture -> coloured lines */
  function boxBlur(src, W, H, r) {
    if (r < 1) return src;
    var tmp = new Float32Array(W * H), out = new Float32Array(W * H), x, y, i, acc, n = 2 * r + 1;
    for (y = 0; y < H; y++) {
      var row = y * W; acc = 0;
      for (x = -r; x <= r; x++) acc += src[row + Math.min(W - 1, Math.max(0, x))];
      for (x = 0; x < W; x++) {
        tmp[row + x] = acc / n;
        acc += src[row + Math.min(W - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
      }
    }
    for (x = 0; x < W; x++) {
      acc = 0;
      for (y = -r; y <= r; y++) acc += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
      for (y = 0; y < H; y++) {
        out[y * W + x] = acc / n;
        acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
      }
    }
    return out;
  }
  function dilate(m, W, H, r) {
    if (r < 1) return m;
    var tmp = new Uint8Array(W * H), out = new Uint8Array(W * H), x, y, c;
    for (y = 0; y < H; y++) {
      var row = y * W; c = 0;
      for (x = 0; x <= Math.min(W - 1, r); x++) c += m[row + x];
      for (x = 0; x < W; x++) {
        tmp[row + x] = c > 0 ? 1 : 0;
        if (x + r + 1 < W) c += m[row + x + r + 1];
        if (x - r >= 0) c -= m[row + x - r];
      }
    }
    for (x = 0; x < W; x++) {
      c = 0;
      for (y = 0; y <= Math.min(H - 1, r); y++) c += tmp[y * W + x];
      for (y = 0; y < H; y++) {
        out[y * W + x] = c > 0 ? 1 : 0;
        if (y + r + 1 < H) c += tmp[(y + r + 1) * W + x];
        if (y - r >= 0) c -= tmp[(y - r) * W + x];
      }
    }
    return out;
  }
  function edges(L, W, H, thr) {
    var n = W * H, M = new Float32Array(n), D = new Uint8Array(n), out = new Uint8Array(n), x, y, i;
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
      i = y * W + x;
      var gx = -L[i - W - 1] - 2 * L[i - 1] - L[i + W - 1] + L[i - W + 1] + 2 * L[i + 1] + L[i + W + 1];
      var gy = -L[i - W - 1] - 2 * L[i - W] - L[i - W + 1] + L[i + W - 1] + 2 * L[i + W] + L[i + W + 1];
      M[i] = Math.sqrt(gx * gx + gy * gy);
      var a = Math.atan2(gy, gx) * 57.2958; if (a < 0) a += 180;
      D[i] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3;
    }
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
      i = y * W + x;
      var m = M[i]; if (m < thr) continue;
      var d = D[i], a1, a2;
      if (d === 0) { a1 = M[i - 1]; a2 = M[i + 1]; }
      else if (d === 1) { a1 = M[i - W - 1]; a2 = M[i + W + 1]; }
      else if (d === 2) { a1 = M[i - W]; a2 = M[i + W]; }
      else { a1 = M[i - W + 1]; a2 = M[i + W - 1]; }
      if (m >= a1 && m >= a2) out[i] = 1;
    }
    return out;
  }
  function despeckle(m, W, H) {  // drop lonely dots (no neighbours) from edge maps
    var out = new Uint8Array(m), x, y, i;
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
      i = y * W + x; if (!m[i]) continue;
      if (!(m[i - 1] || m[i + 1] || m[i - W] || m[i + W] || m[i - W - 1] || m[i - W + 1] || m[i + W - 1] || m[i + W + 1])) out[i] = 0;
    }
    return out;
  }

  /* The picture drawn upright (turned + mirrored) on white, at most maxSide px. */
  WT.base = function (img, s, maxSide) {
    s = WT.settings(s);
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, rot = ((s.rotate % 360) + 360) % 360, swap = rot === 90 || rot === 270;
    var ow = swap ? ih : iw, oh = swap ? iw : ih, k = Math.min(1, (maxSide || 2048) / Math.max(ow, oh));
    var cv = canvas(ow * k, oh * k), g = cv.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height);
    g.save(); g.translate(cv.width / 2, cv.height / 2);
    if (s.mirror) g.scale(-1, 1);
    g.rotate(rot * Math.PI / 180);
    g.drawImage(img, -iw * k / 2, -ih * k / 2, iw * k, ih * k);
    g.restore();
    return cv;
  };

  WT.process = function (img, s, maxSide) {
    s = WT.settings(s);
    var cv = WT.base(img, s, maxSide), W = cv.width, H = cv.height, n = W * H;
    var g = cv.getContext('2d', { willReadFrequently: true }), id = g.getImageData(0, 0, W, H), d = id.data, i;
    var cf = Math.pow((s.contrast + 100) / 100, 2), br = s.brightness * 1.28;
    function adj(v) { v = (v - 128) * cf + 128 + br; return v < 0 ? 0 : v > 255 ? 255 : v; }
    if (s.look === 'photo') {
      for (i = 0; i < n * 4; i += 4) {
        var r = adj(d[i]), gg = adj(d[i + 1]), b = adj(d[i + 2]);
        if (s.invert) { r = 255 - r; gg = 255 - gg; b = 255 - b; }
        d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
      }
      g.putImageData(id, 0, 0);
      return cv;
    }
    var L = new Float32Array(n);
    for (i = 0; i < n; i++) {
      var l = adj(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
      L[i] = s.invert ? 255 - l : l;
    }
    var unit = Math.max(1, Math.max(W, H) / 1024), line = new Uint8Array(n), fillA = null, x, y;
    var thrDark = 40 + s.detail * 1.8;
    if (s.look === 'lines') {
      for (i = 0; i < n; i++) line[i] = L[i] < thrDark ? 1 : 0;
    } else if (s.look === 'outline') {
      var bl = boxBlur(L, W, H, Math.round(unit * (1 + (100 - s.detail) / 34)));
      line = despeckle(edges(bl, W, H, 26 + (100 - s.detail) * 2.6), W, H);
    } else if (s.look === 'zones') {
      var lv = Math.max(2, Math.min(8, s.levels | 0)), bz = boxBlur(L, W, H, Math.round(unit * (2 + (100 - s.detail) / 22))), q = new Uint8Array(n);
      for (i = 0; i < n; i++) q[i] = Math.min(lv - 1, Math.floor(bz[i] * lv / 256));
      fillA = new Uint8Array(n);
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        i = y * W + x;
        if ((x < W - 1 && q[i] !== q[i + 1]) || (y < H - 1 && q[i] !== q[i + W])) line[i] = 1;
        fillA[i] = Math.round((lv - 1 - q[i]) / (lv - 1) * 70);
      }
    } else { // stencil / silhouette
      var bs = boxBlur(L, W, H, Math.round(unit)), m = new Uint8Array(n);
      for (i = 0; i < n; i++) m[i] = bs[i] < thrDark ? 1 : 0;
      fillA = new Uint8Array(n);
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        i = y * W + x;
        if (!m[i]) continue;
        fillA[i] = 95;
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || !m[i - 1] || !m[i + 1] || !m[i - W] || !m[i + W]) line[i] = 1;
      }
    }
    var r2 = Math.round((s.thickness - 1) * 0.8 * unit);
    if (s.look !== 'lines') r2 = Math.round((s.thickness - 1) * 0.9 * unit);
    line = dilate(line, W, H, r2);
    var halo = null;
    if (s.halo) {
      var hd = dilate(line, W, H, Math.max(1, Math.round(1.6 * unit)));
      halo = hd;
    }
    var col = WT.rgb(s.color), hc = WT.isDark(s.color) ? [255, 255, 255] : [0, 0, 0];
    for (i = 0; i < n; i++) {
      var o = i * 4;
      if (line[i]) { d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255; }
      else if (halo && halo[i]) { d[o] = hc[0]; d[o + 1] = hc[1]; d[o + 2] = hc[2]; d[o + 3] = 150; }
      else if (fillA && fillA[i]) { d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = fillA[i]; }
      else d[o + 3] = 0;
    }
    g.putImageData(id, 0, 0);
    return cv;
  };

  /* ------------------------------------------------------------------ overlay: grid, names, done cells, crosses */
  WT.gridColor = function (s) { return /^#(ffe14d|ff5d3a|ff4fd8)$/.test(s.color) ? '#00e5ff' : '#ffb347'; };
  /* Draw on g inside the rectangle (X, Y, W, H) where the picture sits. opts: {grid, labels, marks, done, spot, onlyMarks} */
  WT.drawOverlay = function (g, X, Y, W, H, p, opts) {
    var s = WT.settings(p.settings), gr = WT.grid(p), cw = W / gr.cols, ch = H / gr.rows, lw = Math.max(1.2, Math.min(W, H) / 520), c, r;
    var gc = WT.gridColor(s);
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (opts.grid && !opts.onlyMarks) {
      (opts.done || []).forEach(function (k) {
        var a = k.split(','), cc = +a[0], rr = +a[1];
        if (cc >= gr.cols || rr >= gr.rows) return;
        g.fillStyle = 'rgba(80, 220, 130, .22)';
        g.fillRect(X + cc * cw, Y + rr * ch, cw, ch);
        var m = Math.min(cw, ch) * 0.14, cx = X + (cc + 0.5) * cw, cy = Y + (rr + 0.5) * ch;
        g.strokeStyle = 'rgba(70, 230, 130, .9)'; g.lineWidth = lw * 3;
        g.beginPath(); g.moveTo(cx - m, cy); g.lineTo(cx - m * 0.25, cy + m * 0.7); g.lineTo(cx + m, cy - m * 0.8); g.stroke();
      });
      g.strokeStyle = gc; g.globalAlpha = 0.85; g.lineWidth = lw;
      g.setLineDash([lw * 6, lw * 4]);
      g.beginPath();
      for (c = 1; c < gr.cols; c++) { g.moveTo(X + c * cw, Y); g.lineTo(X + c * cw, Y + H); }
      for (r = 1; r < gr.rows; r++) { g.moveTo(X, Y + r * ch); g.lineTo(X + W, Y + r * ch); }
      g.stroke(); g.setLineDash([]);
      g.strokeRect(X, Y, W, H);
      g.globalAlpha = 1;
      if (opts.labels) {
        var fs = Math.max(10, Math.min(cw, ch) * 0.13);
        g.font = '700 ' + fs + 'px Inter, Arial, sans-serif'; g.textBaseline = 'top';
        for (c = 0; c < gr.cols; c++) for (r = 0; r < gr.rows; r++) {
          var t = WT.cellName(c, r);
          g.lineWidth = fs * 0.22; g.strokeStyle = 'rgba(0,0,0,.55)'; g.strokeText(t, X + c * cw + fs * 0.35, Y + r * ch + fs * 0.3);
          g.fillStyle = gc; g.fillText(t, X + c * cw + fs * 0.35, Y + r * ch + fs * 0.3);
        }
      }
    }
    if (opts.spot && !opts.onlyMarks) {
      var sp = opts.spot;
      g.strokeStyle = '#ffffff'; g.lineWidth = lw * 3.2;
      g.strokeRect(X + sp[0] * cw, Y + sp[1] * ch, cw, ch);
      g.strokeStyle = s.color; g.lineWidth = lw * 1.6;
      g.strokeRect(X + sp[0] * cw, Y + sp[1] * ch, cw, ch);
    }
    if (opts.marks) {
      var R = Math.max(8, Math.min(W, H) * 0.035);
      [[X, Y], [X + W, Y], [X, Y + H], [X + W, Y + H], [X + W / 2, Y + H / 2]].forEach(function (pt) {
        g.lineWidth = lw * 3.4; g.strokeStyle = 'rgba(0,0,0,.6)';
        cross(g, pt[0], pt[1], R);
        g.lineWidth = lw * 1.5; g.strokeStyle = '#ff5d3a';
        cross(g, pt[0], pt[1], R);
      });
    }
    g.restore();
  };
  function cross(g, x, y, R) {
    g.beginPath(); g.moveTo(x - R, y); g.lineTo(x + R, y); g.moveTo(x, y - R); g.lineTo(x, y + R); g.stroke();
    g.beginPath(); g.arc(x, y, R * 0.45, 0, Math.PI * 2); g.stroke();
  }

  /* ------------------------------------------------------------------ lettering: text -> picture */
  WT.FONTS = [['Pacifico', 'Script', 400], ['Bebas Neue', 'Tall block', 400], ['Playfair Display', 'Elegant serif', 700], ['Permanent Marker', 'Marker', 400],
    ['Caveat', 'Handwriting', 700], ['Abril Fatface', 'Poster', 400], ['Fraunces', 'Soft serif', 700], ['Rubik Mono One', 'Chunky', 400]];
  var fontsP = null;
  WT.loadFonts = function () {
    if (fontsP) return fontsP;
    var fam = WT.FONTS.map(function (f) { return 'family=' + f[0].replace(/ /g, '+') + (f[2] !== 400 ? ':wght@' + f[2] : ''); }).join('&');
    var link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = 'https://fonts.googleapis.com/css2?' + fam + '&display=swap';
    document.head.appendChild(link);
    fontsP = new Promise(function (resolve) {
      link.onload = function () {
        Promise.all(WT.FONTS.map(function (f) { return document.fonts.load(f[2] + ' 60px "' + f[0] + '"').catch(function () {}); })).then(resolve, resolve);
      };
      link.onerror = resolve;
      setTimeout(resolve, 4000);
    });
    return fontsP;
  };
  /* {text, font, outline} -> canvas (black on white). Several lines allowed. */
  WT.lettering = function (o) {
    var f = WT.FONTS.filter(function (x) { return x[0] === o.font; })[0] || WT.FONTS[0];
    var lines = String(o.text || '').split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean).slice(0, 6);
    if (!lines.length) lines = ['Hello'];
    var size = 220, pad = 70, lh = size * 1.18, probe = canvas(10, 10).getContext('2d');
    probe.font = f[2] + ' ' + size + 'px "' + f[0] + '"';
    var w = Math.max.apply(null, lines.map(function (l) { return probe.measureText(l).width; }));
    var c = canvas(Math.min(4000, w + pad * 2), lines.length * lh + pad * 2), g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    g.font = probe.font; g.textAlign = 'center'; g.textBaseline = 'middle';
    var k = Math.min(1, (c.width - pad * 2) / w);
    g.save(); g.translate(c.width / 2, pad); g.scale(k, 1);
    lines.forEach(function (l, i) {
      var y = lh * (i + 0.5);
      if (o.outline) { g.lineWidth = 7; g.strokeStyle = '#111'; g.lineJoin = 'round'; g.strokeText(l, 0, y); }
      else { g.fillStyle = '#111'; g.fillText(l, 0, y); }
    });
    g.restore();
    return c;
  };
  WT.letteringModal = function () {
    var state = { text: 'Home sweet home', font: 'Pacifico', outline: true };
    var settle = null, settled = new Promise(function (r) { settle = r; });  // closing the dialog resolves with null (Python waits on it)
    var m = UI.modal('<h2>Lettering maker</h2><p class="muted">Type a word, a name or a quote. It becomes a picture you can trace, at any size.</p>' +
      '<form class="ui-stack" data-lt><label class="ui-field"><span>Your text <em>(new line = Enter)</em></span><textarea name="text" rows="2" maxlength="160" style="min-height:70px">' + UI.esc(state.text) + '</textarea></label>' +
      '<div class="wt-fonts" data-fonts>' + WT.FONTS.map(function (f) {
        return '<button type="button" data-font="' + UI.esc(f[0]) + '" class="' + (f[0] === state.font ? 'on' : '') + '" style="font-family:\'' + f[0] + '\';font-weight:' + f[2] + '">Aa<small>' + UI.esc(f[1]) + '</small></button>';
      }).join('') + '</div>' +
      '<label class="ui-check"><input type="checkbox" name="outline" checked> Outline letters (trace the edges, then paint them in)</label>' +
      '<div class="wt-thumb" style="aspect-ratio:auto;min-height:150px;padding:10px"><canvas data-prev style="max-width:100%;max-height:220px"></canvas></div>' +
      '<div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Cancel</button><button class="ui-btn primary" type="submit">' + UI.icon('plus') + 'Create project</button></div></form>', { wide: true, onclose: function () { settle(null); } });
    var form = m.el.querySelector('[data-lt]'), prev = m.el.querySelector('[data-prev]');
    function draw() {
      var c = WT.lettering(state), k = Math.min(1, 1100 / c.width);
      prev.width = c.width * k; prev.height = c.height * k;
      prev.getContext('2d').drawImage(c, 0, 0, prev.width, prev.height);
    }
    WT.loadFonts().then(draw); draw();
    form.addEventListener('input', function () { var v = UI.formData(form); state.text = v.text; state.outline = v.outline; draw(); });
    form.addEventListener('click', function (e) {
      var b = e.target.closest('[data-font]');
      if (!b) return;
      state.font = b.getAttribute('data-font');
      form.querySelectorAll('[data-font]').forEach(function (x) { x.classList.toggle('on', x === b); });
      draw();
    });
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var c = WT.lettering(state);
        var data = { title: state.text.split('\n')[0].slice(0, 60), image: c.toDataURL('image/png'), w: c.width, h: c.height, thumb: WT.thumb(c, 360),
          source: 'lettering', settings: { look: 'lines', width_cm: Math.max(40, Math.min(240, Math.round(c.width / 12))), color: '#ff4fd8' } };
        UI.busy(form.querySelector('[type=submit]'), WT.store.create(data)).then(function (p) { settle(p); m.close(); });
    });
    return settled;
  };

  /* ------------------------------------------------------------------ storage: account (server) or this device */
  var DBP = null, MEM = {};
  function db() {
    if (DBP) return DBP;
    DBP = new Promise(function (resolve) {
      try {
        var rq = indexedDB.open('walltracer', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('projects', { keyPath: 'id' }); };
        rq.onsuccess = function () { resolve(rq.result); };
        rq.onerror = function () { resolve(null); };
        rq.onblocked = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
    return DBP;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      if (!d) return fn(null);
      return new Promise(function (resolve, reject) {
        var t = d.transaction('projects', mode), out;
        out = fn(t.objectStore('projects'));
        t.oncomplete = function () { resolve(out && 'result' in out ? out.result : out); };
        t.onerror = function () { reject(t.error || new Error('Could not save on this device.')); };
      });
    });
  }
  function dAll() { return tx('readonly', function (st) { return st ? st.getAll() : { result: Object.keys(MEM).map(function (k) { return MEM[k]; }) }; }).then(function (r) { return r || []; }); }
  function dGet(id) { return tx('readonly', function (st) { return st ? st.get(id) : { result: MEM[id] }; }); }
  function dPut(rec) { return tx('readwrite', function (st) { if (st) st.put(rec); else MEM[rec.id] = rec; return { result: rec }; }); }
  function dDel(id) { return tx('readwrite', function (st) { if (st) st.delete(id); else delete MEM[id]; return { result: true }; }); }
  function summary(rec) { var o = {}; Object.keys(rec).forEach(function (k) { if (k !== 'image') o[k] = rec[k]; }); return o; }
  function nowIso() { return new Date().toISOString(); }
  function newRec(data) {
    var t = nowIso();
    return { id: 'd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), title: (data.title || 'Untitled wall').slice(0, 80),
      image: data.image, thumb: data.thumb || null, w: data.w || 1000, h: data.h || 1000, settings: WT.settings(data.settings), done: data.done || [],
      minutes: data.minutes || 0, sessions: data.sessions || 0, status: data.status || 'tracing', notes: data.notes || '', source: data.source || 'upload',
      stencil_id: data.stencil_id || null, created: t, updated: t, last_traced: null, device: true };
  }
  WT.isDevice = function (id) { return String(id || '').indexOf('d_') === 0; };
  function byUpdated(a, b) { return String(b.updated).localeCompare(String(a.updated)); }
  function stats(list) {
    return { count: list.length, minutes: Math.round(list.reduce(function (a, p) { return a + (p.minutes || 0); }, 0)),
      done: list.filter(function (p) { return p.status === 'done'; }).length };
  }
  WT.store = {
    /* {projects, stats, device: [projects kept in this browser]} */
    list: function () {
      return dAll().then(function (dev) {
        dev = dev.map(summary).sort(byUpdated);
        if (!UI.me) return { projects: dev, stats: stats(dev), device: [], local: true };
        return UI.api('list_projects').then(function (r) { return { projects: r.projects, stats: r.stats, device: dev, local: false }; });
      });
    },
    get: function (id) {
      if (WT.isDevice(id)) return dGet(id).then(function (r) { if (!r) throw new Error('That project isn\'t on this device any more.'); return r; });
      if (!UI.me) return Promise.reject(new Error('Sign in to open the projects in your account.'));
      return UI.api('get_project', id).then(function (r) { return r.project; });
    },
    create: function (data) {
      if (UI.me) return UI.api('create_project', data).then(function (r) { return r.project; });
      var make = data.stencil_id ? UI.api('get_stencil', data.stencil_id).then(function (r) {
        var st = r.stencil;
        return newRec({ title: data.title || st.title, image: st.image, thumb: st.thumb, w: st.w, h: st.h, source: 'stencil:' + st.key, stencil_id: st.id,
          settings: data.settings || { look: 'lines', width_cm: st.cm } });
      }) : Promise.resolve(newRec(data));
      return make.then(function (rec) { return dPut(rec).then(function () { return summary(rec); }); });
    },
    update: function (id, patch) {
      if (!WT.isDevice(id)) return UI.apiQuiet('update_project', id, patch).then(function (r) { return r.project; });
      return dGet(id).then(function (rec) {
        if (!rec) throw new Error('That project isn\'t on this device any more.');
        Object.keys(patch).forEach(function (k) { rec[k] = k === 'settings' ? WT.settings(Object.assign({}, rec.settings, patch.settings)) : patch[k]; });
        rec.updated = nowIso();
        return dPut(rec).then(function () { return summary(rec); });
      });
    },
    log: function (id, minutes, done, newSession, settings) {
      if (!WT.isDevice(id)) return UI.apiQuiet('log_session', id, minutes, done || null, !!newSession, settings || null).then(function (r) { return r.project; });
      return dGet(id).then(function (rec) {
        if (!rec) return null;
        rec.minutes = Math.round(((rec.minutes || 0) + (minutes || 0)) * 100) / 100;
        if (newSession) rec.sessions = (rec.sessions || 0) + 1;
        if (done) rec.done = done;
        if (settings) rec.settings = WT.settings(Object.assign({}, rec.settings, settings));
        rec.last_traced = rec.updated = nowIso();
        return dPut(rec).then(function () { return summary(rec); });
      });
    },
    duplicate: function (id) {
      if (!WT.isDevice(id)) return UI.api('duplicate_project', id).then(function (r) { return r.project; });
      return dGet(id).then(function (rec) {
        var c = newRec(Object.assign({}, rec, { title: rec.title + ' (copy)', done: [], minutes: 0, sessions: 0, status: 'tracing' }));
        return dPut(c).then(function () { return summary(c); });
      });
    },
    remove: function (id) {
      try { localStorage.removeItem('walltracer.anchor.' + id); } catch (e) {}
      return WT.isDevice(id) ? dDel(id) : UI.api('delete_project', id);
    },
    /* Move a project kept in this browser into the signed-in account. */
    moveToAccount: function (id) {
      return dGet(id).then(function (rec) {
        if (!rec) return null;
        var data = { title: rec.title, settings: rec.settings, done: rec.done, minutes: rec.minutes, sessions: rec.sessions, status: rec.status, notes: rec.notes };
        if (rec.stencil_id && /^data:image\/svg/.test(rec.image || '')) data.stencil_id = rec.stencil_id;
        else { data.image = rec.image; data.thumb = rec.thumb; data.w = rec.w; data.h = rec.h; data.source = rec.source; }
        return UI.api('create_project', data).then(function (r) { return dDel(id).then(function () { return r.project; }); });
      });
    }
  };

  /* ------------------------------------------------------------------ small things */
  var threeP = null;
  WT.three = function () {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (threeP) return threeP;
    threeP = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = '_/theme/three.min.js'; s.async = true;
      s.onload = function () { window.THREE ? resolve(window.THREE) : reject(new Error('The 3D engine is missing.')); };
      s.onerror = function () { threeP = null; reject(new Error('Could not load the 3D engine. Check your connection.')); };
      document.head.appendChild(s);
    });
    return threeP;
  };
  WT.confetti = function () {
    var box = document.createElement('div'), cols = ['#c4552d', '#2f8f83', '#ffe14d', '#00e5ff', '#ff4fd8', '#7dff6a'];
    box.className = 'wt-confetti';
    for (var i = 0; i < 70; i++) {
      var p = document.createElement('i');
      p.style.left = (Math.random() * 100) + 'vw';
      p.style.background = cols[i % cols.length];
      p.style.animationDelay = (Math.random() * 0.6) + 's';
      p.style.setProperty('--dx', (Math.random() * 200 - 100) + 'px');
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 3400);
  };
  WT.thumbHtml = function (p, cls) {
    var s = WT.settings(p.settings);
    return '<div class="wt-thumb ' + (cls || '') + (WT.isDark(s.wall) ? ' dark' : '') + '" style="--wt-wall:' + UI.esc(s.wall) + '">' +
      (p.thumb ? '<img src="' + UI.esc(p.thumb) + '" alt="" loading="lazy">' : UI.icon('image')) + '</div>';
  };
  /* Pick a picture file, then create a project from it. Resolves with the new project. */
  WT.pickAndCreate = function (file) {
    function go(f) {
      return WT.readPicture(f).then(function (pic) {
        return WT.store.create({ title: pic.title, image: pic.image, w: pic.w, h: pic.h, thumb: pic.thumb, source: 'upload',
          settings: { look: /\.(png|svg|gif)$/i.test(f.name || '') ? 'lines' : 'outline' } });
      });
    }
    if (file) return go(file);
    return new Promise(function (resolve, reject) {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = function () { if (inp.files[0]) go(inp.files[0]).then(resolve, reject); else resolve(null); };
      inp.addEventListener('cancel', function () { resolve(null); });
      inp.click();
    });
  };
  WT.xrSupport = function () {
    if (!navigator.xr || !navigator.xr.isSessionSupported) return Promise.resolve({ ar: false, vr: false });
    return Promise.all([navigator.xr.isSessionSupported('immersive-ar').catch(function () { return false; }),
      navigator.xr.isSessionSupported('immersive-vr').catch(function () { return false; })]).then(function (r) { return { ar: !!r[0], vr: !!r[1] }; });
  };
})();
