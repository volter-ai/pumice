// Phase 7 — `.obsidian/` config round-trip + themes. Read/write the config files
// (app.json, appearance.json, community-plugins.json, hotkeys.json, core-plugins.json)
// with ZERO-DIFF on untouched keys, and apply a theme's CSS variables + toggle snippets.
// Config persistence is via any VaultAdapter; this module is the pure model + DOM apply.

const CONFIG_FILES = ['app.json', 'appearance.json', 'community-plugins.json', 'core-plugins.json', 'hotkeys.json', 'graph.json'];

/** Read a JSON config file's text → object (preserving raw for zero-diff). */
export function parseConfig(text) { return { data: JSON.parse(text), _raw: text }; }

/** Serialize a config object back. Untouched configs re-emit verbatim (zero-diff). */
export function serializeConfig(cfg, opts = {}) {
  if (cfg._raw != null && cfg._clean) return cfg._raw;
  return JSON.stringify(cfg.data, null, opts.indent || 2);
}

/** Set a key (dotted) on a config, marking it dirty so it re-serializes. */
export function setConfigKey(cfg, dottedKey, value) {
  const parts = dottedKey.split('.');
  let cur = cfg.data;
  for (let i = 0; i < parts.length - 1; i++) cur = (cur[parts[i]] = cur[parts[i]] || {});
  cur[parts[parts.length - 1]] = value;
  cfg._clean = false;
  return cfg;
}

/**
 * The full `.obsidian/` config manager over a VaultAdapter. Loads each known file,
 * gives typed accessors, and writes back only changed files.
 */
export class ConfigManager {
  constructor(adapter, configDir = '.obsidian') { this.adapter = adapter; this.dir = configDir; this.configs = {}; }
  async load() {
    for (const f of CONFIG_FILES) {
      const path = this.dir + '/' + f;
      try { const text = await this.adapter.read(path); this.configs[f] = { data: JSON.parse(text), _raw: text, _clean: true }; }
      catch { /* missing file — leave undefined */ }
    }
    return this;
  }
  get(file) { return this.configs[file] && this.configs[file].data; }
  set(file, dottedKey, value) { if (!this.configs[file]) this.configs[file] = { data: {}, _raw: null, _clean: false }; setConfigKey(this.configs[file], dottedKey, value); return this; }
  async save() {
    for (const [f, cfg] of Object.entries(this.configs)) {
      if (cfg._clean) continue;
      if (this.adapter.write) await this.adapter.write(this.dir + '/' + f, serializeConfig(cfg));
      cfg._clean = true;
    }
  }
  enabledPlugins() { return (this.get('community-plugins.json')) || []; }
  isCorePluginEnabled(id) { const c = this.get('core-plugins.json'); return Array.isArray(c) ? c.includes(id) : !!(c && c[id]); }
  theme() { const a = this.get('appearance.json') || {}; return { mode: a.theme || 'obsidian', cssTheme: a.cssTheme || '', snippets: a.enabledCssSnippets || [] }; }
}

/**
 * Apply a theme's CSS variables to a root element (Obsidian sets vars on `body`/`:root`).
 * `vars` is { '--text-normal': '#222', ... }. Adds the `theme-dark|light` body class.
 */
export function applyThemeVars(rootEl, vars, mode = 'dark') {
  rootEl.classList.remove('theme-dark', 'theme-light');
  rootEl.classList.add(mode === 'light' ? 'theme-light' : 'theme-dark');
  for (const [k, v] of Object.entries(vars)) rootEl.style.setProperty(k, v);
  return rootEl;
}

/** Parse a theme.css `:root { --x: y; }` block into a vars object. */
export function parseThemeVars(css) {
  const vars = {};
  const root = css.match(/:root\s*\{([\s\S]*?)\}/);
  const body = root ? root[1] : css;
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

/** Toggle a CSS snippet on/off in appearance config (returns updated enabled list). */
export function toggleSnippet(cfg, name, enabled) {
  const a = cfg.data;
  const list = a.enabledCssSnippets || (a.enabledCssSnippets = []);
  const i = list.indexOf(name);
  if (enabled && i === -1) list.push(name);
  if (!enabled && i !== -1) list.splice(i, 1);
  cfg._clean = false;
  return list;
}

export { CONFIG_FILES };
