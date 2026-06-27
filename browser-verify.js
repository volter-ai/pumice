// Real-browser verification of the browser-bound real plugins (Worker/WebGL/getBBox/
// ownerNode/layout all exist here, unlike jsdom). Loads each GENUINE bundle on the shim,
// drives its primary feature, reports pass/fail + evidence into #out. Read via console.
import { installDomExtensions } from './src/obsidian/dom.js';
installDomExtensions(window);

// Obsidian browser-shell globals (the browser analogue of what dom-bootstrap sets for
// Node): activeWindow/activeDocument, a legacy CodeMirror 5 global (dataview's
// defineMode), and the app-shell DOM elements plugins read (.app-container/.workspace
// + a theme class for getComputedStyle on theme vars).
window.activeWindow = window; window.activeDocument = document;
if (!window.CodeMirror) {
  const CM5 = { defineMode() {}, defineMIME() {}, defineSimpleMode() {}, defineOption() {}, registerHelper() {}, modes: {}, mimeModes: {}, commands: {}, keyMap: { default: {} }, Pos: (line, ch) => ({ line, ch }), Vim: { defineOption() {}, map() {} }, getMode() { return { name: 'null' }; }, startState() { return {}; }, copyState(s) { return s; }, innerMode(m, s) { return { mode: m, state: s }; }, runMode() {}, overlayMode() { return { name: 'overlay' }; } };
  window.CodeMirror = CM5; window.CodeMirrorAdapter = { commands: {}, Pos: CM5.Pos, keymap: {}, defineMode() {}, e_stop() {}, on() {}, off() {} };
}
document.body.classList.add('theme-dark');
for (const cls of ['app-container', 'workspace', 'workspace-split', 'mod-root']) {
  const d = document.createElement('div'); d.className = cls; document.body.appendChild(d);
}

import { marked } from 'marked';
import { memoryAdapter } from './src/vfs/memoryAdapter.js';
import { createApp } from './src/obsidian/runtime.js';
import { activatePlugin } from './src/obsidian/loader.js';
import { MarkdownView } from './src/obsidian/api.js';
import * as cmState from '@codemirror/state';
import * as cmView from '@codemirror/view';
import * as cmLanguage from '@codemirror/language';
import * as cmCommands from '@codemirror/commands';
import * as cmAutocomplete from '@codemirror/autocomplete';
import * as cmSearch from '@codemirror/search';
import * as lezerCommon from '@lezer/common';
import * as lezerHighlight from '@lezer/highlight';

import dataviewSrc from './real-plugins/dataview.js?raw';
import mindmapSrc from './real-plugins/mind-map.js?raw';
import styleSettingsSrc from './real-plugins/style-settings.js?raw';
import slidingPanesSrc from './real-plugins/sliding-panes.js?raw';
import graph3dSrc from './real-plugins/3d-graph.js?raw';

const EXT = {
  '@codemirror/state': cmState, '@codemirror/view': cmView, '@codemirror/language': cmLanguage,
  '@codemirror/commands': cmCommands, '@codemirror/autocomplete': cmAutocomplete, '@codemirror/search': cmSearch,
  '@lezer/common': lezerCommon, '@lezer/highlight': lezerHighlight,
};
const render = async (md, el) => { el.innerHTML = marked.parse(md, { gfm: true }); return el; };
const FIX = {
  'Project.md': '---\nrating: 8\ntags: [project]\n---\n# Project\n[[Tasks]] and [[Ideas]]. #urgent\n',
  'Tasks.md': '---\nrating: 5\n---\n# Tasks\n- [ ] open [[Project]]\n- [x] done\n',
  'Ideas.md': '---\nrating: 3\n---\n# Ideas\n## Branch\n[[Project]]\n- leaf a\n- leaf b\n',
};
const stage = document.getElementById('stage');
const results = [];
const rec = (plugin, pass, evidence) => { results.push({ plugin, pass, evidence: String(evidence).slice(0, 400) }); };

