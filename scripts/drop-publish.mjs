// AC: drag-drop vault loading + published read-only viewer.
import './dom-bootstrap.mjs';
import { filesToVault, publishedAdapter } from '../src/ui/drop-loader.js';

let pass = 0, fail = 0; const log = [];
const ok = (n, c, d = '') => { if (c) { pass++; log.push('  ✓ ' + n); } else { fail++; log.push('  ✗ ' + n + ' ' + d); } };

// --- drag-drop core: File-like objects → vault map ---
const mkFile = (name, content, rel) => ({ name, webkitRelativePath: rel || '', async text() { return content; } });
const map = await filesToVault([
  mkFile('a.md', '# A', 'Vault/a.md'),
  mkFile('b.md', '# B', 'Vault/sub/b.md'),
  mkFile('image.png', 'binary', 'Vault/image.png'), // non-text, skipped
  mkFile('note.md', '# loose'),
]);
ok('drop keeps folder paths', map['Vault/a.md'] === '# A' && map['Vault/sub/b.md'] === '# B');
ok('drop skips non-text files', !('Vault/image.png' in map));
ok('drop handles loose files by name', map['note.md'] === '# loose');

// --- published read-only adapter ---
const pub = publishedAdapter({ 'Welcome.md': '# Welcome', 'Note.md': '# N' });
ok('published adapter is read-only', pub.capabilities.readonly === true && pub.capabilities.write === false);
ok('published adapter has no write method', typeof pub.write === 'undefined');
ok('published lists + reads', (await pub.list()).length === 2 && (await pub.read('Welcome.md')).includes('Welcome'));
let threw = false; try { await pub.read('missing.md'); } catch { threw = true; }
ok('published read of missing throws', threw);

console.log('=== Drag-drop loader + published viewer ===');
for (const l of log) console.log(l);
console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail) { console.log('\nFAIL'); process.exit(1); }
console.log('\nAC GREEN: drag-drop vault load + read-only published viewer.');
process.exit(0);
