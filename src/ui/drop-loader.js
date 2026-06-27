// Drag-and-drop vault loader + published-vault viewer support.
//   filesToVault(files)      — turn dropped File objects into a { path -> content } map
//   publishedAdapter(snap)   — a read-only VaultAdapter over an embedded snapshot
//   readDataTransfer(dt)     — walk a DataTransfer (folder drop via webkitGetAsEntry)

/** Turn a FileList / File[] into { path -> content }, keeping folder structure when present. */
export async function filesToVault(files) {
  const out = {};
  for (const f of files) {
    const rel = (f.webkitRelativePath && f.webkitRelativePath.length ? f.webkitRelativePath : f.name).replace(/^\/+/, '');
    if (!/\.(md|markdown|canvas|base|json|css)$/i.test(rel)) continue;
    out[rel] = await f.text();
  }
  return out;
}

/** Recursively read a dropped folder via the (Chromium) webkitGetAsEntry API. */
export async function readDataTransfer(dt) {
  const out = {};
  const items = [...(dt.items || [])].map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
  async function walk(entry, prefix) {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      const rel = (prefix ? prefix + '/' : '') + entry.name;
      if (/\.(md|markdown|canvas|base|json|css)$/i.test(rel)) out[rel] = await file.text();
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const entries = await new Promise((res) => reader.readEntries(res));
      for (const e of entries) await walk(e, (prefix ? prefix + '/' : '') + entry.name);
    }
  }
  if (items.length) { for (const e of items) await walk(e, ''); return out; }
  // fallback: plain files
  if (dt.files && dt.files.length) return filesToVault(dt.files);
  return out;
}

/** Read-only VaultAdapter over an embedded snapshot — the published-vault viewer backend. */
export function publishedAdapter(snapshot) {
  const files = { ...snapshot };
  return {
    name: 'published',
    capabilities: { write: false, watch: false, sync: false, readonly: true },
    async list() { return Object.keys(files).sort(); },
    async read(p) { if (!(p in files)) throw new Error('ENOENT ' + p); return files[p]; },
    async snapshot() { return { ...files }; },
  };
}
