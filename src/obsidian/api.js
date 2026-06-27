// The `obsidian` module shim — what a plugin's `require('obsidian')` resolves to.
// This is the compatibility surface. It is deliberately a SUBSET (the realistic
// boundary we mapped: pure-API + vault + UI hooks work; Electron/Node/child_process
// do not). DOM use is guarded so the exact same shim runs headless (Node tests)
// and in the browser.

import momentImpl from 'moment';
import * as yaml from 'js-yaml';
import { StateField } from '@codemirror/state';

const hasDOM = typeof document !== 'undefined';

// Obsidian's YAML helpers (kanban board parse/serialize, dataview, others).
export function parseYaml(s) { try { return yaml.load(s); } catch { return null; } }
export function stringifyYaml(o) { try { return yaml.dump(o); } catch { return ''; } }

// Obsidian's editor state field holding the active MarkdownFileInfo (the view). Editor
// extensions read it via state.field(editorInfoField) (outliner, live-preview plugins).
// The runtime seeds it with the real MarkdownView when building the editor.
export const editorInfoField = StateField.define({
  create: () => null,
  update: (v) => v,
});

// Obsidian bundles moment and re-exports it; date plugins (Natural Language Dates,
// Calendar, Templater) rely on `import { moment } from 'obsidian'`.
export const moment = momentImpl;
// Obsidian injects `moment` as a global (window.moment); periodic-notes, tasks,
// natural-dates, calendar read it bare. In a browser globalThis===window.
if (typeof globalThis !== 'undefined' && !globalThis.moment) globalThis.moment = momentImpl;
if (typeof window !== 'undefined' && !window.moment) window.moment = momentImpl;

let noticeSink = (msg) => console.log('[Notice]', msg);
export function setNoticeSink(fn) {
  noticeSink = fn;
}

export class Events {
  constructor() {
    this._ev = new Map();
  }
  // Obsidian: on(name, callback, ctx?) — ctx is the thisArg applied at trigger time
  // (periodic-notes/various-complements register method handlers with a context object).
  on(name, cb, ctx) {
    const ref = { name, cb, ctx };
    (this._ev.get(name) || this._ev.set(name, []).get(name)).push(ref);
    return ref;
  }
  off(name, cb) {
    const a = this._ev.get(name);
    if (a) this._ev.set(name, a.filter((e) => e.cb !== cb));
  }
  // Obsidian's EventRef removal — various-complements unloads listeners via offref(ref).
  offref(ref) { const a = ref && this._ev.get(ref.name); if (a) this._ev.set(ref.name, a.filter((e) => e !== ref)); }
  trigger(name, ...args) {
    (this._ev.get(name) || []).slice().forEach((e) => e.cb.apply(e.ctx, args));
  }
}

export class TAbstractFile {
  constructor(path) {
    this.path = path;
    this.name = path.split('/').pop();
  }
}
export class TFile extends TAbstractFile {
  constructor(path) {
    super(path);
    const dot = this.name.lastIndexOf('.');
    this.basename = dot >= 0 ? this.name.slice(0, dot) : this.name;
    this.extension = dot >= 0 ? this.name.slice(dot + 1) : '';
    this.stat = { ctime: 0, mtime: 0, size: 0 };
    this.parent = null;
  }
}
export class TFolder extends TAbstractFile {
  constructor(path) {
    super(path);
    this.children = [];
  }
  isRoot() { return this.path === '/' || this.path === ''; }
}

// Obsidian exports the Vault class; plugins use its STATIC recurseChildren(root, cb)
// helper (calendar's daily-note scan). The live vault instance is the runtime Vault.
export class Vault extends Events {
  static recurseChildren(root, cb) {
    if (!root) return;
    const walk = (f) => { cb(f); if (f && f.children) for (const c of f.children) walk(c); };
    walk(root);
  }
}

// Desktop-only DataAdapter subtype; plugins gate desktop features on `instanceof
// FileSystemAdapter`. In the browser/VFS we are never one, so the check is false.
export class FileSystemAdapter {
  getBasePath() { return ''; }
  getFullPath(p) { return p; }
  getName() { return 'vault'; }
}

export class Notice {
  constructor(message, timeout = 4000) {
    this.message = message;
    noticeSink(message, timeout);
  }
  setMessage(m) {
    this.message = m;
    noticeSink(m);
    return this;
  }
  hide() {}
}

