// Tag operations (the vault capability tag-wrangler's "rename tag" command drives).
// Renames a tag across every note: inline `#old` → `#new` (and nested `#old/x`), plus
// frontmatter `tags:` entries. Pure string logic; returns the changed { path -> content }.
import { splitFrontmatter } from '../vfs/links.js';

/**
 * Rename `from` → `to` across all notes. Matches the whole tag and nested children
 * (`#from/child` → `#to/child`), inline and in frontmatter. Returns { changes, count }
 * where changes is { path -> newContent } for files that actually changed.
 */
export function renameTag(files, from, to) {
  const f = from.replace(/^#/, ''), t = to.replace(/^#/, '');
  const changes = {};
  let count = 0;
  // inline: #from or #from/child, not #fromother — boundary is end or `/`
  const inlineRe = new RegExp('#' + escapeRe(f) + '(?=$|[\\s/#)\\].,;:!?])', 'g');
  for (const [path, content] of Object.entries(files)) {
    let next = content.replace(inlineRe, '#' + t);
    // frontmatter tags list
    const { frontmatter, body } = splitFrontmatter(content);
    if (frontmatter && frontmatter.tags != null) {
      const raw = String(frontmatter.tags);
      if (new RegExp('(^|[,\\s\\[])' + escapeRe(f) + '($|[,\\s\\]/])').test(raw)) {
        // rewrite the frontmatter block's tag tokens
        next = next.replace(/^(---\n[\s\S]*?\n---)/, (block) => block.replace(new RegExp('(^|[,\\s\\[])' + escapeRe(f) + '(?=$|[,\\s\\]/])', 'gm'), (m, pre) => pre + t));
      }
    }
    if (next !== content) { changes[path] = next; count++; }
  }
  return { changes, count };
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
