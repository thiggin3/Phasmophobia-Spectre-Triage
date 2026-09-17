/**
 * app.js — browser UI for Spectre Triage.
 *
 * Relies on the globals defined by ghosts.js and engine.js (the build step
 * concatenates the three files into one inline script and strips the ESM
 * import/export lines). Everything DOM-related lives here; the engine stays
 * pure so it can be unit-tested in Node.
 */

/* ────────────────────────── state ────────────────────────── */

const STORAGE_KEY = 'spectre-triage-v1';
const NEW_GHOSTS = new Set(['dayan', 'obambo', 'gallu', 'kormos', 'aswang', 'deildegast']);

/** Investigation state — the single source of truth for the triage view. */
let state = createState();
/** UI-only preferences (not part of identification logic). */
let ui = { view: 'triage', tier: 'all', relevantOnly: true, calib: BPM_PER_MPS, taps: [] };

/** Persist per-viewer convenience state. Storage may be unavailable — never fatal. */
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      state: { ...state, found: [...state.found], ruledOut: [...state.ruledOut] },
      ui: { view: ui.view, tier: ui.tier, relevantOnly: ui.relevantOnly, calib: ui.calib },
    }));
  } catch (_) { /* private mode / blocked storage — ignore */ }
}
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.state) {
      state = createState({ ...data.state, found: new Set(data.state.found), ruledOut: new Set(data.state.ruledOut) });
      if (!DIFFICULTIES[state.difficulty]) state.difficulty = 'professional';
    }
    if (data.ui) ui = { ...ui, ...data.ui };
  } catch (_) { state = createState(); }
}

const $ = sel => document.querySelector(sel);
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v === false || v === null || v === undefined) continue;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined) node.append(c.nodeType ? c : document.createTextNode(String(c)));
  return node;
};
const fmt = n => (Math.round(n * 100) / 100).toString();
const evLabel = id => EVIDENCE.find(e => e.id === id)?.short ?? id;

/* ────────────────────────── top bar ────────────────────────── */

function renderTopbar() {
  const dseg = $('#difficulty-seg'); dseg.replaceChildren();
  for (const [key, d] of Object.entries(DIFFICULTIES)) {
    dseg.append(el('button', { type: 'button', 'aria-pressed': String(state.difficulty === key),
      onclick: () => { state.difficulty = key; update(); } },
      d.label.replace('Custom · 0 evidence', 'Custom 0'), el('span', { class: 'ev-count' }, `${d.evidence}ev`)));
  }
  const mseg = $('#map-seg'); mseg.replaceChildren();
  for (const size of ['small', 'medium', 'large']) {
    mseg.append(el('button', { type: 'button', 'aria-pressed': String(state.mapSize === size),
      onclick: () => { state.mapSize = size; update(); } }, size[0].toUpperCase() + size.slice(1)));
  }
}

/* ────────────────────────── evidence grid ────────────────────────── */

function cycleEvidence(id) {
  if (state.found.has(id)) { state.found.delete(id); state.ruledOut.add(id); }
  else if (state.ruledOut.has(id)) { state.ruledOut.delete(id); }
  else { state.found.add(id); }
  update();
}

function renderEvidence(result) {
  const grid = $('#evidence-grid'); grid.replaceChildren();
  const shown = result.shown;
  EVIDENCE.forEach((ev, i) => {
    let st = state.found.has(ev.id) ? 'found' : state.ruledOut.has(ev.id) ? 'out' : 'unknown';
    // Could any remaining ghost still show this evidence?
    const stillPossible = result.possible.some(g => g.evidence.includes(ev.id) || g.fakeEvidence === ev.id);
    const attrs = { class: 'ev', type: 'button', 'data-state': st === 'unknown' && !stillPossible ? 'impossible' : st,
      'aria-pressed': String(st === 'found'), onclick: () => cycleEvidence(ev.id) };
    grid.append(el('button', attrs,
      el('span', { class: 'key' }, i + 1),
      el('span', { class: 'name' }, ev.label),
      el('span', { class: 'state' }, st === 'found' ? 'found' : st === 'out' ? 'ruled out' : stillPossible ? 'unknown' : 'not possible')));
  });
  const realFound = [...state.found].filter(f => f !== 'orbs' || result.possible.some(g => g.evidence.includes('orbs')) || result.possible.length === 0).length;
  $('#slots-label').textContent = shown === 0 ? 'no evidence on this difficulty' : `${Math.min(realFound, shown)} / ${shown} slots filled`;
}

