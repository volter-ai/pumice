// Measure the compat curve: run REAL community plugin bundles through the shim and
// report how far each gets — which externals they demand, whether they construct,
// whether onload() runs, and the first thing that breaks. Honest baseline.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import { listFiles, readFile, writeFile, snapshot } from '../server/vaultFs.js';
import * as obsidian from '../src/obsidian/api.js';
import { setNoticeSink } from '../src/obsidian/api.js';
import { createApp } from '../src/obsidian/runtime.js';

setNoticeSink(() => {});

const adapter = {
  name: 'node-fs',
  capabilities: { write: true, watch: false, sync: true },
  list: listFiles, read: readFile, write: writeFile, snapshot,
};

// Universal stub — callable, constructable, infinitely chainable. Lets a bundle
// get PAST an unimplemented external/DOM call so we can see what ELSE it needs.
function universal(label, sink) {
  const f = function () { return universal(label, sink); };
  return new Proxy(f, {
    get: (_t, k) => {
      if (k === Symbol.toPrimitive || k === Symbol.toStringTag) return () => '';
      if (k === 'then') return undefined; // not a thenable
      return universal(label + '.' + String(k), sink);
    },
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
  const domStub = universal('document', null);
  const winStub = universal('window', null);

  const app = await createApp(adapter, async (md) => marked.parse(md));
  const manifest = { id, name: id, version: '0.0.0', minAppVersion: '1.0.0' };

  const report = { id, externals, constructed: false, onload: false, error: null, commands: 0 };
  try {
    const module = { exports: {} };
    // Inject globals that genuinely exist in the target runtime (browser + Obsidian
    // renderer): `self`, `app`, `globalThis`. Not cheating — the harness was just
    // barer than the real environment.
    // Web/Obsidian globals absent from bare Node but present in the real runtime.
    class WorkerStub { constructor() {} postMessage() {} terminate() {} addEventListener() {} }
    const fn = new Function(
      'module', 'exports', 'require', 'process', 'window', 'document', 'navigator', 'global', 'self', 'app',
      'activeWindow', 'activeDocument', 'Worker',
      source,
    );
    fn(module, module.exports, requireShim, { platform: 'web', env: {} }, winStub, domStub, winStub, winStub, winStub, app,
      winStub, domStub, WorkerStub);
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
for (const f of files) {
  const src = await fs.readFile(path.join(dir, f), 'utf8');
  rows.push(await triage(f.replace(/\.js$/, ''), src));
}

console.log('\n=== REAL PLUGIN COMPAT TRIAGE ===\n');
for (const r of rows) {
  const stage = r.onload ? '✅ onload ran' : r.constructed ? '🔶 constructed, onload threw' : '❌ failed to load';
  console.log(`${r.id}`);
  console.log(`   ${stage}${r.commands ? ` — ${r.commands} command(s) registered` : ''}`);
  if (r.error) console.log(`   first break: ${r.error}`);
  const ext = [...r.externals].filter((e) => e !== 'obsidian');
  console.log(`   externals beyond 'obsidian': ${ext.length ? ext.join(', ') : '(none — pure obsidian API)'}`);
  console.log('');
}
const ran = rows.filter((r) => r.onload).length;
console.log(`onload ran for ${ran}/${rows.length} real plugins (with externals stubbed).`);
