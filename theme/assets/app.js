/* core.js: the shared front-end engine (window.UI). Same in every app made from APP_MAKER/template;
   app-specific things live in web/app.js (brand, nav, footer) and web/pages/*.html (the pages).

   Pages:   UI.page(name, {title, nav, icon, auth, order, chrome}, mount)
              auth: null (anyone) | 'guest' (signed-out only) | 'user' | 'admin'
              nav: label for the header / phone tab bar (omit to keep it out of the menus)
              mount(view, ctx) draws into `view`; ctx = {args, me, go, api}. Return a Promise (the page
              is "ready" when it resolves) or {ready, destroy}. URLs are #name/arg1/arg2.
   Server:  UI.api(fn, ...args) -> Promise of the server function's return value. A reply of
              {ok: false, error} rejects with that message (shown as a toast unless you .catch it).
            UI.apiQuiet(fn, ...args) is the same without Anvil's loading spinner.
   Auth:    UI.auth('login'|'signup'|'reset'|'logout', {...}) -> Promise of {ok, me, message}
   Helpers: UI.esc, UI.icon, UI.toast, UI.modal, UI.confirm, UI.busy, UI.formData, UI.fmtDate, UI.ago,
            UI.store, UI.setTheme, UI.feedback, UI.go, UI.refresh
   Tests:   window.UI_READY is true when the current page has finished loading. */
(function () {
  'use strict';
  if (window.UI && window.UI.__v) return;
  var UI = window.UI = { __v: 1, pages: {}, me: null, config: { name: 'App', key: 'app', home: 'home', landing: 'landing' } };
  window.UI_READY = false;

  UI.configure = function (cfg) { Object.keys(cfg).forEach(function (k) { UI.config[k] = cfg[k]; }); };

  /* ------------------------------------------------------------------ small helpers */
  UI.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  UI.plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); };
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
  UI.store = {
    get: function (k, dflt) { try { var v = localStorage.getItem(UI.config.key + '.' + k); return v == null ? dflt : JSON.parse(v); } catch (e) { return dflt; } },
    set: function (k, v) { try { localStorage.setItem(UI.config.key + '.' + k, JSON.stringify(v)); } catch (e) {} }
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
  /* Disable a button while a Promise runs; returns the Promise. */
  UI.busy = function (btn, promise) {
    if (!btn) return promise;
    btn.disabled = true; btn.classList.add('is-busy');
    var done = function () { btn.disabled = false; btn.classList.remove('is-busy'); };
    promise.then(done, done);
    return promise;
  };

  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.7c2.2.6 3.5 2.4 3.5 5.3"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    bug: '<rect x="7" y="8" width="10" height="12" rx="5"/><path d="M12 8V5M9 5.5 7.5 4M15 5.5 16.5 4M7 13H3M21 13h-4M7.5 18l-3 2M16.5 18l3 2M7.5 9.5l-3-2M16.5 9.5l3-2"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13"/><path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'
  };
  UI.ICONS = ICONS;
  UI.icon = function (name, cls) {
    return '<svg class="ui-ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.sparkle) + '</svg>';
  };

  /* ------------------------------------------------------------------ toasts, modals */
  UI.toast = function (msg, kind) {
    var box = document.querySelector('.ui-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'ui ui-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'ui-toast' + (kind ? ' ' + kind : '');
    t.innerHTML = (kind === 'error' ? UI.icon('info') : kind === 'ok' ? UI.icon('check') : '') + '<span>' + UI.esc(msg) + '</span>';
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }, kind === 'error' ? 6500 : 3200);
  };
  UI.modal = function (html, opts) {
    opts = opts || {};
    var prev = document.activeElement;
    var wrap = document.createElement('div');
    wrap.className = 'ui ui-modal-wrap';
    wrap.innerHTML = '<div class="ui-modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
      '<button class="ui-btn ghost icon ui-modal-x" data-close aria-label="Close">' + UI.icon('x') + '</button>' + html + '</div>';
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
    var first = wrap.querySelector('input, textarea, select');
    setTimeout(function () { (first || wrap.querySelector('.ui-modal')).focus && (first || wrap.querySelector('.ui-modal')).focus(); }, 30);
    return { el: wrap.querySelector('.ui-modal'), close: close };
  };
  UI.confirm = function (o) {
    o = typeof o === 'string' ? { title: o } : (o || {});
    return new Promise(function (resolve) {
      var answered = false;
      var m = UI.modal('<h2>' + UI.esc(o.title || 'Are you sure?') + '</h2>' + (o.text ? '<p class="muted">' + UI.esc(o.text) + '</p>' : '') +
        '<div class="ui-row end" style="margin-top:20px"><button class="ui-btn ghost" data-close>' + UI.esc(o.cancel || 'Cancel') + '</button>' +
        '<button class="ui-btn ' + (o.danger ? 'danger solid' : 'primary') + '" data-ok>' + UI.esc(o.ok || 'OK') + '</button></div>',
      { onclose: function () { if (!answered) resolve(false); } });
      m.el.querySelector('[data-ok]').onclick = function () { answered = true; m.close(); resolve(true); };
    });
  };

  /* ------------------------------------------------------------------ theme */
  UI.theme = function () { return UI.store.get('theme', 'auto'); };
  UI.applyTheme = function (t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    var dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('ui-dark', !!dark);
  };
  UI.setTheme = function (t) { UI.store.set('theme', t); UI.applyTheme(t); };
  UI.applyTheme(UI.theme());
  if (window.matchMedia) {
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { UI.applyTheme(UI.theme()); }); } catch (e) {}
  }

  /* ------------------------------------------------------------------ server bridge */
  var bridge = null;
  function send(kind, payload) {
    if (!bridge) return Promise.reject(new Error('The app is still starting.'));
    var out;
    try { out = bridge(kind, JSON.stringify(payload || {})); } catch (e) { return Promise.reject(e); }
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
  function apiCall(quiet, fn, args) {
    return send('call', { fn: fn, args: args, quiet: quiet }).then(function (res) {
      if (res && typeof res === 'object' && res.ok === false) {
        var err = new Error(res.error || 'That didn\'t work.'); err.uiApi = true; err.expected = true; err.result = res;
        throw err;
      }
      return res;
    });
  }
  UI.api = function (fn) { return apiCall(false, fn, Array.prototype.slice.call(arguments, 1)); };
  UI.apiQuiet = function (fn) { return apiCall(true, fn, Array.prototype.slice.call(arguments, 1)); };
  /* Errors nobody caught become a toast, so a failed action is never silent. */
  window.addEventListener('unhandledrejection', function (e) {
    if (e.reason && e.reason.uiApi) { e.preventDefault(); UI.toast(e.reason.message, 'error'); }
  });

  /* Sign in / up / out. On success it navigates: to where the visitor was heading (UI.after) or home
     after signing in, to the landing page after signing out. */
  UI.auth = function (kind, payload) {
    return send(kind, payload || {}).then(function (r) {
      if (r && r.ok === false) { var err = new Error(r.error); err.uiApi = true; err.expected = true; throw err; }
      if (r && 'me' in r && (r.me || kind === 'logout')) {
        UI.me = r.me || null;
        var target = r.me ? (UI.after || '#' + UI.config.home) : '#' + UI.config.landing;
        UI.after = null;
        if (location.hash === target) route(); else location.hash = target;
      }
      return r;
    });
  };
  /* Update the signed-in user's details (e.g. a new name) and redraw the header, without reloading the page. */
  UI.setMe = function (me) {
    UI.me = me || null;
    if (shellRoot) renderChrome(current.name);
  };

  /* ------------------------------------------------------------------ pages and routing */
  UI.page = function (name, opts, mount) {
    if (typeof opts === 'function') { mount = opts; opts = {}; }
    opts.name = name; opts.mount = mount;
    UI.pages[name] = opts;
  };
  UI.allowed = function (p) {
    if (!p) return false;
    if (p.auth === 'user') return !!UI.me;
    if (p.auth === 'admin') return !!(UI.me && UI.me.is_admin);
    if (p.auth === 'guest') return !UI.me;
    return true;
  };
  UI.navPages = function () {
    return Object.keys(UI.pages).map(function (k) { return UI.pages[k]; })
      .filter(function (p) { return p.nav && UI.allowed(p) && (!p.when || p.when()); })
      .sort(function (a, b) { return (a.order || 50) - (b.order || 50); });
  };
  UI.parseHash = function () {
    var h = (location.hash || '').replace(/^#!?\/?/, '');
    var parts = h.split('?')[0].split('/').filter(function (x) { return x !== ''; }).map(decodeURIComponent);
    return { name: parts[0] || '', args: parts.slice(1) };
  };
  UI.hashFor = function (name) {
    var args = Array.prototype.slice.call(arguments, 1).filter(function (a) { return a != null && a !== ''; });
    return '#' + [name].concat(args.map(encodeURIComponent)).join('/');
  };
  UI.go = function (name) {
    var h = UI.hashFor.apply(null, arguments);
    if (location.hash === h) route(); else location.hash = h;
  };
  UI.refresh = function () { route(); };
  UI.after = null;  // where to go after signing in

  var shellRoot = null, view = null, current = { name: null, destroy: null }, routeSeq = 0;

  function defaultPage() { return UI.me ? UI.config.home : UI.config.landing; }

  function route() {
    var r = UI.parseHash(), name = r.name || defaultPage(), p = UI.pages[name];
    if (!p) { name = defaultPage(); p = UI.pages[name]; r.args = []; }
    if (p.auth === 'guest' && UI.me) { p = UI.pages[UI.config.home]; name = UI.config.home; r.args = []; }
    if ((p.auth === 'user' || p.auth === 'admin') && !UI.me) {
      UI.after = location.hash && location.hash !== '#' ? location.hash : null;
      p = UI.pages.auth; name = 'auth'; r.args = [];
    }
    if (p.auth === 'admin' && !(UI.me && UI.me.is_admin)) {
      UI.toast('That page is for admins only.', 'error');
      p = UI.pages[UI.config.home]; name = UI.config.home; r.args = [];
    }
    var seq = ++routeSeq;
    window.UI_READY = false;
    if (current.destroy) { try { current.destroy(); } catch (e) { console.error(e); } }
    current = { name: name, args: r.args, destroy: null };
    if (shellRoot) {
      shellRoot.className = 'ui ui-shell page-' + name + (UI.me ? ' signed-in' : ' signed-out') + (p.chrome === false ? ' no-chrome' : '');
      renderChrome(name);
    }
    // A fresh element for every page, so listeners a page adds to `view` never pile up.
    var fresh = view.cloneNode(false);
    view.parentNode.replaceChild(fresh, view);
    view = fresh;
    window.scrollTo(0, 0);
    document.title = (p.title ? (typeof p.title === 'function' ? p.title(r.args) : p.title) + ' · ' : '') + UI.config.name;
    var ctx = { name: name, args: r.args, me: UI.me, go: UI.go, api: UI.api, page: p };
    var out;
    try { out = p.mount(view, ctx); } catch (e) { console.error(e); out = Promise.reject(e); }
    var ready = out && typeof out.then === 'function' ? out : (out && out.ready) || Promise.resolve();
    if (out && out.destroy) current.destroy = out.destroy;
    Promise.resolve(ready).then(function () { if (seq === routeSeq) window.UI_READY = true; },
      function (e) {
        if (seq !== routeSeq) return;
        console.error(e);
        if (!view.innerHTML) view.innerHTML = '<div class="ui-wrap"><div class="ui-empty">' + UI.icon('info') +
          '<h3>This page didn\'t load</h3><p class="muted">' + UI.esc(e && e.message || 'Something went wrong.') + '</p>' +
          '<button class="ui-btn" onclick="UI.refresh()">Try again</button></div></div>';
        window.UI_READY = true;
      });
  }
  UI.current = function () { return current; };

  /* The shell's parts come from web/app.js: UI.shell = {header(me, active), footer(me), tabbar(me, active)} */
  function renderChrome(active) {
    var S = UI.shell || {};
    var hd = shellRoot.querySelector('[data-ui-header]'), ft = shellRoot.querySelector('[data-ui-footer]'), tb = shellRoot.querySelector('[data-ui-tabbar]');
    if (hd) hd.innerHTML = S.header ? S.header(UI.me, active) : '';
    if (ft) ft.innerHTML = S.footer ? S.footer(UI.me, active) : '';
    if (tb) tb.innerHTML = S.tabbar ? S.tabbar(UI.me, active) : '';
  }
  UI.renderChrome = function () { if (shellRoot) renderChrome(current.name); };

  /* Called by client_code/Main.py (and by the local harness) once the page is up. */
  UI.start = function (node, bridgeFn, bootJson) {
    bridge = bridgeFn;
    var boot = typeof bootJson === 'string' ? JSON.parse(bootJson || '{}') : (bootJson || {});
    UI.me = boot.me || null;
    var host = node && node.matches && node.matches('[data-ui-app]') ? node : (node && node.querySelector('[data-ui-app]')) || node || document.body;
    host.innerHTML = '<div class="ui ui-shell">' +
      '<header class="ui-header" data-ui-header></header>' +
      '<main class="ui-main" data-ui-view></main>' +
      '<footer class="ui-footer" data-ui-footer></footer>' +
      '<nav class="ui-tabbar" data-ui-tabbar aria-label="Main"></nav></div>';
    shellRoot = host.firstChild;
    view = host.querySelector('[data-ui-view]');
    if (UI.shell && UI.shell.wire) UI.shell.wire(shellRoot);
    window.addEventListener('hashchange', route);
    route();
  };

  /* ------------------------------------------------------------------ feedback form (footer + menu) */
  UI.feedback = function (kind) {
    var kinds = [['bug', 'Something\'s broken', 'bug'], ['idea', 'An idea', 'bulb'], ['question', 'A question', 'info'], ['other', 'Something else', 'chat']];
    var m = UI.modal('<h2>Send feedback</h2><p class="muted">Found a bug or have an idea? It goes straight to the people who make ' + UI.esc(UI.config.name) + '.</p>' +
      '<form class="ui-stack" data-fb>' +
      '<div class="ui-choices">' + kinds.map(function (k) {
        return '<label class="ui-choice"><input type="radio" name="kind" value="' + k[0] + '"' + ((kind || 'bug') === k[0] ? ' checked' : '') + '>' +
          '<span>' + UI.icon(k[2]) + UI.esc(k[1]) + '</span></label>';
      }).join('') + '</div>' +
      '<label class="ui-field"><span>What happened, or what would you like?</span><textarea name="message" rows="5" required minlength="5" placeholder="The more detail, the better."></textarea></label>' +
      (UI.me ? '' : '<label class="ui-field"><span>Your email <em>(optional, if you\'d like a reply)</em></span><input type="email" name="email" autocomplete="email"></label>') +
      '<p class="ui-hint">We also send the page you were on, your screen size and browser, to help us fix bugs.</p>' +
      '<div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Cancel</button><button class="ui-btn primary" type="submit">' + UI.icon('arrow') + 'Send</button></div></form>');
    var form = m.el.querySelector('[data-fb]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formData(form);
      var ctx = { page: location.hash || '#', screen: innerWidth + 'x' + innerHeight, browser: navigator.userAgent.slice(0, 280), theme: UI.theme() };
      UI.busy(form.querySelector('[type=submit]'), UI.api('submit_feedback', v.kind, v.message, v.email || null, ctx)).then(function () {
        m.close(); UI.toast('Thank you! Your message was sent.', 'ok');
      });
    });
    return m;
  };

  /* Shared clicks: [data-go="page/arg"], [data-feedback], [data-theme-set] anywhere in the app. */
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-go],[data-feedback],[data-theme-set]');
    if (!el) return;
    if (el.hasAttribute('data-go')) { e.preventDefault(); UI.go.apply(null, el.getAttribute('data-go').split('/')); }
    else if (el.hasAttribute('data-feedback')) { e.preventDefault(); UI.feedback(el.getAttribute('data-feedback') || null); }
    else if (el.hasAttribute('data-theme-set')) { e.preventDefault(); UI.setTheme(el.getAttribute('data-theme-set')); if (UI.shell && UI.shell.onTheme) UI.shell.onTheme(); }
  });
})();


