// Pumice workbench — the INTEGRATED app. Mounts every subsystem into one runnable UI
// with stable data-testid hooks so each feature is provable by a real-browser e2e test.
// This is what converts "the libraries pass jsdom tests" into "the app actually works".
import { installDomExtensions } from '../obsidian/dom.js';
installDomExtensions(window);

import * as obsidian from '../obsidian/api.js';
import { createApp } from '../obsidian/runtime.js';
import { memoryAdapter } from '../vfs/memoryAdapter.js';
import { opfsAdapter } from '../vfs/opfsAdapter.js';
import { readDataTransfer, filesToVault, publishedAdapter } from '../ui/drop-loader.js';
import { renderMarkdown } from '../render/obsidian-markdown.js';
import { Editor } from '../editor/editor.js';
import { livePreview, buildDecorations } from '../editor/live-preview.js';
import { parseCanvas, renderCanvas } from '../canvas/canvas.js';
import { parseBase, evaluateView, renderTableView } from '../bases/bases.js';
import { buildPropertiesPanel } from '../ui/properties-ui.js';
// Search + graph are delivered by REAL Obsidian plugins (omnisearch, 3D-graph) on the
// shim — no Pumice-built search/graph modules.
import { backlinks as backlinksOf } from '../vfs/links.js';
import { createPagePreview, registerPagePreviews } from '../ui/page-preview.js';
import { ensureDailyNote } from '../core/daily-notes.js';
import { createStyleSettingsManager } from '../ui/css-settings.js';
import { renameTag } from '../core/tag-ops.js';
import { parseProperties, processFrontMatter } from '../core/properties.js';
import { createVaultCore, createMcpServer, createRestHandler, memoryStore } from '../mcp/server.js';
// Real CodeMirror 6 externals (same set the compat harness provides to plugins).
import * as cmState from '@codemirror/state';
import * as cmView from '@codemirror/view';
import * as cmLanguage from '@codemirror/language';
import * as cmCommands from '@codemirror/commands';
import * as cmAutocomplete from '@codemirror/autocomplete';
import * as cmSearch from '@codemirror/search';
import * as lezerCommon from '@lezer/common';
import * as lezerHighlight from '@lezer/highlight';
const REAL_EXTERNALS = { '@codemirror/state': cmState, '@codemirror/view': cmView, '@codemirror/language': cmLanguage, '@codemirror/commands': cmCommands, '@codemirror/autocomplete': cmAutocomplete, '@codemirror/search': cmSearch, '@lezer/common': lezerCommon, '@lezer/highlight': lezerHighlight };
// EVERY real community plugin bundle in the repo, loaded in the real browser via glob.
// LAZY (eager:false) so each plugin is its own code-split chunk fetched on demand —
// keeps the main app bundle small instead of inlining ~100MB of plugin source.
const rawA = import.meta.glob('../../real-plugins/*.js', { query: '?raw', import: 'default' });
const rawB = import.meta.glob('../../real-plugins-100/*.js', { query: '?raw', import: 'default' });
// Plugins that genuinely need native/external libs a browser can't provide (capability
// walls) — excluded from the in-browser batch, documented in INTERNALS.md §C/§D.
const WALLED = new Set(['excalidraw', 'obsidian-charts', 'obsidian-map-view', 'obsidian-leaflet', 'obsidian-git', 'obsidian-pandoc', 'obsidian-importer', 'obsidian-paste-png-to-jpeg', 'obsidian-kindle-plugin', 'obsidian-open-vault-in-vscode', 'metaedit', 'text-generator', 'cm-editor-syntax-highlight', 'hover-editor', 'obsidian-quick-explorer', 'obsidian-memos', 'obsidian-consistent-attachments', 'obsidian-icons-plugin', 'obsidian-auto-link-title']);
const REAL_PLUGINS = {}; // id -> async loader returning the bundle source
for (const [p, loader] of [...Object.entries(rawA), ...Object.entries(rawB)]) {
  const id = p.split('/').pop().replace(/\.js$/, '');
  if (!REAL_PLUGINS[id] && !WALLED.has(id)) REAL_PLUGINS[id] = loader;
}
// a few featured ids the plugin e2e checks explicitly
const FEATURED = ['emoji-shortcodes', 'recent-files', 'sliding-panes', 'natural-dates', 'advanced-tables'];

