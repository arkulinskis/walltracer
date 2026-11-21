/* Smoke test (tools/ui_test.py runs it): every page address opens without errors, is not empty and doesn't scroll
   sideways. Signed out: landing, sign in / up, studio, library (+ a category), showcase, guide, then a project made in
   this browser (a stencil from the library) in the editor and in the tracing session (practice room).
   As a new member: studio, library, showcase (+ yours), profile, an account project in the editor and the tracing
   session. As admin (admin@example.com becomes admin on first sign-in): every Admin tab.
   Python/JS errors are caught by ui_test.py from the browser log. Resolves to {ok, log}. */
(async function () {
  const log = [], bad = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(fn, what, ms) {
    const end = Date.now() + (ms || 20000);
    while (Date.now() < end) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(150); }
    throw new Error('timed out waiting for: ' + what);
  }
  const $ = (s) => document.querySelector(s), $$ = (s) => Array.from(document.querySelectorAll(s));
  const errs = [];
  window.addEventListener('error', (e) => errs.push(String(e.message || e)));
  function type(input, value) {
    input.focus(); input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function button(re, root) { return $$((root || '') + ' button').find((b) => re.test(b.textContent) && b.offsetParent !== null); }
  async function open(hash, expect, opts) {
    opts = opts || {};
    if (location.hash !== hash) window.UI_READY = false;
    location.hash = hash;
    await until(() => window.UI_READY && location.hash === hash, hash, 60000);
    await sleep(opts.wait || 800);
    const main = $(opts.root || '.ui-main');
    const text = main ? main.innerText.trim() : '';
    const w = document.documentElement.scrollWidth, vw = screen.width <= 500 ? screen.width : window.innerWidth;
    const problems = [];
    if (text.length < 30) problems.push('empty page');
    if (expect && !new RegExp(expect.source, 'i').test(text)) problems.push('missing ' + expect);
    if (w > vw + 1) problems.push('scrolls sideways (' + w + ' > ' + vw + ')');
    if (errs.length) problems.push('errors: ' + errs.splice(0).join(' / '));
    if (problems.length) bad.push(hash + ': ' + problems.join('; '));
    log.push((problems.length ? 'BAD  ' : 'ok   ') + hash);
  }
  async function signUp(name, email, password) {
    location.hash = '#auth/signup';
    await until(() => window.UI_READY && $$('.au-card input').length >= 3, 'sign-up form');
    await sleep(400);
    const inputs = $$('.au-card input[type=text], .au-card input[type=email], .au-card input[type=password]');
    type(inputs[0], name); type(inputs[1], email); type(inputs[2], password);
    const tick = $('.au-card input[type=checkbox]'); if (tick && !tick.checked) tick.click();
    button(/Create account/, '.au-card .anvil-role-btn-block').click();
    const end = Date.now() + 30000;
    while (Date.now() < end) {
      if (location.hash.indexOf('#studio') === 0 && window.UI_READY) return true;
      const msg = $('.au-card .anvil-role-msg-error');
      if (msg && msg.offsetParent !== null && msg.textContent.trim()) { log.push('sign-up said: ' + msg.textContent.trim()); return false; }
      await sleep(200);
    }
    log.push('sign-up: still on ' + location.hash);
    return false;
  }
  async function signIn(email, password) {
    location.hash = '#auth';
    await until(() => window.UI_READY && $$('.au-card input[type=password]').length, 'sign-in form');
    await sleep(400);
    type($('.au-card input[type=email]'), email); type($('.au-card input[type=password]'), password);
    button(/Sign in/, '.au-card .anvil-role-btn-block').click();
    await until(() => location.hash.indexOf('#studio') === 0 && window.UI_READY, 'signed in as ' + email, 30000);
  }
  async function signOut() {
    location.hash = '#profile';
    await until(() => window.UI_READY && location.hash === '#profile' && button(/Sign out/, '.pf-links'), 'profile');
    await sleep(300);
    button(/Sign out/, '.pf-links').click();
    await until(() => {
      const a = $('.anvil-role-avatar button');
      return location.hash === '#landing' && window.UI_READY && (!a || a.offsetParent === null);
    }, 'signed out');
    await sleep(500);
  }
  async function newProject() {  // a project from the first stencil, through the engines' own store (account or browser)
    const d = await UI.api('list_stencils');
    const p = await WT.store.create({ stencil_id: d.stencils[0].id });
    return p.id;
  }
  async function engines(id, who) {
    await open('#edit/' + encodeURIComponent(id), /Trace on the wall/, { wait: 1500 });
    if (!$('.wt-screen-host canvas')) bad.push(who + ' #edit: no preview canvas');
    // vector tracing (wt-vector.js): six looks, Shapes styles, smooth lines, Download SVG, a valid SVG file
    if ($$('[data-look]').length !== 6) bad.push(who + ' #edit: expected 6 looks, got ' + $$('[data-look]').length);
    if (!window.ImageTracer || !WT.vector) bad.push(who + ' #edit: vector tracing not loaded');
    else {
      $('[data-look="shapes"]').click();
      await until(() => $$('[data-trace]').length === 3 && $('[data-svg]'), 'Shapes styles + Download SVG');
      $('[data-trace="photo"]').click();
      await until(() => ($('[data-trace="photo"]') || {}).className === 'on', 'Photo style on');
      $('[data-look="outline"]').click();
      await until(() => $('[data-set="smooth"]') && $('[data-svg]'), 'Outline smooth toggle');
      const pic = await WT.store.get(id), im = await WT.loadImage(pic.image);
      for (const look of ['outline', 'lines', 'stencil', 'shapes']) {
        const svg = WT.vector.svg(im, { look: look, width_cm: 80 }, 'test');
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
        if (doc.getElementsByTagName('parsererror').length || !/<path /.test(svg) || !/width="80cm"/.test(svg)) bad.push(who + ' SVG for ' + look + ' is not valid');
      }
      $('[data-look="lines"]').click();
      await sleep(600);
    }
    // no-headset ways (wt-flat.js): projector & lightbox, see it on my wall, print at real size
    await open('#project/' + encodeURIComponent(id), /corners|Lock/, { root: '.wt-screen-host', wait: 1200 });
    if ($$('.pin-h').length !== 4 || !/matrix3d/.test(($('.pj [data-art]') || { style: {} }).style.transform)) bad.push(who + ' #project: no corner pin');
    await open('#mockup/' + encodeURIComponent(id), /photo of your wall/i, { wait: 800 });
    await open('#print/' + encodeURIComponent(id), /across/i, { wait: 1200 });
    if (!$('[data-prev]') || !window.WT_FLAT.state().pages) bad.push(who + ' #print: no page plan');
    await open('#trace/' + encodeURIComponent(id), /practi|room|wall/i, { root: '.wt-screen-host', wait: 2000 });
    const head = $('.ui-header');
    if (head && head.offsetParent !== null) bad.push(who + ' #trace: the header should be hidden');
    // the three steps in the practice room: 1 place + size, 2 push a corner in / out, 3 look + opacity
    const flatBtn = $('[data-flat]');
    if (!flatBtn) { bad.push(who + ' #trace: no practice-room button'); return; }
    flatBtn.click();
    await until(() => window.WT_TRACE && WT_TRACE.state().mode === 'flat', 'practice room');
    if (!WT_TRACE.placeAt(0.5, 0.45)) { bad.push(who + ' #trace: could not place on the wall'); return; }
    let s = WT_TRACE.state();
    if (s.step !== 1 || s.phase !== 'adjust') bad.push(who + ' trace: not on step 1 after placing (' + s.phase + ')');
    if (!$('[data-act="step2"]') || $('[data-act="grid"]')) bad.push(who + ' trace step 1: wrong buttons');
    $('[data-act="step2"]').click(); await sleep(150);
    s = WT_TRACE.state();
    if (s.step !== 2 || s.handles !== 9) bad.push(who + ' trace step 2: ' + JSON.stringify({ step: s.step, handles: s.handles }));
    WT_TRACE.select('tl'); $('[data-act="out"]').click(); $('[data-act="out"]').click(); await sleep(100);
    s = WT_TRACE.state();
    if (Math.round(s.fit[0] * 1000) !== 4 || s.fit[1] !== 0) bad.push(who + ' trace step 2: top-left corner not pulled out 4 mm: ' + JSON.stringify(s.fit));
    WT_TRACE.select('b'); $('[data-act="in"]').click(); await sleep(100);
    s = WT_TRACE.state();
    if (Math.round(s.fit[2] * 1000) !== -2 || Math.round(s.fit[3] * 1000) !== -2) bad.push(who + ' trace step 2: bottom edge not pushed in: ' + JSON.stringify(s.fit));
    $('[data-act="step3"]').click(); await sleep(150);
    s = WT_TRACE.state();
    if (s.step !== 3 || s.handles !== 0) bad.push(who + ' trace step 3: ' + JSON.stringify({ step: s.step, handles: s.handles }));
    if (Math.round(s.fit[0] * 1000) !== 4) bad.push(who + ' trace step 3: the corner fit was lost');
    const op = s.opacity;
    $('[data-act="opdown"]').click(); await sleep(100);
    if (!(WT_TRACE.state().opacity < op)) bad.push(who + ' trace step 3: Fainter did nothing');
    const look0 = WT_TRACE.state().look;
    $('[data-act="look"]').click(); await sleep(400);
    if (WT_TRACE.state().look === look0) bad.push(who + ' trace step 3: the Look button does nothing');
    WT_TRACE.act('look-lines'); await sleep(300);
    if (WT_TRACE.state().look !== 'lines') bad.push(who + ' trace step 3: the headset look buttons do nothing');
    if ($('[data-act="grid"]')) bad.push(who + ' trace step 3: extra tools should wait behind More tools');
    $('[data-act="more"]').click(); await sleep(100);
    if (!$('[data-act="grid"]')) bad.push(who + ' trace step 3: More tools shows no grid');
    $('[data-act="unlock"]').click(); await sleep(100);
    if (WT_TRACE.state().step !== 2) bad.push(who + ' trace: Back to step 2 failed');
  }
  try {
    // ---- signed out
    await open('#landing', /Your headset is the projector/);
    if (!$('[data-prepsto-open]') || !/arkvital\.com/.test(document.body.innerText) || !/addanapp\.com/.test(document.body.innerText)) bad.push('footer links missing');
    if (!$('.ytf-cover')) bad.push('#landing: no Watch section');
    await open('#auth', /Sign in/);
    await open('#auth/signup', /Create account/);
    await open('#studio', /tracing/);
    await open('#library', /Lettering maker/);
    const chip = $$('.anvil-role-wt-chip button').find((b) => b.textContent.trim() !== 'All');
    if (chip) { chip.click(); await sleep(600); } else bad.push('#library: no category chips');
    const card = $('.lb-card:not(.letter)');
    if (card) {
      card.click();
      await until(() => button(/Trace this/), 'stencil preview', 15000);
      button(/Close/, '.wt-dialog').click();
      await sleep(600);
    } else bad.push('#library: no stencils');
    await open('#showcase', /Walls people/);
    await open('#guide', /What you need/);
    await open('#guide/controls', /Controller map/);
    const devId = await newProject();
    if (!/^d_/.test(devId)) bad.push('guest project is not a device project: ' + devId);
    await open('#studio', /Adjust/);
    if (!$('.st-card')) bad.push('#studio: the new browser project is not listed');
    await engines(devId, 'guest');

    // ---- a new member
    const ok = await signUp('Smoke Tester', 'smoke' + Date.now() + '@example.com', 'Wt-' + Math.random().toString(36).slice(2) + '-Kq7');
    if (!ok) throw new Error('sign-up failed');
    await open('#studio', /On this device/);
    await open('#library', /Lettering maker/);
    await open('#showcase', /Share your wall/);
    await open('#showcase/yours', /shared/);
    await open('#profile', /Your name/);
    const accId = await newProject();
    await open('#studio', /Trace/);
    await engines(accId, 'member');
    await signOut();

    // ---- admin
    const pw = 'Wt-smoke-Adm1n-7Qx';
    const fresh = await signUp('Arkadi Admin', 'admin@example.com', pw);
    if (!fresh) await signIn('admin@example.com', pw);
    for (const t of ['overview', 'showcase', 'stencils', 'feedback', 'users', 'demo']) {
      await open('#admin/' + t, /Only admins/);
      if (t === 'stencils' && !$$('.ad-st-wrap .row').length) bad.push('#admin/stencils: no stencils listed');
    }
    await signOut();

    log.push(bad.length ? 'PROBLEMS: ' + bad.join(' | ') : 'PASSED');
    return { ok: !bad.length, log: log };
  } catch (e) {
    log.push(String(e && e.message || e));
    if (bad.length) log.push('PROBLEMS: ' + bad.join(' | '));
    return { ok: false, log: log };
  }
})();