/* app.js: this app's identity and frame: name, header, footer, phone tab bar.
   Pages live in web/pages/*.html. The engine (window.UI) is web/core.js. */
(function () {
  'use strict';
  UI.configure({
    name: 'WallTracer',
    key: 'walltracer',          // prefix for this app's browser storage
    tagline: 'Your wall is the canvas. Your headset is the projector.',   // footer line
    home: 'studio',              // first page after signing in
    landing: 'landing'           // first page for visitors who aren't signed in
  });

  var esc = UI.esc;

  function brand() {
    return '<a class="ui-brand" href="#" data-go="' + (UI.me ? UI.config.home : UI.config.landing) + '" aria-label="' + esc(UI.config.name) + ' home">' +
      '<img src="_/theme/icon.svg" alt="" width="32" height="32"><span>' + esc(UI.config.name) + '</span></a>';
  }

  function themeSwitch() {
    var t = UI.theme();
    return '<div class="ui-seg" role="group" aria-label="Appearance">' + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
      return '<button type="button" data-theme-set="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }

  function userMenu(me) {
    return '<div class="ui-menu" data-menu hidden>' +
      '<div class="ui-menu-head"><strong>' + esc(me.name) + '</strong><span class="muted small">' + esc(me.email) + '</span></div>' +
      '<a href="#profile" data-go="profile">' + UI.icon('user') + 'Your profile</a>' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<div class="ui-menu-block"><span class="small muted">Appearance</span>' + themeSwitch() + '</div>' +
      '<button type="button" data-feedback>' + UI.icon('chat') + 'Send feedback</button>' +
      '<button type="button" data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms</button>' +
      '<button type="button" data-signout>' + UI.icon('logout') + 'Sign out</button></div>';
  }

  UI.shell = {
    header: function (me, active) {
      var nav = UI.navPages();
      return '<div class="ui-header-in">' + brand() +
        (nav.length ? '<nav class="ui-nav" aria-label="Main">' + nav.map(function (p) {
          return '<a href="#' + p.name + '" class="' + (p.name === active ? 'on' : '') + '">' + UI.icon(p.icon) + '<span>' + esc(p.nav) + '</span></a>';
        }).join('') + '</nav>' : '') +
        '<div class="ui-header-right">' +
        (me ? '<button type="button" class="ui-avatar-btn" data-menu-toggle aria-label="Your account" aria-haspopup="true">' + esc(UI.initials(me.name)) + '</button>' + userMenu(me)
          : (active === 'auth' ? '' : '<a class="ui-btn ghost" href="#auth" data-go="auth">Sign in</a><a class="ui-btn primary" href="#auth/signup" data-go="auth/signup">Sign up free</a>')) +
        '</div></div>';
    },
    footer: function (me) {
      return '<div class="ui-footer-in"><div class="ui-footer-brand">' + brand() + '<p class="muted small">' + esc(UI.config.tagline) + '</p></div>' +
        '<div class="ui-footer-links">' +
        '<a href="#landing" data-go="landing">About</a>' +
        '<a href="#studio" data-go="studio">Studio</a>' +
        '<a href="#library" data-go="library">Stencil library</a>' +
        '<a href="#showcase" data-go="showcase">Showcase</a>' +
        '<a href="#guide" data-go="guide">Guide</a>' +
        '<a href="https://prepsto.com/#f/4rxd8g8" target="_blank" rel="noopener" data-prepsto-open>Suggest an idea</a>' +
        '<button type="button" data-feedback>Send feedback</button>' +
        '<button type="button" data-lk-open="overview">Privacy &amp; Terms</button>' +
        '</div><p class="ui-footer-legal small muted">© ' + new Date().getFullYear() + ' ' + esc(UI.config.name) + '</p></div>';
    },
    tabbar: function (me, active) {
      var nav = UI.navPages();
      if (!me || nav.length < 2) return '';
      return nav.slice(0, 4).map(function (p) {
        return '<a href="#' + p.name + '" class="' + (p.name === active ? 'on' : '') + '">' + UI.icon(p.icon) + '<span>' + esc(p.nav) + '</span></a>';
      }).join('') + '<a href="#profile" class="' + (active === 'profile' ? 'on' : '') + '">' + UI.icon('user') + '<span>You</span></a>';
    },
    wire: function (root) {
      root.addEventListener('click', function (e) {
        var t = e.target.closest('[data-menu-toggle]');
        var menu = root.querySelector('[data-menu]');
        if (t && menu) { menu.hidden = !menu.hidden; t.setAttribute('aria-expanded', String(!menu.hidden)); return; }
        if (e.target.closest('[data-signout]')) { UI.auth('logout').then(function () { UI.toast('Signed out. See you soon!'); }); }
        if (menu && !menu.hidden && !e.target.closest('[data-menu] .ui-seg')) menu.hidden = true;
      });
      document.addEventListener('keydown', function (e) {
        var menu = root.querySelector('[data-menu]');
        if (e.key === 'Escape' && menu) menu.hidden = true;
      });
    },
    onTheme: function () {  // redraw the menu's Auto/Light/Dark buttons and keep the menu open
      var menu = document.querySelector('[data-menu]'), open = menu && !menu.hidden;
      UI.renderChrome();
      if (open) document.querySelector('[data-menu]').hidden = false;
    }
  };
})();


/* ===== _wt.html ===== */
(function () {
  'use strict';
  var WT = window.WT = {};

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
    var m = UI.modal('<h2>Lettering maker</h2><p class="muted">Type a word, a name or a quote. It becomes a picture you can trace, at any size.</p>' +
      '<form class="ui-stack" data-lt><label class="ui-field"><span>Your text <em>(new line = Enter)</em></span><textarea name="text" rows="2" maxlength="160" style="min-height:70px">' + UI.esc(state.text) + '</textarea></label>' +
      '<div class="wt-fonts" data-fonts>' + WT.FONTS.map(function (f) {
        return '<button type="button" data-font="' + UI.esc(f[0]) + '" class="' + (f[0] === state.font ? 'on' : '') + '" style="font-family:\'' + f[0] + '\';font-weight:' + f[2] + '">Aa<small>' + UI.esc(f[1]) + '</small></button>';
      }).join('') + '</div>' +
      '<label class="ui-check"><input type="checkbox" name="outline" checked> Outline letters (trace the edges, then paint them in)</label>' +
      '<div class="wt-thumb" style="aspect-ratio:auto;min-height:150px;padding:10px"><canvas data-prev style="max-width:100%;max-height:220px"></canvas></div>' +
      '<div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Cancel</button><button class="ui-btn primary" type="submit">' + UI.icon('plus') + 'Create project</button></div></form>', { wide: true });
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
    return new Promise(function (resolve) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var c = WT.lettering(state);
        var data = { title: state.text.split('\n')[0].slice(0, 60), image: c.toDataURL('image/png'), w: c.width, h: c.height, thumb: WT.thumb(c, 360),
          source: 'lettering', settings: { look: 'lines', width_cm: Math.max(40, Math.min(240, Math.round(c.width / 12))), color: '#ff4fd8' } };
        UI.busy(form.querySelector('[type=submit]'), WT.store.create(data)).then(function (p) { m.close(); resolve(p); });
      });
    });
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
      inp.onchange = function () { if (inp.files[0]) go(inp.files[0]).then(resolve, reject); };
      inp.click();
    });
  };
  WT.xrSupport = function () {
    if (!navigator.xr || !navigator.xr.isSessionSupported) return Promise.resolve({ ar: false, vr: false });
    return Promise.all([navigator.xr.isSessionSupported('immersive-ar').catch(function () { return false; }),
      navigator.xr.isSessionSupported('immersive-vr').catch(function () { return false; })]).then(function (r) { return { ar: !!r[0], vr: !!r[1] }; });
  };
})();

