// Plugin loader — evaluates an UNMODIFIED Obsidian plugin's main.js.
// Real plugins are bundled to CommonJS that does `require('obsidian')` and sets
// `module.exports`. We provide that contract: a `require` that returns our shim,
// then instantiate the exported Plugin subclass against an App over the VFS.

import * as obsidian from './api.js';

export function loadPluginSource({ app, manifest, source }) {
  const module = { exports: {} };
  const exports = module.exports;

  // The capability boundary, made explicit: only `obsidian` resolves. A plugin
  // that `require('fs')` / `require('child_process')` fails loudly here rather
  // than silently — that's the honest subset.
  const require = (name) => {
    if (name === 'obsidian') return obsidian;
    throw new Error(
      `[uicommons] plugin "${manifest.id}" requires "${name}", which the browser sandbox cannot provide`,
    );
  };

  // eslint-disable-next-line no-new-func
  const fn = new Function('module', 'exports', 'require', 'process', source);
  fn(module, exports, require, { platform: 'web', env: {} });

  const PluginClass = module.exports.default || module.exports;
  if (typeof PluginClass !== 'function') {
    throw new Error(`[uicommons] plugin "${manifest.id}" did not export a Plugin class`);
  }
  const instance = new PluginClass(app, manifest);
  return instance;
}

export async function activatePlugin({ app, manifest, source }) {
  const instance = loadPluginSource({ app, manifest, source });
  await instance.onload();
  return {
    manifest,
    instance,
    commands: instance._commands,
    ribbon: instance._ribbon,
    settingTabs: instance._settingTabs,
  };
}
