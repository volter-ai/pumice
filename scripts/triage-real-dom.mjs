// Triage v2 — same as triage-real.mjs but globals are a REAL jsdom DOM, not no-op
// proxies. So "onload ran" here means the plugin executed against a real document/
// window (DOM calls actually do something), not that calls silently swallowed.
// (require() externals like @codemirror/* are still stubbed and reported — closing
// those is the remaining step toward the full Phase-0 harness v2 AC.)
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { marked } from 'marked';
import { listFiles, readFile, writeFile, snapshot } from '../server/vaultFs.js';
import * as obsidian from '../src/obsidian/api.js';
import { setNoticeSink } from '../src/obsidian/api.js';
import { createApp } from '../src/obsidian/runtime.js';
import { installDomExtensions } from '../src/obsidian/dom.js';

setNoticeSink(() => {});

const adapter = {
  name: 'node-fs',
  capabilities: { write: true, watch: false, sync: true },
  list: listFiles, read: readFile, write: writeFile, snapshot,
};

// One real DOM for the run.
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/', // non-opaque origin → localStorage works (real browser has one)
});
const { window } = dom;
installDomExtensions(window); // Obsidian's createEl/createDiv/setText/addClass/... on the real DOM
window.indexedDB = new IDBFactory(); // real IndexedDB (browsers have one) for storage-using plugins
window.IDBKeyRange = IDBKeyRange;
globalThis.indexedDB = window.indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;
window.moment = obsidian.moment; // Obsidian exposes moment globally too
// One plugin's stray async throw must not kill the triage of the others.
process.on('unhandledRejection', (e) => console.log('   (async) unhandledRejection:', String(e && e.message || e).slice(0, 80)));
process.on('uncaughtException', (e) => console.log('   (async) uncaughtException:', String(e && e.message || e).slice(0, 80)));
class WorkerStub { constructor() {} postMessage() {} terminate() {} addEventListener() {} }

// Minimal require-external stub (only for non-obsidian modules), logged per plugin.
function universal(label, sink) {
  const f = function () { return universal(label, sink); };
  return new Proxy(f, {
    get: (_t, k) => (k === 'then' ? undefined : universal(label + '.' + String(k), sink)),
    apply: () => universal(label + '()', sink),
    construct: () => universal('new ' + label, sink),
  });
}

async function triage(id, source) {
  const externals = new Set();
  const requireShim = (name) => {
    if (name === 'obsidian') return obsidian;
    externals.add(name);
    return universal(name, externals);
  };
  const app = await createApp(adapter, async (md) => marked.parse(md));
  const manifest = { id, name: id, version: '0.0.0', minAppVersion: '1.0.0' };
  const report = { id, externals, constructed: false, onload: false, error: null, commands: 0 };
  try {
    const module = { exports: {} };
    const fn = new Function(
      'module', 'exports', 'require', 'process',
      'window', 'document', 'navigator', 'self', 'activeWindow', 'activeDocument', 'Worker', 'app', 'global',
      'createEl', 'createDiv', 'createSpan', 'createFragment',
      source,
    );
    fn(module, module.exports, requireShim, { platform: 'web', env: {} },
      window, window.document, window.navigator, window, window, window.document, WorkerStub, app, window,
      window.createEl, window.createDiv, window.createSpan, window.createFragment);
    const PluginClass = module.exports.default || module.exports;
    if (typeof PluginClass !== 'function') throw new Error('no Plugin class exported');
    const inst = new PluginClass(app, manifest);
    report.constructed = true;
    await inst.onload();
    report.onload = true;
    report.commands = (inst._commands || []).length;
  } catch (e) {
    report.error = (e && e.message ? e.message : String(e)).split('\n')[0].slice(0, 140);
  }
  return report;
}

const dir = new URL('../real-plugins/', import.meta.url).pathname;
const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.js'));
const rows = [];
for (const f of files) rows.push(await triage(f.replace(/\.js$/, ''), await fs.readFile(path.join(dir, f), 'utf8')));

console.log('\n=== REAL-DOM PLUGIN TRIAGE (jsdom, not proxies) ===\n');
for (const r of rows) {
  const stage = r.onload ? '✅ onload ran (real DOM)' : r.constructed ? '🔶 onload threw' : '❌ failed to load';
  console.log(`${r.id}\n   ${stage}${r.commands ? ` — ${r.commands} command(s)` : ''}`);
  if (r.error) console.log(`   first break: ${r.error}`);
  const ext = [...r.externals].filter((e) => e !== 'obsidian');
  console.log(`   require() externals still stubbed: ${ext.length ? ext.join(', ') : '(none)'}\n`);
}
const ran = rows.filter((r) => r.onload).length;
console.log(`onload ran on a REAL DOM for ${ran}/${rows.length} real plugins.`);

// Acceptance gate: these must run onload against a REAL DOM (no proxies).
// dataview is documented-pending the Phase-2 CodeMirror stack (needs `defineMode`).
const EXPECTED_PASS = ['emoji-shortcodes', 'style-settings', 'tag-wrangler', 'natural-dates'];
const PENDING = { dataview: 'needs Phase-2 CodeMirror (defineMode/@codemirror/*)' };
const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
const regressions = EXPECTED_PASS.filter((id) => !(byId[id] && byId[id].onload));
for (const [id, why] of Object.entries(PENDING)) {
  if (byId[id] && byId[id].onload) console.log(`NOTE: ${id} now passes — promote it out of PENDING.`);
  else console.log(`pending (expected): ${id} — ${why}`);
}
if (regressions.length) { console.log(`\nREGRESSION: expected-pass plugins failed: ${regressions.join(', ')}`); process.exit(1); }
console.log(`\nAC GREEN: all ${EXPECTED_PASS.length} expected plugins run onload on a real DOM.`);
process.exit(0);