/* ===== admin.html ===== */
(function () {
  var esc = UI.esc;
  var TABS = [['overview', 'Overview', 'grid'], ['showcase', 'Showcase', 'heart'], ['stencils', 'Stencils', 'layers'], ['feedback', 'Feedback', 'inbox'], ['users', 'Users', 'users'], ['demo', 'Demo data', 'database']];

  UI.page('admin', { title: 'Admin', auth: 'admin' }, function (view, ctx) {
    var tab = TABS.some(function (t) { return t[0] === ctx.args[0]; }) ? ctx.args[0] : 'overview';
    var fbFilter = 'new';
    view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><h1>Admin</h1><p class="muted">Only admins see this page.</p></div></div>' +
      '<nav class="ui-tabs">' + TABS.map(function (t) {
        return '<a href="#admin/' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + UI.icon(t[2]) + t[1] + '</a>';
      }).join('') + '</nav><div data-body><div class="ui-skel"></div></div></div>';
    var body = view.querySelector('[data-body]');

    function overview() {
      return UI.api('admin_overview').then(function (d) {
        var stat = function (n, label, go) { return '<a class="ui-card ui-stat" href="#admin/' + go + '" style="text-decoration:none;color:inherit"><b>' + n + '</b><span>' + label + '</span></a>'; };
        body.innerHTML = '<div class="ad-stats">' + stat(d.users, 'people signed up', 'users') + stat(d.admins, UI.plural(d.admins, 'admin').replace(/^\d+ /, ''), 'users') +
          stat(d.feedback_new, 'new feedback', 'feedback') + stat(d.showcase_pending, 'walls to approve', 'showcase') +
          stat(d.projects.projects, 'projects', 'overview') + stat(WT.fmtMinutes(d.projects.minutes), 'traced in total', 'overview') +
          stat(d.projects.finished, 'walls finished', 'overview') + stat(d.stencils, 'stencils in the library', 'stencils') + '</div>' +
          '<p class="muted small" style="margin-top:18px">Demo data is <b>' + esc(d.demo.state) + '</b> (' + d.demo.counts.users + ' demo people). Manage it in the Demo data tab.</p>';
      });
    }

    function feedback() {
      return UI.api('list_feedback', null).then(function (d) {
        var items = d.items.filter(function (i) { return fbFilter === 'all' || i.status === fbFilter; });
        body.innerHTML = '<div class="ui-row" style="margin-bottom:16px"><div class="ui-seg">' + [['new', 'New'], ['read', 'Read'], ['done', 'Done'], ['all', 'All']].map(function (f) {
          var n = f[0] === 'all' ? d.items.length : d.counts[f[0]];
          return '<button data-filter="' + f[0] + '" class="' + (fbFilter === f[0] ? 'on' : '') + '">' + f[1] + ' (' + n + ')</button>';
        }).join('') + '</div></div>' +
          (items.length ? '<div class="ad-fb">' + items.map(function (i) {
            var c = i.context || {};
            return '<div class="ui-item" data-id="' + esc(i.id) + '"><div class="meta"><span class="ui-badge ' + (i.kind === 'bug' ? 'bad' : i.kind === 'idea' ? 'brand' : '') + '">' + esc(i.kind_label) + '</span>' +
              '<b>' + esc(i.name) + '</b>' + (i.email ? '<a href="mailto:' + esc(i.email) + '">' + esc(i.email) + '</a>' : '') + '<span>' + esc(UI.fmtDateTime(i.created)) + '</span></div>' +
              '<p class="msg">' + esc(i.message) + '</p>' +
              '<div class="ctx">' + esc([c.page, c.screen, c.theme, c.browser].filter(Boolean).join(' · ')) + '</div>' +
              '<textarea data-note placeholder="Private note (only admins see it)">' + esc(i.note) + '</textarea>' +
              '<div class="ui-row" style="margin-top:10px">' + ['new', 'read', 'done'].map(function (s) {
                return '<button class="ui-btn sm' + (i.status === s ? ' primary' : '') + '" data-status="' + s + '">' + s[0].toUpperCase() + s.slice(1) + '</button>';
              }).join('') + '<span class="ui-spacer"></span><button class="ui-btn sm danger" data-del-fb>' + UI.icon('trash') + 'Delete</button></div></div>';
          }).join('') + '</div>'
            : '<div class="ui-empty">' + UI.icon('inbox') + '<h3>No ' + (fbFilter === 'all' ? '' : fbFilter + ' ') + 'messages</h3><p>Messages from the "Send feedback" form show up here.</p></div>');
      });
    }

    function users(query) {
      return UI.api('list_users', query || null).then(function (d) {
        body.innerHTML = '<form class="ui-row" data-search style="margin-bottom:14px"><input type="search" name="q" placeholder="Search by name or email" value="' + esc(query || '') + '" style="max-width:360px">' +
          '<button class="ui-btn" type="submit">' + UI.icon('search') + 'Search</button><span class="muted small">' + UI.plural(d.total, 'person', 'people') + '</span></form>' +
          '<table class="ad-users"><thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Admin</th><th>Active</th></tr></thead><tbody>' +
          d.users.map(function (u) {
            return '<tr data-id="' + esc(u.id) + '"><td><b>' + esc(u.name) + '</b></td><td class="email">' + esc(u.email) + '</td><td class="joined muted">' + esc(UI.fmtDate(u.joined)) + '</td>' +
              '<td><label class="ui-check"><input type="checkbox" data-admin' + (u.is_admin ? ' checked' : '') + '> Admin</label></td>' +
              '<td><label class="ui-check"><input type="checkbox" data-enabled' + (u.enabled ? ' checked' : '') + '> Active</label></td></tr>';
          }).join('') + '</tbody></table>';
      });
    }

    function demo() {
      return UI.api('admin_overview').then(function (d) {
        var c = d.demo.counts;
        body.innerHTML = '<div class="ui-card ui-narrow" style="margin:0"><h3>Demo data</h3>' +
          '<p class="muted">Example people and content, so the app never looks empty for the first visitors. Demo rows are flagged, so removing them never touches real data. Once removed, it stays removed until you load it again.</p>' +
          '<p>Status: <b>' + esc(d.demo.state) + '</b> · ' + Object.keys(c).map(function (k) { return c[k] + ' ' + esc(k); }).join(', ') + '</p>' +
          '<div class="ui-row"><button class="ui-btn primary" data-demo="load">' + UI.icon('refresh') + (d.demo.state === 'loaded' ? 'Reload demo data' : 'Load demo data') + '</button>' +
          '<button class="ui-btn danger" data-demo="remove">' + UI.icon('trash') + 'Remove demo data</button></div></div>';
      });
    }

    var scFilter = 'pending';
    function showcase() {
      return UI.api('admin_showcase', scFilter).then(function (d) {
        body.innerHTML = '<div class="ui-row" style="margin-bottom:16px"><div class="ui-seg">' + [['pending', 'To approve'], ['approved', 'Public'], ['rejected', 'Rejected']].map(function (f) {
          return '<button data-scf="' + f[0] + '" class="' + (scFilter === f[0] ? 'on' : '') + '">' + f[1] + ' (' + d.counts[f[0]] + ')</button>';
        }).join('') + '</div></div>' +
          (d.posts.length ? '<div class="ad-sc">' + d.posts.map(function (p) {
            return '<div class="ui-card" data-sc="' + esc(p.id) + '"><img src="' + esc(p.thumb || '') + '" alt=""><b>' + esc(p.title) + '</b>' + (p.demo ? ' <span class="ui-badge">Demo</span>' : '') +
              '<p class="small muted" style="margin:4px 0 6px;overflow-wrap:anywhere">' + esc(p.by) + ' · ' + esc(p.email) + ' · ' + esc(UI.ago(p.created)) + '</p>' +
              (p.caption ? '<p class="small" style="white-space:pre-wrap;margin:0 0 8px">' + esc(p.caption) + '</p>' : '') +
              '<div class="ui-row">' + (p.status !== 'approved' ? '<button class="ui-btn sm primary" data-scs="approved">' + UI.icon('check') + 'Approve</button>' : '') +
              (p.status !== 'rejected' ? '<button class="ui-btn sm" data-scs="rejected">' + UI.icon('x') + 'Reject</button>' : '') +
              '<button class="ui-btn sm danger" data-scdel aria-label="Delete">' + UI.icon('trash') + '</button></div></div>';
          }).join('') + '</div>' : '<div class="ui-empty">' + UI.icon('heart') + '<h3>Nothing ' + (scFilter === 'pending' ? 'to approve' : 'here') + '</h3><p>New walls people share show up here first.</p></div>');
      });
    }

    var stData = null;
    function stencils() {
      return UI.api('admin_stencils').then(function (d) {
        stData = d;
        body.innerHTML = '<div class="ui-row between" style="margin-bottom:14px"><p class="muted small" style="margin:0">' + d.stencils.length + ' stencils. Hidden ones don\'t show in the library. Built-in ones come from StencilArt.py.</p>' +
          '<button class="ui-btn primary sm" data-st-add>' + UI.icon('plus') + 'Add a stencil</button></div><div class="ad-st">' +
          d.stencils.map(function (s, i) {
            return '<div class="row' + (s.published ? '' : ' off') + '" data-st="' + esc(s.id) + '"><img src="' + esc(s.thumb || '') + '" alt=""><div><b>' + esc(s.title) + '</b>' +
              '<div class="small muted">' + esc(s.category) + ' · ' + esc(s.level) + ' · ' + s.cm + ' cm · used ' + s.uses + 'x' + (s.builtin ? ' · built-in' : '') + '</div></div>' +
              '<div class="acts"><button class="ui-btn sm icon" data-st-move="-1" aria-label="Up"' + (i ? '' : ' disabled') + '>&uarr;</button><button class="ui-btn sm icon" data-st-move="1" aria-label="Down"' + (i < d.stencils.length - 1 ? '' : ' disabled') + '>&darr;</button>' +
              '<button class="ui-btn sm" data-st-edit aria-label="Edit">' + UI.icon('edit') + '</button><button class="ui-btn sm" data-st-pub>' + (s.published ? 'Hide' : 'Show') + '</button>' +
              (s.builtin ? '' : '<button class="ui-btn sm danger" data-st-del aria-label="Delete">' + UI.icon('trash') + '</button>') + '</div></div>';
          }).join('') + '</div>';
      });
    }
    function stencilForm(s) {
      var cats = stData.categories, lv = stData.levels, pic = null;
      var m = UI.modal('<h2>' + (s ? 'Edit stencil' : 'Add a stencil') + '</h2><form class="ui-stack" data-stf>' +
        (s ? '' : '<button type="button" class="ui-btn block" data-st-pick>' + UI.icon('upload') + 'Choose a picture (line art works best)</button><div data-st-prev></div>') +
        '<label class="ui-field"><span>Title</span><input name="title" maxlength="80" required value="' + esc(s ? s.title : '') + '"></label>' +
        '<div class="ui-grid two"><label class="ui-field"><span>Category</span><select name="category">' + cats.map(function (c) { return '<option' + (s && s.category === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></label>' +
        '<label class="ui-field"><span>Level</span><select name="level">' + lv.map(function (c) { return '<option' + (s && s.level === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></label></div>' +
        '<label class="ui-field"><span>Suggested width (cm)</span><input type="number" name="cm" min="5" max="1000" value="' + (s ? s.cm : 100) + '"></label>' +
        '<label class="ui-field"><span>Description</span><textarea name="blurb" maxlength="400" rows="2">' + esc(s ? s.blurb : '') + '</textarea></label>' +
        '<label class="ui-field"><span>Credit <em>(artist, licence)</em></span><input name="credit" maxlength="120" value="' + esc(s ? s.credit : '') + '"></label>' +
        '<div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Cancel</button><button class="ui-btn primary" type="submit">Save</button></div></form>');
      var f = m.el.querySelector('[data-stf]');
      var pick = m.el.querySelector('[data-st-pick]');
      if (pick) pick.onclick = function () {
        var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = function () {
          WT.readPicture(inp.files[0]).then(function (p) {
            pic = p; m.el.querySelector('[data-st-prev]').innerHTML = '<img src="' + esc(p.thumb) + '" alt="" style="max-height:140px;border-radius:10px">';
            if (!f.title.value) f.title.value = p.title;
          }, function (err) { UI.toast(err.message, 'error'); });
        };
        inp.click();
      };
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = UI.formData(f);
        var call;
        if (s) call = UI.api('admin_update_stencil', s.id, v);
        else {
          if (!pic) { UI.toast('Choose a picture first.', 'error'); return; }
          call = UI.api('admin_add_stencil', Object.assign(v, { image: pic.image, thumb: pic.thumb, w: pic.w, h: pic.h }));
        }
        UI.busy(f.querySelector('[type=submit]'), call).then(function () { m.close(); UI.toast('Saved', 'ok'); stencils(); });
      });
    }

    var DRAW = { overview: overview, showcase: showcase, stencils: stencils, feedback: feedback, users: users, demo: demo };

    view.addEventListener('click', function (e) {
      var scf = e.target.closest('[data-scf]');
      if (scf) { scFilter = scf.getAttribute('data-scf'); showcase(); return; }
      var scs = e.target.closest('[data-scs]');
      if (scs) { UI.api('admin_set_showcase', scs.closest('[data-sc]').getAttribute('data-sc'), scs.getAttribute('data-scs')).then(function () { UI.toast('Saved', 'ok'); showcase(); }); return; }
      var scd = e.target.closest('[data-scdel]');
      if (scd) {
        UI.confirm({ title: 'Delete this post?', ok: 'Delete', danger: true }).then(function (y) { if (y) UI.api('delete_showcase', scd.closest('[data-sc]').getAttribute('data-sc')).then(showcase); });
        return;
      }
      if (e.target.closest('[data-st-add]')) { stencilForm(null); return; }
      var str = e.target.closest('[data-st]');
      if (str) {
        var sid = str.getAttribute('data-st'), so = stData.stencils.filter(function (x) { return x.id === sid; })[0];
        var mv = e.target.closest('[data-st-move]');
        if (mv) { UI.api('admin_update_stencil', sid, { move: parseInt(mv.getAttribute('data-st-move'), 10) }).then(stencils); return; }
        if (e.target.closest('[data-st-edit]')) { stencilForm(so); return; }
        if (e.target.closest('[data-st-pub]')) { UI.api('admin_update_stencil', sid, { published: !so.published }).then(stencils); return; }
        if (e.target.closest('[data-st-del]')) {
          UI.confirm({ title: 'Delete "' + so.title + '"?', text: 'Projects made from it keep their copy.', ok: 'Delete', danger: true }).then(function (y) { if (y) UI.api('admin_delete_stencil', sid).then(stencils); });
          return;
        }
      }
      var f = e.target.closest('[data-filter]');
      if (f) { fbFilter = f.getAttribute('data-filter'); feedback(); return; }
      var st = e.target.closest('[data-status]');
      if (st) {
        var card = st.closest('[data-id]');
        UI.api('set_feedback_status', card.getAttribute('data-id'), st.getAttribute('data-status'), card.querySelector('[data-note]').value).then(function () { UI.toast('Saved', 'ok'); feedback(); });
        return;
      }
      var del = e.target.closest('[data-del-fb]');
      if (del) {
        UI.confirm({ title: 'Delete this message?', ok: 'Delete', danger: true }).then(function (yes) {
          if (yes) UI.api('delete_feedback', del.closest('[data-id]').getAttribute('data-id')).then(feedback);
        });
        return;
      }
      var dm = e.target.closest('[data-demo]');
      if (dm) {
        var load = dm.getAttribute('data-demo') === 'load';
        UI.confirm({ title: load ? 'Load the demo data?' : 'Remove the demo data?', text: load ? 'Demo people and content are added (any old demo rows are replaced).' : 'Every demo row is deleted. Real data stays.', ok: load ? 'Load' : 'Remove', danger: !load })
          .then(function (yes) { if (yes) UI.busy(dm, UI.api(load ? 'demo_load' : 'demo_remove')).then(function () { UI.toast('Done', 'ok'); demo(); }); });
      }
    });
    view.addEventListener('change', function (e) {
      var row = e.target.closest('tr[data-id]');
      if (!row) return;
      var id = row.getAttribute('data-id'), box = e.target;
      var fn = box.hasAttribute('data-admin') ? 'set_admin' : box.hasAttribute('data-enabled') ? 'set_enabled' : null;
      if (fn) UI.api(fn, id, box.checked).then(function () { UI.toast('Saved', 'ok'); }, function (err) { box.checked = !box.checked; UI.toast(err.message, 'error'); });
    });
    view.addEventListener('submit', function (e) {
      if (e.target.matches('[data-search]')) { e.preventDefault(); users(UI.formData(e.target).q); }
    });
    return DRAW[tab]();
  });
})();

/* ===== auth.html ===== */
(function () {
  var esc = UI.esc;
  function pw(name, auto) {
    return '<div class="au-pw"><input type="password" name="' + name + '" autocomplete="' + auto + '" required minlength="8">' +
      '<button type="button" data-show>Show</button></div>';
  }
  UI.page('auth', { title: 'Sign in', auth: 'guest' }, function (view, ctx) {
    var mode = ['signup', 'reset'].indexOf(ctx.args[0]) >= 0 ? ctx.args[0] : 'login';
    function draw(msg, isErr) {
      var heading = { login: 'Welcome back', signup: 'Create your account', reset: 'Reset your password' }[mode];
      var sub = { login: 'Sign in to continue to ' + esc(UI.config.name) + '.', signup: 'It\'s free and takes a few seconds.',
        reset: 'We\'ll email you a link to choose a new password.' }[mode];
      view.innerHTML = '<div class="au-wrap"><div class="ui-card au-card">' +
        '<h1>' + heading + '</h1><p class="muted">' + sub + '</p>' +
        (mode !== 'reset' ? '<div class="ui-seg" role="tablist"><button type="button" data-mode="login" class="' + (mode === 'login' ? 'on' : '') + '">Sign in</button>' +
          '<button type="button" data-mode="signup" class="' + (mode === 'signup' ? 'on' : '') + '">Create account</button></div>' : '<div style="height:14px"></div>') +
        '<form class="ui-stack" data-form="' + mode + '" novalidate>' +
        (mode === 'signup' ? '<label class="ui-field"><span>Your name</span><input type="text" name="name" autocomplete="name" required maxlength="60"></label>' : '') +
        '<label class="ui-field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>' +
        (mode === 'login' ? '<label class="ui-field"><span>Password</span>' + pw('password', 'current-password') + '</label>' : '') +
        (mode === 'signup' ? '<label class="ui-field"><span>Password <em>(at least 8 characters)</em></span>' + pw('password', 'new-password') + '</label>' +
          (window.LegalKit ? '<div>' + LegalKit.consentField() + '</div>' : '') : '') +
        '<div data-msg role="alert"' + (msg ? ' class="' + (isErr ? 'ui-error' : 'ui-note') + '">' + esc(msg) : ' hidden>') + '</div>' +
        '<button class="ui-btn primary block" type="submit">' + { login: 'Sign in', signup: 'Create account', reset: 'Send the link' }[mode] + '</button></form>' +
        '<div class="au-links">' + (mode === 'login' ? '<a data-mode="reset">Forgot your password?</a>' : '<a data-mode="login">' + UI.icon('back') + ' Back to sign in</a>') +
        '<a href="#landing" data-go="landing">About ' + esc(UI.config.name) + '</a></div></div></div>';
      var first = view.querySelector('input');
      if (first && !msg) first.focus();
    }
    view.addEventListener('click', function (e) {
      var m = e.target.closest('[data-mode]');
      if (m) { e.preventDefault(); mode = m.getAttribute('data-mode'); history.replaceState(null, '', '#auth' + (mode === 'login' ? '' : '/' + mode)); draw(); return; }
      var s = e.target.closest('[data-show]');
      if (s) { var i = s.parentNode.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; s.textContent = i.type === 'password' ? 'Show' : 'Hide'; }
    });
    view.addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target, v = UI.formData(form);
      var problem = !/^\S+@\S+\.\S+$/.test(v.email || '') ? 'Please enter a valid email address.'
        : mode !== 'reset' && (v.password || '').length < (mode === 'signup' ? 8 : 1) ? (mode === 'signup' ? 'Please choose a password of at least 8 characters.' : 'Please enter your password.')
        : mode === 'signup' && (v.name || '').trim().length < 2 ? 'Please tell us your name.' : null;
      if (problem) { say(problem, true); return; }
      if (mode === 'signup' && window.LegalKit && !LegalKit.consentChecked(form)) return;  // the kit shows its own message
      UI.busy(form.querySelector('[type=submit]'), UI.auth(mode, v)).then(function (r) {
        if (mode === 'reset' || (r && !r.me)) { mode = 'login'; draw(r && r.message, false); restore({ email: v.email }); }
        else UI.toast(mode === 'signup' ? 'Welcome to ' + UI.config.name + '!' : 'Welcome back!', 'ok');
      }, function (err) { say(err.message, true); });
    });
    function say(msg, isErr) {
      var box = view.querySelector('[data-msg]');
      box.className = isErr ? 'ui-error' : 'ui-note'; box.textContent = msg; box.hidden = false;
    }
    function restore(v) {
      ['name', 'email'].forEach(function (k) { var i = view.querySelector('[name=' + k + ']'); if (i && v[k]) i.value = v[k]; });
    }
    draw();
  });
})();

/* ===== edit.html ===== */
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

/* ===== guide.html ===== */
(function () {
  function pads() {
    // Two Quest Touch controllers, seen from above, with what each control does.
    function ctl(x, side) {
      var L = side === 'left', b1 = L ? 'X' : 'A', b2 = L ? 'Y' : 'B';
      var sx = L ? x + 66 : x + 54, ax = L ? x + 44 : x + 76;
      return '<g transform="translate(0 0)">' +
        '<path d="M' + (x + 20) + ',150 C' + (x + 10) + ',80 ' + (x + 40) + ',40 ' + (x + 60) + ',40 C' + (x + 80) + ',40 ' + (x + 110) + ',80 ' + (x + 100) + ',150 L' + (x + 92) + ',260 C' + (x + 88) + ',280 ' + (x + 32) + ',280 ' + (x + 28) + ',260 Z" fill="var(--c-surface-2)" stroke="var(--c-ink)" stroke-width="2.4"/>' +
        '<circle cx="' + sx + '" cy="90" r="15" fill="var(--c-surface)" stroke="var(--c-ink)" stroke-width="2.2"/><circle cx="' + sx + '" cy="90" r="6" fill="var(--c-ink)"/>' +
        '<circle cx="' + ax + '" cy="128" r="10" fill="var(--c-brand)"/><text x="' + ax + '" y="132.5" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" font-family="Inter, Arial">' + b1 + '</text>' +
        '<circle cx="' + (L ? ax + 4 : ax - 4) + '" cy="106" r="9" fill="var(--c-accent)"/><text x="' + (L ? ax + 4 : ax - 4) + '" y="110" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="Inter, Arial">' + b2 + '</text>' +
        '<rect x="' + (L ? x + 96 : x + 6) + '" y="160" width="14" height="46" rx="6" fill="var(--c-warn)"/>' + '</g>';
    }
    function label(x1, y1, x2, y2, t, anchor) {
      return '<path d="M' + x1 + ',' + y1 + ' L' + x2 + ',' + y2 + '" stroke="var(--c-faint)" stroke-width="1.4"/>' +
        '<text x="' + (x2 + (anchor === 'end' ? -6 : 6)) + '" y="' + (y2 + 4) + '" text-anchor="' + (anchor || 'start') + '" font-size="13" fill="var(--c-ink)" font-family="Inter, Arial">' + t + '</text>';
    }
    return '<svg viewBox="0 0 760 300" role="img" aria-label="Quest controllers: what each button does">' +
      ctl(150, 'left') + ctl(490, 'right') +
      label(216, 90, 270, 54, 'Left stick: in / out', 'start') + label(194, 128, 140, 120, 'X: hide / show', 'end') + label(198, 106, 140, 92, 'Y: menu', 'end') +
      label(252, 183, 290, 210, 'Grip: slide it', 'start') + label(216, 90, 140, 64, 'Click: grid', 'end') +
      label(544, 90, 490, 54, 'Right stick: size ↕ turn ↔', 'end') + label(566, 128, 620, 120, 'A: hide / show', 'start') + label(562, 106, 620, 92, 'B: opacity', 'start') +
      label(502, 183, 460, 210, 'Grip: slide it', 'end') + label(544, 90, 620, 64, 'Click: next look', 'start') +
      '<text x="380" y="290" text-anchor="middle" font-size="13" fill="var(--c-muted)" font-family="Inter, Arial">Trigger (under your index finger): place, and press menu buttons</text></svg>';
  }

  var SECTIONS = [['need', 'What you need'], ['setup', 'Set up the headset'], ['steps', 'Trace a wall'], ['controls', 'Controller map'], ['hands', 'Hands-free'], ['tips', 'Tips'], ['help', 'Troubleshooting']];

  UI.page('guide', { title: 'Guide', nav: 'Guide', icon: 'info', order: 40 }, function (view, ctx) {
    var i = 0;
    function sec(idv, title, body) { i++; return '<section id="gd-' + idv + '"><h2><span class="n">' + i + '</span>' + title + '</h2>' + body + '</section>'; }
    view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">Guide</div><h1>How to trace a <span class="ui-squiggle">wall</span></h1>' +
      '<p class="muted">From a picture on your phone to pencil lines on your wall, in about ten minutes of setup.</p></div>' +
      '<a class="ui-btn primary" href="#studio" data-go="studio">' + UI.icon('image') + 'Open the studio</a></div>' +
      '<div class="gd"><nav class="gd-toc" aria-label="Sections">' + SECTIONS.map(function (s) { return '<a href="#guide/' + s[0] + '" data-sec="' + s[0] + '">' + s[1] + '</a>'; }).join('') + '</nav><div>' +

      sec('need', 'What you need', '<div class="gd-need">' +
        [['headset', 'A Meta Quest', 'Quest 3 or 3S (colour passthrough) is ideal. Quest Pro and Quest 2 work too, in black and white.'],
         ['pencil', 'A soft pencil', 'HB or 2B, sharpened. Chalk or a chalk pen for dark walls. An eraser that doesn\'t smudge.'],
         ['image', 'A picture', 'Anything: your drawing, a photo, a logo, or one from the library. Prepare it on any screen.'],
         ['sun', 'Good light', 'Passthrough needs a lit room. Daylight or a bright lamp, no light shining straight at the headset.'],
         ['ruler', 'Optional extras', 'Painter\'s tape, a long ruler or a level for straight lines, a step stool for high walls.'],
         ['globe', 'Or an Android phone', 'Phones with Google Play Services for AR work too. Use a tripod so your hands are free.']].map(function (n) {
          return '<div class="ui-card">' + UI.icon(n[0]) + '<h4>' + n[1] + '</h4><p>' + n[2] + '</p></div>';
        }).join('') + '</div>') +

      sec('setup', 'Set up the headset', '<div class="gd-steps">' +
        '<div class="gd-step"><div><h3>Run Space Setup (Quest 3 / 3S)</h3><p>Settings → Physical space → Space setup. Let it scan the walls. WallTracer then finds the wall exactly where you point, with no guessing.</p></div></div>' +
        '<div class="gd-step"><div><h3>Draw a boundary that includes the wall</h3><p>You\'ll stand right next to it. If the boundary is in the way, redraw it a little past the wall, or use a stationary boundary near it.</p></div></div>' +
        '<div class="gd-step"><div><h3>Open WallTracer in the Meta Quest Browser</h3><p>Go to this site, sign in with the same account, open the <b>Studio</b> and press <b>Trace</b>, then <b>Start on the wall</b>. Allow the browser to use your space and hands when it asks.</p></div></div>' +
        '<div class="gd-step"><div><h3>Turn on hand tracking</h3><p>Settings → Movement tracking → Hand and body tracking: on, and auto-switch from controllers to hands: on. Then the moment you put the controllers down, your hands take over.</p></div></div></div>') +

      sec('steps', 'Trace a wall', '<div class="gd-steps">' +
        '<div class="gd-step"><div><h3>Prepare the picture</h3><p>In the studio, add a picture and choose a <b>look</b>: Lines for drawings, Outline for photos, Tones for murals you\'ll paint in. Set its real <b>width</b>. A grid and corner crosses help a lot for big walls.</p></div></div>' +
        '<div class="gd-step"><div><h3>Place it</h3><ul><li><b>Aim at the wall</b>: a ring shows where the wall is. Pull the trigger.</li>' +
        '<li><b>Touch 3 points</b>: touch the wall with the controller tip at the centre, then two more spots a hand-width apart. Works without Space Setup, and is very precise.</li>' +
        '<li><b>Float in front</b>: it hangs in the air; move it with the grip.</li></ul></div></div>' +
        '<div class="gd-step"><div><h3>Adjust</h3><p>Hold the <b>grip</b> and move your hand to slide it along the wall. <b>Right stick</b> up and down for size, left and right to turn it. The menu has Level, Push in and Pull out (2 mm steps).</p></div></div>' +
        '<div class="gd-step"><div><h3>Lock it</h3><p>Press <b>Lock in place</b>. It\'s pinned to the wall now: put the controllers down and pick up your pencil.</p></div></div>' +
        '<div class="gd-step"><div><h3>Trace, and check</h3><p>Trace the lines. Pinch with your free hand (or press A / X) to hide the picture and see what you\'ve drawn; pinch again to bring it back. <b>Blink</b> does it for you every few seconds.</p></div></div>' +
        '<div class="gd-step"><div><h3>One square at a time</h3><p>With the grid on, <b>Spotlight</b> shows one square and dims the rest. Mark it done, move to the next. Your progress is saved.</p></div></div>' +
        '<div class="gd-step"><div><h3>Come back tomorrow</h3><p>Trace the corner crosses first. Next time, the headset may remember the spot by itself; if not, place it again and line the crosses up. Your size, look and finished squares are kept.</p></div></div></div>') +

      sec('controls', 'Controller map', '<div class="gd-pad">' + pads() + '</div>' +
        '<table class="gd-table"><tr><td>Trigger</td><td>Place the picture · press menu buttons · with the grid on, mark the square you point at</td></tr>' +
        '<tr><td>Grip (hold)</td><td>Slide the picture along the wall (before locking)</td></tr><tr><td>Right stick</td><td>Up / down: size · left / right: turn</td></tr>' +
        '<tr><td>Left stick</td><td>Up / down: push in / pull out · with Spotlight on: next square</td></tr><tr><td>A or X</td><td>Hide / show the picture</td></tr>' +
        '<tr><td>B</td><td>Opacity: 100, 85, 60, 35, 15%</td></tr><tr><td>Y</td><td>Open / close the menu</td></tr><tr><td>Stick click</td><td>Right: next look · left: grid on / off</td></tr></table>') +

      sec('hands', 'Hands-free', '<p class="muted">Once it\'s locked, you never need the controllers again.</p><table class="gd-table">' +
        '<tr><td>Pinch (free hand)</td><td>Hide / show the picture</td></tr><tr><td>Pinch and hold</td><td>Open the menu; pinch while pointing at a button to press it</td></tr>' +
        '<tr><td>Pencil hand</td><td>Ignored, so holding the pencil never hides your picture. Set which hand in the project settings.</td></tr>' +
        '<tr><td>Blink</td><td>Hides the picture for a moment every 3, 5 or 10 seconds, with no hands at all</td></tr></table>') +

      sec('tips', 'Tips for great results', '<div class="gd-tips">' +
        [['Neon on light walls', 'Cyan and magenta read best through passthrough. Keep "dark edge" on for pale walls; white lines for dark walls.'],
         ['Lower the opacity', 'At 35 to 60% you see your pencil through the picture, so you know which lines are done.'],
         ['Lines, not shading', 'Trace outlines and the borders between tones. Paint the shading in afterwards with the picture beside you.'],
         ['Big walls: squares', 'Use the grid and Spotlight. Finish a square, mark it, move on. Great for sharing the work with a friend.'],
         ['Your hand is not in the way', 'The picture draws over your hand. That\'s normal: look at your pencil tip, or lower the opacity.'],
         ['Straight lines', 'For geometric pieces, mark the ends of each line, then join them with a ruler with the headset off.']].map(function (t) {
          return '<div class="ui-card"><h4>' + t[0] + '</h4><p>' + t[1] + '</p></div>';
        }).join('') + '</div>') +

      sec('help', 'Troubleshooting',
        [['"Start on the wall" isn\'t there', 'Your browser can\'t show passthrough. On a Quest, use the Meta Quest Browser (not a third-party one) and make sure it\'s up to date. On a computer you can still practise in the virtual room.'],
         ['The ring doesn\'t appear on my wall', 'The headset doesn\'t know your walls yet. Run Space Setup, or choose Touch 3 points in the menu: it works anywhere.'],
         ['The picture drifts or jumps', 'Tracking needs light and some texture. Turn on more lights; a completely blank white wall is hard. If it moved, unlock it and line it up with your crosses again.'],
         ['It hid when I didn\'t want it to', 'Pinches with your pencil hand are ignored, but check which hand is set as your pencil hand in the project\'s settings.'],
         ['It\'s the wrong size', 'Set the width in the studio, or use the right stick before locking. Measure the wall with a tape for a perfect fit.'],
         ['Can I trace on paper or a table?', 'Yes: aim at a table or the floor. The top of the picture points away from you.']].map(function (q) {
          return '<details><summary>' + q[0] + '</summary><p>' + q[1] + '</p></details>';
        }).join('') + '<p class="muted small">Still stuck? <a href="#" data-feedback="question">Ask us</a>.</p>') +
      '</div></div></div>';
    view.addEventListener('click', function (e) {
      var a = e.target.closest('[data-sec]');
      if (!a) return;
      e.preventDefault();
      var el = view.querySelector('#gd-' + a.getAttribute('data-sec'));
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    });
    if (ctx.args[0]) setTimeout(function () { var el = view.querySelector('#gd-' + ctx.args[0]); if (el) el.scrollIntoView(); }, 60);
    return Promise.resolve();
  });
})();

/* ===== landing.html ===== */
(function () {
  var COPY = {
    eyebrow: 'Trace anything onto any wall',
    title: 'Your wall is the canvas. <em>Your headset is the projector.</em>',
    lead: 'Pick a picture, pin it to your real wall in passthrough, put the controllers down and trace it with a pencil. ' +
      'Hide it with one button to check your lines. No projector, no hand-drawn grid, no guessing.',
    proof: ['Meta Quest 3, 3S, Pro and 2', 'True to size, to the centimetre', 'Free'],
    stepsTitle: 'How it works',
    stepsLead: 'From a picture on your phone to pencil lines on your wall.',
    steps: [['Pick a picture', 'Your drawing, a photo, a logo, lettering, or a stencil from the library. Choose its look and real size.'],
            ['Pin it to the wall', 'In the headset, aim at the wall and pull the trigger, or touch the wall at three points. Slide, resize, lock.'],
            ['Put the controllers down', 'The picture stays exactly where you locked it. Pick up your pencil and trace, hands free.'],
            ['Hide it to check', 'Press A or X, or pinch your free hand: the picture vanishes and you see only your lines. Pinch again to carry on.']],
    featuresTitle: 'Made for real walls and real pencils',
    features: [['sparkle', 'Five looks', 'Clean lines, photo outlines, paint-by-number tones, silhouettes, or the photo itself.'],
               ['ruler', 'True to size', 'Type 120 cm and it is 120 cm on your wall. Even a person-for-scale preview.'],
               ['hand', 'Hands-free', 'Hand tracking takes over when you put the controllers down. Your pencil hand is ignored.'],
               ['blink', 'Blink and spotlight', 'Auto-peek every few seconds, or light up one grid square at a time and tick it off.'],
               ['cross', 'Come back tomorrow', 'Registration crosses and remembered spots let you continue exactly where you stopped.'],
               ['layers', 'Stencil library', 'Botanicals, animals, patterns, kids\' murals and handy templates, ready to trace.'],
               ['type', 'Lettering maker', 'Names, quotes and shop signs in eight lovely fonts, outlined for painting.'],
               ['play', 'Practice room', 'No headset yet? Place, lock and trace in a virtual room right in your browser.'],
               ['clock', 'Progress saved', 'Minutes traced, squares done and finished walls, on every device you sign in on.']],
    vs: { no: ['Needs a dark room', 'Keystone distortion on anything but a square-on wall', 'Your body casts a shadow on the picture', 'Cables, stands and a projector to buy'],
          yes: ['Works in daylight, in passthrough', 'No distortion, at any angle, on walls, tables and floors', 'Nothing to block: the picture is in your eyes', 'Just the headset you already own'] },
    faq: [['Which headsets work?', 'Meta Quest 3 and 3S give the best, full-colour passthrough. Quest Pro and Quest 2 work too (Quest 2 in black and white). Android phones with AR work on a tripod.'],
          ['Do I need to install anything?', 'No. Open this site in the Meta Quest Browser, sign in and press Trace. Prepare your pictures on any computer or phone first.'],
          ['How accurate is it?', 'Very, once it\'s locked: within a few millimetres on a well-lit wall. For big murals, trace the corner crosses first so you can line it up again any time.'],
          ['Will the picture stay still when I put the controllers down?', 'Yes. Locking pins it to the room (with a spatial anchor when the headset supports it), and hand tracking takes over.'],
          ['Is it free?', 'Yes, WallTracer is free. Without an account you can try everything; with one, your projects are saved and waiting in your headset.'],
          ['Who can see my pictures?', 'Only you. Projects are private. Only photos you choose to share in the Showcase are public, after a moderator approves them.']],
    bandTitle: 'Got a blank wall?',
    bandLead: 'Pick a picture now. It takes a minute, and it\'s free.'
  };

  function heroArt() {
    var leaf = 'M170 330 C 120 300 100 230 128 180 C 152 132 214 110 250 120 C 300 112 352 150 362 200 C 376 262 330 318 268 334 C 240 342 200 342 170 330 Z';
    var cuts = 'M132 205 L196 222 L136 232 M152 160 L212 190 L162 178 M346 192 L292 214 L350 222 M330 150 L280 182 L322 168 M180 318 L222 280 L206 330';
    var rib = 'M170 330 C 210 280 240 200 250 120';
    return '<div class="lp-art" aria-hidden="true"><svg viewBox="0 0 520 470">' +
      '<defs><filter id="lpglow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.2"/></filter></defs>' +
      '<rect x="8" y="8" width="504" height="380" rx="26" fill="var(--c-surface)" stroke="var(--c-line)" stroke-width="2"/>' +
      '<rect x="8" y="370" width="504" height="92" rx="22" fill="var(--c-surface-2)"/>' +
      '<g class="lp-trace"><g stroke="var(--c-accent)" stroke-width="7" fill="none" opacity=".45" filter="url(#lpglow)"><path d="' + leaf + '"/><path d="' + rib + '"/></g>' +
      '<g stroke="#2fe0cf" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="' + leaf + '"/><path d="' + rib + '"/><path d="' + cuts + '"/></g></g>' +
      '<g stroke="var(--c-ink)" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".78"><path d="M170 330 C 120 300 100 230 128 180 C 152 132 214 110 250 120"/><path d="M132 205 L196 222 L136 232 M152 160 L212 190 L162 178"/><path d="M170 330 C 200 290 222 240 236 180"/></g>' +
      '<g stroke="var(--c-brand)" stroke-width="3" stroke-linecap="round"><path d="M86 92h28M100 78v28M396 92h28M410 78v28M86 362h0M396 352h28M410 338v28M86 352h28M100 338v28"/></g>' +
      '<g transform="translate(412 210)">' +
        '<circle cx="34" cy="40" r="30" fill="var(--c-ink)" opacity=".9"/>' +
        '<rect x="-2" y="26" width="58" height="30" rx="14" fill="var(--c-brand)"/><rect x="6" y="33" width="42" height="13" rx="6" fill="var(--c-surface)" opacity=".85"/>' +
        '<path d="M8 80 C 0 120 0 190 10 250 L70 250 C 80 190 78 120 64 80 Z" fill="var(--c-ink)" opacity=".9"/>' +
        '<path d="M14 100 C -40 110 -84 120 -128 118" stroke="var(--c-ink)" stroke-width="18" stroke-linecap="round" fill="none" opacity=".9"/>' +
        '<g transform="translate(-140 116) rotate(-28)"><rect x="-4" y="-34" width="9" height="40" rx="2" fill="#f2b632"/><path d="M-4 6h9l-4.5 10z" fill="var(--c-ink)"/></g>' +
      '</g></svg>' +
      '<div class="chip c1"><span class="k">A</span>Hide / show the picture</div>' +
      '<div class="chip c2">' + UI.icon('ruler') + '70 × 61 cm · locked ' + UI.icon('lock') + '</div></div>';
  }

  UI.page('landing', { title: 'Trace any picture onto your wall' }, function (view, ctx) {
    var me = ctx.me, C = COPY, esc = UI.esc;
    var primary = me ? '<a class="ui-btn primary lg" href="#studio" data-go="studio">Open your studio ' + UI.icon('arrow') + '</a>'
      : '<a class="ui-btn primary lg" href="#studio" data-go="studio">Try it now, no account ' + UI.icon('arrow') + '</a>' +
        '<a class="ui-btn lg" href="#auth/signup" data-go="auth/signup">Sign up free</a>';
    view.innerHTML =
      '<section class="lp-hero"><div class="ui-wrap"><div>' +
        '<div class="eyebrow">' + esc(C.eyebrow) + '</div><h1>' + C.title + '</h1><p class="lp-lead">' + esc(C.lead) + '</p>' +
        '<div class="lp-cta">' + primary + '</div>' +
        '<div class="lp-proof">' + C.proof.map(function (p) { return '<span>' + UI.icon('check') + esc(p) + '</span>'; }).join('') + '</div>' +
      '</div>' + heroArt() + '</div></section>' +
      '<section class="lp-section" id="how"><div class="ui-wrap"><div class="lp-head"><h2>' + esc(C.stepsTitle) + '</h2><p>' + esc(C.stepsLead) + '</p></div>' +
        '<div class="lp-steps four">' + C.steps.map(function (s) { return '<div class="ui-card lp-step"><h3>' + esc(s[0]) + '</h3><p class="muted">' + esc(s[1]) + '</p></div>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>Better than a projector</h2><p>The old trick for murals, minus the dark room and the shadows.</p></div><div class="lp-vs">' +
        '<div class="ui-card no"><h3>' + UI.icon('x') + 'A projector</h3><ul>' + C.vs.no.map(function (t) { return '<li>' + UI.icon('x') + esc(t) + '</li>'; }).join('') + '</ul></div>' +
        '<div class="ui-card yes"><h3>' + UI.icon('headset') + 'WallTracer</h3><ul>' + C.vs.yes.map(function (t) { return '<li>' + UI.icon('check') + esc(t) + '</li>'; }).join('') + '</ul></div></div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>' + esc(C.featuresTitle) + '</h2></div>' +
        '<div class="ui-grid lp-feats">' + C.features.map(function (f) { return '<div class="ui-card lp-feature">' + UI.icon(f[0]) + '<h3>' + esc(f[1]) + '</h3><p>' + esc(f[2]) + '</p></div>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section" data-show hidden><div class="ui-wrap"><div class="lp-head"><h2>Fresh from the showcase</h2><p>Walls traced by people like you.</p></div><div class="lp-show" data-show-list></div>' +
        '<p style="text-align:center;margin-top:18px"><a class="ui-btn" href="#showcase" data-go="showcase">See all the walls ' + UI.icon('arrow') + '</a></p></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-head"><h2>Questions</h2></div><div class="lp-faq">' +
        C.faq.map(function (q) { return '<details><summary>' + esc(q[0]) + '</summary><p>' + esc(q[1]) + '</p></details>'; }).join('') + '</div></div></section>' +
      '<section class="lp-section"><div class="ui-wrap"><div class="lp-band"><div><h2>' + esc(C.bandTitle) + '</h2><p>' + esc(C.bandLead) + '</p></div>' +
        '<a class="ui-btn lg" href="#studio" data-go="studio">' + (me ? 'Open your studio' : 'Start a wall') + '</a>' +
      '</div></div></section>';
    return UI.apiQuiet('list_showcase', 'top').then(function (d) {
      if (!d.posts.length) return;
      view.querySelector('[data-show-list]').innerHTML = d.posts.slice(0, 4).map(function (p) {
        return '<a href="#showcase" data-go="showcase"><img src="' + esc(p.thumb || '') + '" alt="" loading="lazy"><span>' + esc(p.title) + '</span></a>';
      }).join('');
      view.querySelector('[data-show]').hidden = false;
    }, function () {});
  });
})();

/* ===== library.html ===== */
(function () {
  var esc = UI.esc;
  var LEVEL = { Easy: 'good', Medium: 'warn', Detailed: 'brand' };

  UI.page('library', { title: 'Stencil library', nav: 'Library', icon: 'layers', order: 20 }, function (view, ctx) {
    var all = [], cats = [], cat = ctx.args[0] || 'All', q = '';
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:420px"></div></div>';

    function draw() {
      var shown = all.filter(function (s) {
        return (cat === 'All' || s.category === cat) && (!q || (s.title + ' ' + s.blurb + ' ' + s.category).toLowerCase().indexOf(q) >= 0);
      });
      var used = ['All'].concat(cats.filter(function (c) { return c === 'Lettering' || all.some(function (s) { return s.category === c; }); }));
      view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">Stencil library</div><h1>Ready to <span class="ui-squiggle">trace</span></h1>' +
        '<p class="muted">Original line art, free to use on your walls. Each one opens at a sensible real size; change it to fit your wall.</p></div></div>' +
        '<div class="lb-top"><input type="search" placeholder="Search stencils" value="' + esc(q) + '" data-q aria-label="Search stencils">' +
        '<div class="wt-chips" style="flex:1;min-width:0">' + used.map(function (c) { return '<button class="wt-chip' + (c === cat ? ' on' : '') + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div></div>' +
        '<div class="lb-grid">' +
        ((cat === 'All' || cat === 'Lettering') && !q ? '<button class="lb-card letter" data-letter><div class="pic">Aa</div><h3>Lettering maker</h3><div class="meta"><span class="ui-badge accent">Your words</span><span class="ui-badge">8 fonts</span></div></button>' : '') +
        shown.map(function (s) {
          return '<button class="lb-card" data-id="' + esc(s.id) + '"><div class="pic"><img src="' + esc(s.thumb) + '" alt="" loading="lazy"></div><h3>' + esc(s.title) + '</h3>' +
            '<div class="meta"><span class="ui-badge ' + (LEVEL[s.level] || '') + '">' + esc(s.level) + '</span><span class="ui-badge">' + esc(WT.fmtLen(s.cm, 'cm')) + ' wide</span>' +
            (s.uses ? '<span class="ui-badge">' + UI.icon('heart') + s.uses + '</span>' : '') + '</div></button>';
        }).join('') + '</div>' +
        (!shown.length && q ? '<div class="ui-empty" style="margin-top:16px">' + UI.icon('search') + '<h3>Nothing called "' + esc(q) + '"</h3><p>Try another word, or make it with the Lettering maker or your own picture.</p></div>' : '') +
        '</div>';
    }
    function preview(s) {
      var m = UI.modal('<div class="lb-big"><img src="' + esc(s.thumb) + '" alt=""></div><h2>' + esc(s.title) + '</h2>' +
        '<div class="ui-row" style="margin-bottom:10px"><span class="ui-badge ' + (LEVEL[s.level] || '') + '">' + esc(s.level) + '</span><span class="ui-badge">' + esc(s.category) + '</span>' +
        '<span class="ui-badge">' + UI.icon('ruler') + esc(WT.fmtLen(s.cm, 'cm')) + ' × ' + esc(WT.fmtLen(s.cm * s.h / s.w, 'cm')) + '</span></div>' +
        '<p class="muted">' + esc(s.blurb) + '</p>' + (s.credit ? '<p class="small faint">By ' + esc(s.credit) + '</p>' : '') +
        '<div class="ui-row end" style="margin-top:16px"><button class="ui-btn ghost" data-close>Close</button><button class="ui-btn primary" data-use>' + UI.icon('plus') + 'Trace this</button></div>', { wide: true });
      m.el.querySelector('[data-use]').onclick = function (e) {
        UI.busy(e.currentTarget, WT.store.create({ stencil_id: s.id, title: s.title })).then(function (p) {
          m.close(); UI.toast('Added to your studio', 'ok'); UI.go('edit', p.id);
        });
      };
    }
    view.addEventListener('click', function (e) {
      var c = e.target.closest('[data-cat]');
      if (c) { cat = c.getAttribute('data-cat'); history.replaceState(null, '', '#library' + (cat === 'All' ? '' : '/' + encodeURIComponent(cat))); draw(); return; }
      if (e.target.closest('[data-letter]')) { WT.letteringModal().then(function (p) { UI.go('edit', p.id); }); return; }
      var card = e.target.closest('[data-id]');
      if (card) preview(all.filter(function (s) { return s.id === card.getAttribute('data-id'); })[0]);
    });
    view.addEventListener('input', function (e) {
      if (!e.target.matches('[data-q]')) return;
      q = e.target.value.trim().toLowerCase();
      var pos = e.target.selectionStart;
      draw();
      var inp = view.querySelector('[data-q]'); inp.focus(); try { inp.setSelectionRange(pos, pos); } catch (err) {}
    });
    return UI.api('list_stencils').then(function (d) { all = d.stencils; cats = d.categories; draw(); WT.loadFonts(); });
  });
})();

/* ===== profile.html ===== */
(function () {
  var esc = UI.esc;
  UI.page('profile', { title: 'Your profile', auth: 'user' }, function (view, ctx) {
    var me = ctx.me;
    view.innerHTML = '<div class="ui-wrap ui-narrow"><div class="pf-head"><span class="ui-avatar">' + esc(UI.initials(me.name)) + '</span>' +
      '<div><h1>' + esc(me.name) + '</h1><div class="muted">' + esc(me.email) + (me.joined ? ' · member since ' + esc(UI.fmtDate(me.joined, { month: 'long', year: 'numeric' })) : '') + '</div></div></div>' +
      '<div class="pf-grid"><form class="ui-card ui-stack" data-name><h3>Your name</h3><label class="ui-field"><span>Shown to other people</span>' +
      '<input type="text" name="name" value="' + esc(me.name) + '" maxlength="60" required></label><button class="ui-btn primary" type="submit">Save</button></form>' +
      '<div class="ui-card ui-stack"><h3>Appearance</h3><p class="muted small">Follow your device, or pick one.</p><div data-theme-box></div>' +
      '<h3 style="margin-top:22px">Password</h3><p class="muted small">We\'ll email you a link to choose a new one.</p>' +
      '<button class="ui-btn" data-reset>' + UI.icon('mail') + 'Email me a reset link</button></div></div>' +
      '<div class="ui-card" style="margin-top:16px"><div class="pf-links">' +
      (me.is_admin ? '<a href="#admin" data-go="admin">' + UI.icon('shield') + 'Admin</a>' : '') +
      '<button data-feedback>' + UI.icon('chat') + 'Send feedback</button>' +
      '<button data-lk-open="overview">' + UI.icon('lock') + 'Privacy &amp; Terms, and your data</button>' +
      '<button data-signout-here>' + UI.icon('logout') + 'Sign out</button></div></div></div>';
    function themeBox() {
      var t = UI.theme();
      view.querySelector('[data-theme-box]').innerHTML = '<div class="ui-seg">' + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (o) {
        return '<button type="button" data-theme-pick="' + o[0] + '" class="' + (t === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
      }).join('') + '</div>';
    }
    themeBox();
    view.addEventListener('click', function (e) {
      var t = e.target.closest('[data-theme-pick]');
      if (t) { UI.setTheme(t.getAttribute('data-theme-pick')); themeBox(); UI.renderChrome(); return; }
      if (e.target.closest('[data-reset]')) {
        UI.busy(e.target.closest('[data-reset]'), UI.auth('reset', { email: me.email })).then(function (r) { UI.toast(r.message, 'ok'); });
      }
      if (e.target.closest('[data-signout-here]')) UI.auth('logout');
    });
    view.querySelector('[data-name]').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = UI.formData(e.target);
      UI.busy(e.target.querySelector('[type=submit]'), UI.api('update_profile', v.name)).then(function (r) {
        UI.setMe(r.me); ctx.me = r.me; UI.toast('Saved', 'ok');
        view.querySelector('.pf-head h1').textContent = r.me.name;
      });
    });
  });
})();

/* ===== showcase.html ===== */
(function () {
  var esc = UI.esc;
  var STATUS = { pending: ['warn', 'Waiting for approval'], approved: ['good', 'Public'], rejected: ['bad', 'Not approved'] };

  function card(p, yours) {
    return '<article class="sc-card" data-id="' + esc(p.id) + '"><button class="ph" data-open aria-label="Open ' + esc(p.title) + '"><img src="' + esc(p.thumb || '') + '" alt="" loading="lazy"></button>' +
      '<div class="bd"><h3>' + esc(p.title) + '</h3><div class="meta"><span>' + (yours ? '<span class="ui-badge ' + STATUS[p.status][0] + '">' + STATUS[p.status][1] + '</span>' : 'by ' + esc(p.by)) +
      (p.minutes ? ' · ' + esc(WT.fmtMinutes(p.minutes)) : '') + '</span>' +
      (yours ? '' : '<button class="sc-like' + (p.liked ? ' on' : '') + '" data-like aria-label="Like">' + UI.icon('heart') + '<span>' + p.likes + '</span></button>') + '</div></div></article>';
  }

  UI.page('showcase', { title: 'Showcase', nav: 'Showcase', icon: 'heart', order: 30 }, function (view, ctx) {
    var tab = ctx.args[0] === 'yours' && ctx.me ? 'yours' : 'all', sort = 'new', posts = [];
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:420px"></div></div>';

    function draw() {
      view.innerHTML = '<div class="ui-wrap"><div class="ui-page-head"><div><div class="eyebrow">Showcase</div><h1>Walls people <span class="ui-squiggle">traced</span></h1>' +
        '<p class="muted">Finished murals, signs and doodles from the WallTracer community. Yours could be next.</p></div>' +
        (ctx.me ? '<button class="ui-btn primary" data-share>' + UI.icon('camera') + 'Share your wall</button>' : '<a class="ui-btn primary" href="#auth/signup" data-go="auth/signup">Sign up to share yours</a>') + '</div>' +
        '<div class="sc-top">' + (ctx.me ? '<div class="ui-seg"><button data-tab="all" class="' + (tab === 'all' ? 'on' : '') + '">Everyone</button><button data-tab="yours" class="' + (tab === 'yours' ? 'on' : '') + '">Yours</button></div>' : '') +
        (tab === 'all' ? '<div class="ui-seg"><button data-sort="new" class="' + (sort === 'new' ? 'on' : '') + '">Newest</button><button data-sort="top" class="' + (sort === 'top' ? 'on' : '') + '">Most loved</button></div>' : '') + '</div>' +
        (posts.length ? '<div class="sc-grid">' + posts.map(function (p) { return card(p, tab === 'yours'); }).join('') + '</div>'
          : '<div class="ui-empty">' + UI.icon('camera') + '<h3>' + (tab === 'yours' ? 'You haven\'t shared a wall yet' : 'No walls yet') + '</h3><p>Finish a trace, take a photo, and share it here.</p></div>') + '</div>';
    }
    function load() {
      var call = tab === 'yours' ? UI.api('my_showcase') : UI.api('list_showcase', sort);
      return call.then(function (d) { posts = d.posts; draw(); });
    }
    function open(p) {
      var m = UI.modal('<img class="sc-big" alt="" src="' + esc(p.thumb || '') + '" data-big><h2>' + esc(p.title) + '</h2>' +
        '<p class="muted small">by ' + esc(p.by) + ' · ' + esc(UI.fmtDate(p.created)) + (p.minutes ? ' · ' + esc(WT.fmtMinutes(p.minutes)) + ' of tracing' : '') + (p.width_cm ? ' · ' + esc(WT.fmtLen(p.width_cm, 'cm')) + ' wide' : '') + '</p>' +
        (p.caption ? '<p style="white-space:pre-wrap">' + esc(p.caption) + '</p>' : '') +
        '<div class="ui-row end">' + (p.mine || (ctx.me && ctx.me.is_admin) ? '<button class="ui-btn danger sm" data-del>' + UI.icon('trash') + 'Delete</button>' : '') + '<span class="ui-spacer"></span>' +
        (p.status === 'approved' ? '<button class="sc-like' + (p.liked ? ' on' : '') + '" data-mlike>' + UI.icon('heart') + '<span>' + p.likes + '</span></button>' : '') + '</div>', { wide: true });
      UI.apiQuiet('get_showcase_photo', p.id).then(function (r) { var b = m.el.querySelector('[data-big]'); if (b && r.photo) b.src = r.photo; });
      m.el.addEventListener('click', function (e) {
        if (e.target.closest('[data-mlike]')) { like(p.id).then(function (np) { m.close(); if (np) open(np); }); }
        if (e.target.closest('[data-del]')) {
          UI.confirm({ title: 'Delete this post?', ok: 'Delete', danger: true }).then(function (y) { if (y) UI.api('delete_showcase', p.id).then(function () { m.close(); UI.toast('Deleted'); load(); }); });
        }
      });
    }
    function like(pid) {
      if (!ctx.me) { UI.toast('Sign in to like walls.'); return Promise.resolve(null); }
      return UI.apiQuiet('like_showcase', pid).then(function (r) {
        posts = posts.map(function (p) { return p.id === pid ? r.post : p; }); draw(); return r.post;
      });
    }
    function share(preset) {
      var photo = null;
      var form0 = '<h2>Share your wall</h2><p class="muted">A photo of the finished wall (not the screen). A moderator has a quick look before it goes public.</p>' +
        '<form class="ui-stack" data-sh><div class="sc-drop" data-pick>' + UI.icon('camera') + '<div><b>Choose a photo</b></div><div class="small">JPEG, PNG or WebP</div></div>' +
        '<label class="ui-field"><span>Title</span><input name="title" maxlength="80" required placeholder="e.g. Mountains over our bed"></label>' +
        '<label class="ui-field"><span>A few words <em>(optional)</em></span><textarea name="caption" maxlength="600" rows="3" placeholder="Tools, paint, tips, how long it took…"></textarea></label>' +
        '<label class="ui-field"><span>Which project? <em>(adds the time and size)</em></span><select name="project"><option value="">None</option></select></label>' +
        '<div class="ui-row end"><button type="button" class="ui-btn ghost" data-close>Cancel</button><button class="ui-btn primary" type="submit">' + UI.icon('share') + 'Share</button></div></form>';
      var m = UI.modal(form0), form = m.el.querySelector('[data-sh]'), projects = [];
      WT.store.list().then(function (d) {
        projects = d.projects.slice().sort(function (a, b) { return (b.status === 'done') - (a.status === 'done'); });
        var sel = form.querySelector('[name=project]');
        sel.innerHTML = '<option value="">None</option>' + projects.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === preset ? ' selected' : '') + '>' + esc(p.title) + (p.status === 'done' ? ' (finished)' : '') + '</option>'; }).join('');
        var pr = projects.filter(function (p) { return p.id === preset; })[0];
        if (pr && !form.title.value) form.title.value = pr.title;
      }).catch(function () {});
      form.querySelector('[data-pick]').addEventListener('click', function () {
        var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = function () {
          WT.readPicture(inp.files[0], 1800).then(function (pic) {
            if (pic.image.indexOf('data:image/png') === 0) {  // photos travel as JPEG
              return WT.loadImage(pic.image).then(function (im) { var c = WT.canvas(im.width, im.height); c.getContext('2d').drawImage(im, 0, 0); pic.image = c.toDataURL('image/jpeg', 0.88); return pic; });
            }
            return pic;
          }).then(function (pic) {
            photo = pic;
            form.querySelector('[data-pick]').innerHTML = '<img class="sc-prev" src="' + esc(pic.image) + '" alt=""><div class="small" style="margin-top:6px">Tap to choose another</div>';
          }, function (err) { UI.toast(err.message, 'error'); });
        };
        inp.click();
      });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!photo) { UI.toast('Add a photo of your wall first.', 'error'); return; }
        var v = UI.formData(form), pr = projects.filter(function (p) { return p.id === v.project; })[0];
        var data = { title: v.title, caption: v.caption, photo: photo.image, thumb: WT.thumb(document.querySelector('.sc-prev'), 520),
          minutes: pr ? pr.minutes : 0, width_cm: pr ? WT.settings(pr.settings).width_cm : 0 };
        UI.busy(form.querySelector('[type=submit]'), UI.api('post_showcase', data)).then(function (r) {
          m.close();
          UI.toast(r.post.status === 'approved' ? 'Shared! It\'s in the Showcase.' : 'Thank you! It shows here once a moderator approves it.', 'ok');
          tab = 'yours'; load();
        });
      });
    }

    view.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tab]');
      if (t) { tab = t.getAttribute('data-tab'); history.replaceState(null, '', '#showcase' + (tab === 'yours' ? '/yours' : '')); load(); return; }
      var s = e.target.closest('[data-sort]');
      if (s) { sort = s.getAttribute('data-sort'); load(); return; }
      if (e.target.closest('[data-share]')) { share(null); return; }
      var c = e.target.closest('[data-id]');
      if (!c) return;
      var p = posts.filter(function (x) { return x.id === c.getAttribute('data-id'); })[0];
      if (e.target.closest('[data-like]')) { like(p.id); return; }
      if (e.target.closest('[data-open]')) open(p);
    });
    return load().then(function () {
      if (ctx.args[0] === 'share' && ctx.me) { history.replaceState(null, '', '#showcase'); share(ctx.args[1] || null); }
    });
  });
})();

