// Pure, dependency-free vault logic shared by BOTH the browser and the Node server.
// Keeping this isomorphic is what lets the same search/backlink/graph behavior run
// client-side (no server) or server-side (agent API) without duplication.

const WIKILINK = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;

/** basename without extension, used to resolve [[Note Name]] -> path */
export function noteName(path) {
  const base = path.split('/').pop() || path;
  return base.replace(/\.md$/i, '');
}

/** Extract outgoing wikilink targets (by note name) from markdown content. */
export function parseLinks(content) {
  const out = [];
  let m;
  WIKILINK.lastIndex = 0;
  while ((m = WIKILINK.exec(content)) !== null) out.push(m[1].trim());
  return out;
}

/** Strip YAML frontmatter, returning { frontmatter, body }. */
export function splitFrontmatter(content) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(content);
  if (!m) return { frontmatter: {}, body: content };
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([^:]+):\s*(.*)$/.exec(line);
    if (kv) fm[kv[1].trim()] = kv[2].trim();
  }
  return { frontmatter: fm, body: content.slice(m[0].length) };
}

/**
 * Build the link graph from a map of { path -> content }.
 * Returns { nodes:[{id,path,name}], links:[{source,target}] }.
 */
export function buildGraph(files) {
  const byName = new Map();
  for (const path of Object.keys(files)) byName.set(noteName(path).toLowerCase(), path);

  const nodes = Object.keys(files).map((path) => ({
    id: path,
    path,
    name: noteName(path),
  }));

  const links = [];
  for (const [path, content] of Object.entries(files)) {
    for (const target of parseLinks(content)) {
      const tgtPath = byName.get(target.toLowerCase());
      if (tgtPath && tgtPath !== path) links.push({ source: path, target: tgtPath });
    }
  }
  return { nodes, links };
}

/** All notes that link TO `path`. */
export function backlinks(files, path) {
  const target = noteName(path).toLowerCase();
  const out = [];
  for (const [p, content] of Object.entries(files)) {
    if (p === path) continue;
    if (parseLinks(content).some((t) => t.toLowerCase() === target)) out.push(p);
  }
  return out;
}

/**
 * Agent-friendly search with fielded queries: `tag:foo`, `path:bar`, and free text.
 * `files` is { path -> content }. Returns [{ path, score, snippet }].
 */
export function search(files, query) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const fields = { tag: [], path: [], text: [] };
  for (const t of terms) {
    if (t.startsWith('tag:')) fields.tag.push(t.slice(4));
    else if (t.startsWith('path:')) fields.path.push(t.slice(5));
    else fields.text.push(t);
  }
  const results = [];
  for (const [path, content] of Object.entries(files)) {
    const lc = content.toLowerCase();
    const lp = path.toLowerCase();
    // Tags come from inline #hashtags AND frontmatter `tags:` (comma/space list).
    const { frontmatter } = splitFrontmatter(content);
    const fmTags = String(frontmatter.tags || '')
      .toLowerCase()
      .split(/[,\s]+/)
      .filter(Boolean);
    const hasTag = (tag) => lc.includes('#' + tag) || fmTags.includes(tag);
    if (!fields.path.every((p) => lp.includes(p))) continue;
    if (!fields.tag.every(hasTag)) continue;
    let score = 0;
    let idx = -1;
    for (const t of fields.text) {
      const at = lc.indexOf(t);
      if (at === -1) { score = -1; break; }
      score += 1;
      if (idx === -1) idx = at;
    }
    if (score < 0) continue;
    score += fields.tag.length + fields.path.length;
    const snippet = idx >= 0 ? content.slice(Math.max(0, idx - 40), idx + 80).replace(/\n/g, ' ') : '';
    results.push({ path, score, snippet });
  }
  return results.sort((a, b) => b.score - a.score);
}
