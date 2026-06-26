// The VaultAdapter interface — the single seam that makes storage pluggable.
// Every backend (local folder, this Vite server, git, Notion, Drive…) implements
// this shape. The renderer/graph never know which one they're talking to.
//
// @typedef {Object} Capabilities
// @property {boolean} write   can persist changes
// @property {boolean} watch   can notify on external changes (else: poll)
// @property {boolean} sync    backing store is shared/syncable across clients
//
// @typedef {Object} VaultAdapter
// @property {string} name
// @property {Capabilities} capabilities
// @property {() => Promise<string[]>}            list      markdown paths
// @property {(path:string) => Promise<string>}   read
// @property {(path:string, content:string) => Promise<void>} [write]
// @property {() => Promise<Record<string,string>>} snapshot  all files (for graph/search)
//
// Adapters declare capabilities so the UI degrades gracefully: a read-only
// backend simply omits `write`, and the editor affordances hide themselves.

export const EMPTY = {};
