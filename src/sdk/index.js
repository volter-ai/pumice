// Pumice SDK — the public entrypoint for embedding the Obsidian-compatible runtime in
// your own app. Wraps the boot ritual (DOM extensions, globals, CodeMirror externals,
// createApp, plugin loading) behind one call, so a host dev doesn't reverse-engineer
// the workbench. See SDK.md.
import { installDomExtensions } from '../obsidian/dom.js';
import * as obsidian from '../obsidian/api.js';
import { createApp } from '../obsidian/runtime.js';
import { loadPluginSource, activatePlugin } from '../obsidian/loader.js';
import { renderMarkdown } from '../render/obsidian-markdown.js';

/** Install the globals Obsidian's runtime exposes that plugins reference bare. */
export function installPumiceGlobals(win = globalThis.window, externals = {}) {
  installDomExtensions(win);
  win.moment = obsidian.moment;
  win.activeWindow = win;
  win.activeDocument = win.document;
  if (!win.CodeMirror) win.CodeMirror = { defineMode() {}, defineMIME() {}, defineSimpleMode() {}, defineOption() {}, registerHelper() {}, modes: {}, mimeModes: {}, commands: {}, keyMap: { default: {} }, Pos: (line, ch) => ({ line, ch }), getMode() { return { name: 'null' }; }, startState() { return {}; }, copyState(s) { return s; }, innerMode(m, s) { return { mode: m, state: s }; }, Vim: { defineOption() {}, map() {} } };
  if (!win.CodeMirrorAdapter) win.CodeMirrorAdapter = { commands: {}, Pos: win.CodeMirror.Pos, keymap: {}, defineMode() {}, e_stop() {}, on() {}, off() {} };
  return win;
}

/**
 * Create a ready-to-use plugin host over a VaultAdapter.
 * @param {import('../vfs/types.d.ts').VaultAdapter} adapter
 * @param {object} [opts] { window, externals: {'@codemirror/state': mod, …}, renderMarkdown }
 * @returns {Promise<{ app, obsidian, loadPlugin, renderMarkdown }>}
 */
export async function setupPluginHost(adapter, opts = {}) {
  const win = opts.window || globalThis.window;
  if (win) installPumiceGlobals(win, opts.externals);
  const render = opts.renderMarkdown || ((md, el, o) => renderMarkdown(md, el, o));
  const app = await createApp(adapter, async (md) => md);
  obsidian.MarkdownRenderer._renderEl = (md, el, sp) => render(md, el, { sourcePath: sp });
  const externals = opts.externals || {};
  return {
    app,
    obsidian,
    renderMarkdown: render,
    /** Load + activate an Obsidian community plugin from its bundle source. */
    async loadPlugin(id, source, manifest = {}) {
      const m = { id, name: id, version: '0.0.0', minAppVersion: '1.0.0', ...manifest };
      // resolve real externals (@codemirror/*) through a require the loader honors
      return activatePlugin({ app, manifest: m, source, externals });
    },
  };
}

export { createApp, loadPluginSource, activatePlugin, installDomExtensions, renderMarkdown, obsidian };