/* ===== studio.html ===== */
(function () {
  var esc = UI.esc;

  function card(p, device) {
    var s = WT.settings(p.settings), prog = WT.progress(p), g = WT.grid(p);
    return '<article class="st-card" data-id="' + esc(p.id) + '"><div style="position:relative" data-open>' + WT.thumbHtml(p) +
      (p.status === 'done' ? '<span class="ui-badge good done-badge">' + UI.icon('check') + 'Finished</span>' : '') + '</div>' +
      '<h3>' + esc(p.title) + '</h3>' +
      '<div class="meta"><span>' + UI.icon('ruler') + ' ' + esc(WT.fmtSize(p)) + '</span><span>' + esc(WT.lookLabel(s.look)) + '</span>' +
      (p.minutes ? '<span>' + UI.icon('clock') + ' ' + esc(WT.fmtMinutes(p.minutes)) + '</span>' : '') + '</div>' +
      (prog != null ? '<div class="meta" style="display:block"><div class="wt-bar"><i style="width:' + Math.round(prog * 100) + '%"></i></div>' +
        '<span class="small">' + (p.status === 'done' ? 'All traced' : (p.done || []).length + ' of ' + g.cells + ' cells traced') + '</span></div>' : '') +
      '<div class="acts"><a class="ui-btn primary sm" href="#trace/' + esc(p.id) + '" data-go="trace/' + esc(p.id) + '">' + UI.icon('headset') + 'Trace</a>' +
      '<a class="ui-btn sm" href="#edit/' + esc(p.id) + '" data-go="edit/' + esc(p.id) + '">' + UI.icon('sliders') + 'Adjust</a>' +
      (device && UI.me ? '<button class="ui-btn sm" data-move title="Save to my account">' + UI.icon('upload') + '</button>' : '') +
      '<button class="ui-btn sm icon" data-more aria-label="More">' + UI.icon('more') + '</button></div></article>';
  }

  function emptyArt() {
    return '<svg viewBox="0 0 360 260" aria-hidden="true"><rect x="10" y="10" width="340" height="200" rx="14" fill="var(--c-surface)" stroke="var(--c-line)"/>' +
      '<path d="M10 210h340" stroke="var(--c-line)" stroke-width="2"/><rect x="0" y="210" width="360" height="40" rx="8" fill="var(--c-surface-2)"/>' +
      '<g stroke="var(--c-accent)" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="6 7"><path d="M110 170c20-60 50-100 70-60s40 30 70-40"/></g>' +
      '<g stroke="var(--c-brand)" stroke-width="3" fill="none" stroke-linecap="round"><path d="M100 50v-10h10M250 40h10v10M260 170v10h-10M110 180h-10v-10"/></g>' +
      '<g transform="translate(240 120) rotate(35)"><rect x="-6" y="-46" width="12" height="70" rx="3" fill="var(--c-warn)"/><path d="M-6 24h12l-6 14z" fill="var(--c-ink)"/></g></svg>';
  }

  UI.page('studio', { title: 'Studio', nav: 'Studio', icon: 'image', order: 10 }, function (view, ctx) {
    var data = null, starters = [], nStencils = 0;
    view.innerHTML = '<div class="ui-wrap"><div class="ui-skel" style="height:120px;margin-bottom:18px"></div><div class="ui-skel" style="height:300px"></div></div>';

    function draw() {
      var d = data, me = ctx.me, list = d.projects;
      var first = me ? me.name.split(' ')[0] : null;
      view.innerHTML = '<div class="ui-wrap"><div class="st-head"><div><div class="eyebrow">Studio</div><h1>' +
        (first ? 'Hello ' + esc(first) + ', what are we <span class="ui-squiggle">tracing</span>?' : 'What are we <span class="ui-squiggle">tracing</span> today?') + '</h1></div>' +
        (list.length ? '<div class="st-stats"><span><b>' + d.stats.count + '</b>' + (d.stats.count === 1 ? 'wall' : 'walls') + '</span><span><b>' + esc(WT.fmtMinutes(d.stats.minutes)) + '</b>traced</span>' +
          '<span><b>' + d.stats.done + '</b>finished</span></div>' : '') + '</div>' +
        (!me ? '<div class="st-banner">' + UI.icon('info') + '<p><b>You\'re trying WallTracer without an account.</b> Projects stay in this browser only. ' +
          'Sign up (free) to keep them and open them on your headset.</p><a class="ui-btn accent sm" href="#auth/signup" data-go="auth/signup">Sign up free</a></div>' : '') +
        '<div class="st-new">' +
        '<button type="button" data-new="upload"><span class="ic">' + UI.icon('upload') + '</span><span><b>From your picture</b><small>A photo, a drawing, a logo. Or drop it on this page.</small></span></button>' +
        '<button type="button" data-new="library"><span class="ic">' + UI.icon('layers') + '</span><span><b>From the library</b><small>' + (nStencils || 18) + ' ready-made stencils and templates.</small></span></button>' +
        '<button type="button" data-new="lettering"><span class="ic">' + UI.icon('type') + '</span><span><b>Lettering</b><small>A name, a quote, a sign in a nice font.</small></span></button></div>' +
        (list.length ? '<div class="st-grid">' + list.map(function (p) { return card(p, d.local); }).join('') + '</div>'
          : '<div class="ui-card st-empty"><div>' + emptyArt() + '</div><div><h2>Your first wall</h2><p class="muted">Pick a picture, choose how it looks, set its real size, then open it in your headset and trace it with a pencil.</p>' +
            '<p class="small muted" style="margin:14px 0 0">Or start with one of these:</p><div class="st-starters">' + starters.slice(0, 3).map(function (s) {
              return '<button type="button" data-starter="' + esc(s.id) + '"><img src="' + esc(s.thumb) + '" alt="">' + esc(s.title) + '</button>';
            }).join('') + '</div></div></div>') +
        (d.device && d.device.length ? '<div class="st-sec"><h2>On this device</h2><button class="ui-btn sm accent" data-move-all>' + UI.icon('upload') + 'Save all ' + d.device.length + ' to my account</button></div>' +
          '<p class="muted small" style="margin-top:-6px">You made these before signing in. Save them to your account to use them anywhere.</p>' +
          '<div class="st-grid">' + d.device.map(function (p) { return card(p, true); }).join('') + '</div>' : '') +
        '<div class="st-tip">' + UI.icon('headset') + '<div><b>On your Quest:</b> open this site in the Meta Quest Browser, sign in, and press <b>Trace</b> on a project. ' +
        'Prepare projects on your computer or phone first; they\'re waiting in the headset. <a href="#guide" data-go="guide">Read the guide</a></div></div></div>';
    }

    function load() {
      return Promise.all([WT.store.list(), UI.apiQuiet('list_stencils').catch(function () { return { stencils: [] }; })]).then(function (r) {
        data = r[0]; nStencils = r[1].stencils.length;
        starters = r[1].stencils.filter(function (s) { return s.level === 'Easy' && s.category !== 'Templates'; });
        draw();
      });
    }
    function openNew(p) { UI.toast('Project created', 'ok'); UI.go('edit', p.id); }
    function find(id) { return data.projects.concat(data.device || []).filter(function (p) { return p.id === id; })[0]; }

    view.addEventListener('click', function (e) {
      var n = e.target.closest('[data-new]');
      if (n) {
        var k = n.getAttribute('data-new');
        if (k === 'library') UI.go('library');
        else if (k === 'lettering') WT.letteringModal().then(openNew);
        else WT.pickAndCreate().then(openNew, function (err) { UI.toast(err.message, 'error'); });
        return;
      }
      var st = e.target.closest('[data-starter]');
      if (st) { UI.busy(st, WT.store.create({ stencil_id: st.getAttribute('data-starter') })).then(openNew); return; }
      var op = e.target.closest('[data-open]');
      if (op) { UI.go('edit', op.closest('[data-id]').getAttribute('data-id')); return; }
      var mv = e.target.closest('[data-move]');
      if (mv) { UI.busy(mv, WT.store.moveToAccount(mv.closest('[data-id]').getAttribute('data-id'))).then(function () { UI.toast('Saved to your account', 'ok'); load(); }); return; }
      if (e.target.closest('[data-move-all]')) {
        var btn = e.target.closest('[data-move-all]'), ids = data.device.map(function (p) { return p.id; });
        UI.busy(btn, ids.reduce(function (pr, id) { return pr.then(function () { return WT.store.moveToAccount(id); }); }, Promise.resolve()))
          .then(function () { UI.toast('All saved to your account', 'ok'); load(); });
        return;
      }
      var more = e.target.closest('[data-more]');
      if (more) moreMenu(find(more.closest('[data-id]').getAttribute('data-id')));
    });

    function moreMenu(p) {
      if (!p) return;
      var m = UI.modal('<h2>' + esc(p.title) + '</h2><p class="muted small">' + esc(WT.fmtSize(p)) + ' · ' + (p.minutes ? esc(WT.fmtMinutes(p.minutes)) + ' traced · ' : '') + 'updated ' + esc(UI.ago(p.updated)) + '</p>' +
        '<div class="ui-list" style="margin-top:14px">' +
        '<button class="ui-btn block" data-a="done">' + UI.icon(p.status === 'done' ? 'refresh' : 'flag') + (p.status === 'done' ? 'Back to tracing' : 'Mark as finished') + '</button>' +
        (UI.me && !WT.isDevice(p.id) ? '<button class="ui-btn block" data-a="share">' + UI.icon('share') + 'Share a photo in the Showcase</button>' : '') +
        '<button class="ui-btn block" data-a="dup">' + UI.icon('copy') + 'Duplicate (for a second wall)</button>' +
        '<button class="ui-btn block danger" data-a="del">' + UI.icon('trash') + 'Delete</button></div>');
      m.el.addEventListener('click', function (e) {
        var a = e.target.closest('[data-a]');
        if (!a) return;
        var act = a.getAttribute('data-a');
        if (act === 'done') {
          var done = p.status !== 'done';
          UI.busy(a, WT.store.update(p.id, { status: done ? 'done' : 'tracing' })).then(function () {
            m.close(); if (done) { WT.confetti(); UI.toast('Finished! Lovely work.', 'ok'); } load();
          });
        } else if (act === 'dup') {
          UI.busy(a, WT.store.duplicate(p.id)).then(function () { m.close(); UI.toast('Copied', 'ok'); load(); });
        } else if (act === 'share') {
          m.close(); UI.go('showcase', 'share', p.id);
        } else if (act === 'del') {
          m.close();
          UI.confirm({ title: 'Delete "' + p.title + '"?', text: 'The picture, its settings and your progress are deleted. This can\'t be undone.', ok: 'Delete', danger: true })
            .then(function (yes) { if (yes) WT.store.remove(p.id).then(function () { UI.toast('Deleted'); load(); }); });
        }
      });
    }

    // drop a picture anywhere on the page
    var drop = null;
    function dragOver(e) {
      if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return;
      e.preventDefault();
      if (!drop) { drop = document.createElement('div'); drop.className = 'ui wt-drop'; drop.textContent = 'Drop your picture to start a wall'; document.body.appendChild(drop); }
    }
    function dragEnd(e) { if (drop && (!e.relatedTarget || e.type === 'drop')) { drop.remove(); drop = null; } }
    function onDrop(e) {
      if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files[0]) return;
      e.preventDefault(); dragEnd(e);
      WT.pickAndCreate(e.dataTransfer.files[0]).then(openNew, function (err) { UI.toast(err.message, 'error'); });
    }
    window.addEventListener('dragover', dragOver); window.addEventListener('dragleave', dragEnd); window.addEventListener('drop', onDrop);

    return {
      ready: load(),
      destroy: function () {
        window.removeEventListener('dragover', dragOver); window.removeEventListener('dragleave', dragEnd); window.removeEventListener('drop', onDrop);
        if (drop) drop.remove();
      }
    };
  });
})();