/* ────────────────────────── ghost list ────────────────────────── */

function ghostChip(g, { single = false } = {}) {
  const pips = g.evidence.map(e => el('span', { class: `pip ${state.found.has(e) ? 'found' : state.ruledOut.has(e) ? 'out' : ''}` }, evLabel(e)));
  if (g.fakeEvidence) pips.push(el('span', { class: `pip fake ${state.found.has(g.fakeEvidence) ? 'found' : ''}`, title: 'Always shown (fake)' }, evLabel(g.fakeEvidence) + '*'));
  const thr = g.hunt.min === g.hunt.max ? `${g.hunt.base}%` : `${g.hunt.min}–${g.hunt.max}%`;
  const spd = g.speed.min === g.speed.max ? `${fmt(g.speed.min)}` : `${fmt(g.speed.min)}–${fmt(g.speed.max)}`;
  return el('button', { class: `ghost${single ? ' single' : ''}`, type: 'button', onclick: () => openSheet(g) },
    el('span', { class: 'n' }, g.name, NEW_GHOSTS.has(g.id) ? el('span', { class: 'new' }, 'NEW') : null),
    el('span', { class: 'meta' }, el('span', { class: 't' }, `hunt ${thr}${g.hunt.targetSanity ? ' target' : ''}`), el('span', {}, `${spd} m/s`)),
    el('span', { class: 'evs' }, pips));
}

function renderGhosts(result) {
  const list = $('#ghost-list'); list.replaceChildren();
  const n = result.possible.length;
  $('#count-label').textContent = `${n} of ${GHOSTS.length}`;
  $('#nav-count').textContent = n;
  if (n === 0) list.append(el('p', { class: 'empty' }, 'Nothing fits. Re-check a toggle — a ruled-out evidence or a mis-answered behaviour is the usual culprit.'));
  for (const g of result.possible) list.append(ghostChip(g, { single: n === 1 }));

  const elim = $('#eliminated'); const elimList = $('#eliminated-list'); elimList.replaceChildren();
  elim.hidden = result.eliminated.length === 0;
  elim.querySelector('summary').textContent = `${result.eliminated.length} eliminated — show`;
  const groups = {};
  for (const { ghost, reason } of result.eliminated) (groups[reason] ||= []).push(ghost);
  for (const [reason, ghosts] of Object.entries(groups)) {
    elimList.append(el('div', { class: 'hint', style: 'flex-basis:100%;margin:4px 0 0' }, `by ${reason}`));
    for (const g of ghosts) elimList.append(ghostChip(g));
  }
}

/* ────────────────────────── next best test ────────────────────────── */

function renderTests(result) {
  const wrap = $('#tests'); wrap.replaceChildren();
  if (result.possible.length <= 1) {
    wrap.append(el('p', { class: 'hint' }, result.possible.length === 1
      ? `Identified: ${result.possible[0].name}. Confirm with one tell from its card before you commit the journal.`
      : 'No candidates remain — fix the inputs first.'));
    return;
  }
  const tests = (result.possible.length <= 4 ? finalFilter(state, result.possible) : nextBestTests(state, result.possible)).slice(0, 5);
  if (result.possible.length <= 4) wrap.append(el('p', { class: 'hint', style: 'margin:0 0 4px' }, `Final filter · ${result.possible.length} left. Each question below splits them.`));
  tests.forEach((t, i) => {
    const total = t.yes + t.no;
    const card = el('div', { class: `test${i === 0 ? ' top' : ''}` },
      el('div', {}, el('div', { class: `kind ${t.kind}` }, t.kind === 'evidence' ? 'journal evidence' : t.kind === 'speed' ? 'speed' : (t.tier === 'veteran' ? 'behaviour · veteran' : 'behaviour')),
        el('div', { class: 'lbl' }, t.label)),
      el('div', { class: 'split' }, `yes ${t.yes} · no ${t.no}`),
      el('div', { class: 'bar' }, el('i', { style: `width:${(t.yes / total) * 100}%` }), el('i', { style: `width:${(t.no / total) * 100}%` })),
    );
    if (t.yesGhosts && t.yesGhosts.length <= 6) card.append(el('div', { class: 'sub' }, `Yes → ${t.yesGhosts.join(', ')}`));
    if (t.kind === 'evidence') {
      card.append(el('div', { class: 'act' },
        el('button', { class: 'mini yes', type: 'button', onclick: () => { state.found.add(t.id); state.ruledOut.delete(t.id); update(); } }, 'Found it'),
        el('button', { class: 'mini no', type: 'button', onclick: () => { state.ruledOut.add(t.id); state.found.delete(t.id); update(); } }, 'Rule out')));
    } else if (t.kind === 'behaviour') {
      card.append(el('div', { class: 'act' },
        el('button', { class: 'mini yes', type: 'button', onclick: () => { state.observations[t.id] = true; update(); } }, 'Yes'),
        el('button', { class: 'mini no', type: 'button', onclick: () => { state.observations[t.id] = false; update(); } }, 'No')));
    } else if (t.kind === 'speed') {
      card.append(el('div', { class: 'act' }, el('button', { class: 'mini', type: 'button', onclick: () => showView('speed') }, 'Open speed tap')));
    }
    wrap.append(card);
  });
}

