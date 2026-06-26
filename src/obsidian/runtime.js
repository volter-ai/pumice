// The Obsidian App/Vault/Workspace/MetadataCache runtime — built ON TOP of our
// VaultAdapter. This is the whole point: Obsidian's `Vault` is just a consumer of
// the same VFS interface the renderer and agent API use. Swap the adapter and the
// plugins run over a folder, the Vite server, git, Notion — unchanged.

import { Events, TFile, MarkdownRenderer, Scope } from './api.js';
import { parseLinks, splitFrontmatter, noteName } from '../vfs/links.js';

class CommandRegistry {
  constructor() {
    this.commands = new Map();
  }
  register(cmd) {
    this.commands.set(cmd.id, cmd);
  }
  listCommands() {
    return [...this.commands.values()];
  }
  addCommand(cmd) { this.register(cmd); return cmd; }
  removeCommand(id) { this.commands.delete(id); }
  findCommand(id) { return this.commands.get(id) || null; }
  async executeCommandById(id) {
    const c = this.commands.get(id);
    if (!c) return false;
    if (c.callback) return c.callback();
    if (c.checkCallback) return c.checkCallback(false);
    if (c.editorCallback) return c.editorCallback(null, null);
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
    async stat() { return null; },
    async mkdir() {}, async remove() {}, async rmdir() {}, async rename() {},
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
  }
  getName() {
    return this.backend.name || 'vault';
  }
  getConfig(key) {
    const defaults = { attachmentFolderPath: '', newFileLocation: 'root', tabSize: 4, useTab: true };
    return key ? defaults[key] : defaults;
  }
  setConfig() {}
  getRoot() { return { path: '/', name: '', children: [] }; }
  configDir = '.obsidian';
  getFiles() {
    return [...this._files.values()];
  }
  getMarkdownFiles() {
    return [...this._files.values()].filter((f) => f.extension === 'md');
  }
  getAbstractFileByPath(path) {
    return this._files.get(path) || null;
  }
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
  }
  getFileCache(file) {
    const content = this.vault._cache.get(file.path) || '';
    const { frontmatter } = splitFrontmatter(content);
    const links = parseLinks(content).map((link) => ({ link, displayText: link }));
    const tags = [];
    const inline = content.match(/(^|\s)#([A-Za-z0-9_\/-]+)/g) || [];
    for (const t of inline) tags.push({ tag: '#' + t.trim().replace(/^#/, '') });
    if (frontmatter.tags) for (const t of String(frontmatter.tags).split(/[,\s]+/).filter(Boolean)) tags.push({ tag: '#' + t });
    return { frontmatter, links, tags, headings: [], embeds: [] };
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
  getFirstLinkpathDest(linkpath) {
    const want = linkpath.toLowerCase();
    for (const f of this.vault.getMarkdownFiles()) {
      if (noteName(f.path).toLowerCase() === want) return f;
    }
    return null;
  }
  resolvedLinks() { return {}; }
}

class Workspace extends Events {
  constructor() {
    super();
    this.activeLeaf = null;
  }
  getActiveFile() { return this._activeFile || null; }
  getActiveViewOfType() { return null; }
  getLeavesOfType() { return []; }
  getLeaf() { return { openFile() {}, setViewState() {} }; }
  getLeftLeaf() { return this.getLeaf(); }
  getRightLeaf() { return this.getLeaf(); }
  iterateAllLeaves() {}
  updateOptions() {}
  registerHoverLinkSource(id, info) {
    (this._hoverSources || (this._hoverSources = new Map())).set(id, info);
  }
  onLayoutReady(cb) { cb(); }
  setActiveFile(f) { this._activeFile = f; this.trigger('file-open', f); }
}

class App {
  constructor(adapter, renderMarkdown) {
    this.vault = new Vault(adapter);
    this.metadataCache = new MetadataCache(this.vault);
    this.workspace = new Workspace();
    this.commands = new CommandRegistry();
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
    this.internalPlugins = {
      plugins: {},
      getPluginById(id) { return this.plugins[id] || null; },
      getEnabledPluginById(id) { return this.plugins[id] || null; },
    };
    this.fileManager = {
      processFrontMatter: async () => {},
      generateMarkdownLink: (file) => `[[${noteName(file.path)}]]`,
      renameFile: async () => {},
      getNewFileParent: () => this.vault.getRoot(),
    };
    this.setting = { open() {}, openTabById() {}, closeActiveTab() {} };
    this.loadLocalStorage = (k) => { try { return JSON.parse(globalThis.localStorage.getItem(k)); } catch { return null; } };
    this.saveLocalStorage = (k, v) => { try { globalThis.localStorage.setItem(k, JSON.stringify(v)); } catch {} };
    this.customCss = { setCssEnabledStatus() {}, enabledSnippets: new Set(), snippets: [], themes: {}, oldThemes: [], getSnippetsFolder() { return ''; }, getThemeFolder() { return ''; }, readSnippets() { return []; }, readThemes() { return []; }, requestLoadSnippets() {}, requestLoadTheme() {} };
    this.embedRegistry = { embedByExtension: new Proxy({}, { get: () => () => ({ loadFile() {}, onload() {} }) }), registerExtension() {}, unregisterExtension() {}, registerExtensions() {}, getEmbedCreator() { return null; } };
    this.viewRegistry = { typeByExtension: {}, viewByType: {}, getTypeByExtension() { return null; }, getViewCreatorByType() { return null; }, registerExtensions() {}, registerView() {}, isExtensionRegistered() { return false; } };
    this.metadataTypeManager = { properties: {}, getAllProperties() { return {}; }, getPropertyInfo() { return null; }, setType() {} };
    this.hotkeyManager = { getHotkeys() { return []; }, getDefaultHotkeys() { return []; }, addDefaultHotkeys() {}, removeDefaultHotkeys() {}, onTrigger() {} };
    this.dom = { appContainerEl: globalThis.document ? globalThis.document.body : null };
    if (renderMarkdown) MarkdownRenderer._render = renderMarkdown;
  }
}

export async function createApp(adapter, renderMarkdown) {
  const app = new App(adapter, renderMarkdown);
  await app.vault.init();
  return app;
}
