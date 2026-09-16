# Spectre Triage — Phasmophobia ghost identification app

Second-screen triage tool for identifying all 30 Phasmophobia ghosts (data current to v0.19.0.2, Sep 2026).

## Layout
- `src/ghosts.js`   — ghost database (evidence, hunt thresholds, speeds, tells, timers)
- `src/engine.js`   — pure logic: evidence feasibility per difficulty, behaviour filters, next-best-test ranking, final filter, speed tap maths, per-ghost calculators
- `src/app.js`      — browser UI (no framework, no dependencies)
- `src/styles.css`, `src/index.template.html`
- `build.js`        — bundles everything into `dist/index.html` (artifact body) and `dist/standalone.html` (open from disk)
- `tests/`          — `ghosts.test.js` (data integrity), `engine.test.js` (logic), `ui.smoke.test.js` (headless Chromium end-to-end)

## Run
```
npm install          # only needed for the browser smoke test (playwright)
npm run check        # tests + build
node --test tests/ghosts.test.js tests/engine.test.js   # logic tests only, no browser needed
```
The smoke test uses the Chromium at `/opt/pw-browsers/chromium` by default; set `CHROMIUM_PATH` to your own binary, or run `npx playwright install chromium`.

## Adding / updating a ghost
1. Edit the entry in `src/ghosts.js`.
2. Add or adjust an observation in `OBSERVATIONS` (`src/engine.js`) if the ghost has a unique tell.
3. Add assertions to `tests/ghosts.test.js` (`known specific values`) and, for new behaviour, `tests/engine.test.js`.
4. `npm run check`, then republish `dist/index.html`.

## Hosting (GitHub Pages)
Pushing to `main` runs `.github/workflows/deploy.yml`: it installs dependencies, runs all tests, and only if they pass copies `dist/standalone.html` to GitHub Pages as `index.html`. In the repo go to **Settings → Pages** and set **Source** to **GitHub Actions** once; every later push redeploys automatically.

## License & credits
Spectre Triage is licensed under the **PolyForm Noncommercial License 1.0.0** — free to use, copy, modify and share for personal, educational and non-profit purposes; commercial use (including selling it or bundling it in a paid product) needs the author's permission. Streaming or recording gameplay while using the tool, monetised or not, is explicitly permitted.

Spectre Triage is an unofficial fan-made tool and is not affiliated with or endorsed by Kinetic Games. *Phasmophobia* is a trademark of Kinetic Games; no game assets are included.

Fonts are served from Google Fonts under the SIL Open Font License. Playwright (test-only dependency) is Apache-2.0.
