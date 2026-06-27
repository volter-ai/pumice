// Dev-SDK AC: a host app embeds the runtime via the public SDK (setupPluginHost) and
// loads a real Obsidian community plugin — the integration a third-party dev would do.
import './dom-bootstrap.mjs';
import { promises as fs } from 'node:fs';
import { setupPluginHost, installPumiceGlobals, renderMarkdown } from '../src/sdk/index.js';
import { memoryAdapter } from '../src/vfs/memoryAdapter.js';

let pass = 0, fail = 0; const log = [];
const ok = (n, c, d = '') => { if (c) { pass++; log.push('  ✓ ' + n); } else { fail++; log.push('  ✗ ' + n + ' ' + d); } };

// 1. one-call host setup over any VaultAdapter
const host = await setupPluginHost(memoryAdapter({ 'Note.md': '# Hi\n[[Other]] :smile:' }), { window });
ok('setupPluginHost returns app + loadPlugin', !!host.app && typeof host.loadPlugin === 'function');
ok('app has the vault', host.app.vault.getMarkdownFiles().length === 1);

// 2. load a REAL community plugin through the public API
const src = await fs.readFile(new URL('../real-plugins/emoji-shortcodes.js', import.meta.url), 'utf8');
const loaded = await host.loadPlugin('emoji-shortcodes', src);
ok('real plugin loads via SDK', !!loaded && loaded.manifest.id === 'emoji-shortcodes');
ok('plugin registered in app.plugins', !!host.app.plugins.plugins['emoji-shortcodes']);

// 3. the SDK also exposes the renderer + globals installer standalone
const el = document.createElement('div');
host.renderMarkdown('a ==hl== and #tag and [[Link]]', el, { resolve: (n) => '#' + n });
ok('SDK renderMarkdown produces DOM', !!el.querySelector('mark') && !!el.querySelector('a.internal-link'));
ok('installPumiceGlobals is exported', typeof installPumiceGlobals === 'function' && typeof renderMarkdown === 'function');

console.log('=== Dev-SDK: setupPluginHost embedding ===');
for (const l of log) console.log(l);
console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail) { console.log('\nFAIL'); process.exit(1); }
console.log('\nAC GREEN: a host app can embed the runtime + load a real plugin via the SDK.');
process.exit(0);