// ---- fixture vault ----
const VAULT = {
  'Welcome.md': '---\ntitle: Welcome\ntags: [home, demo]\nrating: 5\npublished: true\n---\n# Welcome\nLinks to [[Note A]] and [[Tasks]]. A ==highlight==, a #home tag, and $E=mc^2$.\n\n> [!note] Heads up\n> Body of the callout.\n\n- [ ] open task\n- [x] done task',
  'Note A.md': '# Note A\nBack to [[Welcome]]. Some #demo content with :smile: emoji.',
  'Tasks.md': '# Tasks\n- [ ] write spec\n- [x] ship it\nLinks [[Welcome]].',
  'Project.canvas': JSON.stringify({ nodes: [{ id: 'a', type: 'text', text: 'Idea', x: 20, y: 20, width: 120, height: 50 }, { id: 'b', type: 'file', file: 'Welcome.md', x: 200, y: 120, width: 160, height: 60 }], edges: [{ id: 'e1', fromNode: 'a', toNode: 'b', label: 'leads to' }] }, null, 2),
  'Books.base': JSON.stringify({ filters: 'type == "book"', formulas: { value: 'price * qty' }, properties: {}, views: [{ type: 'table', name: 'Inventory', order: ['file.name', 'price', 'qty', 'value'] }] }, null, 2),
  'Books/Dune.md': '---\ntype: book\nprice: 20\nqty: 3\n---\nDune',
  'Books/Hobbit.md': '---\ntype: book\nprice: 10\nqty: 5\n---\nHobbit',
};
const resolve = (name) => '#' + encodeURIComponent(name);

let app, store, mcp, rest;

// ---- plugin loader (same shape as the compat harness, in the real browser) ----
function universal(label) { const f = function () { return universal(label); }; return new Proxy(f, { get: (_t, k) => (k === 'then' ? undefined : universal(label)), apply: () => universal(label), construct: () => universal(label) }); }
async function loadPlugin(id, source) {
  const require = (n) => (n === 'obsidian' ? obsidian : (REAL_EXTERNALS[n] || universal(n)));
  const module = { exports: {} };
  const fn = new Function('module', 'exports', 'require', 'process', 'app', 'window', 'document', source);
  fn(module, module.exports, require, { platform: 'web', env: {} }, app, window, document);
  const P = module.exports.default || module.exports;
  const inst = new P(app, { id, name: id, version: '0.0.0', minAppVersion: '1.0.0' });
  app.plugins.plugins[id] = inst;
  app.plugins.enabledPlugins.add(id);
  await inst.onload();
  return inst;
}

// Ensure one real plugin bundle is loaded (lazy), returning its instance.
async function ensureRealPlugin(id) {
  if (app.plugins.plugins[id]) return app.plugins.plugins[id];
  if (!REAL_PLUGINS[id]) throw new Error('no real plugin bundle: ' + id);
  return loadPlugin(id, await REAL_PLUGINS[id]());
}

// Mount the REAL 3D-graph community plugin's view into `host` — this REPLACES the
// retired native src/graph.js. The plugin reads app.metadataCache.resolvedLinks and
// renders a Three.js/WebGL canvas via its own command + leaf.open(view).
async function mountRealGraph(host) {
  await ensureRealPlugin('3d-graph');
  const leaf = app.workspace._makeLeaf();
  leaf.containerEl.style.cssText = 'position:absolute;inset:0';
  host.appendChild(leaf.containerEl);
  app.workspace.activeLeaf = leaf; // so the plugin's getLeaf(false) targets this leaf
  const cmd = app.commands.findCommand('open-3d-graph-global') || app.commands.listCommands().find((c) => /3d.?graph/i.test(c.id));
  if (cmd) await app.commands.executeCommandById(cmd.id);
  // The plugin sizes its 3d-force-graph to the window; reframe it to the host so the
  // graph is centered+fit. There can be several ForceGraph instances (global/local/
  // settings) — collect them all and pick the POPULATED one.
  // The ForceGraph instance is a FUNCTION (3d-force-graph returns a fn with methods),
  // held as a property of the view. Test function-valued props, but only recurse into
  // plain objects (so we don't explode over function method-properties).
  const collect = (root, depth, seen, out) => {
    if (!root || depth > 6 || seen.has(root) || typeof root !== 'object') return;
    seen.add(root);
    for (const k of Object.keys(root)) {
      let v; try { v = root[k]; } catch { continue; }
      if (!v) continue;
      const t = typeof v;
      if ((t === 'object' || t === 'function')) {
        try { if (typeof v.zoomToFit === 'function' && typeof v.graphData === 'function') out.push(v); } catch {}
      }
      if (t === 'object') collect(v, depth + 1, seen, out);
    }
  };
  await new Promise((r) => setTimeout(r, 900));
  const cands = [];
  collect(leaf.view, 0, new Set(), cands);
  const nodeCount = (g) => { try { return (g.graphData().nodes || []).length; } catch { return 0; } };
  const fg = cands.sort((a, b) => nodeCount(b) - nodeCount(a))[0] || null;
  if (fg) {
    window.__fg = fg;
    // Resize the renderer to the host and zoom-to-fit; retry a few times so it sticks
    // even if the plugin re-sizes to the window or the sim settles late.
    const frame = () => {
      try { fg.width(host.clientWidth).height(host.clientHeight); } catch {}
      try { const cv = host.querySelector('canvas'); if (cv) { cv.style.width = '100%'; cv.style.height = '100%'; } } catch {}
      try { fg.zoomToFit(400, 40); } catch {}
    };
    frame();
    for (const d of [600, 1300, 2200]) setTimeout(frame, d);
  }
  return { leaf, fg };
}

