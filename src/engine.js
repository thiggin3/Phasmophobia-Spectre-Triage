/**
 * engine.js — Ghost identification logic engine.
 *
 * Pure functions only (no DOM) so the same code runs in Node tests and the
 * browser bundle. Inputs are plain objects; outputs are plain arrays/objects.
 *
 * Core model
 * ──────────
 *  state = {
 *    difficulty : key of DIFFICULTIES (controls how many evidences are shown)
 *    mapSize    : 'small' | 'medium' | 'large'
 *    found      : Set<evidenceId>  — evidence confirmed in the journal
 *    ruledOut   : Set<evidenceId>  — evidence you are CERTAIN is absent
 *    observations : { [observationId]: true | false }  — behaviour answers
 *    huntSanity : number | null     — avg sanity when a hunt began (highest seen)
 *    speed      : number | null     — measured footstep speed in m/s
 *  }
 */

import { EVIDENCE, GHOSTS, TIMERS } from './ghosts.js';

/** Difficulty presets → number of evidences the journal will reveal. */
const DIFFICULTIES = {
  amateur:      { label: 'Amateur',      evidence: 3, sanityDrain: 1.0, startSanity: 100 },
  intermediate: { label: 'Intermediate', evidence: 3, sanityDrain: 1.5, startSanity: 100 },
  professional: { label: 'Professional', evidence: 3, sanityDrain: 2.0, startSanity: 100 },
  nightmare:    { label: 'Nightmare',    evidence: 2, sanityDrain: 2.0, startSanity: 100 },
  insanity:     { label: 'Insanity',     evidence: 1, sanityDrain: 2.0, startSanity: 75 },
  custom0:      { label: 'Custom · 0 evidence', evidence: 0, sanityDrain: 2.0, startSanity: 100 },
};

/**
 * Base hunt durations in seconds by map size and difficulty (before
 * ghost-specific modifiers such as Obambo's −20%). Community-verified values;
 * treat as a planning reference, not a stopwatch.
 */
const HUNT_DURATION = {
  small:  { amateur: 15, intermediate: 20, professional: 30, nightmare: 40, insanity: 50, custom0: 40 },
  medium: { amateur: 20, intermediate: 30, professional: 40, nightmare: 50, insanity: 60, custom0: 50 },
  large:  { amateur: 30, intermediate: 40, professional: 50, nightmare: 60, insanity: 70, custom0: 60 },
};

/** Raiju electronics speed-boost radius by map size (metres). */
const RAIJU_RADIUS = { small: 6, medium: 8, large: 10 };

/**
 * Behavioural observations ("soft evidence"). Each has:
 *  - id, question (UI text), yes/no labels
 *  - only:     if answered YES, only these ghosts (plus the Mimic) survive
 *  - excludes: if answered YES, these ghosts are removed
 *  - noOnly / noExcludes: same, for a NO answer (optional)
 *  - tier: 'basic' (New Blood) or 'veteran' (frame-data / niche)
 *  - note: explanation shown in UI
 * The Mimic is never removed by an observation (it can copy anything).
 */
