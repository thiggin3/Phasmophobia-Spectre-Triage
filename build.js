/**
 * build.js — bundles src/ into a single self-contained page.
 *
 *  dist/index.html      — page body for the Artifact publisher (no doctype/html/body;
 *                         the publisher wraps it).
 *  dist/standalone.html — full document you can open straight from disk.
 *
 * ESM `import`/`export` lines are stripped so the three modules become one
 * plain script sharing a scope. Everything else (fonts aside) is inline.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = p => readFileSync(join(here, 'src', p), 'utf8');

const stripModuleSyntax = code => code
  .replace(/^import .*$/gm, '')
  .replace(/^export \{[\s\S]*?\};\s*$/gm, '');

/**
 * App icons, inlined as data URIs so the page stays a single self-contained
 * file (GitHub Pages deploys only standalone.html). Sources: assets/icons/.
 *  - icon-32.png          browser tab favicon
 *  - icon-192.webp        high-res favicon / Android home screen
 *  - apple-touch-icon.png iOS home screen (full-bleed; iOS rounds it itself)
 */
const dataUri = (file, mime) => `data:${mime};base64,${readFileSync(join(here, 'assets', 'icons', file)).toString('base64')}`;
const iconTags = [
  `<link rel="icon" type="image/png" sizes="32x32" href="${dataUri('icon-32.png', 'image/png')}">`,
  `<link rel="icon" type="image/webp" sizes="192x192" href="${dataUri('icon-192.webp', 'image/webp')}">`,
  `<link rel="apple-touch-icon" sizes="180x180" href="${dataUri('apple-touch-icon.png', 'image/png')}">`,
  '<meta name="theme-color" content="#0a0c11">',
  '<meta name="apple-mobile-web-app-title" content="Spectre Triage">',
].join('\n');

const scripts = ['ghosts.js', 'engine.js', 'app.js'].map(f => `/* ===== ${f} ===== */\n${stripModuleSyntax(src(f))}`).join('\n\n');
const styles = src('styles.css');

const page = src('index.template.html')
  .replace('/*__STYLES__*/', () => styles)
  .replace('/*__SCRIPTS__*/', () => scripts)
  .replace('__LOGO_SRC__', () => dataUri('icon-192.webp', 'image/webp'));

mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist', 'index.html'), page);
writeFileSync(join(here, 'dist', 'standalone.html'),
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>Spectre Triage</title>\n${iconTags}\n</head>\n<body>\n${page}\n</body>\n</html>\n`);

// Guard: no module syntax may survive into the browser bundle.
if (page.includes('__LOGO_SRC__')) {
  console.error('build: logo placeholder was not replaced'); process.exit(1);
}
if (/^\s*(import|export)\s/m.test(scripts)) {
  console.error('build: module syntax leaked into bundle'); process.exit(1);
}
console.log(`build: dist/index.html ${(page.length / 1024).toFixed(1)} KB`);