/* ────────────────────────── observations ────────────────────────── */

function renderObservations(result) {
  const list = $('#obs-list'); list.replaceChildren();
  $('#tier-seg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tier === ui.tier)));
  $('#relevant-only').checked = ui.relevantOnly;
  const cands = result.possible;
  for (const obs of OBSERVATIONS) {
    if (ui.tier !== 'all' && obs.tier !== ui.tier) continue;
    const answer = state.observations[obs.id];
    if (ui.relevantOnly && answer === undefined && cands.length > 0) {
      // Skip questions whose YES answer would change nothing about the current candidates.
      const survivors = cands.filter(g => g.id === 'mimic' || ((!obs.only || obs.only.includes(g.id)) && !(obs.excludes && obs.excludes.includes(g.id))));
      if (survivors.length === cands.length || survivors.length === 0 || (survivors.length === 1 && survivors[0].id === 'mimic' && cands.length > 1 && !cands.some(g => obs.only?.includes(g.id)))) continue;
    }
    const setAns = v => { if (v === undefined) delete state.observations[obs.id]; else state.observations[obs.id] = v; update(); };
    list.append(el('div', { class: 'obs', 'data-answer': answer === undefined ? null : String(answer) },
      el('div', { class: 'q' }, obs.question, obs.tier === 'veteran' ? el('span', { class: 'tier' }, 'VET') : null),
      el('div', { class: 'tri' },
        el('button', { class: 'y', type: 'button', 'aria-pressed': String(answer === true), onclick: () => setAns(true) }, 'Yes'),
        el('button', { class: 'n', type: 'button', 'aria-pressed': String(answer === false), onclick: () => setAns(false) }, 'No'),
        el('button', { class: 'u', type: 'button', 'aria-pressed': String(answer === undefined), onclick: () => setAns(undefined) }, '?')),
      el('div', { class: 'note' }, obs.note)));
  }
  if (!list.children.length) list.append(el('p', { class: 'hint' }, 'No behaviour question would change the current candidate list. Untick "Only tests that still matter" to see everything.'));
}

/* ────────────────────────── numeric readings ────────────────────────── */

function renderReadings() {
  const hs = $('#hunt-sanity'); if (document.activeElement !== hs) hs.value = state.huntSanity ?? '';
  const sp = $('#speed-input'); if (document.activeElement !== sp) sp.value = state.speed ?? '';
  const d = DIFFICULTIES[state.difficulty];
  $('#hunt-hint').textContent = `Hunt lasts ≈ ${huntDuration(state.mapSize, state.difficulty)} s here (Obambo aggressive ${huntDuration(state.mapSize, state.difficulty, { obamboAggressive: true })} s). ` +
    `Raiju electronics boost radius ${raijuRadius(state.mapSize)} m on this map size. Sanity drain ×${d.sanityDrain}, start ${d.startSanity}%.`;
}

/* ────────────────────────── ghost detail sheet ────────────────────────── */

function openSheet(g) {
  const root = $('#sheet-root');
  const close = () => root.replaceChildren();
  const thr = g.hunt.min === g.hunt.max ? `${g.hunt.base}%` : `${g.hunt.min}% – ${g.hunt.max}%`;
  const sheet = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': g.name },
    el('h2', {}, g.name, NEW_GHOSTS.has(g.id) ? el('span', { class: 'new pip fake' }, 'NEW') : null, el('button', { class: 'btn quiet', type: 'button', onclick: close }, 'Close')),
    el('div', { class: 'evrow' }, g.evidence.map(e => el('span', { class: `pip ${state.found.has(e) ? 'found' : ''}` }, EVIDENCE.find(x => x.id === e).label)),
      g.fakeEvidence ? el('span', { class: 'pip fake' }, EVIDENCE.find(x => x.id === g.fakeEvidence).label + ' (always, fake)') : null),
    el('dl', { class: 'stat' },
      el('dt', {}, 'Hunt threshold'), el('dd', {}, el('span', { class: 'v' }, thr), ' — ', g.hunt.note),
      el('dt', {}, 'Speed'), el('dd', {}, el('span', { class: 'v' }, `${fmt(g.speed.min)}–${fmt(g.speed.max)} m/s`), ' — ', g.speed.note,
        g.speed.variants ? el('div', { class: 'variants', style: 'margin-top:6px' }, g.speed.variants.map(v => el('span', {}, `${v.label} `, el('b', {}, `${fmt(v.mps)} m/s`)))) : null),
      el('dt', {}, 'LoS speed-up'), el('dd', {}, g.speed.los ? `Yes — ramps to ×${LOS_MULTIPLIER} of base with sustained line of sight.` : 'No — fixed speed rules.'),
      el('dt', {}, 'Incense'), el('dd', {}, `Blocks hunts ${incenseBlock(g.id)} s · blinds ${g.incenseBlind ?? TIMERS.incenseBlindDefault} s during a hunt.`),
      el('dt', {}, 'Hunt cooldown'), el('dd', {}, `${g.huntCooldown ?? TIMERS.huntCooldownDefault} s`)),
    renderChase(g),
    el('h3', { style: 'margin:6px 0 0;font:400 14px var(--font-display);color:var(--ink-dim)' }, 'Tells'),
    el('ul', {}, g.tells.map(t => el('li', {}, t))),
    el('div', { class: 'sw' }, el('div', {}, el('b', {}, 'Strength'), g.strengths), el('div', {}, el('b', {}, 'Weakness'), g.weaknesses)));
  root.replaceChildren(el('div', { class: 'sheet-back', onclick: e => { if (e.target === e.currentTarget) close(); } }, sheet));
  sheet.querySelector('button').focus();
}

