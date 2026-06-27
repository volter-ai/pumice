// Publish a static, read-only vault viewer — like Obsidian Publish, but a single file
// with NO backend. Reads VAULT_DIR (default ./vault), embeds the snapshot into the
// built app.html as `window.__vaultSnapshot`, and writes dist/published.html. The
// workbench detects __vaultSnapshot and mounts it via the read-only publishedAdapter.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshot } from '../server/vaultFs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const snap = await snapshot();
let html = await fs.readFile(path.join(DIST, 'app.html'), 'utf8');
const inject = `<script>window.__vaultSnapshot=${JSON.stringify(snap).replace(/</g, '\\u003c')};window.__published=true;</script>`;
html = html.replace('</head>', inject + '</head>');
const outPath = path.join(DIST, 'published.html');
await fs.writeFile(outPath, html);

console.log(`Published ${Object.keys(snap).length} notes → ${path.relative(ROOT, outPath)} (read-only, no backend).`);

// when run with --check, assert the output is valid
if (process.argv.includes('--check')) {
  const written = await fs.readFile(outPath, 'utf8');
  const okEmbed = written.includes('window.__vaultSnapshot');
  const okNote = Object.keys(snap).some((p) => written.includes(JSON.stringify(p).slice(1, -1)));
  if (okEmbed && okNote && Object.keys(snap).length > 0) { console.log('CHECK OK'); process.exit(0); }
  console.log('CHECK FAIL'); process.exit(1);
}
