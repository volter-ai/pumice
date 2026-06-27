// Phase 9 — Notion read-into-VFS model. Notion's API returns a tree of pages with rich
// blocks; this maps that tree into the vault VFS as { path -> markdown } (read-only in
// v1). Writes raise a typed NotSupported error (the conflict/write story is deferred).
// The Notion HTTP client is injectable so the mapping is testable without network.

export class NotSupportedError extends Error { constructor(op) { super(op + ' is not supported by the Notion adapter (read-only in v1)'); this.name = 'NotSupportedError'; this.op = op; } }

// Convert a Notion block to a markdown line.
function blockToMarkdown(block) {
  const t = block.type;
  const rich = (block[t] && block[t].rich_text) || [];
  const text = rich.map((r) => {
    let s = r.plain_text != null ? r.plain_text : (r.text && r.text.content) || '';
    const a = r.annotations || {};
    if (a.code) s = '`' + s + '`';
    if (a.bold) s = '**' + s + '**';
    if (a.italic) s = '*' + s + '*';
    return s;
  }).join('');
  switch (t) {
    case 'heading_1': return '# ' + text;
    case 'heading_2': return '## ' + text;
    case 'heading_3': return '### ' + text;
    case 'bulleted_list_item': return '- ' + text;
    case 'numbered_list_item': return '1. ' + text;
    case 'to_do': return `- [${block.to_do && block.to_do.checked ? 'x' : ' '}] ` + text;
    case 'code': return '```' + ((block.code && block.code.language) || '') + '\n' + text + '\n```';
    case 'quote': return '> ' + text;
    case 'divider': return '---';
    default: return text;
  }
}

function pageTitle(page) {
  const props = page.properties || {};
  for (const k of Object.keys(props)) { const p = props[k]; if (p.type === 'title') return (p.title || []).map((r) => r.plain_text).join('') || 'Untitled'; }
  return page.title || 'Untitled';
}

/**
 * Read a Notion workspace (page tree) into a VFS snapshot.
 * `client` provides: listChildren(pageId) → [pages], getBlocks(pageId) → [blocks].
 * Returns a VaultAdapter whose snapshot is the mapped { path -> markdown }.
 */
export async function notionAdapter(client, rootPageIds, opts = {}) {
  const files = {};
  async function walk(pageId, prefix) {
    const page = await client.getPage(pageId);
    const title = pageTitle(page).replace(/[\\/:*?"<>|]/g, '-');
    const blocks = await client.getBlocks(pageId);
    const md = blocks.map(blockToMarkdown).join('\n');
    const path = (prefix ? prefix + '/' : '') + title + '.md';
    files[path] = md;
    const children = (await client.listChildren(pageId)) || [];
    for (const child of children) await walk(child.id, (prefix ? prefix + '/' : '') + title);
  }
  for (const id of rootPageIds) await walk(id, '');

  return {
    name: opts.name || 'notion',
    capabilities: { write: false, watch: false, sync: false, readonly: true },
    async list() { return Object.keys(files).sort(); },
    async read(p) { if (!(p in files)) throw new Error('ENOENT ' + p); return files[p]; },
    async snapshot() { return { ...files }; },
    async write() { throw new NotSupportedError('write'); },
    async remove() { throw new NotSupportedError('remove'); },
  };
}

export { blockToMarkdown, pageTitle };