/**
 * "You vs. the ghost" block for the ghost card: your walk / sprint numbers on
 * a shared scale, then one verdict per ghost speed state so you know whether to
 * walk, sprint-cycle, loop, or hide.
 */
function renderChase(g) {
  const prof = chaseProfile(g);
  const lo = 0.4, hi = 3.8, pct = v => ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100;
  const scale = el('div', { class: 'chase-scale' },
    el('div', { class: 'axis' }),
    // Player reference lines
    el('div', { class: 'pmark walk', style: `left:${pct(prof.player.walk)}%` }, el('span', {}, `walk ${prof.player.walk}`)),
    el('div', { class: 'pmark avg', style: `left:${pct(prof.player.sprintAverage)}%` }, el('span', {}, `sprint avg ${prof.player.sprintAverage}`)),
    el('div', { class: 'pmark sprint', style: `left:${pct(prof.player.sprint)}%` }, el('span', {}, `sprint ${prof.player.sprint}`)),
    // Ghost envelope
    el('div', { class: `gband lvl-${prof.worst.level}`, style: `left:${pct(g.speed.min)}%;width:${Math.max(0.8, pct(g.speed.max) - pct(g.speed.min))}%` }));
  const rows = el('div', { class: 'chase-rows' }, prof.rows.map(r =>
    el('div', { class: `chase-row lvl-${r.verdict.level}`, title: r.verdict.detail },
      el('span', { class: 'cl' }, r.label),
      el('span', { class: 'cm' }, `${fmt(r.mps)} m/s`),
      el('span', { class: 'cv' }, r.verdict.label))));
  return el('section', { class: 'chase' },
    el('h3', { style: 'margin:0 0 6px;font:400 14px var(--font-display);color:var(--ink-dim);display:flex;gap:8px;align-items:center' },
      'You vs. the ghost', el('span', { class: `verdict lvl-${prof.worst.level}` }, `worst case: ${prof.worst.label}`)),
    scale, rows,
    el('p', { class: 'hint', style: 'margin:8px 0 0' }, `You walk at ${prof.player.walk} m/s and sprint at ${prof.player.sprint} m/s for ${prof.player.sprintSeconds} s, then need ${prof.player.sprintCooldownSeconds} s to recharge — cycling that averages ${prof.player.sprintAverage} m/s. ${prof.worst.detail}`));
}

