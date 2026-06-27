// Demo: render a big, densely-cross-linked vault through the REAL 3D-graph community
// plugin (real-plugins/3d-graph.js) running unmodified on the Pumice shim.
import { installDomExtensions } from './src/obsidian/dom.js';
installDomExtensions(window);
import momentImpl from 'moment';
window.moment = globalThis.moment = momentImpl;
window.activeWindow = window; window.activeDocument = document;
if (!window.CodeMirror) window.CodeMirror = { defineMode() {}, defineMIME() {}, defineSimpleMode() {}, registerHelper() {}, modes: {}, mimeModes: {}, commands: {}, keyMap: { default: {} }, Pos: (l, c) => ({ line: l, ch: c }), Vim: { defineOption() {}, map() {} }, getMode() { return { name: 'null' }; }, startState() { return {}; }, copyState(s) { return s; } };

import { createApp } from './src/obsidian/runtime.js';
import { activatePlugin } from './src/obsidian/loader.js';
import { memoryAdapter } from './src/vfs/memoryAdapter.js';
import { marked } from 'marked';
import graph3dSrc from './real-plugins/3d-graph.js?raw';

// ---- build a complicated, clustered worldbuilding vault (Dune-flavoured) ----
const HOUSES = ['House Atreides', 'House Harkonnen', 'House Corrino', 'The Fremen', 'Spacing Guild', 'Bene Gesserit', 'House Ordos', 'Ixian Confederacy', 'Tleilaxu Order'];
const PLANETS = ['Arrakis', 'Caladan', 'Giedi Prime', 'Kaitain', 'Salusa Secundus', 'Ix', 'Tleilax', 'Wallach IX', 'Sikun', 'Junction'];
const TECH = ['Spice Melange', 'Holtzman Shield', 'Folding Space', 'Ornithopter', 'Lasgun', 'Stillsuit', 'Gom Jabbar', 'The Voice', 'Prescience', 'Sandworm Riding', 'Axlotl Tanks', 'No-Ship', 'Glowglobe', 'Suspensor'];
const TECH_PREREQ = { 'Folding Space': ['Spice Melange', 'Prescience'], 'Prescience': ['Spice Melange'], 'No-Ship': ['Holtzman Shield', 'Folding Space'], 'Sandworm Riding': ['Stillsuit', 'Spice Melange'], 'Axlotl Tanks': ['Gom Jabbar'], 'Suspensor': ['Holtzman Shield'], 'Lasgun': ['Holtzman Shield'] };
const CHARS = [
  ['Paul Atreides', 'House Atreides', 'Caladan'], ['Leto Atreides', 'House Atreides', 'Caladan'], ['Jessica', 'Bene Gesserit', 'Wallach IX'], ['Duncan Idaho', 'House Atreides', 'Caladan'], ['Gurney Halleck', 'House Atreides', 'Caladan'], ['Thufir Hawat', 'House Atreides', 'Caladan'],
  ['Baron Harkonnen', 'House Harkonnen', 'Giedi Prime'], ['Feyd-Rautha', 'House Harkonnen', 'Giedi Prime'], ['Glossu Rabban', 'House Harkonnen', 'Giedi Prime'], ['Piter De Vries', 'Tleilaxu Order', 'Tleilax'],
  ['Shaddam IV', 'House Corrino', 'Kaitain'], ['Princess Irulan', 'House Corrino', 'Kaitain'], ['Count Fenring', 'House Corrino', 'Kaitain'],
  ['Stilgar', 'The Fremen', 'Arrakis'], ['Chani', 'The Fremen', 'Arrakis'], ['Liet-Kynes', 'The Fremen', 'Arrakis'], ['Otheym', 'The Fremen', 'Arrakis'],
  ['Reverend Mother Mohiam', 'Bene Gesserit', 'Wallach IX'], ['Margot Fenring', 'Bene Gesserit', 'Wallach IX'],
  ['Guild Navigator', 'Spacing Guild', 'Junction'], ['Edric', 'Spacing Guild', 'Junction'],
  ['Hidar Fen Ajidica', 'Tleilaxu Order', 'Tleilax'], ['Hasimir', 'Ixian Confederacy', 'Ix'], ['Earl Vernius', 'Ixian Confederacy', 'Ix'],
  ['Esmar Tuek', 'House Ordos', 'Sikun'], ['Alia Atreides', 'House Atreides', 'Arrakis'], ['Chumas', 'House Ordos', 'Sikun'],
];
const EVENTS = ['Battle of Arrakeen', 'Fall of House Atreides', 'The Jihad', 'Trial of Forgiveness', 'Spacing Guild Pact', 'Sietch Tabr Raid', 'Spice Harvest Massacre', 'Kwisatz Haderach Awakening', 'Siege of Giedi Prime', 'Treaty of Kaitain'];