// Drive the REAL omnisearch plugin for a query (replaces the retired src/search engine).
async function realSearch(query) {
  const inst = await ensureRealPlugin('omnisearch');
  if (inst.populateIndex) { try { await inst.populateIndex(); } catch {} }
  const api = (globalThis.omnisearch && globalThis.omnisearch.api) || inst.api;
  const res = api && api.search ? await api.search(query) : [];
  return res.map((r) => r.path || (r.basename ? r.basename + '.md' : '') || r.id).filter(Boolean);
}

// A hand-written plugin that registers a markdown post-processor — proves the plugin
// API → render pipeline end to end in the browser.
class BadgePlugin extends obsidian.Plugin {
  async onload() {
    this.registerMarkdownPostProcessor((el) => {
      el.querySelectorAll('a.tag').forEach((a) => { const b = document.createElement('span'); b.className = 'tag-badge'; b.setAttribute('data-testid', 'plugin-badge'); b.textContent = '★'; a.appendChild(b); });
    });
  }
}

// ---- feature panels ----
const FEATURES = [];
function feature(id, label, build) { FEATURES.push({ id, label, build }); }
const el = (tag, props = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(props)) { if (k.includes('-')) n.setAttribute(k, v); else n[k] = v; } for (const k of kids) n.append(k); return n; };

feature('vault', 'Vault open', (root) => {
  const list = el('ul', { 'data-testid': 'note-list' });
  for (const f of app.vault.getMarkdownFiles()) {
    const li = el('li', { className: 'result-item', textContent: f.path });
    li.setAttribute('data-path', f.path);
    li.onclick = () => openNote(f.path, root);
    list.append(li);
  }
  root.append(el('h2', { textContent: 'Vault (' + app.vault.getMarkdownFiles().length + ' notes)' }), list);
  const note = el('div', { id: 'note-pane' }); note.setAttribute('data-testid', 'note-pane'); root.append(note);
  openNote('Welcome.md', root);
});
function openNote(path, root) {
  const note = root.querySelector('[data-testid=note-pane]') || document.querySelector('[data-testid=note-pane]');
  if (!note) return;
  note.replaceChildren();
  const content = app.vault._cache.get(path) || VAULT[path] || '';
  renderMarkdown(content, note, { resolve, postProcessors: app.postProcessors });
  note.querySelectorAll('a.internal-link').forEach((a) => { a.onclick = (e) => { e.preventDefault(); const t = decodeURIComponent(a.dataset.target); const hit = app.vault.getMarkdownFiles().find((f) => f.path.replace(/\.md$/, '').endsWith(t)); if (hit) openNote(hit.path, root); }; });
  note.setAttribute('data-current', path);
}

feature('render', 'Markdown render', (root) => {
  const out = el('div'); out.setAttribute('data-testid', 'render-out');
  renderMarkdown(VAULT['Welcome.md'], out, { resolve, postProcessors: app.postProcessors });
  root.append(el('h2', { textContent: 'Markdown rendering' }), out);
});

const ALL_MD = [
  '# H1', '## H2', '### H3', '#### H4', '##### H5', '###### H6',
  '', '**boldtext** and *italictext* and ~~striketext~~ and ==hltext== and `codetext`',
  '', 'mass $E=mc^2$ inline and:', '', '$$\\int_0^1 x\\,dx$$',
  '', '```math', 'a^2+b^2=c^2', '```',
  '', '```mermaid', 'graph TD; A-->B;', '```',
  '', '```js', 'const notALink = "[[x]]";', '```',
  '', '> [!warning] Be careful', '> warning body', '', '> [!tip]- Folded tip', '> tip body', '', '> [!bogus] Unknown', '> falls back to note',
  '', 'See [[Note A]] and [[Note A|the alias]] and [[Note A#Heading]] and [[Note A#^blk]].',
  '', 'Embeds: ![[Note A]] ![[Note A#Heading]] ![[Note A#^blk]]',
  '', 'Tags: #toptag and #area/work nested.',
  '', 'A paragraph with a block ref. ^para1',
  '', 'Text with a footnote[^1] here.', '', '[^1]: The footnote definition.',
  '', '| col1 | col2 |', '|---|---|', '| v1 | v2 |',
  '', '- [ ] unchecked task', '- [x] checked task',
  '', 'visible %%inline-secret%% words',
  '', '%%', 'block-secret-comment', '%%', '', 'after-comment',
].join('\n');

