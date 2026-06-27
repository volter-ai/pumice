// Note composer (Phase 4-rest): split a note at a heading into a new note (leaving a
// link or embed behind), merge two notes, and extract a selection into a new note.
// Isomorphic, pure string logic — file writes are the caller's job via the adapter.
import { noteName } from '../vfs/links.js';

/**
 * Split `content` at the section beginning with `headingText` (first match). Returns
 * { kept, extracted, heading } where `extracted` is the heading + its body up to the
 * next heading of the same-or-higher level, and `kept` has that section replaced with
 * a reference (`link` default, or `embed`).
 */
export function splitAtHeading(content, headingText, opts = {}) {
  const ref = opts.ref || 'link';            // 'link' | 'embed' | 'none'
  const newName = opts.newName || headingText;
  const lines = content.split('\n');
  let start = -1, level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (m && m[2].trim() === headingText.trim()) { start = i; level = m[1].length; break; }
  }
  if (start === -1) return { kept: content, extracted: null, heading: null };
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+/);
    if (m && m[1].length <= level) { end = i; break; }
  }
  const extracted = lines.slice(start, end).join('\n').replace(/\n+$/, '') + '\n';
  const refLine = ref === 'embed' ? `![[${newName}]]` : ref === 'link' ? `[[${newName}]]` : '';
  const keptLines = [...lines.slice(0, start), ...(refLine ? [refLine] : []), ...lines.slice(end)];
  return { kept: keptLines.join('\n').replace(/\n{3,}/g, '\n\n'), extracted, heading: headingText };
}

/**
 * Merge `sourceContent` into `targetContent`. Default appends with a separating blank
 * line; `opts.heading` wraps the merged content under a new heading.
 */
export function mergeNotes(targetContent, sourceContent, opts = {}) {
  const src = opts.heading ? `\n## ${opts.heading}\n${sourceContent.trim()}\n` : `\n${sourceContent.trim()}\n`;
  return targetContent.replace(/\n*$/, '\n') + src;
}

/**
 * Extract the line-range [from, to) of `content` into a new note, replacing it in the
 * original with a link/embed to `newName`. Returns { kept, extracted }.
 */
export function extractRange(content, from, to, opts = {}) {
  const ref = opts.ref || 'link';
  const newName = opts.newName || 'Untitled';
  const lines = content.split('\n');
  const extracted = lines.slice(from, to).join('\n').replace(/\n+$/, '') + '\n';
  const refLine = ref === 'embed' ? `![[${newName}]]` : `[[${newName}]]`;
  const keptLines = [...lines.slice(0, from), refLine, ...lines.slice(to)];
  return { kept: keptLines.join('\n'), extracted };
}

/** Suggested path for an extracted note, beside its source. */
export function extractedNotePath(sourcePath, newName) {
  const dir = sourcePath.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/') + 1) : '';
  return dir + newName.replace(/[\\/:*?"<>|]/g, '-') + '.md';
}

export { noteName };