const OBSERVATIONS = [
  { id: 'salt_stepped', tier: 'basic',
    question: 'Ghost stepped in salt (footprints / pile disturbed)?',
    excludes: ['wraith'],
    note: 'Wraiths never touch salt. A Gallu also refuses salt while Enraged — if you saw it refuse salt, answer NO and check the Gallu tells.' },
  { id: 'lights_on', tier: 'basic',
    question: 'Ghost turned a light ON?',
    excludes: ['mare'],
    note: 'A Mare will never switch a light on.' },
  { id: 'breaker_on', tier: 'basic',
    question: 'Ghost turned the breaker ON?',
    excludes: ['hantu'],
    note: 'A Hantu never turns the breaker on.' },
  { id: 'breaker_off', tier: 'basic',
    question: 'Ghost turned the breaker OFF directly?',
    excludes: ['jinn'],
    note: 'A Jinn cannot switch the breaker off (overloading it by lights is different).' },
  { id: 'door_closed', tier: 'basic',
    question: 'Ghost fully CLOSED a door outside a hunt?',
    only: ['yurei'],
    note: 'Only the Yurei fully closes doors outside of hunts (15% sanity drain nearby).' },
  { id: 'photo_no_ghost', tier: 'basic',
    question: 'Photo of a ghost event came out WITHOUT the ghost in it?',
    only: ['phantom'],
    note: 'Phantoms vanish when photographed and never appear in the picture.' },
  { id: 'six_finger', tier: 'basic',
    question: 'Saw a 6-finger handprint or 2-finger light-switch print?',
    only: ['obake'],
    note: 'Unique Obake prints.' },
  { id: 'dots_camera_only', tier: 'basic',
    question: 'Saw a D.O.T.S. figure with your own eyes (not via camera)?',
    excludes: ['goryo'],
    note: 'Goryo DOTS only appear through a video camera.' },
  { id: 'multi_throw', tier: 'basic',
    question: 'Several objects thrown at once (explosion)?',
    only: ['poltergeist'],
    note: 'Poltergeist explosion ability.' },
  { id: 'airball', tier: 'basic',
    question: 'Saw an airball / mist ghost event?',
    excludes: ['oni'],
    note: 'Oni never does the mist event.' },
  { id: 'double_interaction', tier: 'veteran',
    question: 'Two interactions at the same time in different places?',
    only: ['twins'],
    note: 'Twins interact simultaneously up to ~16 m apart.' },
  { id: 'scream_parabolic', tier: 'veteran',
    question: 'Heard a scream on the parabolic microphone?',
    only: ['banshee'],
    note: 'Banshee-only scream (~33% of its sounds).' },
  { id: 'heavy_breathing', tier: 'veteran',
    question: 'Spirit Box gave heavy breathing within 1 m?',
    only: ['deogen'],
    note: 'Deogen-only Spirit Box response.' },
  { id: 'hunt_in_room', tier: 'veteran',
    question: 'Hunt started while a player was in the ghost\'s room?',
    excludes: ['shade'],
    note: 'Shade will not hunt with a player in its room.' },
  { id: 'heard_talking_far', tier: 'veteran',
    question: 'Ghost reacted to your voice from more than 2.5 m during a hunt?',
    excludes: ['yokai'],
    note: 'Yokai only hear within 2.5 m while hunting.' },
  { id: 'ignored_silent', tier: 'veteran',
    question: 'Ghost walked past you while you stood still and silent (not hidden)?',
    only: ['kormos'],
    note: 'Kormos is blind — it only finds you by sound.' },
  { id: 'hunt_ended_hiding', tier: 'veteran',
    question: 'Hunt ended the moment the ghost reached your locker/closet?',
    only: ['aswang'],
    note: 'Aswang cannot kill in official hiding spots and abandons the hunt.' },
  { id: 'steps_quiet', tier: 'veteran',
    question: 'Footsteps only audible once equipment was already glitching?',
    only: ['myling'],
    note: 'Myling footsteps carry ~12 m instead of 20 m.' },
  { id: 'los_no_speedup', tier: 'veteran',
    question: 'Ghost did NOT speed up while chasing you in the open?',
    only: ['deogen', 'hantu', 'thaye', 'deildegast', 'revenant'],
    note: 'These ghosts have fixed speed rules rather than the LoS ramp.' },
  { id: 'slows_near', tier: 'veteran',
    question: 'Ghost was very fast far away but crawled once it reached you?',
    only: ['deogen'],
    note: 'Deogen: 3.0 m/s far, 0.4 m/s within 2.5 m.' },
  { id: 'slows_when_still', tier: 'veteran',
    question: 'Footsteps slowed when you stood still, sped up when you moved?',
    only: ['dayan'],
    note: 'Dayan reacts to nearby player movement.' },
  { id: 'faster_low_sanity', tier: 'veteran',
    question: 'Ghost got faster as team sanity dropped (no electronics/breaker involved)?',
    only: ['moroi'],
    note: 'Moroi scales 1.5 → 2.25 m/s with sanity.' },
  { id: 'slower_over_time', tier: 'veteran',
    question: 'Ghost became slower and calmer as the contract went on?',
    only: ['thaye'],
    note: 'Thaye ages (−0.175 m/s per age).' },
  { id: 'slower_after_tidying', tier: 'veteran',
    question: 'Ghost got slower after you moved 10+ different props?',
    only: ['deildegast'],
    note: 'Deildegast loses 0.1 m/s per unique item moved.' },
  { id: 'fast_electronics', tier: 'veteran',
    question: 'Ghost sped up ONLY when near switched-on equipment?',
    only: ['raiju'],
    note: 'Raiju: flat 2.5 m/s near active electronics.' },
  { id: 'fast_breaker', tier: 'veteran',
    question: 'Fast approach with breaker on, then normal speed for the last 3 m?',
    only: ['jinn'],
    note: 'Jinn 2.5 m/s only with breaker on, LoS, > 3 m.' },
  { id: 'breath_visible', tier: 'veteran',
    question: 'Saw the ghost\'s freezing breath during a hunt (breaker off)?',
    only: ['hantu'],
    note: 'Hantu-only visual.' },
  { id: 'flame_hunt', tier: 'veteran',
    question: 'Hunt began right after a candle/lighter was blown out?',
    only: ['onryo'],
    note: 'Onryo hunts on every 3rd extinguished flame.' },
  { id: 'shapeshift', tier: 'veteran',
    question: 'Ghost model changed for one flicker during a hunt?',
    only: ['obake'],
    note: 'Obake shapeshift.' },
  { id: 'enraged_by_gear', tier: 'veteran',
    question: 'Ghost got faster/angrier after crucifix, salt or incense use?',
    only: ['gallu'],
    note: 'Gallu Enraged state.' },
  { id: 'state_cycle', tier: 'veteran',
    question: 'Ghost hunted at ~65% and again only near 10%, on a 2-minute rhythm?',
    only: ['obambo'],
    note: 'Obambo Calm/Aggressive cycle.' },
  { id: 'incense_180', tier: 'veteran',
    question: 'No hunt for 90–180 s after incense while below threshold?',
    only: ['spirit'],
    note: 'Spirit is blocked 180 s by incense; others 90 s (Demon 60 s).' },
  { id: 'incense_60', tier: 'veteran',
    question: 'Hunt started 60–90 s after incense while below threshold?',
    only: ['demon'],
    note: 'Only a Demon is blocked for just 60 s.' },
  { id: 'evidence_changed', tier: 'veteran',
    question: 'Found MORE evidence than the difficulty allows, or evidence changed?',
    only: ['mimic'],
    note: 'Mimic always adds fake Ghost Orbs.' },
];

