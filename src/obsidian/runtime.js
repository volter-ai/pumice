// The Obsidian App/Vault/Workspace/MetadataCache runtime — built ON TOP of our
// VaultAdapter. This is the whole point: Obsidian's `Vault` is just a consumer of
// the same VFS interface the renderer and agent API use. Swap the adapter and the
// plugins run over a folder, the Vite server, git, Notion — unchanged.

import { Events, TFile, TFolder, MarkdownRenderer, Scope, MarkdownView, editorInfoField } from './api.js';
import { parseLinks, splitFrontmatter, noteName } from '../vfs/links.js';
import { processFrontMatter } from '../core/properties.js';
import { parseMetadata, buildLinkIndex, frontmatterTags } from './metadata.js';
import { Editor } from '../editor/editor.js';

class CommandRegistry {
  constructor() {
    // Obsidian's CommandManager exposes `.commands` as an id->command OBJECT (commander
    // and others read app.commands.commands[id] directly), with editorCommands split out.
    this.commands = {};
    this.editorCommands = {};
  }
  register(cmd) {
    this.commands[cmd.id] = cmd;
    if (cmd.editorCallback || cmd.editorCheckCallback) this.editorCommands[cmd.id] = cmd;
  }
  listCommands() {
    return Object.values(this.commands);
  }
  addCommand(cmd) { this.register(cmd); return cmd; }
  removeCommand(id) { delete this.commands[id]; delete this.editorCommands[id]; }
  findCommand(id) { return this.commands[id] || null; }
  async executeCommandById(id) {
    const c = this.commands[id];
    if (!c) return false;
    if (c.callback) return c.callback();
    if (c.checkCallback) return c.checkCallback(false);
    // Editor commands need a live editor + MarkdownView (advanced-tables, outliner,
    // templater insert, quickadd). Resolve the active markdown view's real editor.
    if (c.editorCheckCallback || c.editorCallback) {
      const app = this._app;
      const view = app ? app.workspace.getActiveViewOfType(MarkdownView) : null;
      const editor = view ? view.editor : null;
      if (c.editorCheckCallback) return c.editorCheckCallback(false, editor, view);
      return c.editorCallback(editor, view);
    }
    return true;
  }
}

class Ribbon {
  constructor() {
    this.items = [];
  }
  add(item) {
    this.items.push(item);
  }
}

class Storage {
  constructor() {
    this.mem = new Map();
    this.ls = typeof localStorage !== 'undefined' ? localStorage : null;
  }
  get(key) {
    if (this.ls) {
      const v = this.ls.getItem('plugin:' + key);
      return v ? JSON.parse(v) : null;
    }
    return this.mem.get(key) ?? null;
  }
  set(key, data) {
    if (this.ls) this.ls.setItem('plugin:' + key, JSON.stringify(data));
    else this.mem.set(key, data);
  }
}

// Obsidian's DataAdapter facade (vault.adapter.{exists,read,write,list,...}) over
// our VaultAdapter backend. Plugins (iconize, templater, ...) use this directly.
function makeDataAdapter(backend) {
  return {
    async exists(p) { try { await backend.read(p); return true; } catch { return (await backend.list()).includes(p); } },
    async read(p) { return backend.read(p); },
    async readBinary(p) { return backend.read(p); },
    async write(p, d) { return backend.write ? backend.write(p, d) : undefined; },
    async writeBinary(p, d) { return backend.write ? backend.write(p, d) : undefined; },
    async append(p, d) { const cur = await backend.read(p).catch(() => ''); return backend.write(p, cur + d); },
    async list(/* p */) { return { files: await backend.list(), folders: [] }; },
    // Delegate to the backend when it supports the op (real fs/OPFS) instead of a
    // silent no-op that made plugins fail invisibly. Backends lacking the method get
    // a sensible default (stat→null, mkdir→ok) rather than a lie.
    async stat(p) { return backend.stat ? backend.stat(p) : null; },
    async mkdir(p) { return backend.mkdir ? backend.mkdir(p) : undefined; },
    async remove(p) { if (backend.remove) return backend.remove(p); throw new Error('adapter "' + (backend.name || 'vault') + '" does not support remove'); },
    async rmdir(p) { return backend.remove ? backend.remove(p) : undefined; },
    async rename(from, to) { if (backend.rename) return backend.rename(from, to); if (backend.write && backend.read && backend.remove) { const c = await backend.read(from); await backend.write(to, c); return backend.remove(from); } throw new Error('adapter "' + (backend.name || 'vault') + '" does not support rename'); },
    async trashSystem() { return false; }, async trashLocal() {},
    getName() { return backend.name || 'vault'; },
    getResourcePath(p) { return p; },
    getFullPath(p) { return p; },
  };
}

