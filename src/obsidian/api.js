// The `obsidian` module shim — what a plugin's `require('obsidian')` resolves to.
// This is the compatibility surface. It is deliberately a SUBSET (the realistic
// boundary we mapped: pure-API + vault + UI hooks work; Electron/Node/child_process
// do not). DOM use is guarded so the exact same shim runs headless (Node tests)
// and in the browser.

import momentImpl from 'moment';

const hasDOM = typeof document !== 'undefined';

// Obsidian bundles moment and re-exports it; date plugins (Natural Language Dates,
// Calendar, Templater) rely on `import { moment } from 'obsidian'`.
export const moment = momentImpl;

let noticeSink = (msg) => console.log('[Notice]', msg);
export function setNoticeSink(fn) {
  noticeSink = fn;
}

export class Events {
  constructor() {
    this._ev = new Map();
  }
  on(name, cb) {
    (this._ev.get(name) || this._ev.set(name, []).get(name)).push(cb);
    return { name, cb };
  }
  off(name, cb) {
    const a = this._ev.get(name);
    if (a) this._ev.set(name, a.filter((f) => f !== cb));
  }
  trigger(name, ...args) {
    (this._ev.get(name) || []).forEach((cb) => cb(...args));
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
Component.prototype.load = function () { this.onload(); };
Component.prototype.unload = function () { this.onunload(); };
Component.prototype.addChild = function (c) { this._children.push(c); c.onload && c.onload(); return c; };
Component.prototype.removeChild = function (c) { this._children = this._children.filter((x) => x !== c); c.onunload && c.onunload(); };
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
Plugin.prototype.registerView = function () {};
Plugin.prototype.registerHoverLinkSource = function (id, info) { this.app.workspace.registerHoverLinkSource(id, info); };
Plugin.prototype.registerEditorExtension = function () {};
Plugin.prototype.registerExtensions = function () {};
Plugin.prototype.registerMarkdownCodeBlockProcessor = function (lang, handler) { (this.app._codeblocks || (this.app._codeblocks = new Map())).set(lang, handler); return handler; };
Plugin.prototype.registerEditorSuggest = function (s) { (this.app._editorSuggests || (this.app._editorSuggests = [])).push(s); return s; };
Plugin.prototype.registerObsidianProtocolHandler = function (action, handler) { (this.app._protocol || (this.app._protocol = new Map())).set(action, handler); };
Plugin.prototype.loadData = async function () { return this.app.storage.get(this.manifest.id); };
Plugin.prototype.saveData = async function (data) { this.app.storage.set(this.manifest.id, data); };

// Minimal UI stubs — enough that onload()/settings code instantiates without throwing.
export class Modal {
  constructor(app) {
    this.app = app;
    this.scope = new Scope();
    this.contentEl = hasDOM ? document.createElement('div') : { empty() {}, createEl: () => ({}) };
    this.modalEl = this.contentEl;
  }
  open() {}
  close() {}
  onOpen() {}
  onClose() {}
}
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
export class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = hasDOM ? document.createElement('div') : { empty() {}, createEl: () => ({}) };
  }
  display() {}
  hide() {}
}
// Non-core symbols some plugins extend (newer/edge API surface); stubbed so onload proceeds.
export class SettingPage extends PluginSettingTab {}
export class SettingGroup extends Component {
  constructor() { super(); this.containerEl = hasDOM ? document.createElement('div') : {}; }
}
export class ItemView extends Component {
  constructor(leaf) {
    super();
    this.leaf = leaf;
    this.containerEl = hasDOM ? document.createElement('div') : {};
  }
  getViewType() { return ''; }
  getDisplayText() { return ''; }
}

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
}
export class MarkdownPreviewView {}

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
    this.limit = 50;
  }
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
  constructor() { this.keys = []; }
  register(mods, key, fn) { this.keys.push({ mods, key, fn }); return { mods, key, fn }; }
  unregister() {}
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
  return String(fm.aliases).split(/[,\s]+/).filter(Boolean);
}
export function setIcon() {}
export function addIcon() {}
export function requireApiVersion() { return true; }
export function getIconIds() { return []; }
export function getIcon() { return null; }
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
  // Wired to the host renderer by runtime.createApp (keeps marked out of the shim).
  static async renderMarkdown(markdown, el, sourcePath, component) {
    if (MarkdownRenderer._render) el.innerHTML = await MarkdownRenderer._render(markdown, sourcePath);
  }
  static async render(app, markdown, el, sourcePath, component) {
    return MarkdownRenderer.renderMarkdown(markdown, el, sourcePath, component);
  }
}