/* ───────────────────────── helpers ───────────────────────── */

const byId = Object.fromEntries(GHOSTS.map(g => [g.id, g]));
const asSet = v => (v instanceof Set ? v : new Set(v || []));

/** Fresh, empty investigation state. */
function createState(overrides = {}) {
  return {
    difficulty: 'professional',
    mapSize: 'medium',
    found: new Set(),
    ruledOut: new Set(),
    observations: {},
    huntSanity: null,
    speed: null,
    ...overrides,
  };
}

/**
 * Evidence-level feasibility. Returns true if the ghost could produce the
 * journal you have, given how many evidences the difficulty reveals.
 *
 * Rules:
 *  - Every found evidence must be one the ghost can show.
 *  - The ghost must still have at least `shown` evidences that are not ruled out.
 *  - Mimic: its fake Orbs are always shown; ruling Orbs out kills it.
 */
function evidenceFeasible(ghost, found, ruledOut, shown) {
  const F = asSet(found), R = asSet(ruledOut);
  const real = new Set(ghost.evidence);
  const showable = new Set(real);
  if (ghost.fakeEvidence) {
    if (R.has(ghost.fakeEvidence)) return false;
    showable.add(ghost.fakeEvidence);
  }
  for (const f of F) if (!showable.has(f)) return false;
  // Real evidences found must fit in the revealed slots.
  const realFound = [...F].filter(f => real.has(f));
  if (realFound.length > shown) return false;
  // Enough non-ruled-out real evidence must remain to fill the slots.
  const remainingReal = [...real].filter(e => !R.has(e));
  return remainingReal.length >= shown;
}

/** Behaviour-level feasibility from yes/no observations. Mimic always passes. */
function observationsFeasible(ghost, observations) {
  if (ghost.id === 'mimic') {
    // The only observation that can act on the Mimic is a NO to evidence_changed
    // (nothing) or a YES to a Mimic-only tell (still passes). Always feasible.
    return true;
  }
  for (const [id, answer] of Object.entries(observations || {})) {
    if (answer === null || answer === undefined) continue;
    const obs = OBSERVATIONS.find(o => o.id === id);
    if (!obs) continue;
    if (answer === true) {
      if (obs.only && !obs.only.includes(ghost.id)) return false;
      if (obs.excludes && obs.excludes.includes(ghost.id)) return false;
    } else {
      if (obs.noOnly && !obs.noOnly.includes(ghost.id)) return false;
      if (obs.noExcludes && obs.noExcludes.includes(ghost.id)) return false;
    }
  }
  return true;
}

/**
 * Hunt-sanity feasibility: a hunt that started at `sanity`% average requires a
 * ghost whose maximum possible threshold is ≥ that value. Banshee is kept
 * (it uses target sanity, which can be far below the average).
 */
function huntSanityFeasible(ghost, sanity) {
  if (sanity === null || sanity === undefined || Number.isNaN(sanity)) return true;
  if (ghost.hunt.targetSanity) return true;
  return ghost.hunt.max >= sanity - 0.5; // half-point tolerance for rounding
}

