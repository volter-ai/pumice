// Packaging AC: the public package entry + every exports subpath import cleanly, the
// types file exists, and the package is publishable (not private). This is what makes
// `npm install pumice-md` + `import { renderMarkdown } from 'pumice-md'` real.
import './dom-bootstrap.mjs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));
let pass = 0, fail = 0; const log = [];
const ok = (n, c, d = '') => { if (c) { pass++; log.push('  ✓ ' + n); } else { fail++; log.push('  ✗ ' + n + ' ' + d); } };

ok('package is publishable (not private)', pkg.private === false);
ok('has name pumice-md', pkg.name === 'pumice-md');
ok('declares types', !!pkg.types && await fs.access(path.join(ROOT, pkg.types)).then(() => true).catch(() => false));
ok('has files allowlist', Array.isArray(pkg.files) && pkg.files.includes('src'));

// every exports subpath resolves to an existing, importable module
for (const [sub, rel] of Object.entries(pkg.exports)) {
  if (sub === './package.json') continue;
  const abs = path.join(ROOT, rel);
  const exists = await fs.access(abs).then(() => true).catch(() => false);
  if (!exists) { ok(`exports ${sub} → file exists`, false, rel); continue; }
  try { const m = await import(abs); ok(`exports ${sub} imports`, !!m && Object.keys(m).length > 0); }
  catch (e) { ok(`exports ${sub} imports`, false, e.message); }
}

// the main barrel exposes the documented public API
const main = await import(path.join(ROOT, pkg.exports['.']));
for (const sym of ['renderMarkdown', 'setupPluginHost', 'memoryAdapter', 'opfsAdapter', 'search', 'tagIndex', 'createMcpServer', 'buildGraph']) {
  ok(`barrel exports ${sym}`, typeof main[sym] === 'function');
}

console.log('=== Packaging: pumice-md exports ===');
for (const l of log) console.log(l);
console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail) { console.log('\nFAIL'); process.exit(1); }
console.log('\nAC GREEN: package is publishable; all exports subpaths import.');
process.exit(0);
