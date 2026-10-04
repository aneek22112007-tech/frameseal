/* FrameSeal · Office Kit review desk (read-only) */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const FSX = window.FS;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let examples = [];          // [{card, source}]
  let imported = [];          // imported this session (also persisted to the local queue)
  const verified = {};        // id+sha -> result
  let selected = null;

  function phoneCards() { return FSX.loadQueue().map((c) => ({ card: c, source: c._desk_source || 'phone' })); }
  function all() {
    const seen = new Set(), out = [];
    for (const it of [...imported, ...phoneCards(), ...examples]) {
      const k = it.card.id + ':' + it.card.sha256 + ':' + (it.tag || '');
      if (seen.has(k)) continue; seen.add(k); out.push(it);
    }
    return out;
  }
  const keyOf = (it) => it.card.id + ':' + it.card.sha256 + ':' + (it.tag || '');

  function gnssStatus(c) {
    const g = (c.packet && c.packet.gnss) || {};
    const ag = c.packet && c.packet.agreement;
    if (g.mock_provider === true) return 'GNSS: mock location';
    if (!g.fix) return 'GNSS: no fix';
    if (ag && ag.agrees === false) return 'GNSS: disagrees';
    return 'GNSS ±' + (g.accuracy_m != null ? g.accuracy_m : '?') + ' m · agrees';
  }
  function motionText(c) {
    const i = (c.packet && c.packet.imu) || {};
    return (i.steps != null ? i.steps : 0) + ' steps · ~' + (i.est_distance_m != null ? i.est_distance_m : 0) + ' m';
  }

  function renderQueue() {
    const items = all();
    $('qCount').textContent = items.length;
    const dec = FSX.loadDecisions();
    $('qlist').innerHTML = items.map((it) => {
      const c = it.card, ok = c.verdict === 'SEALED', k = keyOf(it), v = verified[k];
      const d = dec[c.id + ':' + c.sha256];
      return `<div class="qi ${selected === k ? 'sel' : ''}" data-k="${esc(k)}" tabindex="0">
        <img src="${esc(c.thumbnail || c.frame)}" alt="">
        <div style="min-width:0">
          <div class="top"><span class="vp ${ok ? 'pass' : 'fail'}">${esc(FSX.verdictLabel(c))}</span>${v ? `<span class="vp ${v.ok ? 'ok' : 'bad'}">${v.ok ? 'INTEGRITY OK' : 'TAMPERED'}</span>` : ''}</div>
          <div class="fc">${esc(v && !v.ok ? 'Integrity failed · blocked' : ok ? (d === 'accepted' ? 'Accepted · ticket closed' : 'Sealed on device · awaiting review') : (c.failed_check || 'Refused'))}</div>
          <div class="meta"><span>${esc(motionText(c))}</span><span>${esc(gnssStatus(c))}</span></div>
          <div class="id">${esc(c.id)} · ${esc(new Date(c.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))} · <span class="src">${esc(it.source)}</span></div>
        </div>
      </div>`;
    }).join('') || '<p style="padding:16px;color:var(--muted)">Queue empty.</p>';
    $('qlist').querySelectorAll('.qi').forEach((el) => {
      el.addEventListener('click', () => select(el.dataset.k));
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') select(el.dataset.k); });
    });
  }

  async function verifyItem(it, announce) {
    const r = await FSX.verifyCard(it.card);
    verified[keyOf(it)] = r;
    if (announce) FSX.toast(r.ok ? 'Integrity OK — hash matches frame + packet' : 'TAMPERED — recomputed hash does not match', r.ok ? 'ok' : 'bad');
    return r;
  }

  async function select(k) {
    selected = k;
    const it = all().find((x) => keyOf(x) === k);
    if (!it) return;
    renderQueue();
    renderDetail(it);
    await verifyItem(it);
    if (selected === k) { renderDetail(it); renderQueue(); }
  }

  function renderDetail(it) {
    const c = it.card, ok = c.verdict === 'SEALED', v = verified[keyOf(it)];
    const dec = FSX.loadDecisions()[c.id + ':' + c.sha256];
    const ed = c.packet && c.packet.edit_check;
    const checks = (c.checks || []).map((x) => {
      const st = x.pass === true ? 'pass' : x.pass === false ? 'fail' : 'na';
      return `<div class="ck ${st}"><span class="ico">${st === 'pass' ? '✓' : st === 'fail' ? '✕' : '–'}</span><span class="l">${esc(x.label)}</span><span class="d">${esc(x.detail)}</span></div>`;
    }).join('');
    let decision;
    if (v && !v.ok) decision = `<div class="decision blocked"><b style="color:var(--fail)">Blocked — card integrity failed.</b><div style="color:var(--muted);font-size:13px;margin-top:4px">The recomputed SHA-256 does not match. Something in the frame or the sensor packet was edited after the phone produced this card. Ask for a fresh capture.</div></div>`;
    else if (!ok) decision = `<div class="decision blocked"><b style="color:var(--fail)">Blocked — refusal cannot be overridden on the laptop.</b><div style="color:var(--muted);font-size:13px;margin-top:4px">The phone refused: <b style="color:var(--text)">${esc(c.failed_check)}</b>. Only a new live capture on the phone can produce a seal.</div><div class="row"><button class="btn small" disabled>Accept (disabled)</button></div></div>`;
    else if (dec === 'accepted') decision = `<div class="decision accepted"><b style="color:var(--pass)">Accepted · ticket closed.</b><div style="color:var(--muted);font-size:13px;margin-top:4px">Reviewer accepted a phone-sealed frame. The desk did not create or alter the seal.</div><div class="row"><button class="btn small ghost" id="bUndo">Undo</button></div></div>`;
    else decision = `<div class="decision"><b>Sealed on the phone.</b> <span style="color:var(--muted);font-size:13px">${v ? 'Integrity verified. ' : 'Verifying… '}Accepting closes the ticket; it does not add or change any seal.</span><div class="row"><button class="btn primary" id="bAccept" ${v && v.ok ? '' : 'disabled'}>✓ Accept &amp; close ticket</button></div></div>`;

    const pk = JSON.parse(JSON.stringify(c.packet || {}));
    if (pk.edit_check && pk.edit_check.sealed_thumbnail) pk.edit_check.sealed_thumbnail = pk.edit_check.sealed_thumbnail.slice(0, 40) + '…';
    $('detail').innerHTML = `
      <div class="dtop">
        <div><span class="vp ${ok ? 'pass' : 'fail'}" style="font-size:12px">${esc(FSX.verdictLabel(c))}</span>
          <h2 style="margin-top:8px">${esc(ok ? 'Live frame · this spot · this scene' : c.failed_check)}</h2>
          <div class="sub mono">${esc(c.id)} · ${esc(new Date(c.timestamp).toLocaleString())} · ${esc(c.mode || '')} · source: ${esc(it.source)}</div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn small" id="bVerify">⟳ Verify</button>
          <button class="btn small ghost" id="bTamper" title="Make an edited copy of this card to see the desk catch it">Tamper a copy</button>
          <button class="btn small ghost" id="bDl">Download</button>
        </div>
      </div>
      <div class="verify show ${v ? (v.ok ? 'ok' : 'bad') : ''}">${v ? (v.ok ? '<b>✓ INTEGRITY OK</b> — SHA-256 of frame bytes + sensor packet matches the seal.' : '<b>✕ TAMPERED</b> — ' + esc(v.reason)) + `<br><code>sealed&nbsp;&nbsp;: ${esc(v.expected || c.sha256)}</code><br><code>recomputed: ${esc(v.actual || '—')}</code>` : 'Verifying on this laptop…'}</div>
      <div class="dbody">
        <div>
          <div class="frame"><img src="${esc(c.frame)}" alt="Sealed frame"><span class="lab">${ed ? 'SUBMITTED AFTER-PHOTO' : (ok ? 'SEALED FRAME' : 'REFUSED FRAME')}</span></div>
          ${ed && ed.sealed_thumbnail ? `<div class="beforeafter"><div class="frame"><img src="${esc(ed.sealed_thumbnail)}" alt="Sealed"><span class="lab">SEALED ON PHONE</span></div><div class="frame"><img src="${esc(c.thumbnail)}" alt="Submitted"><span class="lab">SUBMITTED · Δ ${esc(ed.dhash_distance)}/64</span></div></div>` : ''}
          <div class="stats"><span class="chip">${esc(motionText(c))}</span><span class="chip">${esc(gnssStatus(c))}</span><span class="chip">network: ${esc(c.packet && c.packet.device && c.packet.device.network)}</span><span class="chip">cloud calls: ${esc(c.packet && c.packet.device ? c.packet.device.cloud_calls_in_seal_path : 0)}</span></div>
        </div>
        <div>
          <div class="checks dchecks" style="margin:0">${checks}</div>
          ${decision}
          <div class="kv" style="margin-top:14px"><span>SHA-256</span><code>${esc(c.sha256)}</code><span>dHash</span><code>${esc(c.dhash)}</code><span>Job</span><code>${esc(c.job)}</code><span>Site</span><code>${esc(c.site)}</code></div>
        </div>
      </div>
      <details class="pk"><summary>Sensor packet (hashed into the seal)</summary><pre>${esc(JSON.stringify(pk, null, 2))}</pre></details>`;
    $('bVerify').onclick = async () => { await verifyItem(it, true); renderDetail(it); renderQueue(); };
    $('bDl').onclick = () => FSX.downloadCard(c);
    $('bTamper').onclick = () => tamperCopy(it);
    const a = $('bAccept'); if (a) a.onclick = () => { FSX.saveDecision(c.id + ':' + c.sha256, 'accepted'); FSX.toast('Accepted · ticket closed', 'ok'); renderDetail(it); renderQueue(); };
    const u = $('bUndo'); if (u) u.onclick = () => { FSX.saveDecision(c.id + ':' + c.sha256, null); renderDetail(it); renderQueue(); };
  }

  function tamperCopy(it) {
    const c = JSON.parse(JSON.stringify(it.card));
    let what;
    if (c.verdict !== 'SEALED') {
      c.verdict = 'SEALED'; c.failed_check = null; c.outcome = 'PASS';
      what = 'flipped REFUSED → SEALED in the JSON';
    } else {
      c.packet.gnss.lat = FSX.round((c.packet.gnss.lat || 0) + 0.0021, 6);
      what = 'moved the GNSS fix ~230 m in the JSON';
    }
    const tagged = { card: c, source: 'tampered copy', tag: 't' + Date.now() };
    imported.unshift(tagged);
    FSX.toast('Made a tampered copy: ' + what);
    select(keyOf(tagged));
  }

  function importText(text, name) {
    let c;
    try { c = JSON.parse(text); } catch (e) { FSX.toast((name || 'Input') + ' is not valid JSON', 'bad'); return null; }
    if (!c || c.schema !== FSX.SCHEMA || typeof c.frame !== 'string') { FSX.toast((name || 'Input') + ' is not a FrameSeal card', 'bad'); return null; }
    const it = { card: c, source: 'imported', tag: 'i' + Date.now() + Math.random() };
    imported.unshift(it);
    return it;
  }
  async function importFiles(files) {
    let last = null;
    for (const f of files) { const it = importText(await f.text(), f.name); if (it) last = it; }
    if (last) { renderQueue(); select(keyOf(last)); FSX.toast('Imported ' + files.length + ' card' + (files.length > 1 ? 's' : '')); }
  }

  async function buildExamples() {
    const base = Date.parse('2026-10-04T03:40:00Z');
    const order = ['PASS', 'GALLERY', 'SPOOF', 'EDIT'];
    examples = [];
    for (let i = 0; i < order.length; i++) {
      const card = await FSX.scenarioCard(order[i], { seed: 1000 + i, time: base + i * 7 * 60000 });
      examples.push({ card, source: 'example' });
    }
  }

  /* ---------- wire up ---------- */
  FSX.bindNetChip($('net'));
  $('bImport').onclick = () => $('file').click();
  $('file').onchange = (e) => { importFiles([...e.target.files]); e.target.value = ''; };
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' || e.target === drop) drop.classList.remove('over'); }));
  document.addEventListener('drop', (e) => { const f = [...(e.dataTransfer && e.dataTransfer.files || [])]; if (f.length) importFiles(f); });
  document.addEventListener('paste', (e) => {
    const t = e.clipboardData && e.clipboardData.getData('text');
    if (t && t.trim().startsWith('{')) { const it = importText(t, 'Clipboard'); if (it) { renderQueue(); select(keyOf(it)); FSX.toast('Imported card from clipboard'); } }
  });
  $('bPaste').onclick = async () => {
    try { const t = await navigator.clipboard.readText(); const it = importText(t, 'Clipboard'); if (it) { renderQueue(); select(keyOf(it)); FSX.toast('Imported card from clipboard'); } }
    catch (e) { FSX.toast('Clipboard read blocked — press Ctrl/⌘+V or use Import', 'bad'); }
  };
  $('bClear').onclick = () => { FSX.clearQueue(); imported = []; selected = null; renderQueue(); const f = all()[0]; if (f) select(keyOf(f)); FSX.toast('Cleared local cards · examples kept'); };
  window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith('frameseal.')) { renderQueue(); FSX.toast('New card from the phone'); } });

  $('detail').innerHTML = '<p style="color:var(--muted)">Loading queue…</p>';
  buildExamples().then(() => {
    renderQueue();
    const first = all()[0];
    if (first) select(keyOf(first));
    // pre-verify everything so the queue shows integrity badges
    Promise.all(all().map((it) => verifyItem(it))).then(renderQueue);
  });
  FSX.registerSW();
  window.FSDesk = { all, select, keyOf, importText, verifyItem, tamperCopy };
})();
