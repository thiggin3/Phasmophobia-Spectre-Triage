// Logic-engine tests: evidence filtering per difficulty, behaviour filters,
// hunt-sanity and speed filters, next-best-test ranking, calculators.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GHOSTS } from '../src/ghosts.js';
import {
  DIFFICULTIES, OBSERVATIONS, createState, evaluate, evidenceFeasible, nextBestTests, finalFilter,
  splitScore, tapsToBpm, bpmToMps, mpsToBpm, matchSpeed, hantuSpeed, thayeAtAge, moroiSpeed,
  deildegastSpeed, raijuRadius, huntDuration, incenseBlock,
} from '../src/engine.js';

const names = list => list.map(g => g.name).sort();

test('empty state on Professional keeps all 30 ghosts', () => {
  const r = evaluate(createState());
  assert.equal(r.possible.length, 30);
  assert.equal(r.eliminated.length, 0);
});

test('difficulty presets expose the right number of evidences', () => {
  assert.equal(DIFFICULTIES.amateur.evidence, 3);
  assert.equal(DIFFICULTIES.professional.evidence, 3);
  assert.equal(DIFFICULTIES.nightmare.evidence, 2);
  assert.equal(DIFFICULTIES.insanity.evidence, 1);
  assert.equal(DIFFICULTIES.custom0.evidence, 0);
});

test('three found evidences on Professional pin a single ghost', () => {
  const s = createState({ found: new Set(['emf', 'spiritbox', 'writing']) });
  assert.deepEqual(names(evaluate(s).possible), ['Spirit']);
});

test('found evidence never eliminates the Mimic while orbs are possible', () => {
  // Mimic real: spiritbox, uv, freezing + fake orbs.
  const s = createState({ found: new Set(['spiritbox', 'uv', 'orbs']) });
  const r = names(evaluate(s).possible);
  assert.ok(r.includes('The Mimic'));
  assert.ok(r.includes('Kormos')); // orbs, spiritbox, uv is a real combo now
});

test('four evidences (3 real + orbs) on Professional leaves only the Mimic', () => {
  const s = createState({ found: new Set(['spiritbox', 'uv', 'freezing', 'orbs']) });
  assert.deepEqual(names(evaluate(s).possible), ['The Mimic']);
});

test('ruling out Ghost Orbs eliminates the Mimic', () => {
  const s = createState({ ruledOut: new Set(['orbs']) });
  const r = names(evaluate(s).possible);
  assert.ok(!r.includes('The Mimic'));
  assert.ok(!r.includes('Banshee'));
  assert.ok(r.includes('Spirit'));
});

test('Nightmare: two found evidences keep every ghost that has both, ruled-out evidence only kills when slots cannot be filled', () => {
  const s = createState({ difficulty: 'nightmare', found: new Set(['emf', 'writing']) });
  const r = names(evaluate(s).possible);
  // Ghosts with emf+writing: Spirit, Revenant? no. Spirit(emf,sb,writing), Shade(emf,writing,freezing),
  // Myling(emf,uv,writing), Deildegast(emf,writing,dots)
  assert.deepEqual(r, ['Deildegast', 'Myling', 'Shade', 'Spirit']);

  // Ruling out Freezing on Nightmare: Shade has emf+writing left = 2 slots → still feasible.
  const s2 = createState({ difficulty: 'nightmare', found: new Set(['emf', 'writing']), ruledOut: new Set(['freezing']) });
  assert.ok(names(evaluate(s2).possible).includes('Shade'));

  // With zero found and Freezing + EMF ruled out, Shade only has Writing left → cannot fill 2 slots.
  const s3 = createState({ difficulty: 'nightmare', ruledOut: new Set(['freezing', 'emf']) });
  assert.ok(!names(evaluate(s3).possible).includes('Shade'));
});

test('Insanity: one found evidence narrows to ghosts holding it; ruling out is weak', () => {
  const s = createState({ difficulty: 'insanity', found: new Set(['dots']) });
  const r = evaluate(s).possible;
  for (const g of r) assert.ok(g.evidence.includes('dots') || g.fakeEvidence === 'dots', g.name);
  // On Insanity you can never find a second real evidence, so a second found evidence is impossible.
  const s2 = createState({ difficulty: 'insanity', found: new Set(['dots', 'emf']) });
  assert.deepEqual(names(evaluate(s2).possible), []);
  // ... except the Mimic's orbs.
  const s3 = createState({ difficulty: 'insanity', found: new Set(['uv', 'orbs']) });
  assert.ok(names(evaluate(s3).possible).includes('The Mimic'));
});