// Lifecycle container — plugins extend Component / Plugin and register children.
// Component/Plugin are ES5 function-constructors (not `class`) so that plugins
// transpiled to ES5 — whose `__extends` helper calls `Plugin.call(this)` — work.
// ES6 `class X extends Component` still works (functions are valid `extends` targets).
export function Component() {
  this._children = [];
  this._events = [];
}
Component.prototype.onload = function () {};
Component.prototype.onunload = function () {};
// Obsidian Component lifecycle: load() is idempotent (guards _loaded) and only
// loads children once. addChild loads the child only if the parent is already
// loaded — matching real semantics and avoiding re-entrant addChild→onload loops.
Component.prototype.load = function () {
  if (this._loaded) return;
  this._loaded = true;
  this.onload();
  for (const c of this._children.slice()) c.load && c.load();
};
Component.prototype.unload = function () {
  if (!this._loaded) return;
  this._loaded = false;
  for (const c of this._children.slice()) c.unload && c.unload();
  this.onunload();
};
Component.prototype.addChild = function (c) { this._children.push(c); if (c.load) c.load(); else if (c.onload) c.onload(); return c; };
Component.prototype.removeChild = function (c) { this._children = this._children.filter((x) => x !== c); if (c.unload) c.unload(); return c; };
Component.prototype.register = function () {};
Component.prototype.registerEvent = function (ref) { this._events.push(ref); };
Component.prototype.registerDomEvent = function (el, type, cb) { if (el && el.addEventListener) el.addEventListener(type, cb); };
Component.prototype.registerInterval = function (id) { return id; };

export function Plugin(app, manifest) {
  Component.call(this);
  this.app = app;
  this.manifest = manifest;
  this._commands = [];
  this._ribbon = [];
  this._settingTabs = [];
}
Plugin.prototype = Object.create(Component.prototype);
Plugin.prototype.constructor = Plugin;
Plugin.prototype.addCommand = function (cmd) { this._commands.push(cmd); this.app.commands.register(cmd); return cmd; };
Plugin.prototype.addRibbonIcon = function (icon, title, callback) {
  const item = { icon, title, callback };
  this._ribbon.push(item);
  this.app.ribbon.add(item);
  return hasDOM ? document.createElement('div') : { addEventListener() {}, addClass() {}, setAttribute() {} };
};
Plugin.prototype.addStatusBarItem = function () { return hasDOM ? document.createElement('div') : { setText() {}, createEl: () => ({}) }; };
Plugin.prototype.addSettingTab = function (tab) { this._settingTabs.push(tab); this.app.settingTabs.push(tab); };
Plugin.prototype.registerMarkdownPostProcessor = function (fn) { this.app.postProcessors.push(fn); return fn; };
// Record the view creator so the workspace can actually mount it (calendar/homepage).
Plugin.prototype.registerView = function (type, creator) {
  (this.app._viewCreators || (this.app._viewCreators = new Map())).set(type, creator);
  if (this.app.viewRegistry) this.app.viewRegistry.viewByType[type] = creator;
  return creator;
};
Plugin.prototype.registerHoverLinkSource = function (id, info) { this.app.workspace.registerHoverLinkSource(id, info); };
// Collect plugin-supplied CM6 extensions; the live Editor includes them (outliner,
// advanced-tables keymaps, live-preview decorations).
Plugin.prototype.registerEditorExtension = function (ext) {
  const list = this.app._editorExtensions || (this.app._editorExtensions = []);
  Array.isArray(ext) ? list.push(...ext) : list.push(ext);
  return ext;
};
Plugin.prototype.registerExtensions = function () {};
Plugin.prototype.registerMarkdownCodeBlockProcessor = function (lang, handler) { (this.app._codeblocks || (this.app._codeblocks = new Map())).set(lang, handler); return handler; };
Plugin.prototype.registerEditorSuggest = function (s) { (this.app._editorSuggests || (this.app._editorSuggests = [])).push(s); return s; };
Plugin.prototype.registerObsidianProtocolHandler = function (action, handler) { (this.app._protocol || (this.app._protocol = new Map())).set(action, handler); };
Plugin.prototype.registerCliHandler = function (name, desc, handler) { (this.app._cliHandlers || (this.app._cliHandlers = new Map())).set(name, { desc, handler }); };
Plugin.prototype.registerBasesView = function (id, view) { (this.app._basesViews || (this.app._basesViews = new Map())).set(id, view); };
Plugin.prototype.loadData = async function () { return this.app.storage.get(this.manifest.id); };
Plugin.prototype.saveData = async function (data) { this.app.storage.set(this.manifest.id, data); };

