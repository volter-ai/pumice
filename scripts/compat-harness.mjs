// Phase-1 breadth harness. Runs a set of REAL top community plugins through the
// real-DOM triage (jsdom + Obsidian DOM extensions + IndexedDB + moment), classifies
// each by tier (T0 loads / T1 constructs / T2 onload-on-real-DOM), and emits
// COMPAT.json plus a first-failure frequency table — the data that tells us which
// missing API symbols block the most plugins (data-driven Phase-1 priority).
import { window } from './dom-bootstrap.mjs'; // MUST be first — sets global DOM before api.js
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import { listFiles, readFile, writeFile, snapshot } from '../server/vaultFs.js';
import * as obsidian from '../src/obsidian/api.js';
import { setNoticeSink } from '../src/obsidian/api.js';
import { createApp } from '../src/obsidian/runtime.js';

// id -> GitHub "latest release" main.js. A representative slice of the most-installed
// plugins (NOT the full pinned top-100 lockfile — that's a separate Phase-0 artifact).
const PLUGINS = {
  dataview: 'blacksmithgu/obsidian-dataview',
  templater: 'SilentVoid13/Templater',
  tasks: 'obsidian-tasks-group/obsidian-tasks',
  calendar: 'liamcain/obsidian-calendar-plugin',
  'advanced-tables': 'tgrosinger/advanced-tables-obsidian',
  kanban: 'mgmeyers/obsidian-kanban',
  'style-settings': 'mgmeyers/obsidian-style-settings',
  iconize: 'FlorianWoelki/obsidian-iconize',
  quickadd: 'chhoumann/quickadd',
  omnisearch: 'scambier/obsidian-omnisearch',
  outliner: 'vslinko/obsidian-outliner',
  homepage: 'mirnovov/obsidian-homepage',
  'natural-dates': 'argenos/nldates-obsidian',
  'tag-wrangler': 'pjeby/tag-wrangler',
  'emoji-shortcodes': 'phibr0/obsidian-emoji-shortcodes',
  'periodic-notes': 'liamcain/obsidian-periodic-notes',
  'recent-files': 'tgrosinger/recent-files-obsidian',
  admonition: 'javalent/admonitions',
  linter: 'platers/obsidian-linter',
  commander: 'phibr0/obsidian-commander',
  'various-complements': 'tadashi-aikawa/obsidian-various-complements-plugin',
  'paste-image-rename': 'reorx/obsidian-paste-image-rename',
  'sliding-panes': 'deathau/sliding-panes-obsidian',
  'mind-map': 'lynchjames/obsidian-mind-map',
  buttons: 'shabegom/buttons',
};

const dir = new URL('../real-plugins/', import.meta.url).pathname;
await fs.mkdir(dir, { recursive: true });

// Download any missing bundles.
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
console.log('=== fetch ===');
for (const f of fetched) console.log(`  ${f.id}: ${f.status}`);

// DOM/IndexedDB are set up globally by ./dom-bootstrap.mjs (imported first).
setNoticeSink(() => {});
window.moment = obsidian.moment;
process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});
class WorkerStub { constructor() {} postMessage() {} terminate() {} addEventListener() {} }

const adapter = { name: 'node-fs', capabilities: { write: true, watch: false, sync: true }, list: listFiles, read: readFile, write: writeFile, snapshot };
function universal(label, sink) {
  const f = function () { return universal(label, sink); };
  return new Proxy(f, { get: (_t, k) => (k === 'then' ? undefined : universal(label + '.' + String(k), sink)), apply: () => universal(label, sink), construct: () => universal(label, sink) });
}

async function triage(id, source) {
  const externals = new Set();
  const requireShim = (n) => { if (n === 'obsidian') return obsidian; externals.add(n); return universal(n, externals); };
  const app = await createApp(adapter, async (md) => marked.parse(md));
  const manifest = { id, name: id, version: '0.0.0', minAppVersion: '1.0.0' };
  const out = { id, tier: 'T0-fail', onload: false, firstFailure: null, externals: [] };
  try {
    const module = { exports: {} };
    const fn = new Function('module', 'exports', 'require', 'process', 'window', 'document', 'navigator', 'self', 'activeWindow', 'activeDocument', 'Worker', 'app', 'global', 'createEl', 'createDiv', 'createSpan', 'createFragment', source);
    fn(module, module.exports, requireShim, { platform: 'web', env: {} }, window, window.document, window.navigator, window, window, window.document, WorkerStub, app, window, window.createEl, window.createDiv, window.createSpan, window.createFragment);
    const P = module.exports.default || module.exports;
    if (typeof P !== 'function') throw new Error('no Plugin class exported');
    out.tier = 'T0';
    const inst = new P(app, manifest);
    out.tier = 'T1';
    await inst.onload();
    out.tier = 'T2';
    out.onload = true;
  } catch (e) {
    out.firstFailure = (e && e.message ? e.message : String(e)).split('\n')[0].slice(0, 100);
  }
  out.externals = [...externals];
  return out;
}

const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.js'));
const rows = [];
for (const f of files) rows.push(await triage(f.replace(/\.js$/, ''), await fs.readFile(path.join(dir, f), 'utf8')));

rows.sort((a, b) => a.id.localeCompare(b.id));
await fs.writeFile(new URL('../COMPAT.json', import.meta.url), JSON.stringify(rows, null, 2));

const t2 = rows.filter((r) => r.tier === 'T2');
console.log('\n=== compat (real DOM) ===');
for (const r of rows) console.log(`  ${r.tier === 'T2' ? '✅' : '🔶'} ${r.tier.padEnd(8)} ${r.id}${r.firstFailure ? ' — ' + r.firstFailure : ''}`);

// First-failure frequency → what to implement next to move the most plugins.
const freq = {};
for (const r of rows) if (!r.onload && r.firstFailure) {
  const key = r.firstFailure.replace(/^Cannot read properties of undefined \(reading '(.+?)'\)$/, "undefined.$1").replace(/ is not a function$/, '()');
  freq[key] = (freq[key] || 0) + 1;
}
console.log(`\n=== T2 (onload on real DOM): ${t2.length}/${rows.length} ===`);
console.log('=== top first-failures (fix these next) ===');
for (const [k, n] of Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${String(n).padStart(2)}×  ${k}`);
console.log('\nwrote COMPAT.json');

// Regression gate: T2 count must not drop below the established floor. Raise FLOOR as
// the number climbs so the gate ratchets forward and CI catches regressions.
const FLOOR = 12;
if (t2.length < FLOOR) {
  console.log(`\nREGRESSION: T2 ${t2.length} < floor ${FLOOR}`);
  process.exit(1);
}
console.log(`\nAC GREEN: ${t2.length}/${rows.length} at T2 (floor ${FLOOR}).`);
process.exit(0); // jsdom/plugin timers can keep the loop alive — force clean exit for CI
