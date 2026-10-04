/* FrameSeal core — shared by phone.html and desk.html.
 * Everything here runs locally in the browser. No network calls.
 */
(function () {
  'use strict';

  const JOB = 'Close garbage ticket';
  const SITE = 'Ward 14 · garbage heap';
  const SCHEMA = 'frameseal.card/v1';
  const FRAME_W = 480, FRAME_H = 360;
  const QUEUE_KEY = 'frameseal.desk.queue.v1';
  const DECISIONS_KEY = 'frameseal.desk.decisions.v1';
  const HASH_SPEC = 'sha256( frame_jpeg_bytes || utf8( canonical_json( card minus {id, sha256, frame, thumbnail, hash_spec} ) ) )';
  // Demo site coordinates (illustrative only) and the spoof origin used in the deck story.
  const WARD14 = { lat: 28.45952, lon: 77.02664 };
  const JHAJJAR = { lat: 28.60550, lon: 76.65380 };
  const DHASH_THRESHOLD = 10; // Hamming distance (of 64 bits) above which the scene is treated as changed

  /* ---------- small utils ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

  function haversine(a, b) {
    const R = 6371000, toR = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function canonical(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort()
      .map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }

  function dataURLToBytes(url) {
    const b64 = url.slice(url.indexOf(',') + 1);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function sha256Hex(bytes) {
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /* ---------- perceptual hash (64-bit dHash) ---------- */
  function dhash(source) {
    const c = document.createElement('canvas');
    c.width = 9; c.height = 8;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    // two-stage downscale for a stabler average
    const mid = document.createElement('canvas');
    mid.width = 72; mid.height = 64;
    const mx = mid.getContext('2d');
    mx.imageSmoothingEnabled = true; mx.imageSmoothingQuality = 'high';
    mx.drawImage(source, 0, 0, 72, 64);
    x.drawImage(mid, 0, 0, 9, 8);
    const d = x.getImageData(0, 0, 9, 8).data;
    const g = [];
    for (let i = 0; i < 72; i++) g.push(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
    let hex = '';
    for (let row = 0; row < 8; row++) {
      let nib = 0, bits = 0;
      for (let col = 0; col < 8; col++) {
        nib = (nib << 1) | (g[row * 9 + col] > g[row * 9 + col + 1] ? 1 : 0);
        if (++bits === 4) { hex += nib.toString(16); nib = 0; bits = 0; }
      }
    }
    return hex;
  }
  function hamming(a, b) {
    let n = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      let v = parseInt(a[i], 16) ^ parseInt(b[i], 16);
      while (v) { n += v & 1; v >>= 1; }
    }
    return n;
  }

  /* ---------- procedural demo scene: "Ward 14 · garbage heap" ---------- */
  const HEAP = { cx: 320, base: 420, w: 400, h: 190 }; // in 640x480 scene space

  function drawScene(ctx, W, H, opts = {}) {
    const S = W / 640;
    ctx.save();
    ctx.scale(S, H / 480);
    const r = mulberry32(1414);
    // sky
    let g = ctx.createLinearGradient(0, 0, 0, 200);
    g.addColorStop(0, '#8fb3c9'); g.addColorStop(1, '#e7d6b0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 640, 220);
    // far buildings
    ctx.fillStyle = '#b9a98c';
    for (let i = 0; i < 7; i++) { const bw = 70 + r() * 60, bh = 60 + r() * 70; ctx.fillRect(i * 95 - 10, 200 - bh, bw, bh + 20); }
    // compound wall
    g = ctx.createLinearGradient(0, 140, 0, 300);
    g.addColorStop(0, '#d8c193'); g.addColorStop(1, '#b89f70');
    ctx.fillStyle = g; ctx.fillRect(0, 150, 640, 150);
    ctx.fillStyle = 'rgba(80,60,30,.18)';
    for (let i = 0; i < 26; i++) { ctx.beginPath(); ctx.ellipse(r() * 640, 170 + r() * 120, 8 + r() * 26, 4 + r() * 14, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#a58a5c'; ctx.fillRect(0, 146, 640, 8);
    // painted sign
    ctx.fillStyle = '#f4f1e8'; ctx.fillRect(34, 172, 168, 70);
    ctx.strokeStyle = '#2b5d8a'; ctx.lineWidth = 4; ctx.strokeRect(36, 174, 164, 66);
    ctx.fillStyle = '#2b5d8a'; ctx.font = 'bold 26px sans-serif'; ctx.fillText('WARD 14', 58, 206);
    ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = '#b23a2a'; ctx.fillText('NO DUMPING', 72, 228);
    // tree
    ctx.fillStyle = '#5b4630'; ctx.fillRect(585, 120, 12, 190);
    ctx.fillStyle = '#4f7a3a';
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(560 + r() * 70, 90 + r() * 60, 26 + r() * 16, 0, 7); ctx.fill(); }
    // ground
    g = ctx.createLinearGradient(0, 300, 0, 480);
    g.addColorStop(0, '#9b8f7b'); g.addColorStop(1, '#6d6455');
    ctx.fillStyle = g; ctx.fillRect(0, 296, 640, 184);
    ctx.fillStyle = 'rgba(40,30,20,.25)';
    for (let i = 0; i < 220; i++) ctx.fillRect(r() * 640, 300 + r() * 180, 2 + r() * 3, 1 + r() * 2);
    // kerb line
    ctx.fillStyle = '#c8c0b0'; ctx.fillRect(0, 296, 640, 6);
    if (!opts.wiped) drawHeap(ctx, mulberry32(77));
    ctx.restore();
  }

  function drawHeap(ctx, r) {
    const { cx, base, w, h } = HEAP;
    // shadow
    ctx.fillStyle = 'rgba(20,15,10,.45)';
    ctx.beginPath(); ctx.ellipse(cx, base + 6, w * 0.56, 26, 0, 0, 7); ctx.fill();
    // main mound
    ctx.fillStyle = '#2e281f';
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, base);
    for (let i = 0; i <= 20; i++) {
      const t = i / 20, x = cx - w / 2 + t * w;
      const y = base - Math.sin(t * Math.PI) ** 0.8 * h * (0.85 + r() * 0.2);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(cx + w / 2, base); ctx.closePath(); ctx.fill();
    // debris: bags, cardboard, bottles
    const cols = ['#1d3f6e', '#e9e6dc', '#c2416b', '#2f6b3a', '#8a6a3c', '#111', '#d9a520', '#3a3a3a', '#6b2f2f'];
    for (let i = 0; i < 150; i++) {
      const t = r(), x = cx - w / 2 + 20 + t * (w - 40);
      const top = base - Math.sin(t * Math.PI) ** 0.8 * h * 0.92;
      const y = top + r() * (base - top - 6);
      ctx.fillStyle = cols[Math.floor(r() * cols.length)];
      ctx.globalAlpha = 0.75 + r() * 0.25;
      if (r() < 0.55) { ctx.beginPath(); ctx.ellipse(x, y, 6 + r() * 14, 4 + r() * 9, r() * 3, 0, 7); ctx.fill(); }
      else { ctx.save(); ctx.translate(x, y); ctx.rotate(r() * 3); ctx.fillRect(-8, -5, 10 + r() * 16, 6 + r() * 10); ctx.restore(); }
    }
    ctx.globalAlpha = 1;
  }

  /* simulate an inpaint that wipes the heap from an existing frame canvas */
  function inpaintHeap(canvas, progress = 1, zoom) {
    const z = zoom || canvas._zoom || 1;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height, sx = W / 640, sy = H / 480;
    // map scene coords -> frame coords under the same centred zoom used at capture
    const fx = (x) => (x * sx - (W - W / z) / 2) * z, fy = (y) => (y * sy - (H - H / z) / 2) * z;
    const { cx, base, w, h } = HEAP;
    const x0 = Math.max(0, fx(cx - w / 2 - 34)), x1 = Math.min(W, fx(cx + w / 2 + 34));
    const top = Math.max(0, fy(base - h - 22)), bot = Math.min(H, fy(base + 42));
    const xe = x0 + (x1 - x0) * progress;
    const plate = sceneFrame(null, { wiped: true, zoom: z }); // what a generative inpaint would hallucinate
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, top, xe - x0, bot - top); ctx.clip();
    ctx.drawImage(plate, 0, 0, W, H);
    ctx.fillStyle = 'rgba(150,140,120,.10)'; // faint smudge typical of inpainting
    ctx.beginPath(); ctx.ellipse(fx(cx), fy(base - h / 3), w * 0.45 * sx * z, h * 0.35 * sy * z, 0, 0, 7); ctx.fill();
    ctx.restore();
  }

  function addSensorNoise(canvas, seed) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height), d = img.data;
    const r = mulberry32(seed >>> 0);
    for (let i = 0; i < d.length; i += 4) {
      const n = (r() - 0.5) * 10;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  }

  function newFrameCanvas() {
    const c = document.createElement('canvas'); c.width = FRAME_W; c.height = FRAME_H; return c;
  }
  function sceneFrame(seed, opts = {}) {
    const c = newFrameCanvas();
    const x = c.getContext('2d');
    if (opts.zoom && opts.zoom !== 1) {
      const base = document.createElement('canvas'); base.width = FRAME_W; base.height = FRAME_H;
      drawScene(base.getContext('2d'), FRAME_W, FRAME_H, opts);
      const z = opts.zoom, ox = (opts.dx || 0), oy = (opts.dy || 0);
      x.drawImage(base, (FRAME_W - FRAME_W / z) / 2 + ox, (FRAME_H - FRAME_H / z) / 2 + oy, FRAME_W / z, FRAME_H / z, 0, 0, FRAME_W, FRAME_H);
    } else drawScene(x, FRAME_W, FRAME_H, opts);
    if (seed != null) addSensorNoise(c, seed);
    c._zoom = opts.zoom || 1;
    return c;
  }
  function thumbOf(canvas) {
    const t = document.createElement('canvas'); t.width = 160; t.height = 120;
    const x = t.getContext('2d'); x.imageSmoothingQuality = 'high';
    x.drawImage(canvas, 0, 0, 160, 120);
    return t.toDataURL('image/jpeg', 0.72);
  }

  /* ---------- seal card ---------- */
  function hashedBody(card) {
    const body = {};
    for (const k of Object.keys(card)) if (!['id', 'sha256', 'frame', 'thumbnail', 'hash_spec'].includes(k)) body[k] = card[k];
    return body;
  }
  async function computeCardHash(card) {
    const frame = dataURLToBytes(card.frame);
    const text = new TextEncoder().encode(canonical(hashedBody(card)));
    const all = new Uint8Array(frame.length + text.length);
    all.set(frame, 0); all.set(text, frame.length);
    return sha256Hex(all);
  }
  /* fields: verdict, outcome, failed_check, checks, packet, mode, timestamp; canvas = sealed frame */
  async function buildCard(canvas, fields) {
    const frame = canvas.toDataURL('image/jpeg', 0.82);
    const card = Object.assign({
      schema: SCHEMA,
      job: JOB,
      site: SITE,
      timestamp: new Date().toISOString(),
      dhash: dhash(canvas),
    }, fields);
    card.frame = frame;
    card.thumbnail = thumbOf(canvas);
    card.hash_spec = HASH_SPEC;
    card.sha256 = await computeCardHash(card);
    card.id = 'FS-' + card.sha256.slice(0, 10).toUpperCase();
    // stable key order for export
    const ordered = {};
    ['schema', 'id', 'job', 'site', 'timestamp', 'mode', 'verdict', 'outcome', 'failed_check', 'checks', 'sha256', 'dhash', 'packet', 'hash_spec', 'thumbnail', 'frame']
      .forEach((k) => { if (k in card) ordered[k] = card[k]; });
    Object.keys(card).forEach((k) => { if (!(k in ordered)) ordered[k] = card[k]; });
    return ordered;
  }
  async function verifyCard(card) {
    try {
      if (!card || typeof card.frame !== 'string' || !card.sha256) return { ok: false, reason: 'missing frame or sha256' };
      const actual = await computeCardHash(card);
      return { ok: actual === card.sha256, expected: card.sha256, actual, reason: actual === card.sha256 ? 'hash matches frame + packet' : 'recomputed hash differs — card was modified after sealing' };
    } catch (e) {
      return { ok: false, reason: 'could not parse card: ' + e.message };
    }
  }
  function verdictLabel(card) {
    if (card.verdict === 'SEALED') return 'PASS · SEALED';
    return 'REFUSE · ' + (card.outcome || 'UNKNOWN');
  }

  /* ---------- scenario definitions (judge / simulation mode) ---------- */
  const SCENARIOS = {
    PASS: {
      key: 'PASS', title: 'Pass', sub: 'Walk 2 steps · live · GNSS agrees', verdict: 'SEALED', color: 'pass',
      steps: 3, stride: 0.7, accelVar: 2.41, walking: true, still: false,
      gnss: { mock: false, accuracy: 4.6, speed: 0.9, displacement: 2.3, jump: 1.1, from: WARD14 },
      source: 'live_camera', captureAge: 0.4, failed: null,
    },
    GALLERY: {
      key: 'GALLERY', title: 'Gallery', sub: 'Old file picked from gallery', verdict: 'REFUSED', color: 'fail',
      steps: 0, stride: 0.7, accelVar: 0.004, walking: false, still: true,
      gnss: { mock: false, accuracy: 6.2, speed: 0, displacement: 0.3, jump: 0.3, from: WARD14 },
      source: 'gallery_file', captureAge: 3 * 86400 + 4210, failed: 'GALLERY: no capture motion · file not from live camera',
    },
    SPOOF: {
      key: 'SPOOF', title: 'Spoof', sub: 'Mock GPS on · phone held still', verdict: 'REFUSED', color: 'fail',
      steps: 0, stride: 0.7, accelVar: 0.003, walking: false, still: true,
      gnss: { mock: true, accuracy: 3.0, speed: 0, displacement: null, jump: null, from: JHAJJAR },
      source: 'live_camera', captureAge: 0.5, failed: 'SPOOF: mock location on · IMU still · signals disagree',
    },
    EDIT: {
      key: 'EDIT', title: 'Edit', sub: 'Heap wiped from after-photo', verdict: 'REFUSED', color: 'fail',
      steps: 2, stride: 0.75, accelVar: 2.07, walking: true, still: false,
      gnss: { mock: false, accuracy: 5.1, speed: 0.8, displacement: 1.8, jump: 0.9, from: WARD14 },
      source: 'live_camera', captureAge: 0.4, failed: 'EDIT: hash break · scene changed',
    },
  };
  (function fillSpoof() {
    const s = SCENARIOS.SPOOF.gnss;
    s.jump = round(haversine(JHAJJAR, WARD14), 0);
    s.displacement = s.jump;
  })();

  function scenarioChecks(sc, extra = {}) {
    const g = sc.gnss, dist = round(sc.steps * sc.stride, 2);
    const checks = [];
    checks.push(sc.source === 'live_camera'
      ? { id: 'camera_live', label: 'Camera live', pass: true, detail: 'rear camera stream · frame grabbed in-app' }
      : { id: 'camera_live', label: 'Camera live', pass: false, detail: 'file picker — not the live camera' });
    checks.push(sc.steps >= 2 && dist >= 1.4
      ? { id: 'motion', label: 'Motion', pass: true, detail: `${sc.steps} steps · ~${dist} m · σ² ${sc.accelVar}` }
      : { id: 'motion', label: 'Motion', pass: false, detail: `${sc.steps} steps · IMU still (σ² ${sc.accelVar})` });
    if (g.mock) checks.push({ id: 'gnss_agrees', label: 'GNSS agrees', pass: false, detail: `mock location on · fix jumped ${(g.jump / 1000).toFixed(1)} km while IMU still` });
    else checks.push({ id: 'gnss_agrees', label: 'GNSS agrees', pass: true, detail: `±${g.accuracy} m · moved ${g.displacement} m vs IMU ${dist} m` });
    checks.push(sc.captureAge < 30
      ? { id: 'fresh', label: 'Fresh', pass: true, detail: `captured ${sc.captureAge}s after motion` }
      : { id: 'fresh', label: 'Fresh', pass: false, detail: `file is ${Math.floor(sc.captureAge / 86400)} days old` });
    checks.push({ id: 'hash_on_device', label: 'Hash on device', pass: true, detail: sc.verdict === 'SEALED' || sc.key === 'EDIT' ? 'SHA-256 written locally' : 'hash computed · seal blocked' });
    if (extra.edit) checks.push(extra.edit);
    else checks.push({ id: 'edit_check', label: 'Edit check', pass: sc.key === 'PASS' ? true : null, detail: sc.key === 'PASS' ? 'dHash baseline stored' : 'not reached — sensors refused first' });
    return checks;
  }

  function scenarioPacket(sc, t0, tCap) {
    const g = sc.gnss, dist = round(sc.steps * sc.stride, 2);
    const fix = sc.key === 'SPOOF' ? WARD14 : g.from; // spoof reports the ward location, device is elsewhere
    return {
      capture: {
        source: sc.source,
        motion_started_at: new Date(t0).toISOString(),
        captured_at: new Date(tCap).toISOString(),
        capture_age_s: sc.captureAge,
        file_last_modified: sc.source === 'gallery_file' ? new Date(tCap - sc.captureAge * 1000).toISOString() : null,
        frame_w: FRAME_W, frame_h: FRAME_H, mime: 'image/jpeg',
      },
      imu: { steps: sc.steps, est_distance_m: dist, stride_m: sc.stride, accel_var: sc.accelVar, still: sc.still, window_s: 4.2, samples: 252 },
      gnss: {
        fix: true, lat: round(fix.lat + (sc.key === 'SPOOF' ? 0 : 0.00001), 6), lon: round(fix.lon, 6),
        accuracy_m: g.accuracy, speed_mps: g.speed, mock_provider: g.mock,
        displacement_m: g.displacement, max_jump_m: g.jump,
        prev_fix: sc.key === 'SPOOF' ? { lat: JHAJJAR.lat, lon: JHAJJAR.lon, note: 'last fix before mock provider took over' } : undefined,
      },
      agreement: {
        rule: 'refuse if GNSS moves > 25 m while IMU is still, or IMU walks while GNSS is frozen',
        gnss_minus_imu_m: g.displacement == null ? null : round(Math.abs(g.displacement - dist), 2),
        agrees: !g.mock,
      },
      device: { network: navigator.onLine ? 'online' : 'offline', cloud_calls_in_seal_path: 0, mode: 'simulation' },
    };
  }

  /* produce a scenario card instantly (used by desk preload and by phone after animation) */
  async function scenarioCard(key, opts = {}) {
    const sc = SCENARIOS[key];
    const tCap = opts.time || Date.now();
    const t0 = tCap - 4200;
    const seed = opts.seed != null ? opts.seed : (Math.random() * 2 ** 32) >>> 0;
    let frame = opts.frame || sceneFrame(seed, { zoom: sc.walking ? 1.12 : 1 });
    const packet = scenarioPacket(sc, t0, tCap);
    let extraEdit = null;
    if (key === 'EDIT') {
      // 1) original seal at capture time
      const sealedSha = await sha256Hex(dataURLToBytes(frame.toDataURL('image/jpeg', 0.82)));
      const sealedD = dhash(frame);
      const sealedThumb = thumbOf(frame);
      // 2) after-photo: heap wiped by an inpaint tool
      const edited = newFrameCanvas();
      edited.getContext('2d').drawImage(frame, 0, 0);
      inpaintHeap(edited, 1, frame._zoom || 1);
      const subSha = await sha256Hex(dataURLToBytes(edited.toDataURL('image/jpeg', 0.82)));
      const subD = dhash(edited);
      const dist = hamming(sealedD, subD);
      packet.edit_check = {
        method: 'SHA-256 compare + 64-bit dHash (best-effort, not a deepfake detector)',
        sealed_frame_sha256: sealedSha, submitted_frame_sha256: subSha, sha_match: sealedSha === subSha,
        sealed_dhash: sealedD, submitted_dhash: subD, dhash_distance: dist, dhash_threshold: DHASH_THRESHOLD,
        sealed_thumbnail: sealedThumb,
      };
      extraEdit = { id: 'edit_check', label: 'Edit check', pass: false, detail: `SHA-256 mismatch · dHash Δ ${dist}/64 (> ${DHASH_THRESHOLD})` };
      frame = edited;
    }
    return buildCard(frame, {
      timestamp: new Date(tCap).toISOString(),
      mode: 'simulation',
      verdict: sc.verdict,
      outcome: key,
      failed_check: sc.failed,
      checks: scenarioChecks(sc, { edit: extraEdit }),
      packet,
    });
  }

  /* ---------- desk queue storage ---------- */
  function loadQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (e) { return []; }
  }
  function sendToDesk(card) {
    const q = loadQueue().filter((c) => c.id !== card.id);
    q.unshift(card);
    while (q.length > 25) q.pop();
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); return true; }
    catch (e) { q.length = Math.max(1, q.length - 5); try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); return true; } catch (e2) { return false; } }
  }
  function clearQueue() { localStorage.removeItem(QUEUE_KEY); }
  function loadDecisions() { try { return JSON.parse(localStorage.getItem(DECISIONS_KEY) || '{}'); } catch (e) { return {}; } }
  function saveDecision(id, v) { const d = loadDecisions(); d[id] = v; localStorage.setItem(DECISIONS_KEY, JSON.stringify(d)); }

  function downloadCard(card) {
    const blob = new Blob([JSON.stringify(card, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${card.id}.frameseal.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove(); return ok;
    }
  }

  /* ---------- network indicator ---------- */
  function bindNetChip(el) {
    if (!el) return;
    const upd = () => {
      const off = !navigator.onLine;
      el.classList.toggle('off', off);
      el.classList.toggle('on', !off);
      el.innerHTML = off ? '<i></i>NETWORK OFF' : '<i></i>ONLINE · 0 cloud calls';
      el.title = off ? 'navigator.onLine = false — sealing still works' : 'You are online, but nothing in the seal path touches the network. Try airplane mode.';
    };
    window.addEventListener('online', upd); window.addEventListener('offline', upd); upd();
  }

  function registerSW() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    }
  }

  function toast(msg, kind) {
    let t = document.getElementById('fs-toast');
    if (!t) { t = document.createElement('div'); t.id = 'fs-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'show ' + (kind || '');
    clearTimeout(t._h); t._h = setTimeout(() => (t.className = ''), 2600);
  }

  window.FS = {
    JOB, SITE, SCHEMA, FRAME_W, FRAME_H, WARD14, JHAJJAR, DHASH_THRESHOLD, SCENARIOS, HEAP,
    mulberry32, sleep, round, haversine, canonical, dataURLToBytes, sha256Hex, dhash, hamming,
    drawScene, inpaintHeap, addSensorNoise, sceneFrame, newFrameCanvas, thumbOf,
    buildCard, verifyCard, computeCardHash, verdictLabel, scenarioCard, scenarioChecks, scenarioPacket,
    loadQueue, sendToDesk, clearQueue, loadDecisions, saveDecision, downloadCard, copyText,
    bindNetChip, registerSW, toast,
  };
})();
