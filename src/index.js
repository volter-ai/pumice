// Public package entry for pumice-md. Re-exports the stable SDK surface so a host app
// can `import { renderMarkdown, setupPluginHost, memoryAdapter } from 'pumice-md'`.
// Sub-path exports (./render, ./vfs, ./sdk, ./mcp, ./search) are in package.json.
export { renderMarkdown, renderToString } from './render/obsidian-markdown.js';
export { setupPluginHost, installPumiceGlobals, createApp, activatePlugin, loadPluginSource, installDomExtensions } from './sdk/index.js';
export * as obsidian from './obsidian/api.js';
export { memoryAdapter } from './vfs/memoryAdapter.js';
export { httpAdapter } from './vfs/httpAdapter.js';
export { opfsAdapter } from './vfs/opfsAdapter.js';
export { pickFolderAdapter } from './vfs/fsaAdapter.js';
export { gitAdapter } from './vfs/gitAdapter.js';
export { notionAdapter } from './vfs/notionAdapter.js';
// Search + graph visualization are delivered by REAL Obsidian plugins (omnisearch,
// 3D-graph) running on the shim — not Pumice-built. Host VFS-core search/tag/link
// primitives (for the agent/MCP surface) live in vfs/links.js.
export { buildGraph, backlinks, tagIndex, search, parseLinks, splitFrontmatter, noteName } from './vfs/links.js';
export { parseCanvas, serializeCanvas, renderCanvas } from './canvas/canvas.js';
export { parseBase, evaluateView, renderTableView, renderCardsView } from './bases/bases.js';
export { parseProperties, serializeProperties, processFrontMatter } from './core/properties.js';
export { createVaultCore, createMcpServer, createRestHandler, memoryStore } from './mcp/server.js';
