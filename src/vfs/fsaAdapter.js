// File System Access adapter — pure browser, NO server.
// Reads/writes a real local folder the user picks once. This is the "display
// layer over my actual vault, server-free" path. Chromium-only; for Firefox/
// Safari fall back to the HTTP adapter (the Vite server) or a drag-drop loader.

/** @returns {Promise<import('./types.js').VaultAdapter>} */
export async function pickFolderAdapter() {
  if (!('showDirectoryPicker' in window)) {
    throw new Error('File System Access API unavailable — use the served (HTTP) mode instead.');
  }
  const root = await window.showDirectoryPicker();

  async function* walk(dir, prefix = '') {
    for await (const [name, handle] of dir.entries()) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === 'directory') yield* walk(handle, path);
      else if (name.toLowerCase().endsWith('.md')) yield { path, handle };
    }
  }
  // `create` true (for writes) auto-creates missing parent directories, matching the
  // node-fs adapter's `mkdir({recursive:true})`. Without it, writing `Inbox/2026/n.md`
  // into a vault lacking those folders threw — the bug that made write() unusable.
  async function handleFor(path, create = false) {
    const parts = path.split('/');
    let dir = root;
    for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i], { create });
    return dir.getFileHandle(parts[parts.length - 1], { create });
  }

  return {
    name: 'fsa:' + root.name,
    capabilities: { write: true, watch: false, sync: false },
    async list() {
      const out = [];
      for await (const f of walk(root)) out.push(f.path);
      return out;
    },
    async read(path) {
      return (await (await handleFor(path)).getFile()).text();
    },
    async write(path, content) {
      const fh = await handleFor(path, true); // create missing parent dirs + file
      const w = await fh.createWritable();
      await w.write(content);
      await w.close();
    },
    async snapshot() {
      const files = {};
      for await (const f of walk(root)) files[f.path] = await (await f.handle.getFile()).text();
      return files;
    },
  };
}