feature('decorations', 'All markdown decorations', (root) => {
  root.append(el('h2', { textContent: 'Full markdown decoration set' }));
  const out = el('div'); out.setAttribute('data-testid', 'decorations-out');
  renderMarkdown(ALL_MD, out, { resolve });
  root.append(out);
});

feature('plugin', 'Plugins', (root) => {
  const status = el('div'); status.setAttribute('data-testid', 'plugin-status');
  const render = () => { const real = window.__loadedReal || []; status.setAttribute('data-real-count', String(real.length)); status.textContent = 'Real community plugins loaded in-browser (' + real.length + '): ' + real.join(', '); };
  render();
  // Load the full breadth on demand (boot only loaded the featured few).
  const loadBtn = el('button', { className: 'action', textContent: 'load all community plugins', 'data-testid': 'plugin-load-all' });
  loadBtn.onclick = async () => { status.setAttribute('data-loading', 'true'); await window.__loadAllPlugins(); status.setAttribute('data-loading', 'done'); render(); };
  root.append(loadBtn);
  const out = el('div'); out.setAttribute('data-testid', 'plugin-render');
  // render Note A (has a #demo tag) through the post-processor pipeline → BadgePlugin adds ★
  renderMarkdown(VAULT['Note A.md'], out, { resolve, postProcessors: app.postProcessors });
  root.append(el('h2', { textContent: 'Plugin runtime' }), status, el('h3', { textContent: 'Post-processor output (★ badge injected by a plugin):' }), out);
});

feature('editor', 'Editor (CM6)', (root) => {
  root.append(el('h2', { textContent: 'CodeMirror 6 editor + live preview' }));
  const host = el('div'); host.setAttribute('data-testid', 'editor-host'); root.append(host);
  const ed = new Editor(host, { doc: '# Title\n**bold** and ==highlight== and [[Welcome]]\n- [ ] task', extensions: [livePreview] });
  window.__ed = ed;
  const info = el('div'); info.setAttribute('data-testid', 'editor-value');
  const sync = () => { info.textContent = 'lines:' + ed.lineCount() + ' value:' + JSON.stringify(ed.getValue().slice(0, 30)); };
  sync(); ed.cm.dom.addEventListener('keyup', sync);
  const btn = el('button', { className: 'action', textContent: 'append text', 'data-testid': 'editor-append' });
  btn.setAttribute('data-testid', 'editor-append');
  btn.onclick = () => { ed.replaceRange(' MORE', { line: 0, ch: ed.getLine(0).length }); sync(); };
  root.append(btn, info);
});

feature('canvas', 'Canvas', (root) => {
  root.append(el('h2', { textContent: 'Canvas' }));
  const host = el('div', { id: 'canvas-host' }); host.setAttribute('data-testid', 'canvas-host');
  renderCanvas(parseCanvas(VAULT['Project.canvas']), host);
  root.append(host);
});

feature('bases', 'Bases', (root) => {
  root.append(el('h2', { textContent: 'Bases' }));
  const model = parseBase(VAULT['Books.base']);
  const files = { 'Books/Dune.md': VAULT['Books/Dune.md'], 'Books/Hobbit.md': VAULT['Books/Hobbit.md'], 'Welcome.md': VAULT['Welcome.md'] };
  const view = evaluateView(model, model.views[0], files);
  const host = el('div'); host.setAttribute('data-testid', 'bases-host');
  renderTableView(view, host);
  root.append(host);
});

feature('properties', 'Properties', (root) => {
  root.append(el('h2', { textContent: 'Properties panel' }));
  const { data } = parseProperties(VAULT['Welcome.md']);
  const panel = buildPropertiesPanel(data);
  panel.el.setAttribute('data-testid', 'properties-panel');
  root.append(panel.el);
  const out = el('div'); out.setAttribute('data-testid', 'properties-data');
  const btn = el('button', { className: 'action', textContent: 'read values', 'data-testid': 'properties-read' });
  btn.onclick = () => { out.textContent = JSON.stringify(panel.getData()); };
  btn.onclick();
  root.append(btn, out);
});

feature('search', 'Search', (root) => {
  root.append(el('h2', { textContent: 'Search — real omnisearch plugin' }));
  const input = el('input', { 'data-testid': 'search-input', placeholder: 'full-text search (omnisearch)' });
  input.setAttribute('data-testid', 'search-input');
  const results = el('ul'); results.setAttribute('data-testid', 'search-results');
  const run = async () => { results.replaceChildren(); for (const p of await realSearch(input.value || 'task')) results.append(el('li', { className: 'result-item', textContent: p })); };
  input.oninput = run; run();
  root.append(input, results);
});