// Minimal UI stubs — enough that onload()/settings code instantiates without throwing.
export function Modal(app) {
  this.app = app;
  this.scope = new Scope();
  const mk = () => (hasDOM ? document.createElement('div') : { empty() {}, createEl: () => ({}), addClass() {}, setText() {} });
  this.containerEl = mk();
  this.modalEl = mk();
  this.contentEl = mk();
  this.titleEl = mk();
  if (hasDOM) { this.modalEl.appendChild(this.contentEl); this.containerEl.appendChild(this.modalEl); }
}
Modal.prototype.open = function () { this.onOpen && this.onOpen(); };
Modal.prototype.close = function () { this.onClose && this.onClose(); };
Modal.prototype.onOpen = function () {};
Modal.prototype.onClose = function () {};
Modal.prototype.setTitle = function (t) { this.titleEl && this.titleEl.setText && this.titleEl.setText(t); return this; };
Modal.prototype.setContent = function () { return this; };
// Undocumented internal Obsidian class; templater (and others) subclass it.
export function ConfirmationModal(app) { Modal.call(this, app); }
ConfirmationModal.prototype = Object.create(Modal.prototype);
ConfirmationModal.prototype.constructor = ConfirmationModal;
export class Setting {
  constructor(containerEl) {
    this.containerEl = containerEl;
  }
  setName() { return this; }
  setDesc() { return this; }
  addText(cb) { cb && cb({ setValue: () => ({}), onChange: () => ({}), setPlaceholder: () => ({}) }); return this; }
  addToggle(cb) { cb && cb({ setValue: () => ({}), onChange: () => ({}) }); return this; }
  addButton(cb) { cb && cb({ setButtonText: () => ({}), onClick: () => ({}), setCta: () => ({}) }); return this; }
  addDropdown(cb) { cb && cb({ addOption: () => ({}), setValue: () => ({}), onChange: () => ({}) }); return this; }
}
export function PluginSettingTab(app, plugin) {
  this.app = app;
  this.plugin = plugin;
  this.containerEl = hasDOM ? document.createElement('div') : { empty() {}, createEl: () => ({}) };
}
PluginSettingTab.prototype.display = function () {};
PluginSettingTab.prototype.hide = function () {};
// Non-core symbols some plugins extend (newer/edge API surface); stubbed so onload proceeds.
export class SettingPage extends PluginSettingTab {}
export class SettingGroup extends Component {
  constructor() { super(); this.containerEl = hasDOM ? document.createElement('div') : {}; }
}
export function ItemView(leaf) {
  Component.call(this);
  this.leaf = leaf;
  this.app = leaf && leaf.app;
  this.scope = new Scope();
  this.containerEl = hasDOM ? document.createElement('div') : { empty() {}, createEl: () => ({}), children: [{}, { empty() {}, createEl: () => ({}) }] };
  // Obsidian's ItemView containerEl holds [.view-header, .view-content]; views read
  // contentEl (calendar/recent-files/kanban) or containerEl.children[1] (mind-map).
  if (hasDOM) {
    this.headerEl = document.createElement('div'); this.headerEl.className = 'view-header'; this.containerEl.appendChild(this.headerEl);
    this.contentEl = document.createElement('div'); this.contentEl.className = 'view-content'; this.containerEl.appendChild(this.contentEl);
  } else { this.contentEl = { empty() {}, createEl: () => ({}), createDiv: () => ({ empty() {}, createEl: () => ({}) }), on() {}, appendChild() {} }; }
}
ItemView.prototype = Object.create(Component.prototype);
ItemView.prototype.constructor = ItemView;
ItemView.prototype.getViewType = function () { return ''; };
ItemView.prototype.getDisplayText = function () { return ''; };
ItemView.prototype.getIcon = function () { return 'document'; };
ItemView.prototype.onOpen = function () { return Promise.resolve(); };
ItemView.prototype.onClose = function () { return Promise.resolve(); };
ItemView.prototype.addAction = function () { return hasDOM ? document.createElement('a') : {}; };

