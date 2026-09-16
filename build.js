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

const scripts = ['ghosts.js', 'engine.js', 'app.js'].map(f => `/* ===== ${f} ===== */\n${stripModuleSyntax(src(f))}`).join('\n\n');
const styles = src('styles.css');

const page = src('index.template.html')
  .replace('/*__STYLES__*/', () => styles)
  .replace('/*__SCRIPTS__*/', () => scripts);

mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist', 'index.html'), page);
writeFileSync(join(here, 'dist', 'standalone.html'),
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${page}\n</body>\n</html>\n`);

// Guard: no module syntax may survive into the browser bundle.
if (/^\s*(import|export)\s/m.test(scripts)) {
  console.error('build: module syntax leaked into bundle'); process.exit(1);
}
console.log(`build: dist/index.html ${(page.length / 1024).toFixed(1)} KB`);
