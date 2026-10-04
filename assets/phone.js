/* FrameSeal · phone (seal) app */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const FSX = window.FS;

  const CHECKS = [
    ['camera_live', 'Camera live'], ['motion', 'Motion'], ['gnss_agrees', 'GNSS agrees'],
    ['fresh', 'Fresh'], ['hash_on_device', 'Hash on device'], ['edit_check', 'Edit check'],
  ];
  const state = { mode: 'sim', token: 0, card: null, frame: null, busy: false };
  const vf = { src: null, zoom: 1, dx: 0, dy: 0 };
  const spark = [];
  let base = FSX.sceneFrame(null);

  /* ---------- UI helpers ---------- */
  function renderChecks() {
    $('checks').innerHTML = CHECKS.map(([id, l]) =>
      `<div class="ck" id="ck-${id}"><span class="ico"></span><span class="l">${l}</span><span class="d">waiting</span></div>`).join('');
  }
  function setCheck(id, st, detail) {
    const el = $('ck-' + id); if (!el) return;
    el.className = 'ck ' + (st || '');
    el.querySelector('.ico').textContent = st === 'pass' ? '✓' : st === 'fail' ? '✕' : st === 'na' ? '–' : '';
    if (detail != null) el.querySelector('.d').textContent = detail;
  }
  function applyCardChecks(card) {
    card.checks.forEach((c) => setCheck(c.id, c.pass === true ? 'pass' : c.pass === false ? 'fail' : 'na', c.detail));
  }
  function pill(id, text, cls) { const p = $(id); if (id === 'pLive') { p.className = 'pill ' + (cls || ''); p.querySelector('span:last-child').textContent = text; } else { p.textContent = text; } }
  function msg(t) { $('vfMsg').textContent = t || ''; }
  function stamp(show, ok, text) {
    const s = $('stamp');
    s.className = 'stampbig ' + (ok ? 'pass' : 'fail') + (show ? ' show' : '');
    if (text) s.textContent = text;
  }
  function setSensors(o) {
    if (o.steps != null) { $('sSteps').textContent = o.steps; $('pSteps').textContent = o.steps + (o.steps === 1 ? ' step' : ' steps'); }
    if (o.dist != null) $('sDist').textContent = '~' + o.dist.toFixed(1) + ' m';
    if (o.var != null) $('sVar').textContent = o.var < 0.1 ? o.var.toFixed(3) : o.var.toFixed(2);
    if (o.acc != null) $('sAcc').textContent = o.acc;
    if (o.gnss != null) $('sGnss').textContent = o.gnss;
    if (o.pg != null) $('pGnss').textContent = o.pg;
  }
  function pushSpark(v) { spark.push(v); while (spark.length > 60) spark.shift(); drawSpark(); }
  function drawSpark() {
    const c = $('spark'), x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    x.strokeStyle = '#f5b700'; x.lineWidth = 2.5; x.beginPath();
    spark.forEach((v, i) => {
      const px = (i / 59) * c.width, py = c.height - 4 - Math.min(1, v / 5) * (c.height - 8);
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    });
    x.stroke();
  }
  function clearResult() { $('result').className = 'result'; $('bTamper').classList.add('hidden'); state.card = null; }
  function showResult(card) {
    state.card = card;
    const ok = card.verdict === 'SEALED';
    $('result').className = 'result show ' + (ok ? 'pass' : 'fail');
    $('rVd').textContent = ok ? 'PASS · SEALED' : 'REFUSED · ' + card.outcome;
    $('rFc').textContent = ok ? 'Live frame, at this spot, of this scene. Seal written on device.' : card.failed_check;
    $('rId').textContent = card.id;
    $('rSha').textContent = card.sha256;
    $('rDh').textContent = card.dhash;
    $('rTs').textContent = new Date(card.timestamp).toLocaleString();
    $('bTamper').classList.toggle('hidden', !ok);
    stamp(true, ok, ok ? 'SEALED' : 'REFUSED');
    setTimeout(() => { const r = $('result'); if (r.scrollIntoView) r.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 250);
  }

  /* ---------- viewfinder render loop ---------- */
  const vctx = $('vfc').getContext('2d');
  function frameLoop() {
    if (!$('vfc').classList.contains('hidden')) {
      const src = vf.src || base, W = 480, H = 360, z = vf.zoom;
      vctx.fillStyle = '#000'; vctx.fillRect(0, 0, W, H);
      vctx.drawImage(src, (W - W / z) / 2 + vf.dx, (H - H / z) / 2 + vf.dy, W / z, H / z, 0, 0, W, H);
    }
    requestAnimationFrame(frameLoop);
  }

  /* ---------- simulation (judge mode) ---------- */
  function galleryCanvas() {
    const c = FSX.sceneFrame(null);
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(255,190,90,.18)'; x.fillRect(0, 0, c.width, c.height); // older, warmer shot
    x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, c.height - 30, c.width, 30);
    x.fillStyle = '#fff'; x.font = 'bold 14px sans-serif'; x.fillText('IMG_20261001_0912.jpg · Gallery', 12, c.height - 10);
    return c;
  }
  function resetRun() {
    state.token++;
    renderChecks(); clearResult(); stamp(false, true); msg('');
    vf.src = null; vf.zoom = 1; vf.dx = 0; vf.dy = 0;
    base = FSX.sceneFrame(null);
    spark.length = 0; drawSpark();
    setSensors({ steps: 0, dist: 0, var: 0, acc: '—', gnss: 'no fix', pg: 'GNSS —' });
    $('sVar').textContent = '—';
    pill('pLive', 'READY', 'idle');
  }

  async function runScenario(key) {
    resetRun();
    const my = state.token, alive = () => my === state.token;
    const sc = FSX.SCENARIOS[key];
    document.querySelectorAll('#scen button').forEach((b) => b.classList.toggle('active', b.dataset.k === key));
    const gal = key === 'GALLERY';
    $('pSrc').textContent = gal ? 'GALLERY FILE' : 'SIM CAMERA';
    pill('pLive', gal ? 'FILE' : 'LIVE', gal ? 'idle' : '');
    if (gal) { vf.src = galleryCanvas(); msg('Picked IMG_20261001_0912.jpg from gallery'); }
    // 1) camera
    setCheck('camera_live', 'run', 'checking stream…');
    await FSX.sleep(500); if (!alive()) return;
    setCheck('camera_live', gal ? 'fail' : 'pass', gal ? 'file picker — not the live camera' : 'rear camera stream · live');
    // 2) body: IMU + GNSS
    setCheck('motion', 'run', key === 'PASS' || key === 'EDIT' ? 'walk ~2 steps toward the heap' : 'reading IMU…');
    setCheck('gnss_agrees', 'run', 'waiting for fix…');
    if (!gal) msg(sc.walking ? 'Walk ~2 steps toward the heap' : 'Hold…');
    const stepTimes = sc.walking ? [700, 1450, 2200].slice(0, sc.steps) : [];
    const T = 2600, dt = 50;
    let steps = 0, sum = 0, sum2 = 0, n = 0, spoofShown = false;
    for (let t = 0; t <= T; t += dt) {
      if (!alive()) return;
      let a;
      if (sc.walking) {
        const near = stepTimes.map((s) => Math.exp(-((t - s) ** 2) / (2 * 90 ** 2))).reduce((p, q) => p + q, 0);
        a = 0.35 + 4.2 * near + Math.random() * 0.35;
        while (steps < stepTimes.length && t >= stepTimes[steps]) steps++;
        const prog = Math.min(1, t / 2300);
        vf.zoom = 1 + 0.12 * prog; vf.dy = Math.sin(t / 120) * 3 * (1 - prog * 0.6); vf.dx = Math.sin(t / 240) * 2;
      } else {
        a = 0.03 + Math.random() * 0.04;
      }
      sum += a; sum2 += a * a; n++;
      pushSpark(a);
      const varNow = sc.walking ? Math.max(0, sum2 / n - (sum / n) ** 2) * 2.6 : sc.accelVar + Math.random() * 0.001;
      const acc = Math.max(sc.gnss.accuracy, 18 - t / 120);
      const sens = { steps, dist: steps * sc.stride, var: varNow, acc: '±' + acc.toFixed(1) + ' m' };
      if (key === 'SPOOF') {
        if (t > 1100) {
          if (!spoofShown) { spoofShown = true; FSX.toast('GNSS fix jumped ' + (sc.gnss.jump / 1000).toFixed(1) + ' km in 1 s · IMU still'); }
          sens.gnss = 'MOCK · jumped ' + (sc.gnss.jump / 1000).toFixed(1) + ' km'; sens.pg = '⚠ MOCK GNSS';
        } else { sens.gnss = 'Jhajjar fix'; sens.pg = 'GNSS ' + FSX.JHAJJAR.lat.toFixed(3) + ',' + FSX.JHAJJAR.lon.toFixed(3); }
      } else if (t > 600) {
        sens.gnss = 'moved ' + (sc.gnss.displacement * Math.min(1, t / 2300)).toFixed(1) + ' m'; sens.pg = 'GNSS ±' + acc.toFixed(0) + ' m';
      }
      setSensors(sens);
      await FSX.sleep(dt);
    }
    if (!alive()) return;
    vf.dx = 0; vf.dy = 0; msg('');
    setSensors({ var: sc.accelVar });
    const motionCk = FSX.scenarioChecks(sc);
    setCheck('motion', motionCk[1].pass ? 'pass' : 'fail', motionCk[1].detail);
    await FSX.sleep(350); if (!alive()) return;
    setCheck('gnss_agrees', motionCk[2].pass ? 'pass' : 'fail', motionCk[2].detail);
    setCheck('fresh', 'run', 'checking timestamps…');
    await FSX.sleep(350); if (!alive()) return;
    setCheck('fresh', motionCk[3].pass ? 'pass' : 'fail', motionCk[3].detail);
    setCheck('hash_on_device', 'run', 'SHA-256 over frame + packet…');
    // capture the frame actually shown in the viewfinder
    const frame = gal ? (() => { const c = galleryCanvas(); FSX.addSensorNoise(c, (Math.random() * 2 ** 32) >>> 0); return c; })()
      : FSX.sceneFrame((Math.random() * 2 ** 32) >>> 0, { zoom: vf.zoom });
    state.frame = frame;
    if (key === 'EDIT') {
      // show the honest seal first, then the edited after-photo being submitted
      await FSX.sleep(400); if (!alive()) return;
      setCheck('hash_on_device', 'pass', 'SHA-256 written locally');
      stamp(true, true, 'SEALED');
      await FSX.sleep(900); if (!alive()) return;
      stamp(false, true);
      msg('After-photo submitted to close the ticket…');
      setCheck('edit_check', 'run', 'comparing to sealed frame…');
      const ed = FSX.newFrameCanvas(); vf.zoom = 1; vf.src = ed;
      for (let p = 0; p <= 1.0001; p += 0.05) {
        if (!alive()) return;
        const x = ed.getContext('2d'); x.drawImage(frame, 0, 0); FSX.inpaintHeap(ed, p, frame._zoom || 1);
        await FSX.sleep(45);
      }
      msg('');
    }
    const card = await FSX.scenarioCard(key, { frame });
    if (!alive()) return;
    await FSX.sleep(300);
    applyCardChecks(card);
    pill('pLive', card.verdict === 'SEALED' ? 'SEALED' : 'REFUSED', 'idle');
    showResult(card);
  }

  /* ---------- tamper test on a sealed frame ---------- */
  async function tamperTest() {
    const sealed = state.card, frame = state.frame;
    if (!sealed || !frame || sealed.verdict !== 'SEALED') return;
    state.token++; const my = state.token;
    $('result').className = 'result'; stamp(false, true);
    msg('Inpainting the heap out of the after-photo…');
    setCheck('edit_check', 'run', 'comparing to sealed frame…');
    const ed = FSX.newFrameCanvas(); vf.zoom = 1; vf.dx = vf.dy = 0; vf.src = ed;
    $('video').classList.add('hidden'); $('vfc').classList.remove('hidden');
    for (let p = 0; p <= 1.0001; p += 0.05) {
      if (my !== state.token) return;
      const x = ed.getContext('2d'); x.drawImage(frame, 0, 0); FSX.inpaintHeap(ed, p, frame._zoom || 1);
      await FSX.sleep(40);
    }
    msg('');
    const sealedSha = await FSX.sha256Hex(FSX.dataURLToBytes(frame.toDataURL('image/jpeg', 0.82)));
    const subSha = await FSX.sha256Hex(FSX.dataURLToBytes(ed.toDataURL('image/jpeg', 0.82)));
    const sd = FSX.dhash(frame), ud = FSX.dhash(ed), dist = FSX.hamming(sd, ud);
    const changed = sealedSha !== subSha;
    const big = dist > FSX.DHASH_THRESHOLD;
    const editCk = { id: 'edit_check', label: 'Edit check', pass: false, detail: `SHA-256 mismatch · dHash Δ ${dist}/64${big ? ' (> ' + FSX.DHASH_THRESHOLD + ')' : ''}` };
    const packet = JSON.parse(JSON.stringify(sealed.packet));
    packet.edit_check = {
      method: 'SHA-256 compare + 64-bit dHash (best-effort, not a deepfake detector)',
      sealed_card: sealed.id, sealed_frame_sha256: sealedSha, submitted_frame_sha256: subSha, sha_match: !changed,
      sealed_dhash: sd, submitted_dhash: ud, dhash_distance: dist, dhash_threshold: FSX.DHASH_THRESHOLD,
      sealed_thumbnail: FSX.thumbOf(frame),
    };
    const checks = sealed.checks.filter((c) => c.id !== 'edit_check').concat([editCk]);
    const card = await FSX.buildCard(ed, {
      mode: sealed.mode, verdict: 'REFUSED', outcome: 'EDIT',
      failed_check: big ? 'EDIT: hash break · scene changed' : 'EDIT: hash break · frame bytes changed',
      checks, packet,
    });
    if (my !== state.token) return;
    applyCardChecks(card);
    state.frame = ed;
    showResult(card);
  }

  /* ---------- live sensors ---------- */
  const L = {
    stream: null, watchId: null, started: 0, motionSeen: false, steps: 0, lastStepT: 0, f: 0, above: false,
    win: [], n: 0, mean: 0, m2: 0, fixes: [], first: null, last: null, maxJump: 0, jumpFlag: null, uiTimer: null,
  };
  function resetLive() {
    Object.assign(L, { started: 0, motionSeen: false, steps: 0, lastStepT: 0, f: 0, above: false, win: [], n: 0, mean: 0, m2: 0, fixes: [], first: null, last: null, maxJump: 0, jumpFlag: null });
  }
  function onMotion(e) {
    if (!L.started) return;
    let m = null;
    const a = e.acceleration;
    if (a && a.x != null) m = Math.hypot(a.x, a.y, a.z);
    else if (e.accelerationIncludingGravity && e.accelerationIncludingGravity.x != null) {
      const g = e.accelerationIncludingGravity; m = Math.abs(Math.hypot(g.x, g.y, g.z) - 9.81);
    }
    if (m == null || isNaN(m)) return;
    L.motionSeen = true;
    const t = performance.now();
    // Welford variance over the capture window
    L.n++; const d = m - L.mean; L.mean += d / L.n; L.m2 += d * (m - L.mean);
    L.win.push({ t, m }); while (L.win.length && t - L.win[0].t > 4000) L.win.shift();
    // low-pass + hysteresis peak detector
    L.f = 0.75 * L.f + 0.25 * m;
    if (!L.above && L.f > 1.3 && t - L.lastStepT > 330) { L.above = true; L.steps++; L.lastStepT = t; }
    else if (L.above && L.f < 0.6) L.above = false;
    L._lastM = m;
  }
  function liveVar() { return L.n > 1 ? L.m2 / (L.n - 1) : 0; }
  function onPos(p) {
    const c = p.coords, fix = { lat: c.latitude, lon: c.longitude, acc: c.accuracy, speed: c.speed, t: p.timestamp };
    if (L.last) {
      const j = FSX.haversine(L.last, fix);
      L.maxJump = Math.max(L.maxJump, j);
      const imuDist = L.steps * 0.7;
      if (j > 25 && j > (L.last.acc + fix.acc) && imuDist < 3) L.jumpFlag = `GNSS jumped ${Math.round(j)} m while IMU still`;
      if (fix.speed != null && fix.speed > 8 && imuDist < 3) L.jumpFlag = `GNSS speed ${fix.speed.toFixed(1)} m/s while IMU still`;
    }
    if (!L.first) L.first = fix;
    L.last = fix; L.fixes.push(fix); if (L.fixes.length > 50) L.fixes.shift();
  }
  function frozenWhileWalking() {
    if (L.steps < 12 || L.fixes.length < 3) return false;
    return L.fixes.every((f) => f.lat === L.fixes[0].lat && f.lon === L.fixes[0].lon);
  }
  function liveUI() {
    const dist = L.steps * 0.7;
    setSensors({ steps: L.steps, dist, var: L.motionSeen ? liveVar() : null });
    if (!L.motionSeen) $('sVar').textContent = 'no IMU';
    if (L._lastM != null) pushSpark(L._lastM);
    if (L.last) {
      const disp = FSX.haversine(L.first, L.last);
      setSensors({ acc: '±' + L.last.acc.toFixed(0) + ' m', gnss: L.jumpFlag ? '⚠ disagrees' : 'moved ' + disp.toFixed(1) + ' m', pg: 'GNSS ' + L.last.lat.toFixed(4) + ',' + L.last.lon.toFixed(4) });
    } else setSensors({ acc: '…', gnss: 'acquiring fix', pg: 'GNSS acquiring…' });
    if (L.steps >= 2) msg(''); 
  }
  async function startLive() {
    resetRun(); resetLive();
    $('pSrc').textContent = 'REAR CAMERA';
    // iOS motion permission must be requested inside the tap
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        const r = await DeviceMotionEvent.requestPermission();
        if (r !== 'granted') FSX.toast('Motion permission denied — Motion check will fail', 'bad');
      }
    } catch (e) { /* ignore */ }
    window.addEventListener('devicemotion', onMotion);
    setCheck('camera_live', 'run', 'opening rear camera…');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('camera API unavailable (needs HTTPS)');
      L.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      const v = $('video'); v.srcObject = L.stream; await v.play().catch(() => {});
      v.classList.remove('hidden'); $('vfc').classList.add('hidden');
      setCheck('camera_live', 'pass', 'rear camera stream · live');
    } catch (e) {
      setCheck('camera_live', 'fail', 'no live camera: ' + (e.name || e.message));
      FSX.toast('No live camera here — falling back to Judge mode');
      stopLive();
      setTimeout(() => setMode('sim'), 900);
      return;
    }
    if (navigator.geolocation) {
      L.watchId = navigator.geolocation.watchPosition(onPos, (err) => setSensors({ acc: '✕', gnss: 'GNSS ' + (err.code === 1 ? 'denied' : 'unavailable'), pg: 'GNSS ✕' }), { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    }
    L.started = performance.now();
    pill('pLive', 'LIVE', '');
    msg('Walk ~2 steps toward the subject');
    setCheck('motion', 'run', 'walk ~2 steps…'); setCheck('gnss_agrees', 'run', 'acquiring fix…');
    $('bSeal').disabled = false; $('bStart').textContent = '▶ Restart capture';
    clearInterval(L.uiTimer); L.uiTimer = setInterval(liveUI, 100);
    setTimeout(() => { if (L.started && !L.motionSeen) { FSX.toast('No motion sensor events — Motion check will refuse'); setCheck('motion', 'run', 'no IMU events on this device'); } }, 2500);
  }
  function stopLive() {
    clearInterval(L.uiTimer);
    window.removeEventListener('devicemotion', onMotion);
    if (L.watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(L.watchId);
    L.watchId = null;
    if (L.stream) L.stream.getTracks().forEach((t) => t.stop());
    L.stream = null; L.started = 0;
    $('video').classList.add('hidden'); $('vfc').classList.remove('hidden');
    $('bSeal').disabled = true; $('bStart').textContent = '▶ Start live capture';
  }
  function grabVideo() {
    const v = $('video'), c = FSX.newFrameCanvas(), x = c.getContext('2d');
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) return null;
    const r = Math.max(480 / vw, 360 / vh), sw = 480 / r, sh = 360 / r;
    x.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, 480, 360);
    const d = x.getImageData(0, 0, 480, 360).data;
    let s = 0, s2 = 0, k = 0;
    for (let i = 0; i < d.length; i += 40) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; s += l; s2 += l * l; k++; }
    const mean = s / k, sd = Math.sqrt(Math.max(0, s2 / k - mean * mean));
    c._dark = mean < 8 || sd < 3;
    return c;
  }
  async function sealLive() {
    const tCap = performance.now();
    const track = L.stream && L.stream.getVideoTracks()[0];
    const frame = grabVideo();
    const camOk = !!(track && track.readyState === 'live' && frame && !frame._dark);
    clearInterval(L.uiTimer);
    stopLive();
    const shown = frame || FSX.newFrameCanvas();
    vf.src = shown; vf.zoom = 1;
    const dist = FSX.round(L.steps * 0.7, 2), v = FSX.round(liveVar(), 4);
    const still = L.motionSeen && v < 0.02;
    const motionOk = L.motionSeen && L.steps >= 2 && dist >= 1.4;
    const gnssDisp = L.first && L.last ? FSX.round(FSX.haversine(L.first, L.last), 1) : null;
    const spoof = L.jumpFlag || (frozenWhileWalking() ? 'GNSS frozen while IMU walked' : null);
    const sinceStep = L.lastStepT ? (tCap - L.lastStepT) / 1000 : null;
    const fresh = sinceStep != null && sinceStep < 20;
    const checks = [
      { id: 'camera_live', label: 'Camera live', pass: camOk, detail: camOk ? 'rear camera stream · frame grabbed in-app' : 'no usable live frame' },
      { id: 'motion', label: 'Motion', pass: motionOk, detail: !L.motionSeen ? 'no IMU events on this device' : motionOk ? `${L.steps} steps · ~${dist} m · σ² ${v}` : `${L.steps} steps · ~${dist} m${still ? ' · IMU still' : ''} — walk ~2 steps` },
      { id: 'gnss_agrees', label: 'GNSS agrees', pass: !!L.last && !spoof, detail: !L.last ? 'no GNSS fix' : spoof ? spoof : `±${L.last.acc.toFixed(0)} m · moved ${gnssDisp} m vs IMU ${dist} m` },
      { id: 'fresh', label: 'Fresh', pass: fresh, detail: fresh ? `captured ${sinceStep.toFixed(1)}s after last step` : sinceStep == null ? 'no capture motion before frame' : `last step ${sinceStep.toFixed(0)}s ago (> 20 s)` },
    ];
    let outcome = 'PASS', failed = null;
    if (!camOk) { outcome = 'CAMERA'; failed = 'CAMERA: no live frame · seal blocked'; }
    else if (spoof) { outcome = 'SPOOF'; failed = `SPOOF: ${spoof} · signals disagree`; }
    else if (!motionOk) { outcome = 'MOTION'; failed = !L.motionSeen ? 'MOTION: no IMU on this device · seal blocked' : `MOTION: ${still ? 'IMU still' : 'only ' + L.steps + ' step(s)'} · walk ~2 steps before sealing`; }
    else if (!L.last) { outcome = 'NO_FIX'; failed = 'GNSS: no fix yet · step outside or wait'; }
    else if (!fresh) { outcome = 'STALE'; failed = 'FRESH: frame not captured right after motion'; }
    const sealed = outcome === 'PASS';
    checks.push({ id: 'hash_on_device', label: 'Hash on device', pass: true, detail: sealed ? 'SHA-256 written locally' : 'hash computed · seal blocked' });
    checks.push({ id: 'edit_check', label: 'Edit check', pass: sealed ? true : null, detail: sealed ? 'dHash baseline stored' : 'not reached — sensors refused first' });
    const now = Date.now();
    const packet = {
      capture: { source: 'live_camera', motion_started_at: new Date(now - (tCap - (L._t0 || tCap))).toISOString(), captured_at: new Date(now).toISOString(), capture_age_s: sinceStep == null ? null : FSX.round(sinceStep, 1), file_last_modified: null, frame_w: 480, frame_h: 360, mime: 'image/jpeg', video_w: $('video').videoWidth || null, video_h: $('video').videoHeight || null },
      imu: { steps: L.steps, est_distance_m: dist, stride_m: 0.7, accel_var: v, still, samples: L.n, available: L.motionSeen },
      gnss: L.last ? { fix: true, lat: FSX.round(L.last.lat, 6), lon: FSX.round(L.last.lon, 6), accuracy_m: FSX.round(L.last.acc, 1), speed_mps: L.last.speed, mock_provider: 'not exposed to the web (Android: Location.isMock())', displacement_m: gnssDisp, max_jump_m: FSX.round(L.maxJump, 1), fixes: L.fixes.length } : { fix: false },
      agreement: { rule: 'refuse if GNSS moves > 25 m while IMU is still, or IMU walks while GNSS is frozen', gnss_minus_imu_m: gnssDisp == null ? null : FSX.round(Math.abs(gnssDisp - dist), 1), agrees: !spoof },
      device: { network: navigator.onLine ? 'online' : 'offline', cloud_calls_in_seal_path: 0, mode: 'live', ua: navigator.userAgent.slice(0, 120) },
    };
    renderChecks(); checks.forEach((c) => setCheck(c.id, 'run'));
    for (const c of checks) { await FSX.sleep(160); setCheck(c.id, c.pass === true ? 'pass' : c.pass === false ? 'fail' : 'na', c.detail); }
    const card = await FSX.buildCard(shown, { mode: 'live', verdict: sealed ? 'SEALED' : 'REFUSED', outcome, failed_check: failed, checks, packet });
    state.frame = shown;
    pill('pLive', sealed ? 'SEALED' : 'REFUSED', 'idle');
    showResult(card);
  }

  async function galleryUpload(file) {
    if (!file) return;
    resetRun();
    $('pSrc').textContent = 'GALLERY FILE'; pill('pLive', 'FILE', 'idle');
    let img;
    try { img = await createImageBitmap(file); }
    catch (e) { img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); }); }
    const c = FSX.newFrameCanvas(), x = c.getContext('2d');
    const iw = img.width, ih = img.height, r = Math.max(480 / iw, 360 / ih), sw = 480 / r, sh = 360 / r;
    x.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, 480, 360);
    vf.src = c; msg('');
    const ageS = Math.max(0, (Date.now() - (file.lastModified || Date.now())) / 1000);
    const ageTxt = ageS > 86400 ? Math.floor(ageS / 86400) + ' days old' : ageS > 3600 ? Math.floor(ageS / 3600) + ' h old' : Math.round(ageS) + ' s old';
    const checks = [
      { id: 'camera_live', label: 'Camera live', pass: false, detail: 'file picker — not the live camera' },
      { id: 'motion', label: 'Motion', pass: false, detail: '0 steps · no capture motion' },
      { id: 'gnss_agrees', label: 'GNSS agrees', pass: null, detail: 'not evaluated for files' },
      { id: 'fresh', label: 'Fresh', pass: ageS < 60 ? null : false, detail: ageS < 60 ? `file ${ageTxt} — still not from live camera` : `file is ${ageTxt}` },
      { id: 'hash_on_device', label: 'Hash on device', pass: true, detail: 'hash computed · seal blocked' },
      { id: 'edit_check', label: 'Edit check', pass: null, detail: 'not reached — sensors refused first' },
    ];
    for (const ck of checks) { setCheck(ck.id, 'run'); await FSX.sleep(140); setCheck(ck.id, ck.pass === true ? 'pass' : ck.pass === false ? 'fail' : 'na', ck.detail); }
    const now = Date.now();
    const card = await FSX.buildCard(c, {
      mode: state.mode === 'live' ? 'live' : 'simulation', verdict: 'REFUSED', outcome: 'GALLERY',
      failed_check: 'GALLERY: no capture motion · file not from live camera', checks,
      packet: {
        capture: { source: 'gallery_file', file_name: file.name.slice(0, 80), file_type: file.type, file_size: file.size, file_last_modified: file.lastModified ? new Date(file.lastModified).toISOString() : null, file_age_s: Math.round(ageS), captured_at: new Date(now).toISOString(), frame_w: 480, frame_h: 360, mime: 'image/jpeg' },
        imu: { steps: 0, est_distance_m: 0, still: true, note: 'no capture motion recorded for a picked file' },
        gnss: { fix: false, note: 'not evaluated' },
        agreement: { agrees: null },
        device: { network: navigator.onLine ? 'online' : 'offline', cloud_calls_in_seal_path: 0, mode: state.mode },
      },
    });
    state.frame = c;
    showResult(card);
  }

  /* ---------- mode ---------- */
  function setMode(m) {
    state.mode = m;
    $('mSim').classList.toggle('on', m === 'sim'); $('mLive').classList.toggle('on', m === 'live');
    $('simControls').classList.toggle('hidden', m !== 'sim');
    $('liveControls').classList.toggle('hidden', m !== 'live');
    stopLive(); resetRun();
    document.querySelectorAll('#scen button').forEach((b) => b.classList.remove('active'));
    if (m === 'live') { $('pSrc').textContent = 'REAR CAMERA'; msg('Tap Start live capture'); }
    else { $('pSrc').textContent = 'SIM CAMERA'; msg('Pick a scenario below'); }
  }

  /* ---------- wire up ---------- */
  function clock() { const d = new Date(); $('clock').textContent = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0'); }
  clock(); setInterval(clock, 15000);
  FSX.bindNetChip($('net'));
  renderChecks();
  requestAnimationFrame(frameLoop);
  document.querySelectorAll('#scen button').forEach((b) => b.addEventListener('click', () => runScenario(b.dataset.k)));
  $('mSim').addEventListener('click', () => setMode('sim'));
  $('mLive').addEventListener('click', () => setMode('live'));
  $('bStart').addEventListener('click', () => { L._t0 = performance.now(); startLive(); });
  $('bSeal').addEventListener('click', sealLive);
  $('bReset').addEventListener('click', () => { stopLive(); resetRun(); msg('Tap Start live capture'); });
  $('bGallery').addEventListener('click', () => $('galFile').click());
  $('galFile').addEventListener('change', (e) => { galleryUpload(e.target.files[0]); e.target.value = ''; });
  $('bTamper').addEventListener('click', tamperTest);
  $('bSend').addEventListener('click', () => {
    if (!state.card) return;
    FSX.sendToDesk(state.card) ? FSX.toast('Sent to desk · open the Review Desk in this browser', 'ok') : FSX.toast('Desk storage full — use Download instead', 'bad');
  });
  $('bDl').addEventListener('click', () => state.card && FSX.downloadCard(state.card));
  $('bCopy').addEventListener('click', async () => {
    if (!state.card) return;
    (await FSX.copyText(JSON.stringify(state.card, null, 2))) ? FSX.toast('Seal card JSON copied', 'ok') : FSX.toast('Copy blocked by browser — use Download', 'bad');
  });

  const qp = new URLSearchParams(location.search);
  const touchPhone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
  setMode(qp.get('mode') === 'live' ? 'live' : qp.get('mode') === 'sim' ? 'sim' : (touchPhone ? 'live' : 'sim'));
  if (qp.get('run') && FSX.SCENARIOS[qp.get('run')]) runScenario(qp.get('run'));
  FSX.registerSW();
  window.FSPhone = { runScenario, tamperTest, state };
})();