feature('graph3d', 'Graph (real 3D-graph plugin)', (root) => {
  root.append(el('h2', { textContent: 'Graph — real 3D-graph community plugin (WebGL)' }));
  const host = el('div'); host.setAttribute('data-testid', 'graph3d-host'); host.style.width = '100%'; host.style.height = '620px'; host.style.position = 'relative'; host.style.background = '#0b0e14'; host.style.borderRadius = '8px'; host.style.overflow = 'hidden';
  root.append(host);
  const status = el('div', { 'data-testid': 'graph3d-status', textContent: 'loading real plugin…' });
  root.append(status);
  mountRealGraph(host)
    .then(({ fg }) => { const c = host.querySelector('canvas'); window.__graph3d = c; const n = fg && fg.graphData ? (fg.graphData().nodes || []).length : 0; status.textContent = c ? ('mounted: real 3d-graph plugin · canvas ' + c.width + 'x' + c.height + ' · ' + n + ' nodes · framed') : 'plugin loaded (no canvas)'; })
    .catch((e) => { status.textContent = 'ERROR: ' + (e && e.message); });
});

// Render a markdown code-block through a REAL plugin's registered processor.
async function renderRealCodeblock(pluginId, lang, source, host) {
  const inst = await ensureRealPlugin(pluginId);
  app.metadataCache.trigger('resolved');
  await new Promise((r) => setTimeout(r, 500)); // dataview/tasks index (worker) settle
  const proc = app._codeblocks && app._codeblocks.get(lang);
  if (!proc) throw new Error('no codeblock processor "' + lang + '" from ' + pluginId);
  const ctx = { sourcePath: 'Welcome.md', frontmatter: null, addChild() {}, getSectionInfo() { return null }, docId: 'doc' };
  await proc(source, host, ctx);
  return inst;
}

feature('dataview', 'Dataview (real plugin)', (root) => {
  root.append(el('h2', { textContent: 'Dataview — real plugin query (Web Worker index)' }));
  const out = el('div'); out.setAttribute('data-testid', 'dataview-out'); root.append(out);
  const status = el('div', { 'data-testid': 'dataview-status', textContent: 'loading real dataview…' }); root.append(status);
  renderRealCodeblock('dataview', 'dataview', 'TABLE rating FROM "" SORT rating DESC', out)
    .then(() => { const rows = out.querySelectorAll('table tr').length; status.textContent = 'real dataview rendered a table with ' + rows + ' rows'; })
    .catch((e) => { status.textContent = 'ERROR: ' + e.message; });
});

feature('tasks', 'Tasks (real plugin)', (root) => {
  root.append(el('h2', { textContent: 'Tasks — real plugin query over vault list items' }));
  const out = el('div'); out.setAttribute('data-testid', 'tasks-out'); root.append(out);
  const status = el('div', { 'data-testid': 'tasks-status', textContent: 'loading real tasks…' }); root.append(status);
  renderRealCodeblock('tasks', 'tasks', 'not done', out)
    .then(() => { const items = out.querySelectorAll('li, .task-list-item, .tasks-list-text').length; status.textContent = 'real tasks rendered ' + items + ' open task item(s)'; })
    .catch((e) => { status.textContent = 'ERROR: ' + e.message; });
});

feature('templater', 'Templater (real plugin)', (root) => {
  root.append(el('h2', { textContent: 'Templater — real plugin expands <% tp.* %>' }));
  const before = el('pre', { 'data-testid': 'templater-before' });
  const after = el('pre', { 'data-testid': 'templater-after' });
  const status = el('div', { 'data-testid': 'templater-status', textContent: 'loading real templater…' });
  root.append(el('div', { textContent: 'template:' }), before, el('div', { textContent: 'result:' }), after, status);
  (async () => {
    try {
      const inst = await ensureRealPlugin('templater');
      const tp = inst.templater;
      const file = app.vault.getMarkdownFiles()[0];
      app.workspace.setActiveFile(file);
      const tpl = 'sum = <% 2 + 3 %> · upper = <% "ab".toUpperCase() %> · title = <% tp.file.title %>';
      before.textContent = tpl;
      // Drive the GENUINE templater engine (parse_template) — same path the plugin uses
      // to render <% tp.* %> + arbitrary JS expressions.
      const cfg = tp.create_running_config
        ? tp.create_running_config(file, file, 0)
        : { template_file: file, target_file: file, run_mode: 0, active_file: file };
      const result = await tp.parse_template(cfg, tpl);
      after.textContent = result;
      const ok = typeof result === 'string' && !result.includes('<%') && /sum = 5/.test(result) && /upper = AB/.test(result);
      window.__templater = { result };
      status.textContent = ok ? 'real templater expanded the template ✓' : 'ran → ' + result;
    } catch (e) { status.textContent = 'ERROR: ' + e.message; }
  })();
});