// WorkspaceLeaf — plugins (kanban) monkeypatch WorkspaceLeaf.prototype.detach via
// monkey-around, so the prototype methods must exist as real functions to wrap.
export function WorkspaceLeaf() {
  this.view = null;
  this.containerEl = hasDOM ? document.createElement('div') : { empty() {}, createEl: () => ({}) };
}
WorkspaceLeaf.prototype.openFile = function () { return Promise.resolve(); };
WorkspaceLeaf.prototype.open = function (view) { this.view = view; return Promise.resolve(view); };
WorkspaceLeaf.prototype.setViewState = function () { return Promise.resolve(); };
WorkspaceLeaf.prototype.getViewState = function () { return { type: 'empty', state: {} }; };
WorkspaceLeaf.prototype.setEphemeralState = function () {};
WorkspaceLeaf.prototype.getEphemeralState = function () { return {}; };
WorkspaceLeaf.prototype.getDisplayText = function () { return ''; };
WorkspaceLeaf.prototype.getViewType = function () { return (this.view && this.view.getViewType && this.view.getViewType()) || 'empty'; };
WorkspaceLeaf.prototype.detach = function () {};
WorkspaceLeaf.prototype.setGroup = function () {};
WorkspaceLeaf.prototype.setPinned = function () {};
WorkspaceLeaf.prototype.setGroupMember = function () {};
WorkspaceLeaf.prototype.on = function () { return {}; };
WorkspaceLeaf.prototype.off = function () {};
WorkspaceLeaf.prototype.trigger = function () {};

