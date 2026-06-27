// DOM bootstrap — MUST be imported FIRST (before src/obsidian/api.js) so that
// api.js's module-level `hasDOM = typeof document !== 'undefined'` evaluates true and
// Notice/components/addRibbonIcon use a real DOM. Sets up a single jsdom window as the
// global environment + Obsidian DOM extensions + IndexedDB.
import { JSDOM } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import regeneratorRuntime from 'regenerator-runtime';
import momentImpl from 'moment';
import { installDomExtensions } from '../src/obsidian/dom.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
installDomExtensions(window);

const g = globalThis;
const idb = new IDBFactory();
window.indexedDB = idb;
window.IDBKeyRange = IDBKeyRange;
// Some globals (navigator) are getter-only in Node — assign defensively.
const set = (k, v) => {
  try { g[k] = v; }
  catch { try { Object.defineProperty(g, k, { value: v, configurable: true }); } catch {} }
};
set('window', window);
set('document', window.document);
set('navigator', window.navigator);
set('self', window);
set('activeWindow', window);
set('activeDocument', window.document);
set('HTMLElement', window.HTMLElement);
set('Element', window.Element);
set('Node', window.Node);
set('Document', window.Document);
set('localStorage', window.localStorage);
set('getComputedStyle', window.getComputedStyle.bind(window));
set('indexedDB', idb);
set('IDBKeyRange', IDBKeyRange);
// Browser globals real plugins reference bare (not via window.*): DOM/event/timing.
set('MutationObserver', window.MutationObserver);
set('Text', window.Text);
set('CharacterData', window.CharacterData);
set('Comment', window.Comment);
set('CDATASection', window.CDATASection);
set('Range', window.Range);
set('DocumentFragment', window.DocumentFragment);
set('ShadowRoot', window.ShadowRoot);
set('CustomEvent', window.CustomEvent);
set('customElements', window.customElements);
set('HTMLDivElement', window.HTMLDivElement);
set('HTMLSpanElement', window.HTMLSpanElement);
set('HTMLInputElement', window.HTMLInputElement);
set('HTMLCanvasElement', window.HTMLCanvasElement);
set('Event', window.Event);
set('KeyboardEvent', window.KeyboardEvent);
set('MouseEvent', window.MouseEvent);
set('DOMParser', window.DOMParser);
set('XMLSerializer', window.XMLSerializer);
set('location', window.location);
set('history', window.history);
set('addEventListener', window.addEventListener.bind(window));
set('removeEventListener', window.removeEventListener.bind(window));
set('requestAnimationFrame', (cb) => setTimeout(() => cb(0), 0));
set('cancelAnimationFrame', (h) => clearTimeout(h));
set('matchMedia', window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} })));
set('regeneratorRuntime', regeneratorRuntime);
// Bulk-copy every DOM interface constructor jsdom exposes (CharacterData,
// DocumentType, HTML*Element, SVG*, Range, NodeFilter, ...) so plugins that
// reference them bare don't fail one-by-one.
for (const k of Object.getOwnPropertyNames(window)) {
  if (/^[A-Z]/.test(k) && typeof globalThis[k] === 'undefined') {
    try { const v = window[k]; if (typeof v === 'function' || (v && typeof v === 'object')) set(k, v); } catch {}
  }
}

// Legacy CodeMirror 5 global (Obsidian exposes window.CodeMirror for back-compat;
// plugins like Dataview register a legacy highlight mode via defineMode).
const CM5 = {
  defineMode() {}, defineMIME() {}, defineSimpleMode() {}, defineOption() {},
  registerHelper() {}, modes: {}, mimeModes: {}, commands: {}, keyMap: { default: {} },
  Pos: (line, ch) => ({ line, ch }), Vim: { defineOption() {}, map() {} },
  getMode() { return { name: 'null' }; }, startState() { return {}; }, copyState(s) { return s; },
  innerMode(mode, state) { return { mode, state }; }, getLanguageModes() { return {}; },
  resolveMode() { return { name: 'null' }; }, runMode() {}, overlayMode() { return { name: 'overlay' }; },
};
set('CodeMirror', CM5);
window.CodeMirror = CM5;
const CM5Adapter = { commands: {}, Pos: CM5.Pos, keymap: {}, defineMode() {}, e_stop() {}, on() {}, off() {} };
set('CodeMirrorAdapter', CM5Adapter);
window.CodeMirrorAdapter = CM5Adapter;

// Some plugins reference external libraries that the Obsidian desktop bundle (or a
// CDN load) provides as globals: Leaflet (`L`), Prism (`Prism`). They are NOT part
// of the obsidian API — they're capability-walled external libs. Provide permissive
// proxies so the plugins can construct/configure during onload without a real lib.
function permissive(label) {
  const f = function () { return permissive(label); };
  return new Proxy(f, { get: (_t, k) => (k === 'then' ? undefined : (k === Symbol.toPrimitive ? () => label : permissive(label + '.' + String(k)))), apply: () => permissive(label), construct: () => permissive(label) });
}
set('L', permissive('L'));
set('Prism', permissive('Prism'));
window.L = globalThis.L; window.Prism = globalThis.Prism;

// Obsidian injects `moment` as a global; date plugins read it bare and via window.
set('moment', momentImpl); window.moment = momentImpl;
// tag-wrangler: Obsidian bundles i18next (window.i18next.t) + adds String.isString.
set('i18next', { t: (k) => k, exists: () => false, changeLanguage() {}, language: 'en' });
window.i18next = globalThis.i18next;
if (!String.isString) String.isString = (s) => typeof s === 'string';

export { window };
