/* FrameSeal · landing page interactions (no network, respects reduced motion) */
(function () {
  'use strict';
  const FSX = window.FS, $ = (id) => document.getElementById(id);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  FSX.bindNetChip($('net'));
  FSX.registerSW();

  const nav = $('nav');
  const onScroll = () => nav.classList.toggle('scrolled', scrollY > 10);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* count-up */
  function countUp(el) {
    const end = +el.dataset.count, fmt = (n) => n.toLocaleString('en-US');
    if (reduce) { el.textContent = fmt(end); return; }
    const t0 = performance.now(), dur = 1400;
    const step = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(Math.round(end * e)); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  /* scroll reveal */
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in');
    e.target.querySelectorAll('[data-count]').forEach(countUp);
    io.unobserve(e.target);
  }), { threshold: 0.18, rootMargin: '0px 0px -40px 0px' }) : null;
  document.querySelectorAll('.reveal').forEach((el) => { if (io && !reduce) io.observe(el); else { el.classList.add('in'); } });

  /* duo mini scenes */
  const pass = FSX.sceneFrame(7, { zoom: 1.12 });
  const wiped = FSX.sceneFrame(8, { wiped: true, zoom: 1.12 });
  const gal = (() => { const c = FSX.sceneFrame(9); const x = c.getContext('2d'); x.fillStyle = 'rgba(255,190,90,.22)'; x.fillRect(0, 0, c.width, c.height); return c; })();
  const draw = (cv, src) => cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
  draw($('duoPhone'), pass);
  document.querySelectorAll('canvas[data-scene]').forEach((cv) => draw(cv, cv.dataset.scene === 'gal' ? gal : cv.dataset.scene === 'wiped' ? wiped : pass));

  /* hero phone: auto-plays the four outcomes */
  const cv = $('mCanvas'), ctx = cv.getContext('2d');
  const base = FSX.sceneFrame(null);
  const v = { src: base, zoom: 1, dx: 0, dy: 0 };
  const rows = [...document.querySelectorAll('.mck')];
  let token = 0, visible = true;
  function render() {
    const W = 480, H = 360, z = v.zoom;
    ctx.drawImage(v.src, (W - W / z) / 2 + v.dx, (H - H / z) / 2 + v.dy, W / z, H / z, 0, 0, W, H);
  }
  (function loop() { if (visible) render(); requestAnimationFrame(loop); })();
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(cv);
  const sleep = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));
  function row(i, st, em) { const r = rows[i]; r.className = 'mck ' + (st || ''); r.querySelector('i').textContent = st === 'pass' ? '✓' : st === 'fail' ? '✕' : ''; r.querySelector('em').textContent = em || ''; }
  function stamp(show, ok) { const s = $('mStamp'); s.textContent = ok ? 'SEALED' : 'REFUSED'; s.className = 'mstamp ' + (ok ? 'pass' : 'fail') + (show ? ' show' : ''); }
  function res(cls, big, small) { const r = $('mRes'); r.className = 'mres ' + (cls || ''); r.innerHTML = big + '<small>' + (small || '&nbsp;') + '</small>'; }
  function badges(l, r, warn) { $('mL').textContent = l; const b = $('mR'); b.textContent = r; b.className = 'mbadge r' + (warn ? ' warn' : ''); }
  async function walk(my) {
    const T = reduce ? 0 : 1500;
    const t0 = performance.now();
    while (performance.now() - t0 < T) { if (my !== token) return false; const t = performance.now() - t0, p = t / T; v.zoom = 1 + 0.12 * p; v.dy = Math.sin(t / 110) * 3 * (1 - p); await new Promise(requestAnimationFrame); }
    v.zoom = 1.12; v.dy = 0; return true;
  }
  const order = ['PASS', 'GALLERY', 'SPOOF', 'EDIT'];
  async function play(k) {
    const my = ++token, alive = () => my === token;
    document.querySelectorAll('#mTabs button').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
    rows.forEach((_, i) => row(i)); stamp(false); res('', 'Checking…'); v.src = base; v.zoom = 1; v.dx = v.dy = 0;
    $('mMode').textContent = k === 'GALLERY' ? 'GALLERY FILE' : 'LIVE';
    if (k === 'PASS' || k === 'EDIT') {
      badges('● LIVE', 'GNSS ±5 m');
      await sleep(250); if (!alive()) return; row(0, 'pass', 'live stream');
      res('', 'Walk ~2 steps…', 'IMU counting steps');
      if (!(await walk(my))) return;
      row(1, 'pass', k === 'PASS' ? '3 steps · 2.1 m' : '2 steps · 1.5 m'); await sleep(350); if (!alive()) return;
      row(2, 'pass', 'moved 2 m · agrees'); await sleep(350); if (!alive()) return;
      const sealedFrame = FSX.sceneFrame(null, { zoom: 1.12 });
      if (k === 'PASS') { row(3, 'pass', 'baseline stored'); stamp(true, true); res('pass', 'PASS · SEALED', 'Live · this spot · this scene · hash written'); return; }
      stamp(true, true); res('pass', 'SEALED on phone', 'Now the worker submits an after-photo…');
      await sleep(1100); if (!alive()) return;
      stamp(false); res('', 'After-photo submitted', 'Comparing to the sealed frame…');
      const ed = FSX.newFrameCanvas(); v.src = ed; v.zoom = 1;
      for (let p = 0; p <= 1.0001; p += reduce ? 1 : 0.05) { if (!alive()) return; const x = ed.getContext('2d'); x.drawImage(sealedFrame, 0, 0); FSX.inpaintHeap(ed, p, 1.12); await sleep(40); }
      row(3, 'fail', 'Δ 21/64 · hash break'); stamp(true, false); res('fail', 'REFUSE · EDIT', 'EDIT: hash break · scene changed');
    } else if (k === 'GALLERY') {
      badges('FILE', 'IMG_20261001.jpg');
      v.src = gal; await sleep(500); if (!alive()) return;
      row(0, 'fail', 'file picker'); await sleep(350); if (!alive()) return;
      row(1, 'fail', '0 steps'); await sleep(300); if (!alive()) return;
      row(2, '', 'n/a'); row(3, '', 'not reached'); stamp(true, false);
      res('fail', 'REFUSE · GALLERY', 'no capture motion · file not from live camera');
    } else {
      badges('● LIVE', 'GNSS Jhajjar');
      await sleep(250); if (!alive()) return; row(0, 'pass', 'live stream');
      res('', 'Reading IMU + GNSS…', 'phone held still');
      await sleep(800); if (!alive()) return; badges('● LIVE', '⚠ MOCK GNSS', true);
      row(1, 'fail', 'IMU still'); await sleep(350); if (!alive()) return;
      row(2, 'fail', 'jumped 39.9 km'); row(3, '', 'not reached'); stamp(true, false);
      res('fail', 'REFUSE · SPOOF', 'mock location on · IMU still · signals disagree');
    }
  }
  let auto = !reduce, idx = 0, timer = null;
  async function cycle() {
    if (!auto) return;
    const k = order[idx % 4]; idx++;
    const before = token;
    await play(k);
    if (token !== before + 1) return; // a tab click took over
    timer = setTimeout(cycle, 2200);
  }
  document.querySelectorAll('#mTabs button').forEach((b) => b.addEventListener('click', () => {
    clearTimeout(timer); idx = order.indexOf(b.dataset.k) + 1;
    play(b.dataset.k).then(() => { if (auto) timer = setTimeout(cycle, 4000); });
  }));
  if (reduce) play('PASS'); else cycle();
})();