class Vault extends Events {
  constructor(adapter) {
    super();
    this.backend = adapter;
    this.adapter = makeDataAdapter(adapter);
    this.configDir = '.obsidian';
    this._files = new Map(); // path -> TFile
    this._cache = new Map(); // path -> content
  }
  async init() {
    const snap = await this.backend.snapshot();
    this._files.clear();
    this._cache.clear();
    for (const [path, content] of Object.entries(snap)) {
      this._files.set(path, new TFile(path));
      this._cache.set(path, content);
    }
    this._buildFolderTree();
  }
  // Build the TFolder tree Obsidian exposes (getRoot/recurseChildren/file.parent) so
  // folder-walking plugins (calendar daily-notes, file-explorer) have a real tree.
  _buildFolderTree() {
    this._folders = new Map();
    const root = new TFolder('/'); root.name = '';
    this._folders.set('/', root); this._folders.set('', root);
    this._root = root;
    const ensureFolder = (dir) => {
      if (!dir || dir === '/' || dir === '') return root;
      if (this._folders.has(dir)) return this._folders.get(dir);
      const f = new TFolder(dir);
      const parentDir = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '';
      const parent = ensureFolder(parentDir);
      f.parent = parent; parent.children.push(f);
      this._folders.set(dir, f);
      return f;
    };
    for (const file of this._files.values()) {
      const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
      const folder = ensureFolder(dir);
      file.parent = folder; folder.children.push(file);
    }
  }
  getName() {
    return this.backend.name || 'vault';
  }
  getConfig(key) {
    const defaults = { attachmentFolderPath: '', newFileLocation: 'root', tabSize: 4, useTab: true };
    return key ? defaults[key] : defaults;
  }
  setConfig() {}
  getRoot() { return this._root || (this._root = new TFolder('/')); }
  configDir = '.obsidian';
  getFiles() {
    return [...this._files.values()];
  }
  getMarkdownFiles() {
    return [...this._files.values()].filter((f) => f.extension === 'md');
  }
  getAbstractFileByPath(path) {
    return this._files.get(path) || (this._folders && this._folders.get(path)) || null;
  }
  // Obsidian's typed accessor (tasks, recent-files) — only returns TFiles.
  getFileByPath(path) { const f = this._files.get(path); return f && f.extension !== undefined ? f : (f || null); }
  async read(file) {
    return this.backend.read(file.path);
  }
  async cachedRead(file) {
    if (this._cache.has(file.path)) return this._cache.get(file.path);
    const c = await this.backend.read(file.path);
    this._cache.set(file.path, c);
    return c;
  }
  async modify(file, data) {
    if (!this.backend.write) throw new Error('vault is read-only (adapter has no write)');
    await this.backend.write(file.path, data);
    this._cache.set(file.path, data);
    this.trigger('modify', file);
  }
  async create(path, data) {
    if (!this.backend.write) throw new Error('vault is read-only (adapter has no write)');
    await this.backend.write(path, data);
    const f = new TFile(path);
    this._files.set(path, f);
    this._cache.set(path, data);
    this.trigger('create', f);
    return f;
  }
  async delete() { throw new Error('delete not supported in this adapter'); }
}

