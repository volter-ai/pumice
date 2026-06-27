// Phase-1 full-breadth harness. Reads top100.lock.json, downloads each plugin's
// released main.js, runs it through the same real-DOM triage as compat-harness.mjs
// (jsdom + Obsidian DOM extensions + IndexedDB + moment + real CodeMirror 6), and
// emits COMPAT100.json with per-plugin tier + first-failure symbol. Dedupes by repo
// so alias ids don't double-count. Ratcheting FLOOR gates regressions in CI.
import { window } from './dom-bootstrap.mjs'; // MUST be first — sets global DOM before api.js
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import { listFiles, readFile, writeFile, snapshot } from '../server/vaultFs.js';
import * as obsidian from '../src/obsidian/api.js';
import { setNoticeSink } from '../src/obsidian/api.js';
import { createApp } from '../src/obsidian/runtime.js';
import * as cmState from '@codemirror/state';
import * as cmView from '@codemirror/view';
import * as cmLanguage from '@codemirror/language';
import * as lezerCommon from '@lezer/common';
import * as lezerHighlight from '@lezer/highlight';
import * as cmCommands from '@codemirror/commands';
import * as cmAutocomplete from '@codemirror/autocomplete';
import * as cmSearch from '@codemirror/search';

const REAL_EXTERNALS = {
  '@codemirror/state': cmState, '@codemirror/view': cmView, '@codemirror/language': cmLanguage,
  '@codemirror/commands': cmCommands, '@codemirror/autocomplete': cmAutocomplete, '@codemirror/search': cmSearch,
  '@lezer/common': lezerCommon, '@lezer/highlight': lezerHighlight,
};

const lock = JSON.parse(await fs.readFile(new URL('../top100.lock.json', import.meta.url), 'utf8'));
// Dedupe by repo — alias ids (e.g. cmdr→commander) point at the same bundle.
const byRepo = new Map();
for (const [id, repo] of Object.entries(lock.plugins)) if (!byRepo.has(repo)) byRepo.set(repo, id);
const PLUGINS = Object.fromEntries([...byRepo.entries()].map(([repo, id]) => [id, repo]));

const dir = new URL('../real-plugins-100/', import.meta.url).pathname;
await fs.mkdir(dir, { recursive: true });

async function ensure(id, repo) {
  const file = path.join(dir, id + '.js');
  try { await fs.access(file); return { id, file, status: 'cached' }; } catch {}
  const url = `https://github.com/${repo}/releases/latest/download/main.js`;
  try {
    const r = await fetch(url, { redirect: 'follow' });
    if (!r.ok) return { id, file, status: 'http ' + r.status };
    const text = await r.text();
    if (text.length < 500) return { id, file, status: 'too-small' };
    await fs.writeFile(file, text);
    return { id, file, status: 'downloaded ' + text.length + 'B' };
  } catch (e) { return { id, file, status: 'err ' + (e.message || e).slice(0, 40) }; }
}
const fetched = await Promise.all(Object.entries(PLUGINS).map(([id, repo]) => ensure(id, repo)));
const missing = fetched.filter((f) => f.status !== 'cached' && !f.status.startsWith('downloaded'));
console.log(`=== fetch: ${fetched.length} unique repos, ${missing.length} unavailable ===`);
for (const f of missing) console.log(`  ✗ ${f.id}: ${f.status}`);

setNoticeSink(() => {});
window.moment = obsidian.moment;
process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});
class WorkerStub { constructor() {} postMessage() {} terminate() {} addEventListener() {} }

const adapter = { name: 'node-fs', capabilities: { write: true, watch: false, sync: true }, list: listFiles, read: readFile, write: writeFile, snapshot };
function universal(label, sink) {
  const f = function () { return universal(label, sink); };
  return new Proxy(f, { get: (_t, k) => (k === 'then' ? undefined : (k === Symbol.toPrimitive || k === 'toString' || k === Symbol.toStringTag ? () => label : universal(label + '.' + String(k), sink))), apply: () => universal(label, sink), construct: () => universal(label, sink) });
}

