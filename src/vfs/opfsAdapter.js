// OPFS adapter — persistent browser storage with NO server, in EVERY modern browser
// (Chromium/Firefox/Safari), via the Origin Private File System. Unlike FSA it needs no
// folder picker and survives reloads; unlike FSA it is a browser-private sandbox (not
// the user's real folder), so pair it with import/export. Implements the VaultAdapter
// contract (see ./types.js). Same method shapes as fsaAdapter/memoryAdapter.

/** @returns {Promise<import('./types.js').VaultAdapter>} */
export async function opfsAdapter(opts = {}) {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.getDirectory) {
    throw new Error('OPFS unavailable (navigator.storage.getDirectory missing)');
  }
  const root = await navigator.storage.getDirectory();
  const subdir = opts.dir || ''; // optional namespace within OPFS
  const base = subdir ? await root.getDirectoryHandle(subdir, { create: true }) : root;

  async function* walk(dir, prefix = '') {
    for await (const [name, handle] of dir.entries()) {
      const p = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === 'directory') yield* walk(handle, p);
      else yield { path: p, handle };
    }
  }
  async function handleFor(path, create = false) {
    const parts = path.split('/');
    let dir = base;
    for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i], { create });
    return dir.getFileHandle(parts[parts.length - 1], { create });
  }

  return {
    name: 'opfs' + (subdir ? ':' + subdir : ''),
    capabilities: { write: true, watch: false, sync: false, persistent: true },
    async list() {
      const out = [];
      for await (const f of walk(base)) out.push(f.path);
      return out.sort();
    },
    async read(path) {
      const fh = await handleFor(path);
      return (await fh.getFile()).text();
    },
    async write(path, content) {
      const fh = await handleFor(path, true); // creates missing dirs + file
      const w = await fh.createWritable();
      await w.write(content);
      await w.close();
    },
    async remove(path) {
      const parts = path.split('/');
      let dir = base;
      for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i]);
      await dir.removeEntry(parts[parts.length - 1]);
    },
    async snapshot() {
      const files = {};
      for await (const f of walk(base)) files[f.path] = await (await f.handle.getFile()).text();
      return files;
    },
    /** Seed OPFS from a { path -> content } map (e.g. import a vault). */
    async importFiles(map) {
      for (const [p, c] of Object.entries(map)) await this.write(p, c);
    },
  };
}