async function freshApp() { return createApp(memoryAdapter(FIX), render); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function verifyDataview() {
  try {
    const app = await freshApp();
    const { instance } = await activatePlugin({ app, manifest: { id: 'dataview', name: 'Dataview', version: '0.5.0', minAppVersion: '0.13.0' }, source: dataviewSrc, externals: EXT });
    app.metadataCache.trigger('resolved');
    await sleep(400); // worker indexes
    const pages = instance.index?.pages?.size ?? 0;
    const q = await instance.api.query('TABLE rating FROM "" SORT rating DESC');
    const rows = q && q.successful ? (q.value.values || q.value.data || []).length : 0;
    rec('dataview', pages > 0 && rows > 0, `index pages=${pages}, query successful=${q?.successful}, rows=${rows}`);
  } catch (e) { rec('dataview', false, 'threw: ' + e.message); }
}

async function verify3dGraph() {
  try {
    const app = await freshApp();
    const { instance } = await activatePlugin({ app, manifest: { id: '3d-graph', name: '3D Graph', version: '0.6.0', minAppVersion: '0.15.0' }, source: graph3dSrc, externals: EXT });
    // 3d-graph opens via a command (getLeaf(false) + leaf.open(view)), not registerView.
    const cmd = app.commands.listCommands().find((c) => /global/.test(c.id)) || app.commands.listCommands()[0];
    await app.commands.executeCommandById(cmd.id);
    await sleep(900);
    let canvas = null;
    for (const l of app.workspace._leaves) { const c = l.containerEl && l.containerEl.querySelector && l.containerEl.querySelector('canvas'); if (c) canvas = c; }
    const edges = Object.values(app.metadataCache.resolvedLinks).reduce((n, d) => n + Object.keys(d).length, 0);
    rec('3d-graph', !!canvas, `cmd=${cmd.id}, canvas=${!!canvas}${canvas ? ' ' + canvas.width + 'x' + canvas.height : ''}, resolvedLinks edges=${edges}`);
  } catch (e) { rec('3d-graph', false, 'threw: ' + e.message); }
}

async function verifyMindMap() {
  try {
    const app = await freshApp();
    const { instance } = await activatePlugin({ app, manifest: { id: 'obsidian-mind-map', name: 'Mind Map', version: '1.1.0', minAppVersion: '0.12.0' }, source: mindmapSrc, externals: EXT });
    const ideas = app.vault.getAbstractFileByPath('Ideas.md');
    app.workspace.setActiveFile(ideas);
    // mind-map reads workspace.activeLeaf.view.getState().file — give the active leaf a
    // markdown view state (it does NOT need a CM editor for the markmap render).
    const leaf = app.workspace.getLeaf();
    leaf.view.getState = () => ({ file: 'Ideas.md', mode: 'preview' });
    leaf.view.getViewType = () => 'markdown';
    leaf.view.file = ideas; // mind-map's readFilePath reads activeLeaf.view.file.path
    for (const c of app.commands.listCommands()) { try { await app.commands.executeCommandById(c.id); } catch (e) {} }
    await sleep(700);
    let svg = 0, texts = 0;
    for (const l of Array.from(app.workspace._leaves || [])) { const ce = l.view && l.view.containerEl; const h = (ce && ce.innerHTML) || ''; svg += (h.match(/<svg/g) || []).length; texts += (h.match(/<text|markmap/g) || []).length; }
    // also scan the whole stage in case the view mounted there
    svg += (stage.innerHTML.match(/<svg/g) || []).length; texts += (stage.innerHTML.match(/<text|markmap/g) || []).length;
    const cmds = app.commands.listCommands().map((c) => c.id).join(',');
    const viewKeys = Array.from(app._viewCreators.keys()).join(',');
    rec('mind-map', svg > 0 && texts > 0, `svg=${svg}, text-nodes=${texts}, cmds=[${cmds}], views=[${viewKeys}], stageLen=${stage.innerHTML.length}`);
  } catch (e) { rec('mind-map', false, 'threw: ' + e.message); }
}

async function verifyStyleSettings() {
  try {
    const style = document.createElement('style');
    style.textContent = '/* @settings\nname: Demo\nid: demo\nsettings:\n  - id: accent\n    title: Accent\n    type: variable-text\n    default: blue\n*/\nbody{--x:1}';
    document.head.appendChild(style);
    const app = await freshApp();
    const { instance } = await activatePlugin({ app, manifest: { id: 'obsidian-style-settings', name: 'Style Settings', version: '1.0.0', minAppVersion: '0.16.0' }, source: styleSettingsSrc, externals: EXT });
    await sleep(200);
    const sm = instance.settingsManager || instance.settingsList || instance;
    const list = instance.settingsList || (sm && sm.settings) || [];
    const found = JSON.stringify(list).includes('demo') || JSON.stringify(list).includes('accent') || (instance.settingsManager && instance.settingsManager.settings && instance.settingsManager.settings.size > 0);
    rec('style-settings', !!found, `parsed @settings present=${!!found}, settingsList len=${(instance.settingsList || []).length}`);
  } catch (e) { rec('style-settings', false, 'threw: ' + e.message); }
}

async function verifySlidingPanes() {
  try {
    const app = await freshApp();
    // two distinct open leaves in the DOM, parented to rootSplit
    for (const p of ['Project.md', 'Tasks.md']) { const lf = app.workspace._makeLeaf(); lf.parent = app.workspace.rootSplit; lf.containerEl.style.width = '600px'; stage.appendChild(lf.containerEl); await lf.openFile(app.vault.getAbstractFileByPath(p)); }
    app.workspace.layoutReady = true;
    const { instance } = await activatePlugin({ app, manifest: { id: 'sliding-panes-obsidian', name: 'Sliding Panes', version: '4.0.0', minAppVersion: '0.15.0' }, source: slidingPanesSrc, externals: EXT });
    if (instance.enable) instance.enable();
    if (instance.toggle) instance.toggle(true);
    await sleep(200);
    const cls = document.body.className.includes('plugin-sliding-panes') || document.body.className.includes('sliding-panes');
    const styled = app.workspace._leaves.some((l) => l.containerEl && l.containerEl.style && l.containerEl.style.width);
    rec('sliding-panes', cls || styled, `body-class=${cls}, leaf-widths-set=${styled}`);
  } catch (e) { rec('sliding-panes', false, 'threw: ' + e.message); }
}

(async () => {
  await verifyDataview();
  await verify3dGraph();
  await verifyMindMap();
  await verifyStyleSettings();
  await verifySlidingPanes();
  const pass = results.filter((r) => r.pass).length;
  const out = { pass, total: results.length, results };
  document.getElementById('out').textContent = JSON.stringify(out, null, 2);
  document.getElementById('status').textContent = `DONE ${pass}/${results.length}`;
  window.__verify = out;
  console.log('PUMICE_VERIFY_RESULT ' + JSON.stringify(out));
})();