/* ────────────────────────── speed view ────────────────────────── */

function speedBpm(mps) { return Math.round(mpsToBpm(mps, ui.calib)); }

function renderTap() {
  const bpm = tapsToBpm(ui.taps);
  const mps = bpm ? bpmToMps(bpm, ui.calib) : null;
  $('#tap-mps').textContent = mps ? mps.toFixed(2) : '—';
  $('#tap-bpm').textContent = bpm ? Math.round(bpm) : '—';
  $('#tap-count').textContent = ui.taps.length;
  $('#tap-vs').textContent = mps ? (mps < TIMERS.playerWalk ? 'slower than walk' : mps < TIMERS.playerSprintAverage ? 'walk < ghost < sprint avg' : mps <= TIMERS.playerSprint ? 'faster than sprint avg' : 'outruns you') : '—';
  $('#tap-cue').textContent = ui.taps.length < 3 ? 'Tap here (or press Space) in time with the footsteps — 3+ taps needed' : 'Keep tapping; the last 8 taps are used';
  $('#calib').value = ui.calib; $('#calib-label').textContent = `${ui.calib} BPM per m/s`;

  // Speed scale 0.4 – 3.8 m/s with candidate bands and the live marker.
  const scale = $('#speed-scale'); scale.replaceChildren(el('div', { class: 'axis' }));
  const lo = 0.4, hi = 3.8, pct = v => ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100;
  for (const v of [0.4, 1.0, 1.4, 1.7, 2.1, 2.5, 3.0, 3.71]) scale.append(el('div', { class: 'tick', style: `left:${pct(v)}%` }, el('span', {}, fmt(v))));
  const cands = evaluate(state).possible;
  for (const g of cands) scale.append(el('div', { class: 'band', title: g.name, style: `left:${pct(g.speed.min)}%;width:${Math.max(0.6, pct(g.speed.max) - pct(g.speed.min))}%` }));
  if (mps) scale.append(el('div', { class: 'mark', style: `left:${pct(mps)}%` }));

  const matches = $('#speed-matches'); matches.replaceChildren();
  if (mps) {
    const m = matchSpeed(mps, cands.length ? cands : GHOSTS);
    if (!m.length) matches.append(el('span', { class: 'hint' }, 'No remaining ghost moves at this speed — check calibration or the candidate list.'));
    for (const g of m.slice(0, 12)) matches.append(el('span', { class: 'm' }, g.name, el('b', {}, `${fmt(g.speed.min)}–${fmt(g.speed.max)}`)));
  } else {
    matches.append(el('span', { class: 'hint' }, `Bands show the speed envelope of each remaining ghost (${cands.length}).`));
  }
}

function renderCalculators() {
  const t = parseFloat($('#hantu-temp').value); $('#hantu-out').textContent = Number.isFinite(t) ? hantuSpeed(t).toFixed(2) : '—';
  const a = parseInt($('#thaye-age').value, 10); const th = thayeAtAge(Number.isFinite(a) ? a : 0);
  $('#thaye-out').textContent = th.speed.toFixed(3); $('#thaye-thr').textContent = `m/s · hunts at ${th.threshold}%`;
  const s = parseFloat($('#moroi-san').value); const ms = moroiSpeed(Number.isFinite(s) ? s : 100);
  $('#moroi-out').textContent = ms.toFixed(3); $('#moroi-los').textContent = `m/s (LoS max ${(ms * LOS_MULTIPLIER).toFixed(2)})`;
  const it = parseInt($('#deil-items').value, 10); $('#deil-out').textContent = deildegastSpeed(Number.isFinite(it) ? it : 0).toFixed(2);
  $('#raiju-hint').textContent = `Raiju: flat 2.5 m/s within ${raijuRadius(state.mapSize)} m of active electronics on a ${state.mapSize} map. Jinn: 2.5 m/s only with breaker on, LoS and > 3 m. Kormos: 2.21 m/s when travelling to a sound.`;
}

