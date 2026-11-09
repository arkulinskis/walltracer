/* wt-kit.js: the small window.UI helpers WallTracer's JavaScript engines (wt.js, wt-screens.js) were written against,
   now that the app itself is Python Forms. Loaded after app-kit.js (which has UI.esc, UI.store, UI.icon, UI.ICONS,
   light/dark) and before the engines.

   Server:   UI.api(fn, ...args) / UI.apiQuiet go through window.WT_BRIDGE, a Python function set by client_code/wt.py
             (anvil.server.call there). A reply {ok: false, error} rejects with err.expected = true; errors nobody
             catches become a toast.
   Host:     WT.host = Python functions (client_code/wt.py): toast, confirm, go. UI.toast / UI.confirm use them, so the
             engines show the same notifications and dialogs as the Forms.
   Screens:  UI.page(name, opts, mount) keeps an engine screen in UI.pages; Components/Screen mounts one (edit, trace).
   Also:     UI.me (set by Python on start, sign in and sign out), UI.config.name, UI.go, UI.busy, UI.formData, UI.ago,
             UI.fmtDate, UI.modal (the engines' own small dialogs: the lettering maker), UI.feedback, and [data-go] /
             [data-feedback] clicks inside engine markup. */
(function () {
  'use strict';
  var UI = window.UI = window.UI || {};
  var WT = window.WT = window.WT || {};
  UI.config = UI.config || { key: 'walltracer' };
  UI.config.name = 'WallTracer';
  UI.pages = UI.pages || {};
  UI.me = UI.me || null;
  WT.host = WT.host || {};

  UI.page = function (name, opts, mount) {
    if (typeof opts === 'function') { mount = opts; opts = {}; }
    opts.name = name; opts.mount = mount;
    UI.pages[name] = opts;
  };
  /* Mount an engine screen into el. Returns {ready: Promise, destroy()}; UI_READY turns true once it has loaded. */
  UI.mountScreen = function (name, el, args) {
    var p = UI.pages[name];
    if (!p) throw new Error('No screen called ' + name);
    var out;
    try { out = p.mount(el, { name: name, args: args || [], me: UI.me, go: UI.go, api: UI.api, page: p }); } catch (e) { console.error(e); out = Promise.reject(e); }
    var ready = out && typeof out.then === 'function' ? out : (out && out.ready) || Promise.resolve();
    ready = Promise.resolve(ready).then(function (v) { window.UI_READY = true; return v; }, function (e) {
      console.error(e);
      if (!el.innerHTML) el.innerHTML = '<div class="ui-wrap"><div class="ui-empty">' + UI.icon('info') +
        '<h2>This page didn\'t load</h2><p class="muted">' + UI.esc(e && e.message || 'Something went wrong.') + '</p>' +
        '<a class="ui-btn" href="#studio">Back to the studio</a></div></div>';
      window.UI_READY = true;
    });
    return { ready: ready, destroy: (out && out.destroy) || function () {} };
  };

  UI.initials = function (name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  };
  UI.fmtDate = function (iso, opts) {
    if (!iso) return '';
    var d = iso.length <= 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
    return d.toLocaleDateString(undefined, opts || { day: 'numeric', month: 'short', year: 'numeric' });
  };
  UI.fmtDateTime = function (iso) {
    return iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  };
  UI.ago = function (iso) {
    if (!iso) return '';
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    var steps = [[60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']], n = s / 60;
    for (var i = 0; i < steps.length; i++) {
      if (n < steps[i][0]) { n = Math.floor(n); return UI.plural(n, steps[i][1]) + ' ago'; }
      n = n / steps[i][0];
    }
    return '';
  };
  UI.formData = function (form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value;
    });
    return out;
  };
  UI.busy = function (btn, promise) {
    if (!btn) return promise;
    btn.disabled = true; btn.classList.add('is-busy');
    var done = function () { btn.disabled = false; btn.classList.remove('is-busy'); };
    promise.then(done, done);
    return promise;
  };
  UI.hashFor = function (name) {
    var args = Array.prototype.slice.call(arguments, 1).filter(function (a) { return a != null && a !== ''; });
    return '#' + [name].concat(args.map(encodeURIComponent)).join('/');
  };
  UI.go = function () {
    var h = UI.hashFor.apply(null, arguments);
    if (location.hash === h && WT.host.go) WT.host.go(h); else location.hash = h;
  };
  UI.feedback = function () {
    if (window.Prepsto && window.Prepsto.open) { window.Prepsto.open(); return; }
    window.open('https://prepsto.com/#f/4rxd8g8', '_blank', 'noopener');
  };

  /* ------------------------------------------------------------------ toasts and dialogs */
  UI.toast = function (msg, kind) {
    if (WT.host.toast) { try { WT.host.toast(String(msg), kind || ''); return; } catch (e) { /* fall through */ } }
    var box = document.querySelector('.ui-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'ui ui-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'ui-toast' + (kind ? ' ' + kind : '');
    t.innerHTML = '<span>' + UI.esc(msg) + '</span>';
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 200); }, kind === 'error' ? 6500 : 3200);
  };
  UI.confirm = function (o) {
    o = typeof o === 'string' ? { title: o } : (o || {});
    if (WT.host.confirm) return Promise.resolve(WT.host.confirm(JSON.stringify(o))).then(function (v) { return !!v; });
    return Promise.resolve(window.confirm(o.title || 'Are you sure?'));
  };
  /* A plain dialog for the engines' own prompts (the lettering maker draws its preview live). Python dialogs cover the rest. */
  UI.modal = function (html, opts) {
    opts = opts || {};
    var prev = document.activeElement, wrap = document.createElement('div');
    wrap.className = 'ui ui-modal-wrap';
    wrap.innerHTML = '<div class="ui-modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" tabindex="-1">' +
      '<button type="button" class="ui-btn ghost icon ui-modal-x" data-close aria-label="Close">' + UI.icon('x') + '</button>' + html + '</div>';
    document.body.appendChild(wrap);
    document.documentElement.classList.add('ui-modal-open');
    function key(e) { if (e.key === 'Escape') close(); }
    function close() {
      if (!wrap.parentNode) return;
      wrap.remove(); document.removeEventListener('keydown', key);
      if (!document.querySelector('.ui-modal-wrap')) document.documentElement.classList.remove('ui-modal-open');
      if (opts.onclose) opts.onclose();
      if (prev && prev.focus) prev.focus();
    }
    document.addEventListener('keydown', key);
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
    wrap.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
    var first = wrap.querySelector('input, textarea, select') || wrap.querySelector('.ui-modal');
    setTimeout(function () { if (first.focus) first.focus(); }, 30);
    return { el: wrap.querySelector('.ui-modal'), close: close };
  };

  /* ------------------------------------------------------------------ the server, through Python */
  function send(kind, payload) {
    if (!window.WT_BRIDGE) return Promise.reject(new Error('The app is still starting.'));
    var out;
    try { out = window.WT_BRIDGE(kind, JSON.stringify(payload || {})); } catch (e) { return Promise.reject(e); }
    return Promise.resolve(out).then(function (r) {
      r = typeof r === 'string' ? JSON.parse(r) : (r || {});
      if (r.error) {
        var err = new Error(r.error); err.uiApi = true; err.denied = !!r.denied;
        if (r.detail) console.error(kind, payload && payload.fn, r.detail);
        if (r.reload) setTimeout(function () { location.reload(); }, 2500);
        throw err;
      }
      return r.result;
    });
  }
  function expected(res) {
    if (res && typeof res === 'object' && res.ok === false) {
      var err = new Error(res.error || 'That didn\'t work.'); err.uiApi = true; err.expected = true; err.result = res;
      throw err;
    }
    return res;
  }
  UI.api = function (fn) { return send('call', { fn: fn, args: Array.prototype.slice.call(arguments, 1), quiet: false }).then(expected); };
  UI.apiQuiet = function (fn) { return send('call', { fn: fn, args: Array.prototype.slice.call(arguments, 1), quiet: true }).then(expected); };
  window.addEventListener('unhandledrejection', function (e) {
    if (e.reason && e.reason.uiApi) { e.preventDefault(); UI.toast(e.reason.message, 'error'); }
  });

  /* Promise helpers for Python: a JS promise handed to Python is awaited there, and a rejection raises. These wrap
     an engine promise so Python gets {ok, value} / {ok: false, error} as JSON text instead (no exception juggling). */
  WT.settle = function (promise) {
    return Promise.resolve(promise).then(function (v) { return JSON.stringify({ ok: true, value: v === undefined ? null : v }); },
      function (e) { return JSON.stringify({ ok: false, error: (e && e.message) || String(e || 'Something went wrong.'), expected: !!(e && (e.expected || e.uiApi)) }); });
  };

  /* A photo of a finished wall for the Showcase (Dialogs/SharePost): shrunk to 1800 px, sent as JPEG, plus a 520 px
     thumbnail. Resolves {image, thumb, title}. (Was inline in the old showcase page.) */
  WT.sharePhoto = function (file) {
    return WT.readPicture(file, 1800).then(function (pic) {
      if (pic.image.indexOf('data:image/png') !== 0) return pic;
      return WT.loadImage(pic.image).then(function (im) {
        var c = WT.canvas(im.width, im.height); c.getContext('2d').drawImage(im, 0, 0);
        pic.image = c.toDataURL('image/jpeg', 0.88); return pic;
      });
    }).then(function (pic) {
      return WT.loadImage(pic.image).then(function (im) { return { image: pic.image, thumb: WT.thumb(im, 520), title: pic.title }; });
    });
  };
  /* The stencil picture an admin uploads (Dialogs/StencilForm): WT.readPicture as is. */
  WT.firstFile = function (input) { return input && input.files && input.files[0] || null; };

  /* [data-go="page/arg"] and [data-feedback] inside engine markup (the editors' back buttons, the guide's "Ask us") */
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-go],[data-feedback]');
    if (!el) return;
    e.preventDefault();
    if (el.hasAttribute('data-feedback')) UI.feedback();
    else UI.go.apply(null, el.getAttribute('data-go').split('/'));
  });
})();