feature('backlinks', 'Backlinks', (root) => {
  root.append(el('h2', { textContent: 'Backlinks to Welcome.md' }));
  const files = Object.fromEntries(app.vault.getMarkdownFiles().map((f) => [f.path, app.vault._cache.get(f.path)]));
  const bl = backlinksOf(files, 'Welcome.md');
  const list = el('ul'); list.setAttribute('data-testid', 'backlinks-list');
  for (const p of bl) list.append(el('li', { textContent: p }));
  root.append(list);
});

feature('preview', 'Page preview', (root) => {
  root.append(el('h2', { textContent: 'Hover preview' }));
  const host = el('div'); host.setAttribute('data-testid', 'preview-host');
  renderMarkdown('Hover [[Note A]] to preview.', host, { resolve });
  const files = Object.fromEntries(app.vault.getMarkdownFiles().map((f) => [f.path, app.vault._cache.get(f.path)]));
  registerPagePreviews(host, files, { resolve });
  root.append(host);
});

feature('daily', 'Daily note', (root) => {
  root.append(el('h2', { textContent: 'Daily note / template' }));
  const out = el('div'); out.setAttribute('data-testid', 'daily-out');
  const btn = el('button', { className: 'action', textContent: 'create today', 'data-testid': 'daily-create' });
  btn.onclick = () => { const files = Object.fromEntries(app.vault.getMarkdownFiles().map((f) => [f.path, app.vault._cache.get(f.path)])); const plan = ensureDailyNote(files, { folder: 'Daily' }, new Date(Date.UTC(2026, 5, 26, 12)), '# {{date}}\n\n'); out.setAttribute('data-path', plan.path); out.textContent = plan.path + ' :: ' + plan.content.trim(); };
  root.append(btn, out);
});

feature('theme', 'Theme / style settings', (root) => {
  root.append(el('h2', { textContent: 'Theme CSS variables' }));
  const mgr = createStyleSettingsManager(document.body);
  mgr.load(`/* @settings\nid: demo\nname: Demo\nsettings:\n  - id: accent-color\n    type: variable-color\n    default: '#cba6f7'\n*/`);
  const out = el('div'); out.setAttribute('data-testid', 'theme-out');
  const btn = el('button', { className: 'action', textContent: 'set accent red', 'data-testid': 'theme-apply' });
  btn.onclick = () => { mgr.set('accent-color', '#ff0000'); out.textContent = 'accent=' + getComputedStyle(document.body).getPropertyValue('--accent-color').trim(); };
  root.append(btn, out);
});

feature('tagrename', 'Tag rename', (root) => {
  root.append(el('h2', { textContent: 'Tag rename across vault' }));
  const out = el('div'); out.setAttribute('data-testid', 'tagrename-out');
  const btn = el('button', { className: 'action', textContent: 'rename #demo → #sample', 'data-testid': 'tagrename-run' });
  btn.onclick = () => { const files = Object.fromEntries(app.vault.getMarkdownFiles().map((f) => [f.path, app.vault._cache.get(f.path)])); const { changes, count } = renameTag(files, 'demo', 'sample'); out.setAttribute('data-count', String(count)); out.textContent = count + ' notes changed; A.md now: ' + (changes['Note A.md'] || '').split('\n')[1]; };
  root.append(btn, out);
});

feature('opfs', 'OPFS persistence', (root) => {
  root.append(el('h2', { textContent: 'OPFS — persistent browser storage (no server)' }));
  const out = el('div'); out.setAttribute('data-testid', 'opfs-out'); out.setAttribute('data-state', 'idle');
  const writeBtn = el('button', { className: 'action', textContent: 'write + read back', 'data-testid': 'opfs-write' });
  writeBtn.onclick = async () => {
    try {
      const a = await opfsAdapter({ dir: 'pumice-vault' });
      await a.write('Nested/Folder/note.md', '# Persisted\nvia OPFS');
      const back = await a.read('Nested/Folder/note.md');
      const list = await a.list();
      out.setAttribute('data-state', back.includes('Persisted') && list.includes('Nested/Folder/note.md') ? 'ok' : 'bad');
      out.textContent = 'wrote+read: ' + JSON.stringify(back) + ' | list: ' + list.join(',');
    } catch (e) { out.setAttribute('data-state', 'error'); out.textContent = 'ERROR: ' + e.message; }
  };
  const checkBtn = el('button', { className: 'action', textContent: 'check persisted (after reload)', 'data-testid': 'opfs-check' });
  checkBtn.onclick = async () => {
    try {
      const a = await opfsAdapter({ dir: 'pumice-vault' });
      const list = await a.list();
      const persisted = list.includes('Nested/Folder/note.md');
      out.setAttribute('data-persisted', String(persisted));
      out.textContent = 'persisted across reload: ' + persisted + ' | ' + list.join(',');
    } catch (e) { out.textContent = 'ERROR: ' + e.message; }
  };
  root.append(writeBtn, checkBtn, out);
});

