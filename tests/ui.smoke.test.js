// Browser smoke test: loads dist/standalone.html in headless Chromium and
// drives the triage flow end-to-end. Run `npm run build` first (npm run check does).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
// Uses the preinstalled Chromium; override with CHROMIUM_PATH=<binary> on other machines.

const here = dirname(fileURLToPath(import.meta.url));
const url = 'file://' + join(here, '..', 'dist', 'standalone.html');

let browser, page, errors;
before(async () => {
  // Prefer an explicit CHROMIUM_PATH, then this workspace's preinstalled Chromium, else Playwright's own download (CI).
  const local = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
  browser = await chromium.launch(existsSync(local) ? { executablePath: local } : {});
  page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
  await page.reload();
});
after(async () => { await browser?.close(); });

test('page boots with no JS errors and shows all 30 ghosts', async () => {
  await page.waitForSelector('#ghost-list .ghost');
  assert.deepEqual(errors.filter(e => !/fonts\.g|ERR_INTERNET|net::/.test(e)), []);
  assert.equal(await page.locator('#ghost-list .ghost').count(), 30);
  assert.equal(await page.locator('#count-label').textContent(), '30 of 30');
});

test('tapping evidence tiles narrows the list and hotkeys work', async () => {
  await page.locator('.ev').nth(0).click(); // EMF found
  await page.locator('.ev').nth(6).click(); // Spirit Box found
  await page.keyboard.press('3');           // Writing found
  await page.waitForFunction(() => document.querySelector('#count-label').textContent === '1 of 30');
  assert.equal((await page.locator('#ghost-list .ghost .n').first().textContent()).trim(), 'Spirit');
  assert.ok(await page.locator('#ghost-list .ghost.single').count() === 1);
});

test('reset clears the contract', async () => {
  await page.locator('#reset-btn').click();
  await page.waitForFunction(() => document.querySelector('#count-label').textContent === '30 of 30');
});

test('Nightmare mode with a ruled-out evidence still keeps ghosts that can hide it', async () => {
  await page.locator('#difficulty-seg button', { hasText: 'Nightmare' }).click();
  // Cycle Freezing (tile 4) twice: found → ruled out.
  await page.keyboard.press('4'); await page.keyboard.press('4');
  const names = await page.locator('#ghost-list .ghost .n').allTextContents();
  assert.ok(names.some(n => n.trim().startsWith('Shade')), 'Shade should survive a single ruled-out evidence on Nightmare');
  await page.locator('#reset-btn').click();
  await page.locator('#difficulty-seg button', { hasText: 'Professional' }).click();
});

test('behaviour observation from the next-best-test panel filters ghosts', async () => {
  await page.locator('#tests .test .mini.yes').first().click();
  const count = parseInt(await page.locator('#count-label').textContent(), 10);
  assert.ok(count < 30 && count > 0);
  await page.locator('#reset-btn').click();
});

test('hunt sanity input keeps early hunters only', async () => {
  await page.fill('#hunt-sanity', '75');
  await page.waitForFunction(() => parseInt(document.querySelector('#count-label').textContent, 10) < 15);
  const names = (await page.locator('#ghost-list .ghost .n').allTextContents()).map(s => s.trim().replace(/NEW$/, '').trim());
  assert.ok(names.includes('Demon') && names.includes('Yokai') && names.includes('Thaye'));
  assert.ok(!names.includes('Spirit'));
  await page.locator('#reset-btn').click();
});

test('speed tap view computes m/s from taps and applies it to triage', async () => {
  await page.locator('.nav button[data-view="speed"]').click();
  await page.waitForSelector('#view-speed:not([hidden])');
  // 6 taps at 60 BPM (1000 ms) → 60/54 ≈ 1.11 m/s — only the slow-capable ghosts fit.
  for (let i = 0; i < 6; i++) { await page.locator('#tap-btn').dispatchEvent('pointerdown'); await page.waitForTimeout(1000); }
  const mps = parseFloat(await page.locator('#tap-mps').textContent());
  assert.ok(mps > 0.95 && mps < 1.3, `got ${mps}`);
  await page.locator('#tap-apply').click();
  await page.waitForSelector('#view-triage:not([hidden])');
  assert.ok(Math.abs(parseFloat(await page.inputValue('#speed-input')) - mps) < 0.05);
  const count = parseInt(await page.locator('#count-label').textContent(), 10);
  assert.ok(count <= 6 && count > 0, `expected the slow set, got ${count}`);
  await page.locator('#reset-btn').click();
});

test('timers and journal views render tables and the ghost sheet opens', async () => {
  await page.locator('.nav button[data-view="timers"]').click();
  assert.equal(await page.locator('#timers .timer').count(), 4);
  assert.equal(await page.locator('#threshold-table tbody tr').count(), 30);
  await page.locator('.nav button[data-view="journal"]').click();
  assert.equal(await page.locator('#journal-table tbody tr').count(), 30);
  await page.locator('#journal-table tbody tr', { hasText: 'Deildegast' }).click();
  await page.waitForSelector('.sheet');
  assert.match(await page.locator('.sheet').textContent(), /0\.1 m\/s/);
  // You-vs-the-ghost block: player speeds and a verdict per speed state.
  const chase = await page.locator('.sheet .chase').textContent();
  assert.match(chase, /walk at 1\.6 m\/s/);
  assert.match(chase, /sprint at 3 m\/s for 3 s/);
  assert.ok(await page.locator('.sheet .chase-row').count() >= 4, 'Deildegast should list its item-count speed states');
  assert.match(await page.locator('.sheet .chase-row').first().textContent(), /0 items moved.*3 m\/s.*loop or hide/s);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.sheet').count(), 0);
});

test('no horizontal overflow at phone width', async () => {
  await page.locator('.nav button[data-view="triage"]').click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `page scrolls horizontally by ${overflow}px`);
});

test('no JS errors across the whole session', () => {
  assert.deepEqual(errors.filter(e => !/fonts\.g|ERR_INTERNET|net::/.test(e)), []);
});