/** Speed feasibility: measured m/s must fall inside [min, max] ± tolerance. */
function speedFeasible(ghost, mps, tolerance = 0.15) {
  if (mps === null || mps === undefined || Number.isNaN(mps)) return true;
  return mps >= ghost.speed.min - tolerance && mps <= ghost.speed.max + tolerance;
}

/**
 * Main filter. Returns { possible: Ghost[], eliminated: {ghost, reason}[] }.
 */
function evaluate(state) {
  const shown = DIFFICULTIES[state.difficulty]?.evidence ?? 3;
  const possible = [], eliminated = [];
  for (const g of GHOSTS) {
    let reason = null;
    if (!evidenceFeasible(g, state.found, state.ruledOut, shown)) reason = 'evidence';
    else if (!observationsFeasible(g, state.observations)) reason = 'behaviour';
    else if (!huntSanityFeasible(g, state.huntSanity)) reason = 'hunt sanity';
    else if (!speedFeasible(g, state.speed)) reason = 'speed';
    if (reason) eliminated.push({ ghost: g, reason }); else possible.push(g);
  }
  return { possible, eliminated, shown };
}

/**
 * Score how well a binary test splits the candidate set. Perfect = 1 (half/half),
 * useless = 0 (all on one side). Uses normalised Shannon entropy.
 */