test('Insanity with orbs + uv: Kormos needs two real slots so it must be eliminated', () => {
  const s3 = createState({ difficulty: 'insanity', found: new Set(['uv', 'orbs']) });
  assert.ok(!names(evaluate(s3).possible).includes('Kormos'));
  assert.deepEqual(names(evaluate(s3).possible), ['The Mimic']);
});

test('zero-evidence mode: evidence toggles do nothing, behaviour does everything', () => {
  const s = createState({ difficulty: 'custom0' });
  assert.equal(evaluate(s).possible.length, 30);
  s.observations.salt_stepped = true;
  assert.ok(!names(evaluate(s).possible).includes('Wraith'));
  s.observations.photo_no_ghost = true;
  assert.deepEqual(names(evaluate(s).possible), ['Phantom', 'The Mimic']);
});

test('every observation removes at least one ghost and never removes the Mimic', () => {
  for (const obs of OBSERVATIONS) {
    const s = createState({ difficulty: 'custom0', observations: { [obs.id]: true } });
    const r = evaluate(s).possible;
    assert.ok(r.length < 30, `${obs.id} removed nothing`);
    assert.ok(r.some(g => g.id === 'mimic'), `${obs.id} removed the Mimic`);
    for (const id of [...(obs.only || []), ...(obs.excludes || [])]) {
      assert.ok(GHOSTS.some(g => g.id === id), `${obs.id} references unknown ghost ${id}`);
    }
  }
});

test('hunt sanity filter keeps early hunters and the Banshee', () => {
  const s = createState({ huntSanity: 72 });
  const r = names(evaluate(s).possible);
  assert.ok(r.includes('Demon'));
  assert.ok(r.includes('Yokai'));
  assert.ok(r.includes('Onryo'));
  assert.ok(r.includes('Thaye'));
  assert.ok(r.includes('Banshee'));
  assert.ok(r.includes('The Mimic'));
  assert.ok(!r.includes('Spirit'));
  assert.ok(!r.includes('Mare'));   // max 60
  assert.ok(!r.includes('Obambo')); // max 65
  const s2 = createState({ huntSanity: 62 });
  assert.ok(names(evaluate(s2).possible).includes('Obambo'));
  assert.ok(names(evaluate(s2).possible).includes('Raiju'));
  assert.ok(!names(evaluate(s2).possible).includes('Mare'));
});

test('speed filter: 3.0 m/s keeps the fast set, 1.0 keeps the slow set', () => {
  const fast = names(evaluate(createState({ speed: 3.0 })).possible);
  for (const n of ['Revenant', 'Deogen', 'Deildegast', 'Moroi', 'The Mimic']) assert.ok(fast.includes(n), n);
  assert.ok(!fast.includes('Hantu'));
  assert.ok(!fast.includes('Spirit')); // 1.7 × 1.65 = 2.805 + 0.15 tolerance = 2.955 < 3.0
});

test('speed tolerance boundary: standard ghosts at full LoS reach 2.805 m/s', () => {
  const r = names(evaluate(createState({ speed: 2.9 })).possible);
  assert.ok(r.includes('Spirit'));
  const r2 = names(evaluate(createState({ speed: 3.05 })).possible);
  assert.ok(!r2.includes('Spirit'));
  assert.ok(r2.includes('Revenant'));
});

test('slow speed 1.0 m/s keeps Revenant, Thaye, Deogen, Deildegast only (plus Mimic)', () => {
  const r = names(evaluate(createState({ speed: 1.0 })).possible);
  assert.deepEqual(r, ['Deildegast', 'Deogen', 'Revenant', 'Thaye', 'The Mimic']);
});

test('splitScore prefers even splits', () => {
  assert.equal(splitScore(0, 10), 0);
  assert.equal(splitScore(10, 10), 0);
  assert.ok(Math.abs(splitScore(5, 10) - 1) < 1e-9);
  assert.ok(splitScore(5, 10) > splitScore(2, 10));
});

test('nextBestTests ranks an evidence that splits candidates evenly at the top on Professional', () => {
  const s = createState();
  const tests = nextBestTests(s);
  assert.ok(tests.length > 0);
  assert.ok(tests[0].score >= tests[tests.length - 1].score);
  // No evidence tests offered when the journal is full.
  const full = createState({ found: new Set(['emf', 'spiritbox', 'writing']) });
  assert.ok(nextBestTests(full).every(t => t.kind !== 'evidence'));
});

test('nextBestTests offers no evidence tests in zero-evidence mode', () => {
  const tests = nextBestTests(createState({ difficulty: 'custom0' }));
  assert.ok(tests.length > 0);
  assert.ok(tests.every(t => t.kind !== 'evidence'));
});

