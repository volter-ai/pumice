// Real MetadataCache parsing — produces Obsidian-shaped `CachedMetadata` so that the
// genuine community plugins (Dataview, Tasks, mind-map, …) get the data they actually
// read, not empty stubs. This is host/shim code (the clean-room MetadataCache), NOT a
// feature plugin: it mirrors what Obsidian's own metadata layer exposes.
//
// Shapes mirror https://docs.obsidian.md/Reference/TypeScript+API/CachedMetadata :
//   frontmatter, frontmatterPosition, headings[], sections[], listItems[], tags[],
//   links[], embeds[], blocks{}. Every item carries a {start,end} position with
//   {line,col,offset} so plugins that index by line (Tasks, Dataview) work.

import * as yaml from 'js-yaml';

const WIKILINK = /(!?)\[\[([^\]]+?)\]\]/g; // group1 '!' = embed; group2 = inner
const MD_LINK = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;
const TAG = /(^|[\s(])#([A-Za-zÀ-￿][\w/À-￿-]*)/g;

function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}
function locAt(offset, starts) {
  // binary search the line containing offset
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= offset) lo = mid; else hi = mid - 1; }
  return { line: lo, col: offset - starts[lo], offset };
}
function pos(start, end, starts) { return { start: locAt(start, starts), end: locAt(end, starts) }; }

/** Split frontmatter, returning { data, body, bodyOffset, raw }. */
export function extractFrontmatter(content) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!m) return { data: null, body: content, bodyOffset: 0, raw: null };
  let data = null;
  try { data = yaml.load(m[1]) || {}; } catch { data = {}; }
  if (typeof data !== 'object' || Array.isArray(data)) data = {};
  return { data, body: content.slice(m[0].length), bodyOffset: m[0].length, raw: m[1] };
}

function normalizeTag(t) { return t.startsWith('#') ? t : '#' + t; }

/** Pull tags out of a frontmatter value (string | string[] | nested). */
export function frontmatterTags(fm) {
  if (!fm) return [];
  const raw = fm.tags ?? fm.tag ?? [];
  const arr = Array.isArray(raw) ? raw : String(raw).split(/[,\s]+/);
  return arr.map((t) => String(t).trim()).filter(Boolean).map(normalizeTag);
}

/** Parse one note's content into Obsidian `CachedMetadata`. */
export function parseMetadata(content) {
  const starts = lineStarts(content);
  const { data: frontmatter, bodyOffset } = extractFrontmatter(content);

  const headings = [];
  const sections = [];
  const listItems = [];
  const tags = [];
  const links = [];
  const embeds = [];
  const blocks = {};

  // Frontmatter position (line 0..n of the --- block)
  let frontmatterPosition = null;
  if (bodyOffset > 0) frontmatterPosition = pos(0, bodyOffset, starts);

  // Headings
  const headingRe = /^(#{1,6})\s+(.*?)\s*$/gm;
  let hm;
  while ((hm = headingRe.exec(content)) !== null) {
    if (hm.index < bodyOffset) continue; // skip inside frontmatter
    headings.push({ heading: hm[2], level: hm[1].length, position: pos(hm.index, hm.index + hm[0].length, starts) });
  }

  // List items + tasks (Tasks/Dataview depend on this)
  const lines = content.split('\n');
  let lineOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lm = /^(\s*)([-*+]|\d+[.)])\s+(\[(.)\]\s+)?/.exec(line);
    if (lm && lineOffset >= bodyOffset) {
      const startOff = lineOffset + lm[1].length;
      const item = { position: pos(startOff, lineOffset + line.length, starts), parent: -1 };
      if (lm[3] !== undefined) item.task = lm[4]; // ' ' for open, 'x' for done, etc.
      listItems.push(item);
    }
    lineOffset += line.length + 1;
  }

  // Inline tags
  let tm;
  TAG.lastIndex = 0;
  while ((tm = TAG.exec(content)) !== null) {
    if (tm.index < bodyOffset) continue;
    const at = tm.index + tm[1].length;
    tags.push({ tag: normalizeTag(tm[2]), position: pos(at, at + tm[2].length + 1, starts) });
  }
  // NOTE: Obsidian's `cache.tags` holds ONLY inline tags (with real positions).
  // Frontmatter tags live in `cache.frontmatter.tags` and are surfaced via getTags()/
  // getAllTags() — NOT here. (tag-wrangler's rename slice-guard breaks on a block-wide
  // frontmatter tag entry, so we keep them out of `.tags`.)

  // Links + embeds (wikilink)
  let wm;
  WIKILINK.lastIndex = 0;
  while ((wm = WIKILINK.exec(content)) !== null) {
    if (wm.index < bodyOffset) continue;
    const inner = wm[2];
    const [linkPart, display] = inner.split('|');
    const link = linkPart.trim();
    const entry = { link, original: wm[0].slice(wm[1].length), displayText: (display || linkPart).trim(), position: pos(wm.index, wm.index + wm[0].length, starts) };
    (wm[1] === '!' ? embeds : links).push(entry);
    const blockM = /#\^([\w-]+)$/.exec(link);
    if (blockM) blocks[blockM[1]] = { position: entry.position, id: blockM[1] };
  }
  // Markdown links/embeds
  let mm;
  MD_LINK.lastIndex = 0;
  while ((mm = MD_LINK.exec(content)) !== null) {
    if (mm.index < bodyOffset) continue;
    const entry = { link: mm[3].trim(), original: mm[0].slice(mm[1].length), displayText: mm[2], position: pos(mm.index, mm.index + mm[0].length, starts) };
    (mm[1] === '!' ? embeds : links).push(entry);
  }

  // Sections (coarse: one per non-empty block separated by blank lines)
  const sectRe = /[^\n]+(?:\n[^\n]+)*/g;
  let sm;
  while ((sm = sectRe.exec(content)) !== null) {
    if (sm.index + sm[0].length <= bodyOffset) continue;
    const text = sm[0];
    let type = 'paragraph';
    if (/^#{1,6}\s/.test(text)) type = 'heading';
    else if (/^(\s*)([-*+]|\d+[.)])\s/.test(text)) type = 'list';
    else if (/^>/.test(text)) type = 'blockquote';
    else if (/^```/.test(text)) type = 'code';
    sections.push({ type, position: pos(sm.index, sm.index + sm[0].length, starts) });
  }

  const cache = { headings, sections, listItems, tags, links, embeds, blocks };
  if (frontmatter) cache.frontmatter = frontmatter;
  if (frontmatterPosition) cache.frontmatterPosition = frontmatterPosition;
  return cache;
}

/**
 * Build the vault-wide link index Obsidian exposes as `resolvedLinks` /
 * `unresolvedLinks`: { [sourcePath]: { [destPathOrName]: count } }.
 * `resolve(linkpath, sourcePath)` returns a destination path or null.
 */
export function buildLinkIndex(caches, resolve) {
  const resolved = {};
  const unresolved = {};
  for (const [srcPath, cache] of Object.entries(caches)) {
    resolved[srcPath] = resolved[srcPath] || {};
    unresolved[srcPath] = unresolved[srcPath] || {};
    const all = [...(cache.links || []), ...(cache.embeds || [])];
    for (const l of all) {
      const target = l.link.replace(/#.*$/, '').trim();
      if (!target) continue;
      const dest = resolve(target, srcPath);
      const bucket = dest ? resolved[srcPath] : unresolved[srcPath];
      const key = dest || target;
      bucket[key] = (bucket[key] || 0) + 1;
    }
  }
  return { resolved, unresolved };
}
