// Data-integrity tests for the ghost database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVIDENCE, GHOSTS, LOS_MULTIPLIER } from '../src/ghosts.js';

const EVIDENCE_IDS = new Set(EVIDENCE.map(e => e.id));

test('there are exactly 30 ghosts (24 legacy + Dayan, Obambo, Gallu, Kormos, Aswang, Deildegast)', () => {
  assert.equal(GHOSTS.length, 30);
  for (const id of ['dayan', 'obambo', 'gallu', 'kormos', 'aswang', 'deildegast']) {
    assert.ok(GHOSTS.some(g => g.id === id), `missing ${id}`);
  }
});

test('seven evidence types with unique ids', () => {
  assert.equal(EVIDENCE.length, 7);
  assert.equal(EVIDENCE_IDS.size, 7);
});

test('every ghost has exactly three valid, distinct evidences', () => {
  for (const g of GHOSTS) {
    assert.equal(g.evidence.length, 3, `${g.name} evidence count`);
    assert.equal(new Set(g.evidence).size, 3, `${g.name} duplicate evidence`);
    for (const e of g.evidence) assert.ok(EVIDENCE_IDS.has(e), `${g.name} has unknown evidence ${e}`);
  }
});

test('evidence combinations are unique per ghost', () => {
  const seen = new Map();
  for (const g of GHOSTS) {
    const key = [...g.evidence].sort().join('+');
    assert.ok(!seen.has(key), `${g.name} shares evidence combo with ${seen.get(key)}`);
    seen.set(key, g.name);
  }
});

test('ghost ids are unique and slug-like', () => {
  const ids = GHOSTS.map(g => g.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z]+$/);
});

test('speed envelopes are sane and internally consistent', () => {
  for (const g of GHOSTS) {
    const s = g.speed;
    assert.ok(s.min > 0 && s.max >= s.min, `${g.name} speed range`);
    assert.ok(s.base >= s.min - 1e-9 && s.base <= s.max + 1e-9, `${g.name} base outside range`);
    for (const v of s.variants || []) {
      assert.ok(v.mps >= s.min - 1e-9 && v.mps <= s.max + 1e-9, `${g.name} variant ${v.label} outside range`);
    }
    if (s.los && g.id !== 'mimic') {
      // With LoS the max must include the 1.65x ramp on the fastest named speed,
      // unless the ghost has an explicitly capped boost (Jinn/Raiju/Kormos/Dayan/Aswang).
      const capped = ['jinn', 'raiju', 'kormos', 'dayan', 'aswang'];
      if (!capped.includes(g.id)) {
        const fastest = Math.max(s.base, ...(s.variants || []).map(v => v.mps));
        assert.ok(Math.abs(s.max - fastest * LOS_MULTIPLIER) < 1e-6, `${g.name} LoS max mismatch`);
      }
    }
  }
});

test('hunt thresholds are within 0–100 and min ≤ base ≤ max', () => {
  for (const g of GHOSTS) {
    const h = g.hunt;
    assert.ok(h.min >= 0 && h.max <= 100, `${g.name} threshold bounds`);
    assert.ok(h.min <= h.base && h.base <= h.max, `${g.name} threshold order`);
  }
});

test('known specific values match the current patch data', () => {
  const g = Object.fromEntries(GHOSTS.map(x => [x.id, x]));
  assert.deepEqual([...g.spirit.evidence].sort(), ['emf', 'spiritbox', 'writing']);
  assert.equal(g.spirit.incenseBlock, 180);
  assert.equal(g.demon.incenseBlock, 60);
  assert.equal(g.demon.hunt.base, 70);
  assert.equal(g.shade.hunt.base, 35);
  assert.equal(g.deogen.hunt.base, 40);
  assert.equal(g.revenant.speed.min, 1.0);
  assert.equal(g.revenant.speed.max, 3.0);
  assert.equal(g.hantu.speed.max, 2.7);
  assert.equal(g.thaye.speed.base, 2.75);
  assert.equal(g.mimic.fakeEvidence, 'orbs');
  // New ghosts
  assert.deepEqual([...g.dayan.evidence].sort(), ['emf', 'orbs', 'spiritbox']);
  assert.deepEqual([...g.obambo.evidence].sort(), ['dots', 'uv', 'writing']);
  assert.deepEqual([...g.gallu.evidence].sort(), ['emf', 'spiritbox', 'uv']);
  assert.deepEqual([...g.kormos.evidence].sort(), ['orbs', 'spiritbox', 'uv']);
  assert.deepEqual([...g.aswang.evidence].sort(), ['dots', 'freezing', 'writing']);
  assert.deepEqual([...g.deildegast.evidence].sort(), ['dots', 'emf', 'writing']);
  assert.equal(g.obambo.hunt.min, 10);
  assert.equal(g.obambo.hunt.max, 65);
  assert.equal(g.deildegast.speed.max, 3.0);
  assert.equal(g.deildegast.speed.los, false);
  assert.equal(g.kormos.hunt.max, 70);
});

test('every ghost has at least two tells and both strengths/weaknesses text', () => {
  for (const g of GHOSTS) {
    assert.ok(g.tells.length >= 2, `${g.name} needs tells`);
    assert.ok(g.strengths && g.weaknesses, `${g.name} needs strengths/weaknesses`);
  }
});