function splitScore(yesCount, total) {
  if (total < 2 || yesCount <= 0 || yesCount >= total) return 0;
  const p = yesCount / total;
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

/**
 * Rank the next best tests (evidence to hunt for + behaviours to watch for)
 * given the current candidates. Evidence tests are only offered when the
 * journal still has open slots; behaviour tests always.
 */
function nextBestTests(state, candidates = evaluate(state).possible) {
  const shown = DIFFICULTIES[state.difficulty]?.evidence ?? 3;
  const F = asSet(state.found), R = asSet(state.ruledOut);
  const total = candidates.length;
  const tests = [];

  const realFound = [...F].filter(f => f !== 'orbs' || candidates.some(g => g.evidence.includes('orbs')));
  const slotsOpen = shown > 0 && realFound.length < shown;

  if (slotsOpen) {
    for (const ev of EVIDENCE) {
      if (F.has(ev.id) || R.has(ev.id)) continue;
      const yes = candidates.filter(g => g.evidence.includes(ev.id) || g.fakeEvidence === ev.id).length;
      const score = splitScore(yes, total);
      if (score > 0) tests.push({ kind: 'evidence', id: ev.id, label: `Look for ${ev.label}`, score, yes, no: total - yes,
        yesGhosts: candidates.filter(g => g.evidence.includes(ev.id) || g.fakeEvidence === ev.id).map(g => g.name) });
    }
  }

  for (const obs of OBSERVATIONS) {
    if (state.observations && state.observations[obs.id] !== undefined && state.observations[obs.id] !== null) continue;
    // Which candidates survive a YES?
    const yesSet = candidates.filter(g => g.id === 'mimic' ||
      ((!obs.only || obs.only.includes(g.id)) && !(obs.excludes && obs.excludes.includes(g.id))));
    const yes = yesSet.length;
    // Only useful if a YES removes something and is possible for someone.
    const score = splitScore(yes, total) || (yes < total && yes > 0 ? 0.01 : 0);
    if (score > 0) tests.push({ kind: 'behaviour', id: obs.id, label: obs.question, score, yes, no: total - yes, tier: obs.tier,
      yesGhosts: yesSet.map(g => g.name), note: obs.note });
  }

  // Speed test is valuable whenever candidates disagree on speed range.
  if (state.speed === null || state.speed === undefined) {
    const ranges = new Set(candidates.map(g => `${g.speed.min}-${g.speed.max}`));
    if (ranges.size > 1) {
      const fast = candidates.filter(g => g.speed.max > 2.9).length;
      tests.push({ kind: 'speed', id: 'speed_tap', label: 'Tap footsteps to measure hunt speed', score: Math.max(0.2, splitScore(fast, total)),
        yes: fast, no: total - fast, yesGhosts: candidates.filter(g => g.speed.max > 2.9).map(g => g.name) });
    }
  }

  return tests.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

/**
 * "Final Filter" — when few candidates remain, produce the sharpest pairwise
 * questions. Returns tests that separate at least one pair of candidates,
 * annotated with what each answer would leave.
 */
function finalFilter(state, candidates = evaluate(state).possible) {
  if (candidates.length <= 1) return [];
  return nextBestTests(state, candidates)
    .filter(t => t.kind !== 'evidence' || (DIFFICULTIES[state.difficulty]?.evidence ?? 3) > 0)
    .map(t => ({ ...t, ifYes: t.yesGhosts, ifNo: candidates.map(g => g.name).filter(n => !t.yesGhosts.includes(n)) }))
    .slice(0, 6);
}

/* ─────────────────── speed & sound (footstep tap) ─────────────────── */

/**
 * Community-derived calibration: footstep cadence scales linearly with speed.
 * At 1.7 m/s a ghost steps at roughly 92 BPM; 3.0 m/s ≈ 162 BPM.
 * Exposed so the UI can offer a calibration slider.
 */
const BPM_PER_MPS = 54;

function bpmToMps(bpm, k = BPM_PER_MPS) { return bpm > 0 ? bpm / k : 0; }
function mpsToBpm(mps, k = BPM_PER_MPS) { return mps * k; }

/**
 * Given tap timestamps (ms), estimate BPM from the median interval of the
 * most recent taps (median resists a single mistimed tap).
 */
function tapsToBpm(timestamps, window = 8) {
  const ts = timestamps.slice(-window);
  if (ts.length < 3) return null;
  const intervals = [];
  for (let i = 1; i < ts.length; i++) intervals.push(ts[i] - ts[i - 1]);
  intervals.sort((a, b) => a - b);
  const mid = Math.floor(intervals.length / 2);
  const median = intervals.length % 2 ? intervals[mid] : (intervals[mid - 1] + intervals[mid]) / 2;
  return median > 0 ? 60000 / median : null;
}

/** Ghosts whose speed envelope contains `mps` (± tolerance), best matches first. */
function matchSpeed(mps, candidates = GHOSTS, tolerance = 0.15) {
  return candidates
    .filter(g => speedFeasible(g, mps, tolerance))
    .map(g => {
      // Distance from the nearest "named" speed (base or variant) for ranking.
      const named = [g.speed.base, ...(g.speed.variants || []).map(v => v.mps)];
      const nearest = Math.min(...named.map(v => Math.abs(v - mps)));
      return { ghost: g, nearest };
    })
    .sort((a, b) => a.nearest - b.nearest)
    .map(x => x.ghost);
}

/* ─────────────────── ghost-specific calculators ─────────────────── */

/** Hantu speed from room temperature (°C). */
function hantuSpeed(tempC) {
  if (tempC >= 15) return 1.4;
  if (tempC >= 12) return 1.75;
  if (tempC >= 9) return 2.1;
  if (tempC >= 6) return 2.3;
  if (tempC >= 3) return 2.5;
  return 2.7;
}

/** Thaye speed and hunt threshold at a given age (0–10). */
function thayeAtAge(age) {
  const a = Math.max(0, Math.min(10, Math.round(age)));
  return { age: a, speed: +(2.75 - 0.175 * a).toFixed(3), threshold: 75 - 6 * a };
}

/** Moroi base speed (before LoS ramp) at a given average sanity %. */
function moroiSpeed(sanity) {
  const s = Math.max(0, Math.min(100, sanity));
  if (s >= 45) return 1.5;
  return +(1.5 + (2.25 - 1.5) * (1 - s / 45)).toFixed(3);
}

/** Deildegast speed after `items` unique non-equipment objects moved. */
function deildegastSpeed(items) {
  return +Math.max(0.4, 3.0 - 0.1 * Math.max(0, items)).toFixed(2);
}

/** Raiju electronics boost radius for a map size. */
function raijuRadius(mapSize) { return RAIJU_RADIUS[mapSize] ?? 8; }

/** Base hunt duration for map size + difficulty, with optional Obambo modifier. */
function huntDuration(mapSize, difficulty, { obamboAggressive = false } = {}) {
  const base = HUNT_DURATION[mapSize]?.[difficulty] ?? 30;
  return obamboAggressive ? +(base * 0.8).toFixed(1) : base;
}

/** Incense hunt-block time for a ghost id (seconds). */
function incenseBlock(ghostId) { return byId[ghostId]?.incenseBlock ?? TIMERS.incenseBlockDefault; }

export {
  DIFFICULTIES, HUNT_DURATION, RAIJU_RADIUS, OBSERVATIONS, BPM_PER_MPS,
  createState, evaluate, evidenceFeasible, observationsFeasible, huntSanityFeasible, speedFeasible,
  nextBestTests, finalFilter, splitScore,
  bpmToMps, mpsToBpm, tapsToBpm, matchSpeed,
  hantuSpeed, thayeAtAge, moroiSpeed, deildegastSpeed, raijuRadius, huntDuration, incenseBlock,
  byId,
};