async function triage(id, source) {
  const externals = new Set();
  const requireShim = (n) => {
    if (n === 'obsidian') return obsidian;
    if (REAL_EXTERNALS[n]) return REAL_EXTERNALS[n];
    externals.add(n);
    return universal(n, externals);
  };
  const app = await createApp(adapter, async (md) => marked.parse(md));
    globalThis.app = app; if (typeof window !== 'undefined') window.app = app;
  const manifest = { id, name: id, version: '0.0.0', minAppVersion: '1.0.0' };
  const out = { id, tier: 'T0-fail', onload: false, firstFailure: null, externals: [] };
  try {
    const module = { exports: {} };
    const fn = new Function('module', 'exports', 'require', 'process', 'window', 'document', 'navigator', 'self', 'activeWindow', 'activeDocument', 'Worker', 'global', 'createEl', 'createDiv', 'createSpan', 'createFragment', source);
    fn(module, module.exports, requireShim, { platform: 'web', env: {} }, window, window.document, window.navigator, window, window, window.document, WorkerStub, window, window.createEl, window.createDiv, window.createSpan, window.createFragment);
    const P = module.exports.default || module.exports;
    if (typeof P !== 'function') throw new Error('no Plugin class exported');
    out.tier = 'T0';
    const inst = new P(app, manifest);
    out.tier = 'T1';
    app.plugins.plugins[manifest.id] = inst;
    app.plugins.enabledPlugins.add(manifest.id);
    await inst.onload();
    out.tier = 'T2';
    out.onload = true;
  } catch (e) {
    out.firstFailure = (e && e.message ? e.message : String(e)).split('\n')[0].slice(0, 100);
  }
  out.externals = [...externals];
  return out;
}

// Per-plugin isolation: plugins monkeypatch SHARED obsidian class prototypes
// (monkey-around) and we never unload them, so one plugin's patches — especially a
// plugin that throws mid-patch — would leak into the next. Snapshot every exported
// class prototype's own-property descriptors once, then restore to baseline after
// each plugin so each is measured against a clean API (as it would see in a fresh
// Obsidian process). This is the honest per-plugin compat measurement.
const baseline = [];
for (const [, val] of Object.entries(obsidian)) {
  if (typeof val === 'function' && val.prototype) baseline.push([val.prototype, Object.getOwnPropertyNames(val.prototype).map((n) => [n, Object.getOwnPropertyDescriptor(val.prototype, n)])]);
}
function restoreProtos() {
  for (const [proto, saved] of baseline) {
    const keep = new Set(saved.map((s) => s[0]));
    for (const n of Object.getOwnPropertyNames(proto)) if (!keep.has(n)) { try { delete proto[n]; } catch {} }
    for (const [n, d] of saved) { try { Object.defineProperty(proto, n, d); } catch {} }
  }
}

const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.js'));
const rows = [];
for (const f of files) { rows.push(await triage(f.replace(/\.js$/, ''), await fs.readFile(path.join(dir, f), 'utf8'))); restoreProtos(); }
rows.sort((a, b) => a.id.localeCompare(b.id));
await fs.writeFile(new URL('../COMPAT100.json', import.meta.url), JSON.stringify(rows, null, 2));

const t2 = rows.filter((r) => r.tier === 'T2');
console.log(`\n=== compat (real DOM): ${rows.length} downloaded plugins ===`);
for (const r of rows) if (r.tier !== 'T2') console.log(`  🔶 ${r.tier.padEnd(8)} ${r.id} — ${r.firstFailure}`);

const freq = {};
for (const r of rows) if (!r.onload && r.firstFailure) {
  const key = r.firstFailure.replace(/^Cannot read properties of undefined \(reading '(.+?)'\)$/, "undefined.$1").replace(/^Cannot set properties of undefined \(setting '(.+?)'\)$/, "undefined.$1=").replace(/ is not a function$/, '()');
  freq[key] = (freq[key] || 0) + 1;
}
console.log(`\n=== T2 (onload on real DOM): ${t2.length}/${rows.length} (${Math.round(t2.length / rows.length * 100)}%) ===`);
console.log('=== top first-failures (fix these next) ===');
for (const [k, n] of Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${String(n).padStart(2)}×  ${k}`);
console.log('\nwrote COMPAT100.json');

const FLOOR = Number(process.env.FLOOR_100 || 71);
if (t2.length < FLOOR) { console.log(`\nREGRESSION: T2 ${t2.length} < floor ${FLOOR}`); process.exit(1); }
console.log(`\nbaseline: ${t2.length}/${rows.length} at T2.`);
process.exit(0);