feature('mcp', 'Agent / MCP', (root) => {
  root.append(el('h2', { textContent: 'MCP tri-surface parity' }));
  const out = el('div'); out.setAttribute('data-testid', 'mcp-out');
  const btn = el('button', { className: 'action', textContent: 'search via UI/REST/MCP', 'data-testid': 'mcp-run' });
  btn.onclick = async () => { const core = createVaultCore(store); const m = createMcpServer(core, { allowWrite: true }); const r = createRestHandler(core, { allowWrite: true }); const ui = core.search({ query: 'tag:home' }); const mc = await m.callTool('vault_search', { query: 'tag:home' }); const re = await r({ method: 'GET', path: '/search', query: { q: 'tag:home' } }); const parity = JSON.stringify(ui) === JSON.stringify(mc) && JSON.stringify(ui) === JSON.stringify(re); out.setAttribute('data-parity', String(parity)); out.textContent = 'parity=' + parity + ' results=' + JSON.stringify(ui.map((x) => x.path)); };
  await0(btn);
  root.append(btn, out);
});
function await0(btn) { /* allow async onclick */ }

// ---- boot ----
async function boot() {
  // Published-vault viewer: if a snapshot was embedded (scripts/publish.mjs), mount it
  // read-only with no backend. Otherwise the demo memory vault.
  const seed = (typeof window !== 'undefined' && window.__vaultSnapshot) ? window.__vaultSnapshot : VAULT;
  const adapter = (typeof window !== 'undefined' && window.__published) ? publishedAdapter(seed) : memoryAdapter(seed);
  app = await createApp(adapter, async (md) => md);
  window.__readonly = !!(app.vault.backend.capabilities && app.vault.backend.capabilities.readonly);
  // wire the DOM renderer into the obsidian MarkdownRenderer contract
  obsidian.MarkdownRenderer._renderEl = (md, elm, srcPath) => renderMarkdown(app.vault._cache.get(srcPath) || md, elm, { resolve, postProcessors: app.postProcessors });
  store = memoryStore(Object.fromEntries(Object.entries(VAULT)));
  // load plugins: a hand-written post-processor plugin + a REAL community plugin
  const badge = new BadgePlugin(app, { id: 'badge', name: 'Badge' }); app.plugins.plugins.badge = badge; await badge.onload();
  window.moment = obsidian.moment; // plugins (natural-dates) read window.moment
  // Globals Obsidian's runtime exposes that plugins reference bare (mirror dom-bootstrap).
  window.activeWindow = window; window.activeDocument = document;
  if (!window.CodeMirror) window.CodeMirror = { defineMode() {}, defineMIME() {}, defineSimpleMode() {}, defineOption() {}, registerHelper() {}, modes: {}, mimeModes: {}, commands: {}, keyMap: { default: {} }, Pos: (line, ch) => ({ line, ch }), getMode() { return { name: 'null' }; }, startState() { return {}; }, copyState(s) { return s; }, innerMode(m, s) { return { mode: m, state: s }; }, Vim: { defineOption() {}, map() {} } };
  if (!window.CodeMirrorAdapter) window.CodeMirrorAdapter = { commands: {}, Pos: window.CodeMirror.Pos, keymap: {}, defineMode() {}, e_stop() {}, on() {}, off() {} };
  window.__loadedReal = []; window.__pluginErrors = {};
  // Boot loads only the FEATURED plugins (fast). The full breadth (59) loads on demand
  // when the Plugins tab opens — matching real UX (a user enables specific plugins) and
  // keeping boot quick. window.__loadAllPlugins() loads the rest.
  for (const id of FEATURED) {
    if (!REAL_PLUGINS[id]) continue;
    try { await loadPlugin(id, await REAL_PLUGINS[id]()); window.__loadedReal.push(id); }
    catch (e) { window.__pluginErrors[id] = e.message; }
  }
  window.__loadAllPlugins = async () => {
    for (const [id, loader] of Object.entries(REAL_PLUGINS)) {
      if (window.__loadedReal.includes(id) || window.__pluginErrors[id]) continue;
      try { await loadPlugin(id, await loader()); window.__loadedReal.push(id); }
      catch (e) { window.__pluginErrors[id] = e.message; }
    }
    return window.__loadedReal.length;
  };

  const tabs = document.getElementById('tabs');
  const main = document.getElementById('main');
  function show(id) {
    main.replaceChildren();
    const panel = el('div', { className: 'panel active' }); panel.setAttribute('data-panel', id);
    FEATURES.find((f) => f.id === id).build(panel);
    main.append(panel);
    [...tabs.children].forEach((b) => b.classList.toggle('active', b.dataset.feature === id));
  }
  // --- real Obsidian-style file explorer (vault tree) ---
  const svgEl = (s) => { const d = document.createElement('div'); d.innerHTML = s; return d.firstElementChild; };
  const ICON = {
    chev: '<svg class="chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
    folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    file: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
  };
  function buildFileTree() {
    const tree = document.getElementById('filetree'); if (!tree) return;
    tree.replaceChildren();
    const renderInto = (parentEl, folder, depth) => {
      const kids = [...(folder.children || [])].sort((a, b) => { const af = a.children ? 0 : 1, bf = b.children ? 0 : 1; return af !== bf ? af - bf : (a.name || '').localeCompare(b.name || ''); });
      for (const c of kids) {
        if (c.children) {
          const wrap = el('div', { className: 'nav-folder' });
          const row = el('div', { className: 'nav-row' }); row.style.paddingLeft = (depth * 14 + 6) + 'px';
          row.append(svgEl(ICON.chev), svgEl(ICON.folder), el('span', { textContent: c.name }));
          const childrenEl = el('div', { className: 'nav-children' });
          row.onclick = () => wrap.classList.toggle('is-collapsed');
          wrap.append(row, childrenEl); parentEl.append(wrap);
          renderInto(childrenEl, c, depth + 1);
        } else if (/\.md$/i.test(c.path)) {
          const row = el('div', { className: 'nav-row nav-file' }); row.style.paddingLeft = (depth * 14 + 6) + 'px';
          row.dataset.path = c.path;
          row.append(el('span', { className: 'chev-spacer' }), svgEl(ICON.file), el('span', { textContent: (c.basename || c.name).replace(/\.md$/i, '') }));
          row.onclick = () => showNote(c.path);
          parentEl.append(row);
        }
      }
    };
    renderInto(tree, app.vault.getRoot(), 0);
  }
  // Clean Obsidian reading view of a single note (the default workspace surface).
  function showNote(path) {
    main.replaceChildren();
    const view = el('div', { className: 'panel active markdown-reading-view' });
    view.setAttribute('data-panel', 'note'); view.setAttribute('data-testid', 'note-pane'); view.setAttribute('data-current', path);
    renderMarkdown(app.vault._cache.get(path) || VAULT[path] || '', view, { resolve, postProcessors: app.postProcessors });
    view.querySelectorAll('a.internal-link').forEach((a) => { a.onclick = (e) => { e.preventDefault(); const t = decodeURIComponent(a.dataset.target); const hit = app.vault.getMarkdownFiles().find((f) => f.path.replace(/\.md$/i, '').endsWith(t)); if (hit) showNote(hit.path); }; });
    main.append(view);
    document.querySelectorAll('#filetree .nav-row.is-active').forEach((r) => r.classList.remove('is-active'));
    const active = [...document.querySelectorAll('#filetree .nav-file')].find((r) => r.dataset.path === path); if (active) active.classList.add('is-active');
    document.querySelectorAll('#tabs .feature-tab.active').forEach((b) => b.classList.remove('active'));
    const name = (path.split('/').pop() || path).replace(/\.md$/i, '');
    const tab = document.querySelector('#tabheader .tab span:first-child'); if (tab) tab.textContent = name;
    const title = document.querySelector('#titlebar .title'); if (title) title.textContent = 'Pumice — ' + name;
  }
  window.__showNote = showNote; window.__buildFileTree = buildFileTree;
  for (const f of FEATURES) { const b = el('button', { className: 'feature-tab', textContent: f.label }); b.dataset.feature = f.id; b.setAttribute('data-testid', 'tab-' + f.id); b.onclick = () => show(f.id); tabs.append(b); }
  // Drag-and-drop a vault folder/files anywhere to load it (Chromium folder drop via
  // webkitGetAsEntry; plain file drop elsewhere).
  document.body.addEventListener('dragover', (e) => { e.preventDefault(); });
  document.body.addEventListener('drop', async (e) => {
    e.preventDefault();
    const map = await readDataTransfer(e.dataTransfer);
    if (Object.keys(map).length) { app = await createApp(memoryAdapter(map), async (md) => md); window.__app = app; window.__droppedCount = Object.keys(map).length; buildFileTree(); showNote(app.vault.getMarkdownFiles()[0]?.path || 'Welcome.md'); }
  });
  window.__loadDropped = async (fileLike) => { const map = await filesToVault(fileLike); app = await createApp(memoryAdapter(map), async (md) => md); window.__app = app; window.__droppedCount = Object.keys(map).length; buildFileTree(); showNote(app.vault.getMarkdownFiles()[0]?.path || 'Welcome.md'); return Object.keys(map).length; };
  window.__app = app; window.__ready = true;
  buildFileTree();
  showNote('Welcome.md');
}
boot().catch((e) => { const d = document.createElement('pre'); d.id = 'boot-error'; d.setAttribute('data-testid', 'boot-error'); d.textContent = String(e && e.stack || e); document.body.append(d); window.__bootError = String(e); });
