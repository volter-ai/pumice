// Phase 12 — Agent-native MCP surface. One set of vault capabilities (read/write/
// search/backlinks/graph/list) exposed identically through three surfaces: direct UI
// calls, a REST handler, and MCP tool calls. All three delegate to the SAME core, so a
// parity test proves an agent gets the same answers however it reaches in.
// Search/tag indexing are host VFS-core primitives (links.js) — the agent surface, not
// the user-facing omnisearch plugin.
import { search as vfsSearch, backlinks as backlinksOf, buildGraph, tagIndex, noteName } from '../vfs/links.js';

/**
 * Core vault capabilities over a live { path -> content } store (via `store`, which
 * exposes get()/set()). Every surface calls these — single source of truth.
 */
export function createVaultCore(store) {
  return {
    list() { return Object.keys(store.get()).sort(); },
    read({ path }) { const f = store.get(); if (!(path in f)) throw new Error('not found: ' + path); return { path, content: f[path] }; },
    write({ path, content }) { store.set(path, content); return { path, written: content.length }; },
    search({ query }) { return vfsSearch(store.get(), query).map((r) => ({ path: r.path, name: noteName(r.path) })); },
    backlinks({ path }) { return backlinksOf(store.get(), path).sort(); },
    graph() { const g = buildGraph(store.get()); return { nodes: g.nodes.length, links: g.links.length, edges: g.links }; },
    tags() { return tagIndex(store.get()); },
  };
}

// Tool schemas (MCP-style). Read-path tools are always available; write is gated.
const TOOLS = [
  { name: 'vault_list', description: 'List all note paths', input: {} },
  { name: 'vault_read', description: 'Read a note', input: { path: 'string' } },
  { name: 'vault_write', description: 'Write a note', input: { path: 'string', content: 'string' }, write: true },
  { name: 'vault_search', description: 'Search notes (Obsidian operators)', input: { query: 'string' } },
  { name: 'vault_backlinks', description: 'Backlinks to a note', input: { path: 'string' } },
  { name: 'vault_graph', description: 'Graph node/link summary', input: {} },
];

/** MCP server: listTools + callTool, delegating to the core. `allowWrite` gates writes. */
export function createMcpServer(core, opts = {}) {
  const allowWrite = !!opts.allowWrite;
  const map = { vault_list: () => core.list(), vault_read: (a) => core.read(a), vault_write: (a) => core.write(a), vault_search: (a) => core.search(a), vault_backlinks: (a) => core.backlinks(a), vault_graph: () => core.graph() };
  return {
    listTools() { return TOOLS.filter((t) => allowWrite || !t.write).map((t) => ({ name: t.name, description: t.description, input: t.input })); },
    async callTool(name, args = {}) {
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) throw new Error('unknown tool: ' + name);
      if (tool.write && !allowWrite) throw new Error('tool ' + name + ' is read-only in this scope');
      return map[name](args);
    },
  };
}

/** REST handler over the same core: { method, path, query, body } → result. */
export function createRestHandler(core, opts = {}) {
  const allowWrite = !!opts.allowWrite;
  return async function handle({ method = 'GET', path = '/', query = {}, body = {} }) {
    if (method === 'GET' && path === '/notes') return core.list();
    if (method === 'GET' && path === '/note') return core.read({ path: query.path });
    if (method === 'PUT' && path === '/note') { if (!allowWrite) throw new Error('writes disabled'); return core.write({ path: query.path || body.path, content: body.content }); }
    if (method === 'GET' && path === '/search') return core.search({ query: query.q });
    if (method === 'GET' && path === '/backlinks') return core.backlinks({ path: query.path });
    if (method === 'GET' && path === '/graph') return core.graph();
    throw new Error('404 ' + method + ' ' + path);
  };
}

/** Simple in-memory store backed by a files object. */
export function memoryStore(files = {}) { const f = { ...files }; return { get() { return f; }, set(p, c) { f[p] = c; } }; }