/* ===== trace.html ===== */
(function () {
  'use strict';
  var esc = UI.esc;
  var PANEL_W = 1024, PANEL_M = 0.56;  // menu canvas px and its width in metres

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
      toastCanvas: null, rays: {}, head: null, headQ: null, needPanel: false, restoring: false, stickLatch: {} };
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
    function artVisible() { return st.phase !== 'locked' || (st.shown && !st.blinkOff); }
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
    }
    function placeAt(pos, normal, free) {
      setPose(pos, normal, free);
      st.phase = 'adjust'; st.touchPts = []; clearTouchDots();
      applyVis(); changed();
      say(st.mode === 'xr' ? 'Placed. Grip to slide it, right stick to resize and turn. Lock it when it\'s right.' : 'Placed. Drag it to move, scroll to resize, Q / E to turn. Then lock it.');
      if (st.mode === 'xr') openPanel();
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
      if (inXR) a.push({ id: 'close', label: 'Close menu', icon: 'x' });
      a.push({ id: 'exit', label: 'Finish', icon: 'flag' });
      return a;
    }
    var RUN = {
      'm-aim': function () { st.method = 'aim'; say(st.mode === 'xr' ? 'Point at the wall and pull the trigger.' : 'Click the wall or the table.'); },
      'm-touch': function () { st.method = 'touch'; st.touchPts = []; clearTouchDots(); say('Touch the wall with the tip of a controller where the centre goes, and pull the trigger.'); },
      'm-float': function () { st.method = 'float'; placeFloat(); },
      lock: function () { lock(); }, unlock: function () { unlock(); },
      replace: function () { dropAnchor(true); st.phase = 'place'; st.method = st.mode === 'xr' && !xr.hasHitTest ? 'touch' : 'aim'; art.visible = false; applyVis(); say('Choose a new spot.'); },
      smaller: function () { resizeBy(1 / 1.04); }, bigger: function () { resizeBy(1.04); },
      turnL: function () { turnBy(-1); }, turnR: function () { turnBy(1); }, level: function () { S.rot = 0; applyOrientation(); say('Level'); },
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
      if (st.mode === 'xr') { xr.wantAnchor = true; setTimeout(function () { if (st.phase === 'locked') closePanel(); }, 900); }
      say(st.mode === 'xr' ? 'Locked. Put the controllers down and trace. A / X or a pinch of your free hand hides it.' : 'Locked. Draw on the wall with the pencil; press H to hide the picture and check.');
      haptic(null, 0.8, 90);
    }
    function unlock() { dropAnchor(true); st.phase = 'adjust'; st.blinkOff = false; applyVis(); say('Unlocked. Move it, then lock again.'); }
    function resizeBy(k) { S.width_cm = Math.max(5, Math.min(1000, S.width_cm * k)); applySize(); say(WT.fmtSize(pseudo())); }
    function turnBy(d) { S.rot = Math.max(-180, Math.min(180, Math.round((S.rot + d) * 10) / 10)); applyOrientation(); say('Turned ' + S.rot + '°'); }
    function nudge(m) { if (!st.surface) return; art.position.addScaledVector(st.surface.normal, m); say(m > 0 ? 'Pulled out 2 mm' : 'Pushed in 2 mm'); }
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
      if (st.phase !== 'locked') { say('Lock the picture first.'); return; }
      st.shown = !st.shown; st.blinkOff = false; st.blinkT = 0; applyVis(); haptic(null, 0.35, 35);
      say(st.shown ? 'Picture on' : 'Picture hidden: check your lines');
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
      var k = e.key.toLowerCase();
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
      var init = { optionalFeatures: ['local-floor', 'hand-tracking', 'hit-test', 'anchors', 'plane-detection', 'dom-overlay'] };
      if (kind === 'ar') init.domOverlay = { root: ov };
      navigator.xr.requestSession(kind === 'ar' ? 'immersive-ar' : 'immersive-vr', init).then(function (s) {
        if (!alive) { s.end(); return; }
        var feats = s.enabledFeatures;
        renderer.xr.setReferenceSpaceType(!feats || feats.indexOf('local-floor') >= 0 ? 'local-floor' : 'local');
        return renderer.xr.setSession(s).then(function () { startXR(s, kind); });
      }).catch(function (e) {
        UI.toast('Couldn\'t start the headset view: ' + (e && e.message || 'the browser said no'), 'error');
      });
    }
    function startXR(s, kind) {
      xr.session = s; st.mode = 'xr'; st.kind = kind; st.newSession = true; st.sessionMs = 0; st.sessionCells = 0;
      applyEnv();
      var feats = s.enabledFeatures;
      xr.hasHitTest = !!s.requestHitTestSource && (!feats || feats.indexOf('hit-test') >= 0);
      xr.hitSources = new Map(); xr.pendingHit = new Set(); xr.inputs = {}; xr.buttons = {}; xr.head = null;
      if (xr.hasHitTest) {
        s.requestReferenceSpace('viewer').then(function (v) { return s.requestHitTestSource({ space: v }); })
          .then(function (hs) { xr.viewerHit = hs; }).catch(function () {});
      }
      st.method = xr.hasHitTest ? 'aim' : 'touch';
      ov.innerHTML = '<div class="tr-hud"><button class="tr-x" data-endxr aria-label="Leave the headset view">' + UI.icon('x') + '</button>' +
        '<div class="ttl"><b>' + esc(P.title) + '</b><span>In the headset. Press Y or pinch-and-hold for the menu.</span></div></div>' +
        (kind === 'ar' ? '<div class="tr-bar" data-bar></div>' : '');
      if (kind === 'ar') drawBar();
      on(ov, 'beforexrselect', function (e) { if (e.target.closest && e.target.closest('.tr-bar, .tr-hud')) e.preventDefault(); });
      s.addEventListener('selectstart', function (e) { xr.selStart.set(e.inputSource, performance.now()); });
      s.addEventListener('select', function (e) { onSelect(e.inputSource); });
      s.addEventListener('end', onXREnd);
      // Back on the same wall: a saved anchor puts the picture where it was and locks it.
      var handle = null;
      try { handle = localStorage.getItem('walltracer.anchor.' + P.id); } catch (e) {}
      if (handle && s.restorePersistentAnchor) {
        xr.restoring = true; st.phase = 'locked'; art.visible = false;
        s.restorePersistentAnchor(handle).then(function (a) { xr.anchor = a; xr.anchorFresh = true; }, function () {
          xr.restoring = false; st.phase = 'place'; forgetHandle(); xr.needPanel = true;
        });
        setTimeout(function () {  // a different room, or the headset forgot it
          if (!xr.restoring || st.mode !== 'xr') return;
          xr.restoring = false; dropAnchor(true); st.phase = 'place'; art.visible = false; applyVis(); openPanel();
          say('Could not find your last spot. Place the picture again and line it up with your crosses.');
        }, 6000);
      } else { st.phase = 'place'; art.visible = false; }
      applyVis();
      xr.needPanel = st.phase === 'place';
      var ref = renderer.xr.getReferenceSpace();
      if (ref && ref.addEventListener) ref.addEventListener('reset', function () {
        if (!xr.anchor && st.phase !== 'place') say('The view was recentred. Unlock and line the picture up with your crosses again.');
      });
    }
    function onXREnd() {
      logProgress(true);
      xr.session = null; xr.viewerHit = null; xr.anchor = null; xr.hitSources = new Map(); xr.inputs = {};
      st.panel = false;
      if (xr.panelMesh) xr.panelMesh.visible = false;
      if (xr.toastMesh) xr.toastMesh.visible = false;
      Object.keys(xr.rays).forEach(function (h) { xr.rays[h].visible = false; });
      reticle.visible = false; tipDot.visible = false; clearTouchDots();
      if (!alive) return;
      st.mode = 'intro'; applyEnv(); resize();
      camera.position.set(0, 1.55, 1.1); camera.quaternion.identity();
      showSummary();
    }
    function forgetHandle() { try { localStorage.removeItem('walltracer.anchor.' + P.id); } catch (e) {} }
    function dropAnchor(forget) {
      if (xr.anchor) { try { xr.anchor.delete(); } catch (e) {} xr.anchor = null; }
      if (forget) {
        var old = null;
        try { old = localStorage.getItem('walltracer.anchor.' + P.id); } catch (e) {}
        if (old && xr.session && xr.session.deletePersistentAnchor) xr.session.deletePersistentAnchor(old).catch(function () {});
        forgetHandle();
      }
    }
    function makeAnchor(frame, ref) {
      xr.wantAnchor = false;
      if (!frame.createAnchor || typeof XRRigidTransform === 'undefined') return;
      var p = art.position, q = art.quaternion;
      frame.createAnchor(new XRRigidTransform({ x: p.x, y: p.y, z: p.z }, { x: q.x, y: q.y, z: q.z, w: q.w }), ref).then(function (a) {
        if (st.phase !== 'locked') { try { a.delete(); } catch (e) {} return; }
        dropAnchor(true);
        xr.anchor = a;
        if (a.requestPersistentHandle) a.requestPersistentHandle().then(function (h) {
          try { localStorage.setItem('walltracer.anchor.' + P.id, h); } catch (e) {}
        }).catch(function () {});
      }).catch(function () {});
    }

    function rayLine(h) {
      if (xr.rays[h]) return xr.rays[h];
      var g = new T.BufferGeometry().setFromPoints([new V3(0, 0, 0), new V3(0, 0, -1)]);
      var l = new T.Line(g, new T.LineBasicMaterial({ color: h === 'left' ? 0xffb347 : 0x00e5ff, transparent: true, opacity: 0.85, depthTest: false }));
      l.renderOrder = 30; l.frustumCulled = false; scene.add(l);
      xr.rays[h] = l; return l;
    }
    var tmpM = null, rc = null;
    function xrFrame(frame, dt) {
      var ref = renderer.xr.getReferenceSpace(), s = frame.session;
      tmpM = tmpM || new T.Matrix4(); rc = rc || new T.Raycaster();
      var vp = frame.getViewerPose(ref);
      if (vp) {
        var tp = vp.transform.position, to = vp.transform.orientation;
        xr.head = new V3(tp.x, tp.y, tp.z); xr.headQ = new Q(to.x, to.y, to.z, to.w);
      }
      if (!xr.head) return;
      if (xr.needPanel) { xr.needPanel = false; openPanel(); say(st.method === 'aim' ? 'Point at the wall and pull the trigger to place your picture.' : 'Touch the wall with a controller tip where the centre goes, and pull the trigger.'); }
      if (xr.wantAnchor) makeAnchor(frame, ref);
      if (xr.anchor) {
        var ap = frame.getPose(xr.anchor.anchorSpace, ref);
        if (ap) {
          var m = tmpM.fromArray(ap.transform.matrix);
          art.position.setFromMatrixPosition(m); art.quaternion.setFromRotationMatrix(m);
          if (xr.anchorFresh) {
            xr.anchorFresh = false; xr.restoring = false; art.visible = true;
            var nrm = new V3(0, 0, 1).applyQuaternion(art.quaternion);
            st.surface = { normal: nrm, point: art.position.clone(), horizontal: Math.abs(nrm.y) > 0.85, free: false };
            S.rot = S.rot || 0; applyVis();
            say('Back where you left it. Press A or X to hide or show.');
          }
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
        var inp = xr.inputs[h] = { src: src, origin: origin, dir: dir, isHand: !!src.hand, hit: null, panelHit: null, artHit: null };
        // surface under this ray
        if (xr.hasHitTest && st.phase === 'place') {
          var hs = xr.hitSources.get(src);
          if (!hs && !xr.pendingHit.has(src)) {
            xr.pendingHit.add(src);
            s.requestHitTestSource({ space: src.targetRaySpace }).then(function (srcRef) { return function (x) { xr.hitSources.set(srcRef, x); }; }(src)).catch(function () {});
          }
          var res = hs ? frame.getHitTestResults(hs) : [];
          if (res.length) {
            var hp = res[0].getPose(ref);
            if (hp) {
              var hm = new T.Matrix4().fromArray(hp.transform.matrix);
              inp.hit = { pos: new V3().setFromMatrixPosition(hm), normal: new V3(hm.elements[4], hm.elements[5], hm.elements[6]).normalize() };
            }
          }
        }
        rc.set(origin, dir);
        if (st.panel && xr.panelMesh) {
          var ph = rc.intersectObject(xr.panelMesh, false)[0];
          if (ph) inp.panelHit = { uv: ph.uv, dist: ph.distance };
        }
        if (art.visible && artMesh.visible) {
          var ah = rc.intersectObject(artMesh, false)[0];
          if (ah) inp.artHit = { uv: ah.uv, dist: ah.distance };
        }
        // ray drawing: while placing/adjusting or with the menu open; hands only with the menu open
        var ray = rayLine(h), showRay = st.panel || (!inp.isHand && st.phase !== 'locked');
        ray.visible = showRay;
        if (showRay) {
          var len = inp.panelHit ? inp.panelHit.dist : inp.hit ? origin.distanceTo(inp.hit.pos) : inp.artHit ? inp.artHit.dist : 1.5;
          ray.position.copy(origin); ray.quaternion.setFromUnitVectors(new V3(0, 0, -1), dir); ray.scale.set(1, 1, len);
        }
        if (src.gamepad && !inp.isHand) pad(src, h, inp, dt);
      }
      Object.keys(xr.rays).forEach(function (h) { if (!seen[h]) xr.rays[h].visible = false; });
      Object.keys(xr.inputs).forEach(function (h) { if (!seen[h]) delete xr.inputs[h]; });
      // placing: reticle + ghost follow the best hit (right hand first, then left, then gaze)
      if (st.phase === 'place') {
        var best = null, pick = (xr.inputs.right && xr.inputs.right.hit) ? xr.inputs.right : (xr.inputs.left && xr.inputs.left.hit) ? xr.inputs.left : null;
        if (pick) best = pick.hit;
        else if (xr.viewerHit && st.method === 'aim') {
          var vr = frame.getHitTestResults(xr.viewerHit);
          if (vr.length) { var vpz = vr[0].getPose(ref); if (vpz) { var vm = new T.Matrix4().fromArray(vpz.transform.matrix); best = { pos: new V3().setFromMatrixPosition(vm), normal: new V3(vm.elements[4], vm.elements[5], vm.elements[6]).normalize() }; } }
        }
        if (st.method === 'aim' && best) {
          reticle.visible = true; reticle.position.copy(best.pos);
          reticle.quaternion.setFromUnitVectors(new V3(0, 0, 1), best.normal);
          setPose(best.pos, best.normal, false); artMesh.visible = true;
          xr.lastBest = best;
        } else { reticle.visible = false; if (st.method !== 'float') art.visible = false; }
        var tipSrc = xr.inputs.right || xr.inputs.left;
        tipDot.visible = st.method === 'touch' && !!tipSrc && !tipSrc.isHand;
        if (tipDot.visible) tipDot.position.copy(tipSrc.origin);
      } else { reticle.visible = false; tipDot.visible = false; }
      if (st.panel) hoverPanel();
      followToast(dt);
    }
    function pad(src, h, inp, dt) {
      var gp = src.gamepad, prev = xr.buttons[h] || [], now = [], b = gp.buttons;
      for (var i = 0; i < b.length; i++) now[i] = !!(b[i] && b[i].pressed);
      function down(k) { return now[k] && !prev[k]; }
      if (down(4)) toggleShown();                                  // A / X
      if (down(5)) { if (h === 'left') togglePanel(); else { cycleOpacity(); changed(); } }   // Y menu, B opacity
      if (down(3)) { if (h === 'left') act('grid'); else { cycleLook(); } }                    // stick clicks
      // grip: slide the picture along the wall
      if (st.phase === 'adjust') {
        if (down(1)) xr.grab = { h: h, start: inp.origin.clone(), from: art.position.clone() };
        if (xr.grab && xr.grab.h === h) {
          if (!now[1]) { xr.grab = null; st.surface.point.copy(art.position); }
          else {
            var dlt = inp.origin.clone().sub(xr.grab.start);
            if (st.surface && !st.surface.free) dlt.projectOnPlane(st.surface.normal);
            art.position.copy(xr.grab.from).add(dlt);
          }
        }
      }
      var ax = gp.axes.length >= 4 ? gp.axes[2] : (gp.axes[0] || 0), ay = gp.axes.length >= 4 ? gp.axes[3] : (gp.axes[1] || 0);
      if (Math.abs(ax) < 0.2) ax = 0; if (Math.abs(ay) < 0.2) ay = 0;
      if (st.phase === 'adjust' && (ax || ay)) {
        if (h !== 'left') {
          st.dirty = true;
          if (ay) { S.width_cm = Math.max(5, Math.min(1000, S.width_cm * (1 - ay * dt * 0.7))); applySize(); }
          if (ax) { S.rot = Math.max(-180, Math.min(180, S.rot + ax * dt * 20)); if (Math.abs(S.rot) < 0.6) S.rot = 0; applyOrientation(); }
          throttleSay(WT.fmtSize(pseudo()) + (S.rot ? ' · turned ' + Math.round(S.rot) + '°' : ''));
        } else if (ay && st.surface) { art.position.addScaledVector(st.surface.normal, -ay * dt * 0.03); throttleSay('Moving in and out'); }
      }
      if (st.phase === 'locked' && st.spot && h === 'left') {
        var latch = xr.stickLatch[h];
        if (!latch && Math.abs(ax) > 0.7) { moveSpot(ax > 0 ? 1 : -1); xr.stickLatch[h] = true; }
        else if (!latch && Math.abs(ay) > 0.7) { moveSpot((ay > 0 ? 1 : -1) * WT.grid(pseudo()).cols); xr.stickLatch[h] = true; }
        else if (!ax && !ay) xr.stickLatch[h] = false;
      }
      xr.buttons[h] = now;
    }
    var sayT = 0;
    function throttleSay(m) { var n = performance.now(); if (n - sayT > 250) { sayT = n; say(m); } }
    function onSelect(src) {
      var h = src.handedness || 'none', inp = xr.inputs[h];
      var held = performance.now() - (xr.selStart.get(src) || performance.now());
      if (src.hand && h === S.pencil) return;                       // the pencil hand's pinches are ignored
      if (inp && st.panel && inp.panelHit) { pressPanel(inp.panelHit.uv); return; }
      if (src.hand && held > 650) { togglePanel(); return; }       // long pinch: menu
      if (st.phase === 'place') {
        if (st.method === 'aim') {
          var hit = (inp && inp.hit) || (src.hand ? xr.lastBest : null) || (xr.viewerHit ? xr.lastBest : null);
          if (hit) placeAt(hit.pos, hit.normal, false); else say('No surface there. Aim at the wall, or choose Touch 3 points in the menu.');
        } else if (st.method === 'touch' && inp && !inp.isHand) addTouchPoint(inp.origin);
        else if (st.method === 'float') placeFloat();
        return;
      }
      if (st.phase === 'locked') {
        if (src.hand) { toggleShown(); return; }
        if (S.grid && inp && inp.artHit) { cellAtUv(inp.artHit.uv); return; }
      }
      if (!st.panel) openPanel();
    }

    /* the floating menu in the headset (a canvas on a plane) */
    function panelLayout(list) {
      var cols = 4, bw = 228, bh = 92, gap = 14, top = 150, rows = Math.ceil(list.length / cols);
      var H = top + rows * (bh + gap) + 24;
      return { cols: cols, bw: bw, bh: bh, gap: gap, top: top, H: H, left: (PANEL_W - (cols * bw + (cols - 1) * gap)) / 2 };
    }
    function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    function drawPanel(hover) {
      var list = actions(), L = panelLayout(list);
      if (!xr.panelCanvas) xr.panelCanvas = WT.canvas(PANEL_W, L.H);
      var c = xr.panelCanvas;
      if (c.height !== L.H) c.height = L.H;
      var g = c.getContext('2d');
      g.clearRect(0, 0, PANEL_W, L.H);
      g.fillStyle = 'rgba(250, 247, 242, .97)'; roundRect(g, 4, 4, PANEL_W - 8, L.H - 8, 40); g.fill();
      g.fillStyle = '#2a2522'; g.font = '600 46px Fraunces, Georgia, serif'; g.textBaseline = 'alphabetic';
      g.fillText(P.title.length > 30 ? P.title.slice(0, 29) + '…' : P.title, 40, 70);
      g.fillStyle = '#6c6158'; g.font = '500 27px Inter, Arial, sans-serif';
      var sub = st.phase === 'place' ? (st.method === 'touch' ? 'Touch the wall with a controller tip: centre first, then 2 more spots.' : st.method === 'aim' ? 'Point at the wall and pull the trigger.' : 'Pick a way to place it.')
        : st.phase === 'adjust' ? WT.fmtSize(pseudo()) + ' · grip to slide · right stick: size and turn'
          : 'A / X or a free-hand pinch: hide / show · ' + WT.fmtSize(pseudo());
      g.fillText(sub, 40, 116);
      xr.panelButtons = [];
      list.forEach(function (a, i) {
        var col = i % L.cols, row = Math.floor(i / L.cols), x = L.left + col * (L.bw + L.gap), y = L.top + row * (L.bh + L.gap);
        var isHover = hover === a.id;
        g.fillStyle = a.primary ? '#c4552d' : a.on ? '#d8ece8' : isHover ? '#ece4d8' : '#f1ebe2';
        roundRect(g, x, y, L.bw, L.bh, 24); g.fill();
        if (isHover) { g.lineWidth = 5; g.strokeStyle = a.primary ? '#7d2f15' : '#2f8f83'; g.stroke(); }
        g.fillStyle = a.primary ? '#ffffff' : a.on ? '#1f6b62' : '#2a2522';
        g.font = '600 ' + (a.label.length > 14 ? 25 : 29) + 'px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(a.label, x + L.bw / 2, y + L.bh / 2 + 1);
        g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        xr.panelButtons.push({ id: a.id, x: x, y: y, w: L.bw, h: L.bh });
      });
      if (!xr.panelMesh) {
        var t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
        xr.panelMesh = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, toneMapped: false }));
        xr.panelMesh.renderOrder = 40; scene.add(xr.panelMesh);
      }
      xr.panelMesh.material.map.needsUpdate = true;
      xr.panelMesh.scale.set(PANEL_M, PANEL_M * L.H / PANEL_W, 1);
      xr.panelHover = hover || null;
    }
    function openPanel() {
      if (st.mode !== 'xr' || !xr.head) { xr.needPanel = true; return; }
      st.panel = true; drawPanel();
      var fwd = new V3(0, 0, -1).applyQuaternion(xr.headQ); fwd.y = 0; if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1); fwd.normalize();
      var pos = xr.head.clone().addScaledVector(fwd, 0.6); pos.y = xr.head.y - 0.18;
      xr.panelMesh.position.copy(pos);
      xr.panelMesh.lookAt(xr.head.x, xr.head.y - 0.05, xr.head.z);
      xr.panelMesh.visible = true;
    }
    function closePanel() { st.panel = false; if (xr.panelMesh) xr.panelMesh.visible = false; }
    function togglePanel() { if (st.panel) closePanel(); else openPanel(); }
    function buttonAt(uv) {
      var c = xr.panelCanvas, x = uv.x * PANEL_W, y = (1 - uv.y) * c.height;
      return xr.panelButtons.filter(function (b) { return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; })[0] || null;
    }
    function hoverPanel() {
      var hov = null;
      ['right', 'left', 'none'].forEach(function (h) { var i = xr.inputs[h]; if (!hov && i && i.panelHit) { var b = buttonAt(i.panelHit.uv); if (b) hov = b.id; } });
      if (hov !== xr.panelHover) drawPanel(hov);
    }
    function pressPanel(uv) {
      var b = buttonAt(uv);
      if (!b) return;
      haptic(null, 0.3, 30);
      act(b.id);
    }
    /* a line of text that floats below your view for a moment */
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
      var fwd = new V3(0, 0, -1).applyQuaternion(xr.headQ), want = xr.head.clone().addScaledVector(fwd, 0.75);
      want.y -= 0.22;
      if (xr.toastFresh) { xr.toastMesh.position.copy(want); xr.toastFresh = false; } else xr.toastMesh.position.lerp(want, Math.min(1, dt * 4));
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
    function keysHtml() {
      return '<div class="tr-keys"><div><h4>' + UI.icon('headset') + 'Controllers</h4><ul>' +
        '<li><b>Trigger</b>: place it / press a menu button</li><li><b>Grip</b> (hold): slide it on the wall</li><li><b>Right stick</b>: resize ↕, turn ↔</li>' +
        '<li><b>A or X</b>: hide / show</li><li><b>B</b>: opacity · <b>Y</b>: menu</li></ul></div>' +
        '<div><h4>' + UI.icon('hand') + 'Hands (controllers down)</h4><ul><li><b>Pinch</b> with your free hand: hide / show</li>' +
        '<li><b>Pinch and hold</b>: menu</li><li>Your pencil hand\'s pinches are ignored</li><li>Blink mode peeks for you</li></ul></div>' +
        '<div><h4>' + UI.icon('grid') + 'Keyboard (this screen)</h4><ul><li><span class="wt-kbd">H</span> hide · <span class="wt-kbd">L</span> lock</li>' +
        '<li><span class="wt-kbd">G</span> grid · <span class="wt-kbd">S</span> spotlight · <span class="wt-kbd">D</span> square done</li>' +
        '<li><span class="wt-kbd">Q</span> <span class="wt-kbd">E</span> turn · scroll: size / zoom</li><li><span class="wt-kbd">M</span> look · <span class="wt-kbd">O</span> opacity</li></ul></div></div>';
    }
    function showIntro(sup) {
      st.mode = 'intro';
      var p = pseudo();
      ov.innerHTML = '<div class="tr-intro"><div class="ui-card tr-card">' +
        '<div class="head">' + WT.thumbHtml(P) + '<div><div class="eyebrow">Ready to trace</div><h1>' + esc(P.title) + '</h1>' +
        '<div class="ui-row"><span class="ui-badge">' + UI.icon('ruler') + esc(WT.fmtSize(p)) + '</span><span class="ui-badge">' + esc(WT.lookLabel(S.look)) + '</span>' +
        (P.minutes ? '<span class="ui-badge">' + UI.icon('clock') + esc(WT.fmtMinutes(P.minutes)) + ' so far</span>' : '') + '</div></div></div>' +
        '<div class="tr-go">' +
        (sup.ar ? '<button class="ui-btn primary lg" data-xr="ar">' + UI.icon('headset') + '<span>Start on the wall<small>Passthrough: your real wall with the picture on it.</small></span></button>' : '') +
        (sup.vr && !sup.ar ? '<button class="ui-btn primary lg" data-xr="vr">' + UI.icon('headset') + '<span>Start in VR<small>This headset has no passthrough here, so you\'ll see the practice room.</small></span></button>' : '') +
        '<button class="ui-btn lg' + (sup.ar || sup.vr ? '' : ' primary') + '" data-flat>' + UI.icon('play') + '<span>Practise in the virtual room<small>Place, lock and trace with the mouse or your finger, right here.</small></span></button>' +
        '</div>' +
        (!sup.ar && !sup.vr ? '<p class="ui-note" style="margin-top:12px">To trace a real wall, open this page on a <b>Meta Quest</b> (3, 3S, Pro or 2) in the Meta Quest Browser and sign in. Android phones with AR work too, on a tripod.</p>' : '') +
        keysHtml() +
        '<div class="ui-row" style="margin-top:18px"><a class="ui-btn ghost sm" href="#edit/' + esc(P.id) + '" data-go="edit/' + esc(P.id) + '">' + UI.icon('sliders') + 'Adjust look and size</a>' +
        '<a class="ui-btn ghost sm" href="#studio" data-go="studio">' + UI.icon('back') + 'Studio</a><a class="ui-btn ghost sm" href="#guide" data-go="guide">' + UI.icon('info') + 'Guide</a></div>' +
        '</div></div>';
    }
    function showSummary() {
      st.mode = 'intro';
      var mins = st.sessionMs / 60000, g = WT.grid(pseudo());
      ov.innerHTML = '<div class="tr-intro"><div class="ui-card tr-card"><div class="tr-sum"><div class="eyebrow">Session done</div>' +
        '<div class="big">' + (mins >= 1 ? esc(WT.fmtMinutes(mins)) : 'A quick one') + '</div><p class="muted">' +
        (S.grid ? (P.done || []).length + ' of ' + g.cells + ' squares traced' : 'traced on ' + esc(P.title)) + ' · ' + esc(WT.fmtMinutes((P.minutes || 0) + st.activeMs / 60000)) + ' in total</p></div>' +
        '<div class="tr-go"><button class="ui-btn primary lg" data-again>' + UI.icon('refresh') + 'Keep tracing</button>' +
        (P.status !== 'done' ? '<button class="ui-btn lg" data-finished>' + UI.icon('flag') + 'It\'s finished!</button>' : '') +
        '<a class="ui-btn lg" href="#studio" data-go="studio">' + UI.icon('back') + 'Back to the studio</a></div></div></div>';
    }
    function startFlat() {
      st.mode = 'flat'; st.newSession = true; st.sessionMs = 0; st.sessionCells = 0;
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
      state: function () { return { mode: st.mode, phase: st.phase, shown: st.shown, spot: st.spot, grid: S.grid, width: S.width_cm, opacity: S.opacity, look: S.look, done: (P.done || []).slice(), activeMs: st.activeMs, visible: !!(artMesh && art.visible && artMesh.visible) }; },
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
        if (xr.session) { try { xr.session.end(); } catch (e) {} }
        listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
        if (renderer) { renderer.setAnimationLoop(null); renderer.dispose(); }
        clearTimeout(toastTimer);
        if (window.WT_TRACE) delete window.WT_TRACE;
      }
    };
  });
})();