test('finalFilter separates Spirit vs Goryo-like pairs with an incense question', () => {
  // Force two candidates via evidence + behaviour: Spirit vs Mimic remains; use custom set instead.
  const s = createState({ difficulty: 'custom0' });
  const cands = GHOSTS.filter(g => ['spirit', 'goryo'].includes(g.id));
  const ff = finalFilter(s, cands);
  assert.ok(ff.length > 0);
  assert.ok(ff.some(t => t.id === 'incense_180' || t.id === 'dots_camera_only'));
  for (const t of ff) {
    assert.ok(t.ifYes.length + t.ifNo.length === 2);
  }
});

test('finalFilter returns nothing for a single candidate', () => {
  assert.deepEqual(finalFilter(createState(), [GHOSTS[0]]), []);
});

test('tapsToBpm uses median intervals and needs at least 3 taps', () => {
  assert.equal(tapsToBpm([0, 500]), null);
  const bpm = tapsToBpm([0, 500, 1000, 1500, 2000]);
  assert.ok(Math.abs(bpm - 120) < 1e-9);
  // One mistimed tap does not wreck the estimate.
  const noisy = tapsToBpm([0, 500, 1000, 1900, 2400, 2900]);
  assert.ok(Math.abs(noisy - 120) < 1);
});

test('bpm/mps conversion round-trips', () => {
  const mps = 1.7;
  assert.ok(Math.abs(bpmToMps(mpsToBpm(mps)) - mps) < 1e-9);
  assert.equal(bpmToMps(0), 0);
});

test('matchSpeed ranks the nearest named speed first', () => {
  const m = matchSpeed(2.5).map(g => g.id);
  assert.ok(m.indexOf('jinn') < m.indexOf('spirit') || !m.includes('spirit'));
  assert.ok(m.includes('raiju'));
  assert.ok(m.includes('hantu'));
});

test('Hantu temperature brackets', () => {
  assert.equal(hantuSpeed(20), 1.4);
  assert.equal(hantuSpeed(15), 1.4);
  assert.equal(hantuSpeed(13), 1.75);
  assert.equal(hantuSpeed(10), 2.1);
  assert.equal(hantuSpeed(7), 2.3);
  assert.equal(hantuSpeed(4), 2.5);
  assert.equal(hantuSpeed(0), 2.7);
  assert.equal(hantuSpeed(-5), 2.7);
});

test('Thaye ageing', () => {
  assert.deepEqual(thayeAtAge(0), { age: 0, speed: 2.75, threshold: 75 });
  assert.deepEqual(thayeAtAge(10), { age: 10, speed: 1.0, threshold: 15 });
  assert.equal(thayeAtAge(99).age, 10);
  assert.equal(thayeAtAge(-3).age, 0);
});

test('Moroi speed scales with sanity', () => {
  assert.equal(moroiSpeed(100), 1.5);
  assert.equal(moroiSpeed(45), 1.5);
  assert.equal(moroiSpeed(0), 2.25);
  assert.ok(moroiSpeed(22.5) > 1.5 && moroiSpeed(22.5) < 2.25);
});

test('Deildegast slows 0.1 m/s per item, floored at 0.4', () => {
  assert.equal(deildegastSpeed(0), 3.0);
  assert.equal(deildegastSpeed(9), 2.1);
  assert.equal(deildegastSpeed(13), 1.7);
  assert.equal(deildegastSpeed(26), 0.4);
  assert.equal(deildegastSpeed(40), 0.4);
});

test('map-size dependent values', () => {
  assert.equal(raijuRadius('small'), 6);
  assert.equal(raijuRadius('large'), 10);
  assert.equal(huntDuration('small', 'professional'), 30);
  assert.equal(huntDuration('large', 'insanity'), 70);
  assert.equal(huntDuration('medium', 'professional', { obamboAggressive: true }), 32);
});

test('incense block timers', () => {
  assert.equal(incenseBlock('spirit'), 180);
  assert.equal(incenseBlock('demon'), 60);
  assert.equal(incenseBlock('wraith'), 90);
  assert.equal(incenseBlock('nonexistent'), 90);
});

test('evidenceFeasible handles Sets and arrays alike', () => {
  const spirit = GHOSTS.find(g => g.id === 'spirit');
  assert.ok(evidenceFeasible(spirit, ['emf'], [], 3));
  assert.ok(!evidenceFeasible(spirit, ['orbs'], [], 3));
  assert.ok(!evidenceFeasible(spirit, [], ['emf'], 3));
  assert.ok(evidenceFeasible(spirit, [], ['emf'], 2));
});
