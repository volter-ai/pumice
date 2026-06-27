// Phase 3 — Workspace + UI runtime. A real tree of splits → tabs → leaves, with view
// attachment, active-leaf tracking, type queries, and split/detach lifecycle. Backed by
// real DOM containers so it runs in the browser and jsdom alike. This is the structural
// core the file-explorer/palette/panes/custom-views build on.

class Emitter {
  constructor() { this._ev = {}; }
  on(e, fn) { (this._ev[e] || (this._ev[e] = [])).push(fn); return { e, fn }; }
  off(e, fn) { this._ev[e] = (this._ev[e] || []).filter((f) => f !== fn); }
  trigger(e, ...a) { for (const fn of this._ev[e] || []) fn(...a); }
}

export class WorkspaceLeaf extends Emitter {
  constructor(workspace, doc) {
    super();
    this.workspace = workspace;
    this.parent = null;
    this.view = null;
    this.containerEl = doc.createElement('div');
    this.containerEl.className = 'workspace-leaf';
    this.tabHeaderEl = doc.createElement('div');
    this.tabHeaderEl.className = 'workspace-tab-header';
    this.pinned = false;
    this.group = null;
  }
  async setViewState(state) {
    if (this.view && this.view.onClose) await this.view.onClose();
    const factory = this.workspace._viewFactories[state.type];
    this.view = factory ? factory(this) : { getViewType: () => state.type, containerEl: this.containerEl, getState: () => state.state || {} };
    this.view.leaf = this; this.view.app = this.workspace.app;
    this._viewType = state.type; this._state = state.state || {};
    if (this.view.onOpen) await this.view.onOpen();
    if (this.view.getDisplayText) this.tabHeaderEl.textContent = this.view.getDisplayText();
    this.workspace.trigger('layout-change');
    return this.view;
  }
  getViewState() { return { type: this._viewType || (this.view && this.view.getViewType && this.view.getViewType()) || 'empty', state: this._state || {} }; }
  async openFile(file, opts) { return this.setViewState({ type: opts && opts.type ? opts.type : 'markdown', state: { file: file.path || file } }); }
  getDisplayText() { return (this.view && this.view.getDisplayText && this.view.getDisplayText()) || ''; }
  setPinned(v) { this.pinned = !!v; }
  setGroup(g) { this.group = g; }
  detach() { this.workspace._detachLeaf(this); }
  getRoot() { let n = this; while (n.parent) n = n.parent; return n; }
  getContainer() { let n = this; while (n.parent && n.parent.type !== 'tabs') n = n.parent; return n.parent || n; }
}

class ParentNode {
  constructor(type, doc) { this.type = type; this.children = []; this.parent = null; this.containerEl = doc.createElement('div'); this.containerEl.className = 'workspace-' + type; }
  addChild(c, index) { c.parent = this; if (index == null) this.children.push(c); else this.children.splice(index, 0, c); this.containerEl.appendChild(c.containerEl); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); if (c.containerEl.parentNode === this.containerEl) this.containerEl.removeChild(c.containerEl); }
}

export class Workspace extends Emitter {
  constructor(app, doc = globalThis.document) {
    super();
    this.app = app;
    this._doc = doc;
    this._viewFactories = {};
    this.rootSplit = new ParentNode('split', doc); this.rootSplit.direction = 'vertical';
    this.leftSplit = new ParentNode('split', doc); this.leftSplit.side = 'left'; this.leftSplit.collapsed = false;
    this.rightSplit = new ParentNode('split', doc); this.rightSplit.side = 'right'; this.rightSplit.collapsed = false;
    this._mainTabs = new ParentNode('tabs', doc); this.rootSplit.addChild(this._mainTabs);
    this.activeLeaf = null;
    this._layoutReady = false;
  }
  registerViewType(type, factory) { this._viewFactories[type] = factory; }
  onLayoutReady(cb) { this._layoutReady = true; cb && cb(); }

  _newLeafIn(parent) { const leaf = new WorkspaceLeaf(this, this._doc); parent.addChild(leaf); if (!this.activeLeaf) this.setActiveLeaf(leaf); return leaf; }

  // getLeaf(false|'tab') reuses/creates in main tabs; getLeaf('split', dir) splits active.
  getLeaf(how, direction = 'vertical') {
    if (how === 'split') return this.splitActiveLeaf(direction);
    if (how === false && this.activeLeaf && this.activeLeaf.parent === this._mainTabs) return this.activeLeaf;
    return this._newLeafIn(this._mainTabs);
  }
  getMostRecentLeaf() { return this.activeLeaf || this.getLeaf(); }
  getLeftLeaf() { return this._newLeafIn(this.leftSplit); }
  getRightLeaf() { return this._newLeafIn(this.rightSplit); }

  splitActiveLeaf(direction = 'vertical') {
    const active = this.activeLeaf || this._newLeafIn(this._mainTabs);
    const container = active.parent; // a tabs node
    const split = new ParentNode('split', this._doc); split.direction = direction;
    const grandparent = container.parent || this.rootSplit;
    const idx = grandparent.children.indexOf(container);
    grandparent.removeChild(container);
    grandparent.addChild(split, idx === -1 ? undefined : idx);
    split.addChild(container);
    const newTabs = new ParentNode('tabs', this._doc); split.addChild(newTabs);
    return this._newLeafIn(newTabs);
  }

  setActiveLeaf(leaf, opts) { const prev = this.activeLeaf; this.activeLeaf = leaf; if (prev !== leaf) this.trigger('active-leaf-change', leaf); }
  getActiveViewOfType(Type) { const v = this.activeLeaf && this.activeLeaf.view; if (!v) return null; if (!Type) return v; return v instanceof Type ? v : null; }
  getActiveFile() { const s = this.activeLeaf && this.activeLeaf.getViewState(); return s && s.state && s.state.file ? { path: s.state.file } : null; }

  iterateAllLeaves(cb) {
    const walk = (node) => { if (node instanceof WorkspaceLeaf) { cb(node); return; } for (const c of (node.children || [])) walk(c); };
    for (const root of [this.rootSplit, this.leftSplit, this.rightSplit]) walk(root);
  }
  getLeavesOfType(type) { const out = []; this.iterateAllLeaves((l) => { if (l.getViewState().type === type) out.push(l); }); return out; }
  detachLeavesOfType(type) { for (const l of this.getLeavesOfType(type)) l.detach(); }

  _detachLeaf(leaf) {
    const parent = leaf.parent;
    if (parent) parent.removeChild(leaf);
    if (this.activeLeaf === leaf) { let next = null; this.iterateAllLeaves((l) => { if (!next) next = l; }); this.setActiveLeaf(next); }
    // collapse now-empty tab/split nodes (keep the three roots)
    this._pruneEmpty(parent);
    this.trigger('layout-change');
  }
  _pruneEmpty(node) {
    while (node && node !== this.rootSplit && node !== this.leftSplit && node !== this.rightSplit && (node.children || []).length === 0) {
      const up = node.parent; if (up) up.removeChild(node); node = up;
    }
  }

  async openLinkText(linktext, sourcePath, newLeaf) {
    const leaf = newLeaf ? this.getLeaf('tab') : this.getLeaf(false);
    await leaf.setViewState({ type: 'markdown', state: { file: linktext } });
    this.setActiveLeaf(leaf);
    return leaf;
  }
  revealLeaf(leaf) { this.setActiveLeaf(leaf); return Promise.resolve(); }
  // count of leaves (test/introspection helper)
  get leafCount() { let n = 0; this.iterateAllLeaves(() => n++); return n; }
}