function renderSpeedTable() {
  const tbl = $('#speed-table'); tbl.replaceChildren();
  tbl.append(el('thead', {}, el('tr', {}, ['Ghost', 'Base', 'Range', '≈BPM', 'LoS ramp', 'Rule'].map(h => el('th', {}, h)))));
  const cands = new Set(evaluate(state).possible.map(g => g.id));
  const body = el('tbody');
  for (const g of [...GHOSTS].sort((a, b) => b.speed.max - a.speed.max)) {
    body.append(el('tr', { class: cands.has(g.id) ? '' : 'dim', onclick: () => openSheet(g), style: 'cursor:pointer' },
      el('td', {}, g.name), el('td', { class: 'mono' }, fmt(g.speed.base)),
      el('td', { class: 'mono' }, `${fmt(g.speed.min)} – ${fmt(g.speed.max)}`),
      el('td', { class: 'mono' }, `${speedBpm(g.speed.min)} – ${speedBpm(g.speed.max)}`),
      el('td', { class: 'mono' }, g.speed.los ? 'yes' : 'no'), el('td', {}, g.speed.note)));
  }
  tbl.append(body);
}

/* ────────────────────────── timers view ────────────────────────── */

/** Countdown timers with milestone marks. Each has its own interval. */
const timerDefs = [
  { id: 'incense', title: 'Incense · hunt block', total: 180, marks: [{ at: 60, l: 'Demon 60 s' }, { at: 90, l: 'Others 90 s' }, { at: 180, l: 'Spirit 180 s' }], hint: 'Start when the incense is lit outside a hunt.' },
  { id: 'cooldown', title: 'Hunt cooldown', total: 25, marks: [{ at: 20, l: 'Demon 20 s' }, { at: 25, l: 'Others 25 s' }], hint: 'Start when a hunt ends.' },
  { id: 'obambo', title: 'Obambo state clock', total: 60, marks: [{ at: 60, l: 'Calm → Aggressive' }], cycle: 120, hint: 'Start when the exit door first opens. Flips at 1 min, then every 2 min.' },
  { id: 'hunt', title: 'Hunt length', total: null, marks: [], hint: 'Start when the hunt begins — shows expected end for this map/difficulty.' },
];
const timers = {};

function renderTimers() {
  const wrap = $('#timers'); wrap.replaceChildren();
  $('#hunt-dur-label').textContent = `${state.mapSize} · ${DIFFICULTIES[state.difficulty].label} ≈ ${huntDuration(state.mapSize, state.difficulty)} s`;
  for (const def of timerDefs) {
    const t = timers[def.id] ||= { running: false, elapsed: 0, startedAt: 0, flips: 0 };
    const total = def.id === 'hunt' ? huntDuration(state.mapSize, state.difficulty) : def.total;
    const clock = el('div', { class: 'clock', id: `clock-${def.id}` }, '0.0');
    const marks = el('div', { class: 'marks' }, def.marks.map(m => el('span', { 'data-at': m.at }, m.l)));
    const stateLine = el('div', { class: 'hint', id: `tstate-${def.id}`, style: 'margin:0' }, def.hint);
    const card = el('div', { class: 'timer' }, el('h3', {}, def.title), clock, marks, stateLine,
      el('div', { class: 'ctl' },
        el('button', { class: 'btn primary', type: 'button', onclick: () => { t.running = true; t.startedAt = performance.now() - t.elapsed * 1000; } }, 'Start'),
        el('button', { class: 'btn quiet', type: 'button', onclick: () => { t.running = false; } }, 'Pause'),
        el('button', { class: 'btn quiet', type: 'button', onclick: () => { t.running = false; t.elapsed = 0; t.flips = 0; } }, 'Reset')));
    wrap.append(card);
    t.render = () => {
      if (t.running) t.elapsed = (performance.now() - t.startedAt) / 1000;
      clock.textContent = t.elapsed.toFixed(1);
      marks.querySelectorAll('span').forEach(s => s.classList.toggle('passed', t.elapsed >= +s.dataset.at));
      clock.className = 'clock';
      if (def.id === 'incense') { clock.classList.add(t.elapsed < 60 ? 'safe' : t.elapsed < 180 ? 'hot' : ''); stateLine.textContent = t.elapsed < 60 ? 'Safe from every ghost.' : t.elapsed < 90 ? 'Only a Demon can hunt now.' : t.elapsed < 180 ? 'Everything but a Spirit can hunt.' : 'Block has expired for all ghosts.'; }
      else if (def.id === 'cooldown') { clock.classList.add(t.elapsed < 20 ? 'safe' : 'hot'); stateLine.textContent = t.elapsed < 20 ? 'No ghost can hunt yet.' : t.elapsed < 25 ? 'Only a Demon can hunt.' : 'Any ghost may hunt again.'; }
      else if (def.id === 'obambo') {
        const aggressive = t.elapsed >= 60 && Math.floor((t.elapsed - 60) / 120) % 2 === 0;
        const next = t.elapsed < 60 ? 60 - t.elapsed : 120 - ((t.elapsed - 60) % 120);
        clock.classList.add(aggressive ? 'hot' : 'safe');
        stateLine.textContent = `${aggressive ? 'AGGRESSIVE — hunts at 65%, 1.955 m/s' : 'CALM — hunts at 10%, 1.445 m/s'} · flips in ${next.toFixed(0)} s`;
      } else if (def.id === 'hunt') { clock.classList.add(t.elapsed < total ? 'hot' : 'safe'); stateLine.textContent = t.elapsed < total ? `Expected end in ${(total - t.elapsed).toFixed(0)} s (Obambo aggressive: ${(total * 0.8 - t.elapsed).toFixed(0)} s)` : 'Past the base duration — hunt should be over unless extended.'; }
    };
    t.render();
  }
}
setInterval(() => { for (const t of Object.values(timers)) if (t.render && t.running) t.render(); }, 100);

