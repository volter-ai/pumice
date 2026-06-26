// DOM bootstrap — MUST be imported FIRST (before src/obsidian/api.js) so that
// api.js's module-level `hasDOM = typeof document !== 'undefined'` evaluates true and
// Notice/components/addRibbonIcon use a real DOM. Sets up a single jsdom window as the
// global environment + Obsidian DOM extensions + IndexedDB.
import { JSDOM } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
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

export { window };