// Workspace class hierarchy — plugins (hover-editor) monkeypatch these prototypes
// via monkey-around, so the classes must exist with real prototype methods to wrap.
export function WorkspaceItem() {}
WorkspaceItem.prototype.getRoot = function () { return this; };
WorkspaceItem.prototype.getContainer = function () { return this; };
export function WorkspaceContainer() {}
WorkspaceContainer.prototype = Object.create(WorkspaceItem.prototype);
export function WorkspaceSplit() {}
WorkspaceSplit.prototype = Object.create(WorkspaceItem.prototype);
export function WorkspaceTabs() {}
WorkspaceTabs.prototype = Object.create(WorkspaceItem.prototype);
// Base Workspace prototype that plugins patch; the live instance in runtime.js
// extends Events with the same method names. Exposed so `instanceof`/prototype
// patches resolve against a real class.
export function Workspace() {}
Workspace.prototype.getActiveFile = function () { return null; };
Workspace.prototype.getActiveViewOfType = function () { return null; };
Workspace.prototype.getLeaf = function () { return null; };
Workspace.prototype.iterateAllLeaves = function () {};
Workspace.prototype.onLayoutReady = function (cb) { cb && cb(); };
Workspace.prototype.setActiveLeaf = function () {};
Workspace.prototype.revealLeaf = function () { return Promise.resolve(); };
Workspace.prototype.getActiveLeaf = function () { return null; };
export class MarkdownPreviewView extends Component {
  constructor(containerEl) { super(); this.containerEl = containerEl; }
  get() { return ''; }
  set() {}
  getScroll() { return 0; }
  applyScroll() {}
}
// Static post-processor registry (icons-plugin etc.).
export const MarkdownPreviewRenderer = {
  registerPostProcessor(fn) { (MarkdownPreviewRenderer._pp || (MarkdownPreviewRenderer._pp = [])).push(fn); },
  unregisterPostProcessor(fn) { const a = MarkdownPreviewRenderer._pp || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
  createCodeBlockPostProcessor() { return () => {}; },
};
MarkdownPreviewRenderer.prototype = {};

// PopoverSuggest — base of EditorSuggest/AbstractInputSuggest (map-view extends it).
export class PopoverSuggest extends Component {
  constructor(app, scope) {
    super();
    this.app = app;
    this.scope = scope || new Scope();
    const mk = () => (hasDOM ? document.createElement('div') : { addClass() {}, empty() {}, createEl: () => ({}) });
    this.suggestEl = mk();
    this.suggestions = { containerEl: mk(), setSuggestions() {}, useSelectedItem() {}, selectedItem: 0 };
  }
  open() {} close() {} setAutoDestroy() {}
  renderSuggestion() {} selectSuggestion() {}
}

// BasesView — newer Bases feature base view (map-view extends it).
export function BasesView(controller, leaf) {
  Component.call(this);
  this.controller = controller || null;
  this.leaf = leaf || (controller && controller.leaf) || null;
  this.app = (controller && controller.app) || (leaf && leaf.app) || undefined;
  this.containerEl = hasDOM ? document.createElement('div') : { empty() {}, createEl: () => ({}) };
}
BasesView.prototype = Object.create(Component.prototype);
BasesView.prototype.constructor = BasesView;
BasesView.prototype.onload = function () {};
BasesView.prototype.onDataUpdated = function () {};
BasesView.prototype.getViewType = function () { return 'bases'; };

// Undocumented popover base (hover-editor subclasses HoverPopover).
export class HoverPopover extends Component {
  constructor(parent, targetEl, waitTime) {
    super();
    this.parent = parent || null;
    this.targetEl = targetEl || null;
    this.waitTime = waitTime || 0;
    this.hoverEl = hasDOM ? document.createElement('div') : { empty() {}, createEl: () => ({}), addClass() {} };
    this.state = 0;
  }
  position() {}
  hide() {}
  show() {}
}

// MathJax helpers (latex-suite); no-op in this environment.
export async function loadMathJax() { return undefined; }
export function renderMath(source) { const el = hasDOM ? document.createElement('span') : { setText() {}, textContent: '' }; if (el.setText) el.setText(source); else el.textContent = source; return el; }
export function finishRenderMath() { return Promise.resolve(); }

// --- Additional API surface the real top plugins extend / call ---

export class MarkdownRenderChild extends Component {
  constructor(containerEl) {
    super();
    this.containerEl = containerEl;
  }
}
export class MarkdownView extends Component {
  constructor(leaf) {
    super();
    this.leaf = leaf;
    this.editor = null;
    this.file = null;
  }
  getViewType() { return 'markdown'; }
  getMode() { return 'source'; }
  getState() { return { file: this.file ? this.file.path : null, mode: this.getMode() }; }
  getViewData() { return this.editor ? this.editor.getValue() : ''; }
  getDisplayText() { return this.file ? this.file.basename || this.file.name : 'Markdown'; }
}

export class SuggestModal extends Modal {
  constructor(app) {
    super(app);
    this.limit = 50;
  }
  getSuggestions() { return []; }
  renderSuggestion() {}
  onChooseSuggestion() {}
  setPlaceholder() { return this; }
  setInstructions() { return this; }
  setContent() { return this; }
  emptyStateText() { return this; }
}
export class FuzzySuggestModal extends SuggestModal {
  getItems() { return []; }
  getItemText() { return ''; }
  onChooseItem() {}
}
export class EditorSuggest extends Component {
  constructor(app) {
    super();
    this.app = app;
    this.scope = new Scope();
    // Obsidian's suggest base pre-registers an Escape handler; plugins
    // (various-complements) look it up by key and override its .func.
    this.scope.register([], 'Escape', () => { this.close && this.close(); return false; });
    this.limit = 50;
    // PopoverSuggest DOM hosts (kanban's date suggest calls suggestEl.addClass).
    const mk = () => (hasDOM ? document.createElement('div') : { addClass() {}, empty() {}, createEl: () => ({}), setText() {} });
    this.suggestEl = mk();
    this.suggestions = { containerEl: mk(), setSuggestions() {}, useSelectedItem() {}, selectedItem: 0 };
  }
  close() {}
  onTrigger() { return null; }
  getSuggestions() { return []; }
  renderSuggestion() {}
  selectSuggestion() {}
  setInstructions() { return this; }
}
export class AbstractInputSuggest extends Component {
  constructor(app, inputEl) {
    super();
    this.app = app;
    this.inputEl = inputEl;
  }
  getSuggestions() { return []; }
  renderSuggestion() {}
  selectSuggestion() {}
}

export class MenuItem {
  setTitle(t) { this.title = t; return this; }
  setIcon(i) { this.icon = i; return this; }
  setSection(s) { this.section = s; return this; }
  onClick(cb) { this.callback = cb; return this; }
  setDisabled(v) { this.disabled = v; return this; }
}
export class Menu {
  constructor() { this.items = []; }
  addItem(cb) { const i = new MenuItem(); cb(i); this.items.push(i); return this; }
  addSeparator() { return this; }
  showAtMouseEvent() { return this; }
  showAtPosition() { return this; }
  hide() { return this; }
}

export class Scope {
  constructor(parent) { this.keys = []; this.parent = parent || null; }
  // Obsidian's KeymapEventHandler shape: { scope, modifiers, key, func }.
  register(modifiers, key, func) { const h = { scope: this, modifiers, key, func }; this.keys.push(h); return h; }
  unregister(h) { const i = this.keys.indexOf(h); if (i >= 0) this.keys.splice(i, 1); }
}
export const Keymap = {
  isModifier: () => false,
  isModEvent: () => false,
};
export const Platform = {
  isDesktop: typeof process !== 'undefined' && !!(process.versions && process.versions.node),
  isMobile: false,
  isMacOS: typeof navigator !== 'undefined' && /Mac/.test(navigator.platform || ''),
  isWin: false,
  isLinux: false,
};

export function debounce(fn, timeout = 0) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), timeout);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}
export function getAllTags(cache) {
  return (cache && cache.tags ? cache.tags.map((t) => t.tag) : []);
}
export function parseFrontMatterTags(fm) {
  if (!fm || !fm.tags) return null;
  return String(fm.tags).split(/[,\s]+/).filter(Boolean).map((t) => '#' + t.replace(/^#/, ''));
}
export function parseFrontMatterAliases(fm) {
  if (!fm || !fm.aliases) return null;
  if (Array.isArray(fm.aliases)) return fm.aliases.map(String);
  return String(fm.aliases).split(/[,\s]+/).filter(Boolean);
}
// Obsidian's frontmatter helpers (periodic-notes reads entries; case-insensitive key).
export function parseFrontMatterEntry(fm, key) {
  if (!fm) return null;
  if (key in fm) return fm[key];
  const k = Object.keys(fm).find((x) => x.toLowerCase() === String(key).toLowerCase());
  return k ? fm[k] : null;
}
export function parseFrontMatterStringArray(fm, key) {
  const v = parseFrontMatterEntry(fm, key);
  if (v == null) return null;
  return (Array.isArray(v) ? v : String(v).split(/[,\s]+/)).map(String).filter(Boolean);
}
// Obsidian's icon helpers. iconize reads getIcon(name) (expects a real <svg>) and uses
// setIcon to inject it. We return a structurally-faithful SVG node (host capability,
// not a plugin) so the plugin's icon insertion has something real to place.
const _extraIcons = new Map();
export function setIcon(el, name) {
  if (!el) return;
  if (typeof el.empty === 'function') el.empty();
  const ic = getIcon(name);
  if (ic && el.appendChild) el.appendChild(ic);
}
export function addIcon(id, svg) { _extraIcons.set(id, svg); }
export function requireApiVersion() { return true; }
export function getLanguage() { return 'en'; }
const _LUCIDE = ['file', 'folder', 'search', 'settings', 'star', 'tag', 'calendar', 'check', 'plus', 'trash', 'link', 'pencil', 'list', 'hash', 'bookmark'];
export function getIconIds() { return [..._LUCIDE.map((n) => 'lucide-' + n), ..._extraIcons.keys()]; }
export function getIcon(name) {
  if (typeof document === 'undefined') return null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'svg-icon lucide-' + name);
  svg.setAttribute('width', '16'); svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  return svg;
}
export function setTooltip() {}

// Setting UI components — extended and instantiated by many plugins.
export class BaseComponent {
  constructor() { this.disabled = false; }
  setDisabled(d) { this.disabled = !!d; return this; }
  then(cb) { cb && cb(this); return this; }
}
export class ValueComponent extends BaseComponent {
  getValue() { return this.value; }
  setValue(v) { this.value = v; if (this._onChange) this._onChange(v); return this; }
  onChange(cb) { this._onChange = cb; return this; }
  registerOptionListener() { return this; }
}
function el(container, tag) {
  if (container && container.createEl) return container.createEl(tag);
  return hasDOM ? document.createElement(tag) : { addEventListener() {}, setAttribute() {}, textContent: '', style: {} };
}
export class ButtonComponent extends BaseComponent {
  constructor(c) { super(); this.buttonEl = el(c, 'button'); }
  setButtonText(t) { this.buttonEl.textContent = t; return this; }
  setIcon() { return this; }
  setClass() { return this; }
  setCta() { return this; }
  removeCta() { return this; }
  setWarning() { return this; }
  setTooltip() { return this; }
  onClick(cb) { this.buttonEl.addEventListener && this.buttonEl.addEventListener('click', cb); return this; }
}
export class ExtraButtonComponent extends ButtonComponent {}
export class TextComponent extends ValueComponent {
  constructor(c) { super(); this.inputEl = el(c, 'input'); }
  setPlaceholder(p) { this.inputEl.setAttribute && this.inputEl.setAttribute('placeholder', p); return this; }
  onChanged() { return this; }
}
export class SearchComponent extends TextComponent {}
export class TextAreaComponent extends TextComponent {
  constructor(c) { super(); this.inputEl = el(c, 'textarea'); }
}
export class MomentFormatComponent extends TextComponent {}
export class ToggleComponent extends ValueComponent {
  constructor(c) { super(); this.toggleEl = el(c, 'div'); this.value = false; }
  setTooltip() { return this; }
}
export class DropdownComponent extends ValueComponent {
  constructor(c) { super(); this.selectEl = el(c, 'select'); }
  addOption() { return this; }
  addOptions() { return this; }
}
export class SliderComponent extends ValueComponent {
  constructor(c) { super(); this.sliderEl = el(c, 'input'); }
  setLimits() { return this; }
  setDynamicTooltip() { return this; }
  setInstant() { return this; }
}
export class ColorComponent extends ValueComponent {
  constructor(c) { super(); this.colorEl = el(c, 'input'); }
}
export class ProgressBarComponent extends ValueComponent {
  constructor(c) { super(); this.progressBar = el(c, 'div'); }
}

// View hierarchy — file-backed views (Canvas, Kanban, Excalidraw extend these).
export class View extends Component {
  constructor(leaf) {
    super();
    this.leaf = leaf;
    this.app = leaf && leaf.app;
    this.containerEl = hasDOM ? document.createElement('div') : { empty() {}, createEl: () => ({}) };
    if (hasDOM) {
      this.headerEl = document.createElement('div'); this.headerEl.className = 'view-header'; this.containerEl.appendChild(this.headerEl);
      this.contentEl = document.createElement('div'); this.contentEl.className = 'view-content'; this.containerEl.appendChild(this.contentEl);
    } else { this.contentEl = { empty() {}, createEl: () => ({}), createDiv: () => ({ empty() {}, createEl: () => ({}) }), on() {}, appendChild() {} }; }
    this.scope = new Scope();
  }
  getViewType() { return ''; }
  getDisplayText() { return ''; }
  getIcon() { return 'document'; }
  onOpen() { return Promise.resolve(); }
  onClose() { return Promise.resolve(); }
}
export class FileView extends View {
  constructor(leaf) { super(leaf); this.file = null; this.allowNoFile = false; }
  onLoadFile() { return Promise.resolve(); }
  onUnloadFile() { return Promise.resolve(); }
  getState() { return {}; }
}
export class TextFileView extends FileView {
  constructor(leaf) { super(leaf); this.data = ''; }
  getViewData() { return this.data; }
  setViewData(d) { this.data = d; }
  clear() { this.data = ''; }
  getViewType() { return 'text'; }
}
export class EditableFileView extends FileView {}

export function normalizePath(p) {
  return p.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
}

// Obsidian's getLinkpath — strip subpath (#heading/^block) and alias (|display).
export function getLinkpath(link) {
  return String(link).split('#')[0].split('|')[0].trim();
}

// requestUrl — Obsidian's CORS-free fetch. In a tab it IS subject to CORS (the
// documented boundary); we map to fetch and surface that honestly.
export async function requestUrl(opts) {
  const o = typeof opts === 'string' ? { url: opts } : opts;
  const r = await fetch(o.url, { method: o.method || 'GET', headers: o.headers, body: o.body });
  const text = await r.text();
  return {
    status: r.status,
    headers: Object.fromEntries(r.headers.entries()),
    text,
    json: (() => { try { return JSON.parse(text); } catch { return null; } })(),
    arrayBuffer: null,
  };
}

export class MarkdownRenderer {
  // Wired to the host renderer by the app (keeps marked/DOM-renderer out of the shim).
  // Prefer the DOM renderer (_renderEl: fills the element + runs post-processors,
  // Obsidian's real contract); fall back to a string renderer (_render) if only that
  // is wired (e.g. the breadth harnesses).
  static async renderMarkdown(markdown, el, sourcePath, component) {
    if (MarkdownRenderer._renderEl) { MarkdownRenderer._renderEl(markdown, el, sourcePath, component); return; }
    if (MarkdownRenderer._render) el.innerHTML = await MarkdownRenderer._render(markdown, sourcePath);
  }
  static async render(app, markdown, el, sourcePath, component) {
    return MarkdownRenderer.renderMarkdown(markdown, el, sourcePath, component);
  }
}