function renderThresholdTable() {
  const tbl = $('#threshold-table'); tbl.replaceChildren();
  tbl.append(el('thead', {}, el('tr', {}, ['Ghost', 'Threshold', 'Condition'].map(h => el('th', {}, h)))));
  const cands = new Set(evaluate(state).possible.map(g => g.id));
  const body = el('tbody');
  for (const g of [...GHOSTS].sort((a, b) => b.hunt.max - a.hunt.max || b.hunt.min - a.hunt.min)) {
    body.append(el('tr', { class: cands.has(g.id) ? (g.hunt.max > 50 ? 'hl' : '') : 'dim', onclick: () => openSheet(g), style: 'cursor:pointer' },
      el('td', {}, g.name), el('td', { class: 'mono' }, g.hunt.min === g.hunt.max ? `${g.hunt.base}%` : `${g.hunt.min}–${g.hunt.max}%`), el('td', {}, g.hunt.note)));
  }
  tbl.append(body);
}

/* ────────────────────────── journal view ────────────────────────── */

function renderJournal() {
  const tbl = $('#journal-table'); tbl.replaceChildren();
  tbl.append(el('thead', {}, el('tr', {}, ['Ghost', 'Evidence', 'Hunt', 'Speed m/s', 'Primary tell'].map(h => el('th', {}, h)))));
  const cands = new Set(evaluate(state).possible.map(g => g.id));
  const body = el('tbody');
  for (const g of GHOSTS) {
    body.append(el('tr', { class: cands.has(g.id) ? '' : 'dim', onclick: () => openSheet(g), style: 'cursor:pointer' },
      el('td', {}, g.name, NEW_GHOSTS.has(g.id) ? ' ' : '', NEW_GHOSTS.has(g.id) ? el('span', { class: 'pip fake' }, 'NEW') : null),
      el('td', {}, el('span', { class: 'evs', style: 'display:flex;gap:4px;flex-wrap:wrap' }, g.evidence.map(e => el('span', { class: `pip ${state.found.has(e) ? 'found' : state.ruledOut.has(e) ? 'out' : ''}` }, evLabel(e))), g.fakeEvidence ? el('span', { class: 'pip fake' }, 'Orbs*') : null)),
      el('td', { class: 'mono' }, g.hunt.min === g.hunt.max ? `${g.hunt.base}%` : `${g.hunt.min}–${g.hunt.max}%`),
      el('td', { class: 'mono' }, `${fmt(g.speed.min)}–${fmt(g.speed.max)}`),
      el('td', {}, g.tells[0])));
  }
  tbl.append(body);
  $('#sources').innerHTML = 'Data current to Phasmophobia v0.19.0.2 (16 Sep 2026). Thresholds are average team sanity unless marked "target". Speeds in m/s; player walk 1.6, sprint 3.0 for 3 s. ' +
    'Sources: Kinetic Games patch notes (v0.15.1 Winter\'s Jest, v0.17.x, v0.18.0, v0.19.x), Phasmophobia community wiki, Steam community complete ghost guide (Deildegast edition). ' +
    'Cadence-to-speed calibration is a community approximation — treat BPM as a guide, m/s brackets as the truth.';
}

