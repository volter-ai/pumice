# SDK.md — embedding Pumice in your own app

`pumice-md` ships as a library (ESM, with `exports` subpaths + `.d.ts`). Three common
integrations:

## 1. Render Obsidian markdown to the DOM

```js
import { renderMarkdown } from 'pumice-md/render';
const el = document.createElement('div');
renderMarkdown('# Hi\n[[Link]] ==hl== > [!note] callout', el, { resolve: (n) => `/notes/${n}` });
document.body.append(el);
```
Pure renderer — callouts, wikilinks, embeds, math, mermaid, tags, footnotes, tasks.
Pass `postProcessors: [(el, ctx) => …]` to run Obsidian-style post-processors.

## 2. Embed the plugin runtime + run a real community plugin

```js
import { setupPluginHost } from 'pumice-md/sdk';
import { memoryAdapter } from 'pumice-md';
import * as cmState from '@codemirror/state'; // real externals plugins may need

const host = await setupPluginHost(memoryAdapter({ 'Note.md': '# Hello' }), {
  externals: { '@codemirror/state': cmState /* …@codemirror/view etc. */ },
});
await host.loadPlugin('emoji-shortcodes', pluginBundleSource);
host.app.vault.getMarkdownFiles(); // the vault the plugin sees
```
`setupPluginHost` installs the DOM extensions + globals, creates the app over your
adapter, and returns `{ app, loadPlugin, renderMarkdown, obsidian }`. No tribal knowledge.

## 3. Bring your own storage (custom VaultAdapter)

Implement the [`VaultAdapter`](./src/vfs/types.d.ts) interface (required: `name`,
`capabilities`, `list`, `read`, `snapshot`; optional capability-gated `write`/`remove`/
`rename`/`stat`/`mkdir`/`watch`) and pass it anywhere an adapter is expected:

```js
const s3Adapter = {
  name: 's3', capabilities: { write: true },
  async list() { /* … */ }, async read(p) { /* … */ },
  async write(p, c) { /* … */ }, async snapshot() { /* … */ },
};
const host = await setupPluginHost(s3Adapter);
```
Run it through the shared conformance suite (`scripts/test-adapters.mjs`) to verify.

## Agent / MCP

- In-process: `createVaultCore`, `createMcpServer`, `createRestHandler` (`pumice-md/mcp`).
- Real MCP server (stdio JSON-RPC, for Claude Desktop etc.): `node bin/pumice-mcp.mjs`.
- Real REST + static server: `node bin/pumice-server.mjs`.

## Storage backends included

`memoryAdapter` (demo), `opfsAdapter` (persistent, all browsers, no server),
`pickFolderAdapter` (Chromium real folder), `httpAdapter` (server), `gitAdapter`,
`notionAdapter` (read-only), `publishedAdapter` (read-only embedded snapshot),
plus the native `desktopAdapter` (Tauri).
