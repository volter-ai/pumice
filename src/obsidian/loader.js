// Plugin loader — evaluates an UNMODIFIED Obsidian plugin's main.js.
// Real plugins are bundled to CommonJS that does `require('obsidian')` and sets
// `module.exports`. We provide that contract: a `require` that returns our shim (plus
// any real externals the host provides, e.g. @codemirror/*), then instantiate the
// exported Plugin subclass against an App over the VFS and register it like Obsidian.
import * as obsidian from './api.js';

// Permissive proxy for unknown requires (the documented capability-walled libs). It
// no-ops gracefully so a plugin that touches an absent lib during onload doesn't crash.
function universal(label) {
  const f = function () { return universal(label); };
  return new Proxy(f, { get: (_t, k) => (k === 'then' ? undefined : universal(label)), apply: () => universal(label), construct: () => universal(label) });
}

/**
 * Evaluate a plugin bundle and construct its Plugin instance.
 * @param {{app, manifest, source, externals?:object, permissive?:boolean}} o
 *   externals: { '@codemirror/state': mod, … } real modules to resolve by name.
 *   permissive (default true): unknown requires get a no-op proxy instead of throwing.
 */
export function loadPluginSource({ app, manifest, source, externals = {}, permissive = true }) {
  const module = { exports: {} };
  const exports = module.exports;
  const require = (name) => {
    if (name === 'obsidian') return obsidian;
    if (externals[name]) return externals[name];
    if (permissive) return universal(name);
    throw new Error(`[pumice] plugin "${manifest.id}" requires "${name}", which the browser sandbox cannot provide`);
  };
  const win = typeof window !== 'undefined' ? window : undefined;
  const doc = typeof document !== 'undefined' ? document : undefined;
  // eslint-disable-next-line no-new-func
  const fn = new Function('module', 'exports', 'require', 'process', 'app', 'window', 'document', source);
  fn(module, exports, require, { platform: 'web', env: {} }, app, win, doc);

  const PluginClass = module.exports.default || module.exports;
  if (typeof PluginClass !== 'function') {
    throw new Error(`[pumice] plugin "${manifest.id}" did not export a Plugin class`);
  }
  return new PluginClass(app, manifest);
}

export async function activatePlugin({ app, manifest, source, externals = {}, permissive = true }) {
  const instance = loadPluginSource({ app, manifest, source, externals, permissive });
  // Obsidian registers the instance in app.plugins before calling onload (plugins read it).
  if (app.plugins && app.plugins.plugins) { app.plugins.plugins[manifest.id] = instance; app.plugins.enabledPlugins && app.plugins.enabledPlugins.add(manifest.id); }
  await instance.onload();
  return {
    manifest,
    instance,
    commands: instance._commands,
    ribbon: instance._ribbon,
    settingTabs: instance._settingTabs,
  };
}