/* ────────────────────────── views / nav ────────────────────────── */

function showView(name) {
  ui.view = name;
  for (const v of ['triage', 'speed', 'timers', 'journal']) $(`#view-${v}`).hidden = v !== name;
  document.querySelectorAll('.nav button').forEach(b => b.dataset.view === name ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  if (name === 'speed') { renderTap(); renderCalculators(); renderSpeedTable(); }
  if (name === 'timers') { renderTimers(); renderThresholdTable(); }
  if (name === 'journal') renderJournal();
  save();
}

/** Re-run the engine and repaint the triage view. Called after every state change. */
function update() {
  const result = evaluate(state);
  renderTopbar();
  renderEvidence(result);
  renderGhosts(result);
  renderTests(result);
  renderObservations(result);
  renderReadings();
  if (ui.view === 'speed') { renderTap(); renderCalculators(); renderSpeedTable(); }
  if (ui.view === 'timers') { renderThresholdTable(); $('#hunt-dur-label').textContent = `${state.mapSize} · ${DIFFICULTIES[state.difficulty].label} ≈ ${huntDuration(state.mapSize, state.difficulty)} s`; }
  if (ui.view === 'journal') renderJournal();
  save();
}

function resetContract() {
  const keep = { difficulty: state.difficulty, mapSize: state.mapSize };
  state = createState(keep);
  ui.taps = [];
  update();
}

/* ────────────────────────── wiring ────────────────────────── */

function bind() {
  $('#reset-btn').addEventListener('click', resetContract);
  document.querySelectorAll('.nav button').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
  $('#tier-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { ui.tier = b.dataset.tier; update(); } });
  $('#relevant-only').addEventListener('change', e => { ui.relevantOnly = e.target.checked; update(); });
  $('#hunt-sanity').addEventListener('input', e => { const v = parseFloat(e.target.value); state.huntSanity = Number.isFinite(v) ? v : null; update(); });
  $('#speed-input').addEventListener('input', e => { const v = parseFloat(e.target.value); state.speed = Number.isFinite(v) ? v : null; update(); });

  // Speed tap: pointerdown for zero-latency taps; Space key when the speed view is open.
  const tap = () => {
    const now = performance.now();
    // A gap > 3 s means a new measurement.
    if (ui.taps.length && now - ui.taps[ui.taps.length - 1] > 3000) ui.taps = [];
    ui.taps.push(now); renderTap();
  };
  $('#tap-btn').addEventListener('pointerdown', e => { e.preventDefault(); tap(); });
  $('#tap-clear').addEventListener('click', () => { ui.taps = []; renderTap(); });
  $('#tap-apply').addEventListener('click', () => {
    const bpm = tapsToBpm(ui.taps); if (!bpm) return;
    state.speed = +bpmToMps(bpm, ui.calib).toFixed(2); update(); showView('triage');
  });
  $('#calib').addEventListener('input', e => { ui.calib = +e.target.value; renderTap(); renderSpeedTable(); save(); });
  for (const id of ['hantu-temp', 'thaye-age', 'moroi-san', 'deil-items']) $(`#${id}`).addEventListener('input', renderCalculators);

  // One-handed hotkeys: 1–7 evidence, R reset, Space taps (speed view), Esc closes the sheet.
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.key === 'Escape') { $('#sheet-root').replaceChildren(); return; }
    if (e.key === ' ' && ui.view === 'speed') { e.preventDefault(); tap(); return; }
    if (/^[1-7]$/.test(e.key)) { cycleEvidence(EVIDENCE[+e.key - 1].id); return; }
    if (e.key.toLowerCase() === 'r') resetContract();
  });
}

/* ────────────────────────── boot ────────────────────────── */

load();
bind();
update();
showView(ui.view || 'triage');