const HOUSE_HOME = { 'House Atreides': 'Caladan', 'House Harkonnen': 'Giedi Prime', 'House Corrino': 'Kaitain', 'The Fremen': 'Arrakis', 'Spacing Guild': 'Junction', 'Bene Gesserit': 'Wallach IX', 'House Ordos': 'Sikun', 'Ixian Confederacy': 'Ix', 'Tleilaxu Order': 'Tleilax' };
const HOUSE_TECH = { 'House Atreides': ['Ornithopter', 'Stillsuit'], 'House Harkonnen': ['Lasgun', 'Suspensor'], 'House Corrino': ['Lasgun', 'Holtzman Shield'], 'The Fremen': ['Stillsuit', 'Sandworm Riding'], 'Spacing Guild': ['Folding Space', 'Prescience', 'No-Ship'], 'Bene Gesserit': ['The Voice', 'Gom Jabbar', 'Prescience'], 'House Ordos': ['Suspensor', 'Glowglobe'], 'Ixian Confederacy': ['No-Ship', 'Glowglobe', 'Suspensor'], 'Tleilaxu Order': ['Axlotl Tanks', 'Gom Jabbar'] };
const RIVALS = [['House Atreides', 'House Harkonnen'], ['House Corrino', 'House Atreides'], ['The Fremen', 'House Harkonnen'], ['Ixian Confederacy', 'Tleilaxu Order'], ['House Ordos', 'House Corrino'], ['Bene Gesserit', 'Tleilaxu Order']];

const L = (n) => `[[${n}]]`;
const vault = {};
const add = (name, body) => { vault[`${name}.md`] = `# ${name}\n\n${body}\n`; };

for (const h of HOUSES) {
  const members = CHARS.filter((c) => c[1] === h).map((c) => c[0]);
  const rivals = RIVALS.filter((r) => r.includes(h)).map((r) => (r[0] === h ? r[1] : r[0]));
  add(h, `Great House. Seat of power: ${L(HOUSE_HOME[h])}.\n\n## Members\n${members.map(L).join(', ')}\n\n## Technologies\n${(HOUSE_TECH[h] || []).map(L).join(', ')}\n\n## Rivals\n${rivals.map(L).join(', ')}`);
}
for (const p of PLANETS) {
  const housesHere = HOUSES.filter((h) => HOUSE_HOME[h] === p);
  const natives = CHARS.filter((c) => c[2] === p).map((c) => c[0]);
  add(p, `Planet. Governed/contested by ${housesHere.map(L).join(', ') || 'unaligned powers'}.\n\nNotable people: ${natives.map(L).join(', ') || 'unknown'}.`);
}
for (const t of TECH) {
  const users = HOUSES.filter((h) => (HOUSE_TECH[h] || []).includes(t)).map(L);
  const pre = (TECH_PREREQ[t] || []).map(L);
  add(t, `Technology.\n\nRequires: ${pre.join(', ') || 'none (foundational)'}.\n\nWielded by: ${users.join(', ')}.`);
}
for (const [name, house, planet] of CHARS) {
  const sameHouse = CHARS.filter((c) => c[1] === house && c[0] !== name).map((c) => c[0]).slice(0, 3);
  add(name, `Character of ${L(house)}, born on ${L(planet)}.\n\nAssociates: ${sameHouse.map(L).join(', ')}.`);
}
EVENTS.forEach((e, i) => {
  const houses = [HOUSES[i % HOUSES.length], HOUSES[(i + 3) % HOUSES.length]];
  const chars = [CHARS[(i * 5) % CHARS.length][0], CHARS[(i * 7 + 2) % CHARS.length][0], CHARS[(i * 3 + 1) % CHARS.length][0]];
  const planet = PLANETS[i % PLANETS.length];
  add(e, `Historic event on ${L(planet)}.\n\nFactions: ${houses.map(L).join(', ')}.\nKey figures: ${chars.map(L).join(', ')}.`);
});

const nodeCount = Object.keys(vault).length;

// ---- mount the REAL 3D-graph plugin ----
const hud = document.getElementById('hud');
const host = document.getElementById('host');
(async () => {
  const app = await createApp(memoryAdapter(vault), async (md, el) => { el.innerHTML = marked.parse(md); return el; });
  const edges = Object.values(app.metadataCache.resolvedLinks).reduce((n, d) => n + Object.keys(d).length, 0);
  await activatePlugin({ app, manifest: { id: '3d-graph', name: '3D Graph', version: '0.6.0', minAppVersion: '0.15.0' }, source: graph3dSrc });
  const leaf = app.workspace._makeLeaf();
  leaf.containerEl.style.cssText = 'position:absolute;inset:0';
  host.appendChild(leaf.containerEl);
  app.workspace.activeLeaf = leaf;
  const cmd = app.commands.findCommand('open-3d-graph-global') || app.commands.listCommands().find((c) => /3d.?graph/i.test(c.id));
  await app.commands.executeCommandById(cmd.id);
  // size the WebGL canvas to the viewport
  setTimeout(() => {
    const cv = host.querySelector('canvas');
    if (cv && window.__3dgraphInstance) { /* plugin manages sizing */ }
    hud.innerHTML = `<b>Pumice</b> · real <b>3D-graph</b> plugin · <b>${nodeCount}</b> notes · <b>${edges}</b> links`;
    window.__ready = { nodes: nodeCount, edges, canvas: !!host.querySelector('canvas') };
  }, 1500);
})().catch((e) => { hud.textContent = 'ERROR: ' + e.message; window.__ready = { error: e.message }; });
