// In-memory VaultAdapter — the simplest backing store. Trivial, but it's the
// fixture backend for the compat harness and Playwright tests (no disk, no server),
// and it proves the VaultAdapter interface is honored by a non-fs backend.

/** @param {Record<string,string>} [seed] initial path -> content */
export function memoryAdapter(seed = {}) {
  const files = new Map(Object.entries(seed));
  return {
    name: 'memory',
    capabilities: { write: true, watch: false, sync: false },
    async list() {
      return [...files.keys()].sort();
    },
    async read(path) {
      if (!files.has(path)) throw new Error(`no such file: ${path}`);
      return files.get(path);
    },
    async write(path, content) {
      files.set(path, content);
    },
    async snapshot() {
      return Object.fromEntries(files);
    },
  };
}