class MetadataCache extends Events {
  constructor(vault) {
    super();
    this.vault = vault;
    this._caches = new Map();          // path -> CachedMetadata
    // Obsidian exposes these as DATA properties (objects), not methods. Plugins read
    // `app.metadataCache.resolvedLinks[srcPath][destPath]`.
    this.resolvedLinks = {};
    this.unresolvedLinks = {};
  }
  // Rebuild every file's cache + the vault-wide link index, then announce 'resolved'.
  rebuildAll() {
    this._caches.clear();
    for (const f of this.vault.getMarkdownFiles()) {
      this._caches.set(f.path, parseMetadata(this.vault._cache.get(f.path) || ''));
    }
    this._reindexLinks();
    this.trigger('resolved');
  }
  _reindexLinks() {
    const caches = {};
    for (const [p, c] of this._caches) caches[p] = c;
    const { resolved, unresolved } = buildLinkIndex(caches, (target, src) => {
      const dest = this.getFirstLinkpathDest(target, src);
      return dest ? dest.path : null;
    });
    this.resolvedLinks = resolved;
    this.unresolvedLinks = unresolved;
  }
  // Single-file update on write — recompute that file, reindex, fire Obsidian's events.
  _update(file) {
    const cache = parseMetadata(this.vault._cache.get(file.path) || '');
    this._caches.set(file.path, cache);
    this._reindexLinks();
    this.trigger('changed', file, this.vault._cache.get(file.path) || '', cache);
    this.trigger('resolve', file);
    this.trigger('resolved');
  }
  getFileCache(file) {
    if (!file) return null;
    if (this._caches.has(file.path)) return this._caches.get(file.path);
    const cache = parseMetadata(this.vault._cache.get(file.path) || '');
    this._caches.set(file.path, cache);
    return cache;
  }
  getCachedFiles() {
    return this.vault.getMarkdownFiles().map((f) => f.path);
  }
  getCache(path) {
    const f = this.vault.getAbstractFileByPath(path);
    return f ? this.getFileCache(f) : null;
  }
  fileToLinktext(file) {
    return noteName(file.path);
  }
  // Obsidian resolution order: exact path, path+.md, then basename (prefer same folder
  // as sourcePath), markdown first then any extension.
  getFirstLinkpathDest(linkpath, sourcePath = '') {
    const clean = linkpath.replace(/#.*$/, '').trim();
    if (!clean) return null;
    const files = this.vault.getFiles();
    const byPath = this.vault.getAbstractFileByPath(clean) || this.vault.getAbstractFileByPath(clean + '.md');
    if (byPath) return byPath;
    const want = clean.toLowerCase();
    const matches = files.filter((f) => noteName(f.path).toLowerCase() === want || f.path.toLowerCase() === want);
    if (!matches.length) return null;
    if (matches.length === 1 || !sourcePath) return matches[0];
    const srcDir = sourcePath.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/')) : '';
    return matches.find((f) => f.path.startsWith(srcDir + '/')) || matches[0];
  }
  // { [destPath]: { [srcPath]: refs } } collapsed to Obsidian's {data: Map} shape.
  getBacklinksForFile(file) {
    const data = new Map();
    for (const [src, dests] of Object.entries(this.resolvedLinks)) {
      if (dests[file.path]) data.set(src, [{ link: noteName(file.path) }]);
    }
    return { data, count: () => data.size };
  }
  // Aggregate tag -> count across the vault (Obsidian's getTags()) — inline tags
  // (cache.tags) PLUS frontmatter tags (which live in cache.frontmatter, not cache.tags).
  getTags() {
    const out = {};
    for (const c of this._caches.values()) {
      for (const t of c.tags || []) out[t.tag] = (out[t.tag] || 0) + 1;
      for (const t of frontmatterTags(c.frontmatter)) out[t] = (out[t] || 0) + 1;
    }
    return out;
  }
}

class Workspace extends Events {
  constructor(app) {
    super();
    this.app = app;
    this.activeLeaf = null;
    this.activeEditor = null; // Obsidian MarkdownFileInfo (has .editor/.file)
    this._leaves = [];
    // Split tree (sliding-panes walks rootSplit.children + each leaf's containerEl width;
    // real widths come from the browser's layout).
    const doc = globalThis.document;
    const ws = this;
    this.layoutReady = false;
    this.rootSplit = {
      containerEl: doc ? doc.createElement('div') : { clientWidth: 1200, scrollLeft: 0, scrollTo() {} },
      direction: 'vertical', onChildResizeStart() {}, getRoot() { return this; },
      get children() { return ws._leaves; },
    };
    this.floatingSplit = { children: [] };
    // Workspace root element (3d-graph reads getComputedStyle(workspace.containerEl) for
    // theme vars; file-explorer/others mount into it). A dedicated div under <body> so
    // theme CSS vars resolve by inheritance, and plugin .empty() can't wipe the page.
    if (doc) { const c = doc.createElement('div'); c.className = 'workspace mod-root'; if (doc.body) doc.body.appendChild(c); this.containerEl = c; }
    else this.containerEl = { createEl: () => ({}), empty() {} };
  }
  getActiveFile() { return this._activeFile || null; }
  // A real MarkdownView with a live CM6 editor when asked for one; else the active
  // leaf's mounted view (instanceof-checked like Obsidian).
  getActiveViewOfType(Type) {
    if (Type === MarkdownView || (Type && Type.name === 'MarkdownView')) return this._ensureMarkdownView();
    const v = this._leaf && this._leaf.view;
    if (!v) return null;
    return !Type || v instanceof Type ? v : null;
  }
  _ensureMarkdownView() {
    const doc = globalThis.document;
    if (!doc) return null;
    if (!this._mdView) {
      const leaf = this.getLeaf();
      const view = new MarkdownView(leaf);
      view.app = this.app;
      view.containerEl = doc.createElement('div');
      const parent = doc.createElement('div');
      view.containerEl.appendChild(parent);
      const file = this._activeFile;
      const content = file && this.app ? (this.app.vault._cache.get(file.path) || '') : '';
      // Seed editorInfoField with the MarkdownFileInfo (view) so editor extensions
      // (outliner, live-preview) can resolve back to the app/editor/file.
      view.editor = new Editor(parent, { doc: content, extensions: [editorInfoField.init(() => view), ...((this.app && this.app._editorExtensions) || [])] });
      view.file = file || null;
      leaf.view = view;
      this._mdView = view;
      this.activeEditor = view;
    } else if (this._activeFile && this._mdView.file !== this._activeFile) {
      // retarget editor at the newly-active file
      const content = this.app.vault._cache.get(this._activeFile.path) || '';
      this._mdView.editor.setValue(content);
      this._mdView.file = this._activeFile;
    }
    return this._mdView;
  }
  getActiveLeaf() { return this.getLeaf(); }
  get activeLeaf() { return this.getLeaf(); }
  set activeLeaf(v) { this._leaf = v; }
  getLeavesOfType(type) { return this._leaves.filter((l) => l.getViewState().type === type); }
  _makeLeaf() {
    const doc = globalThis.document;
    const containerEl = doc ? doc.createElement('div') : { empty() {}, createEl: () => ({}), children: [], appendChild() {} };
    const ws = this;
    // Attach the leaf to the in-document workspace root so views that need real layout
    // (3d-graph WebGL canvas sizing, mind-map SVG getBBox) actually measure/render.
    if (doc && ws.containerEl && ws.containerEl.appendChild) { try { containerEl.className = 'workspace-leaf'; ws.containerEl.appendChild(containerEl); } catch {} }
    let view = { containerEl, getViewType: () => 'empty', getDisplayText: () => '', getState: () => ({}), app: ws.app };
    const leaf = {
      view, containerEl, app: ws.app,
      _type: 'empty', _state: {},
      async openFile(file, opts) { const path = file.path || file; const tf = ws.app && ws.app.vault.getAbstractFileByPath(path); ws.setActiveFile(tf || { path }); return this.setViewState({ type: (opts && opts.type) || 'markdown', state: { file: path } }); },
      // Mount the plugin-registered view creator (calendar/homepage). This is the gap
      // that left registerView a no-op end-to-end.
      async setViewState(state) {
        this._type = state.type; this._state = state.state || {};
        const creator = ws.app && ws.app._viewCreators && ws.app._viewCreators.get(state.type);
        if (creator) {
          if (this.view && this.view.onClose) await this.view.onClose();
          this.view = creator(this) || this.view;
          this.view.app = ws.app; this.view.leaf = this;
          if (this.view.containerEl && this.containerEl.appendChild && this.view.containerEl !== this.containerEl) {
            try { this.containerEl.appendChild(this.view.containerEl); } catch {}
          }
          if (this.view.onOpen) await this.view.onOpen();
        }
        ws.trigger('layout-change');
        return this.view;
      },
      // Mount a pre-constructed view instance (mind-map's initPreview -> leaf.open(view)).
      async open(view) {
        this.view = view; view.leaf = this; view.app = ws.app;
        this._type = (view.getViewType && view.getViewType()) || this._type;
        if (view.containerEl && this.containerEl.appendChild && view.containerEl !== this.containerEl) { try { this.containerEl.appendChild(view.containerEl); } catch {} }
        if (view.onOpen) await view.onOpen();
        ws.trigger('layout-change');
        return view;
      },
      getDisplayText() { return (this.view && this.view.getDisplayText && this.view.getDisplayText()) || ''; },
      getViewState() { return { type: this._type, state: this._state }; },
      setEphemeralState() {}, getEphemeralState() { return {}; },
      detach() { ws._leaves = ws._leaves.filter((l) => l !== leaf); }, on() { return {}; }, off() {}, setGroup() {}, setPinned() {},
      getContainer() { return ws.rootSplit; }, parentSplit: ws.rootSplit,
      get width() { return this._width != null ? this._width : ((this.containerEl && this.containerEl.clientWidth) || 0); },
      set width(v) { this._width = v; if (this.containerEl && this.containerEl.style) this.containerEl.style.width = typeof v === 'number' ? v + 'px' : v; },
    };
    Object.defineProperty(leaf, 'view', { get() { return view; }, set(v) { view = v; }, configurable: true });
    ws._leaves.push(leaf);
    return leaf;
  }
  getLeaf() { return this._leaf || (this._leaf = this._makeLeaf()); }
  getUnpinnedLeaf() { const l = this.getLeaf(); return (l && !l.pinned) ? l : this._makeLeaf(); }
  splitActiveLeaf() { const l = this._makeLeaf(); return l; }
  getLeftLeaf() { return this._makeLeaf(); }
  getRightLeaf() { return this._makeLeaf(); }
  getMostRecentLeaf() { return this.getLeaf(); }
  iterateAllLeaves(cb) { if (cb) this._leaves.forEach(cb); }
  iterateRootLeaves(cb) { if (cb) this._leaves.forEach(cb); }
  iterateLeaves(cb) { if (cb) this._leaves.forEach(cb); }
  detachLeavesOfType(type) { this._leaves.filter((l) => l.getViewState().type === type).forEach((l) => l.detach()); }
  ensureSideLeaf() { return this._makeLeaf(); }
  revealLeaf() { return Promise.resolve(); }
  updateOptions() {}
  registerHoverLinkSource(id, info) {
    (this._hoverSources || (this._hoverSources = new Map())).set(id, info);
  }
  getLayout() { return { main: {}, left: {}, right: {} }; }
  changeLayout() { return Promise.resolve(); }
  onLayoutReady(cb) { this.layoutReady = true; cb(); }
  setActiveFile(f) { this._activeFile = f; this.trigger('file-open', f); }
}

class App {
  constructor(adapter, renderMarkdown) {
    this.vault = new Vault(adapter);
    this.metadataCache = new MetadataCache(this.vault);
    // Keep the metadata index live as the vault changes (Obsidian fires changed/resolved).
    this.vault.on('modify', (f) => this.metadataCache._update(f));
    this.vault.on('create', (f) => this.metadataCache._update(f));
    this.workspace = new Workspace(this);
    this.commands = new CommandRegistry();
    this.commands._app = this; // editor commands resolve the active MarkdownView via app
    this._editorExtensions = [];
    this._viewCreators = new Map();
    this.ribbon = new Ribbon();
    this.settingTabs = [];
    this.postProcessors = [];
    this.storage = new Storage();
    this.scope = new Scope();
    this.keymap = { pushScope() {}, popScope() {} };
    // app.plugins / app.internalPlugins registries (undocumented but de-facto API).
    this.plugins = {
      plugins: {},
      enabledPlugins: new Set(),
      manifests: {},
      getPlugin(id) { return this.plugins[id] || null; },
      getPluginById(id) { return this.plugins[id] || null; },
      isEnabled(id) { return this.enabledPlugins.has(id); },
    };
    // Core/internal plugins. hover-editor reaches into the graph plugin's views to
    // patch hover behavior; provide a structurally-faithful stub (engine.constructor,
    // renderer) so that reflection completes without a real graph renderer.
    const graphEngineCtor = function GraphEngine() {};
    const makeGraphView = () => ({ engine: Object.assign(Object.create(graphEngineCtor.prototype), { constructor: graphEngineCtor, render() {}, setData() {} }), renderer: { px: 0, setPan() {}, onResize() {} }, leaf: null, load() {}, unload() {} });
    this.internalPlugins = {
      plugins: {
        graph: { enabled: true, instance: { name: 'Graph' }, views: { localgraph: makeGraphView, graph: makeGraphView } },
        'page-preview': { enabled: true, instance: { name: 'Page Preview' } },
        'file-explorer': { enabled: true, instance: { name: 'Files', revealInFolder() {} } },
      },
      getPluginById(id) { return this.plugins[id] || null; },
      getEnabledPluginById(id) { return (this.plugins[id] && this.plugins[id].enabled) ? this.plugins[id] : null; },
      config: {},
    };
    this.fileManager = {
      // Real Obsidian contract: read the file, let fn mutate the frontmatter object,
      // write it back with zero-diff on untouched fields.
      processFrontMatter: async (file, fn) => {
        const content = await this.vault.read(file).catch(() => this.vault._cache.get(file.path) || '');
        const updated = processFrontMatter(content, fn || (() => {}));
        if (this.vault.backend.write) { await this.vault.backend.write(file.path, updated); this.vault._cache.set(file.path, updated); }
        return updated;
      },
      generateMarkdownLink: (file) => `[[${noteName(file.path)}]]`,
      // Real rename: move the file in the backend + vault maps, rebuild the metadata
      // index (paste-image-rename, and any reorganizing plugin).
      renameFile: async (file, newPath) => {
        const v = this.vault;
        const content = v._cache.get(file.path) ?? (await v.backend.read(file.path).catch(() => ''));
        if (v.backend.rename) await v.backend.rename(file.path, newPath);
        else if (v.backend.write) { await v.backend.write(newPath, content); if (v.backend.remove) await v.backend.remove(file.path).catch(() => {}); }
        v._cache.delete(file.path); v._cache.set(newPath, content);
        v._files.delete(file.path);
        const oldPath = file.path; file.path = newPath; file.name = newPath.split('/').pop();
        v._files.set(newPath, file);
        v._buildFolderTree();
        this.metadataCache.rebuildAll();
        v.trigger('rename', file, oldPath);
      },
      getNewFileParent: () => this.vault.getRoot(),
    };
    this.setting = { open() {}, openTabById() {}, closeActiveTab() {} };
    this.loadLocalStorage = (k) => { try { return JSON.parse(globalThis.localStorage.getItem(k)); } catch { return null; } };
    this.saveLocalStorage = (k, v) => { try { globalThis.localStorage.setItem(k, JSON.stringify(v)); } catch {} };
    this.customCss = { setCssEnabledStatus() {}, enabledSnippets: new Set(), snippets: [], themes: {}, oldThemes: [], getSnippetsFolder() { return ''; }, getThemeFolder() { return ''; }, getSnippetPath(n) { return `.obsidian/snippets/${n}.css`; }, getThemePath(n) { return `.obsidian/themes/${n}`; }, readSnippets() { return []; }, readThemes() { return []; }, requestLoadSnippets() {}, requestLoadTheme() {}, setCssEnabledStatus2() {} };
    // Faux markdown-editor prototype chain so plugins (kanban) that reflect via
    // Object.getPrototypeOf(Object.getPrototypeOf(embed.editMode)).constructor
    // to grab Obsidian's internal editor base get a real 2-level chain.
    function MarkdownScrollableEditView() {}
    function MarkdownEditView() {}
    MarkdownEditView.prototype = Object.create(MarkdownScrollableEditView.prototype);
    MarkdownEditView.prototype.constructor = MarkdownEditView;
    const makeEmbed = () => { const el = globalThis.document ? globalThis.document.createElement('div') : { empty() {}, createEl: () => ({}) }; return { containerEl: el, editMode: new MarkdownEditView(), load() {}, loadFile() { return Promise.resolve(); }, onload() {}, unload() {}, onunload() {}, showEditor() {}, showPreview() {}, editable: false, getMode() { return 'preview'; }, setState() {}, getState() { return {}; } }; };
    this.embedRegistry = { embedByExtension: new Proxy({}, { get: () => () => makeEmbed() }), registerExtension() {}, unregisterExtension() {}, registerExtensions() {}, unregisterExtensions() {}, isExtensionRegistered() { return true; }, getEmbedCreator() { return makeEmbed; } };
    // Status bar host element (commander reads app.statusBar.containerEl).
    this.statusBar = { containerEl: globalThis.document ? globalThis.document.body : { createEl: () => ({}), empty() {} } };
    this.viewRegistry = { typeByExtension: {}, viewByType: {}, getTypeByExtension() { return null; }, getViewCreatorByType() { return null; }, registerExtensions() {}, registerView() {}, isExtensionRegistered() { return false; } };
    this.metadataTypeManager = { properties: {}, getAllProperties() { return {}; }, getPropertyInfo() { return null; }, setType() {} };
    this.hotkeyManager = { getHotkeys() { return []; }, getDefaultHotkeys() { return []; }, addDefaultHotkeys() {}, removeDefaultHotkeys() {}, onTrigger() {} };
    this.dom = { appContainerEl: globalThis.document ? globalThis.document.body : null };
    this.isMobile = false;
    this.isVimEnabled = () => false;
    this.getAppTitle = () => 'Obsidian';
    this.getObsidianUrl = () => '';
    this.openWithDefaultApp = () => {};
    this.lastEvent = null;
    if (renderMarkdown) MarkdownRenderer._render = renderMarkdown;
  }
}

export async function createApp(adapter, renderMarkdown) {
  const app = new App(adapter, renderMarkdown);
  await app.vault.init();
  app.metadataCache.rebuildAll();
  // Obsidian exposes the app globally; daily-notes-interface (calendar/periodic-notes)
  // and others read window.app directly.
  if (typeof globalThis !== 'undefined') globalThis.app = app;
  if (typeof window !== 'undefined') window.app = app;
  return app;
}
