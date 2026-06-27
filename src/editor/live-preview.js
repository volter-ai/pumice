// Phase 2b — Live Preview decorations over CodeMirror 6. Obsidian's editing view hides
// markdown syntax markers (e.g. `**`, `==`, `[[ ]]`) and styles the content, but
// REVEALS the raw markers on whichever construct the cursor is in. This module is the
// decoration engine: a pure `buildDecorations(state)` that returns descriptors (easy to
// assert), and a real CM6 `ViewPlugin` that turns them into a live `DecorationSet`.
import { Decoration, ViewPlugin, WidgetType, EditorView } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

// Inline constructs with paired markers. Order matters: longer/earlier markers win so
// `**bold**` isn't mis-split as italic.
const INLINE = [
  { kind: 'strong', cls: 'cm-strong', re: /\*\*([^*\n]+)\*\*/g, mlen: 2 },
  { kind: 'em', cls: 'cm-em', re: /(?<!\*)\*(?!\*)([^*\n]+)(?<!\*)\*(?!\*)/g, mlen: 1 },
  { kind: 'strikethrough', cls: 'cm-strikethrough', re: /~~([^~\n]+)~~/g, mlen: 2 },
  { kind: 'highlight', cls: 'cm-highlight', re: /==([^=\n]+)==/g, mlen: 2 },
  { kind: 'inline-code', cls: 'cm-inline-code', re: /`([^`\n]+)`/g, mlen: 1 },
  { kind: 'math', cls: 'cm-math', re: /\$([^$\n]+)\$/g, mlen: 1 },
];

class CheckboxWidget extends WidgetType {
  constructor(checked) { super(); this.checked = checked; }
  eq(o) { return o.checked === this.checked; }
  toDOM() { const i = (globalThis.document).createElement('input'); i.type = 'checkbox'; i.className = 'task-list-item-checkbox'; if (this.checked) i.checked = true; return i; }
}
class LinkWidget extends WidgetType {
  constructor(target) { super(); this.target = target; }
  eq(o) { return o.target === this.target; }
  toDOM() { const a = (globalThis.document).createElement('a'); a.className = 'cm-link cm-internal-link'; a.textContent = this.target; a.dataset.target = this.target; return a; }
}

function selOverlaps(state, from, to) {
  return state.selection.ranges.some((r) => r.from <= to && r.to >= from);
}

/**
 * Build live-preview decoration descriptors for the current state.
 * Each descriptor: { from, to, type:'mark'|'replace'|'line'|'widget', class?, kind?, revealed? }
 * Markers (`replace` type) are hidden unless the cursor is within the construct (then
 * a `revealed:true` `mark` is emitted in their place so the raw syntax shows).
 */
export function buildDecorations(state) {
  const out = [];
  const doc = state.doc;
  for (let ln = 1; ln <= doc.lines; ln++) {
    const line = doc.line(ln);
    const text = line.text;
    // --- line-level: headings, lists, tasks ---
    const h = text.match(/^(#{1,6})\s+/);
    if (h) out.push({ from: line.from, to: line.from, type: 'line', class: `cm-header cm-header-${h[1].length}`, kind: 'heading', level: h[1].length });
    const task = text.match(/^(\s*[-*+]\s)\[([ xX])\]\s/);
    if (task) {
      const boxFrom = line.from + task[1].length;
      const revealed = selOverlaps(state, boxFrom, boxFrom + 3);
      out.push({ from: line.from, to: line.from, type: 'line', class: 'cm-task-line', kind: 'task' });
      if (!revealed) out.push({ from: boxFrom, to: boxFrom + 3, type: 'widget', kind: 'checkbox', checked: task[2].toLowerCase() === 'x' });
    } else if (/^\s*[-*+]\s/.test(text)) {
      out.push({ from: line.from, to: line.from, type: 'line', class: 'cm-list-line', kind: 'list' });
    }
    // --- inline paired markers ---
    const consumed = [];
    for (const spec of INLINE) {
      spec.re.lastIndex = 0; let m;
      while ((m = spec.re.exec(text))) {
        const from = line.from + m.index;
        const to = from + m[0].length;
        if (consumed.some(([a, b]) => from < b && to > a)) continue;
        consumed.push([from, to]);
        const cFrom = from + spec.mlen, cTo = to - spec.mlen;
        out.push({ from: cFrom, to: cTo, type: 'mark', class: spec.cls, kind: spec.kind });
        const revealed = selOverlaps(state, from, to);
        if (revealed) {
          out.push({ from, to: cFrom, type: 'mark', class: 'cm-formatting', kind: spec.kind + '-marker', revealed: true });
          out.push({ from: cTo, to, type: 'mark', class: 'cm-formatting', kind: spec.kind + '-marker', revealed: true });
        } else {
          out.push({ from, to: cFrom, type: 'replace', kind: spec.kind + '-marker' });
          out.push({ from: cTo, to, type: 'replace', kind: spec.kind + '-marker' });
        }
      }
    }
    // --- internal links [[target]] ---
    const lre = /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g; let lm;
    while ((lm = lre.exec(text))) {
      const from = line.from + lm.index, to = from + lm[0].length;
      const revealed = selOverlaps(state, from, to);
      if (revealed) out.push({ from, to, type: 'mark', class: 'cm-internal-link', kind: 'internal-link', revealed: true });
      else out.push({ from, to, type: 'widget', kind: 'internal-link', target: (lm[2] || lm[1]).trim(), block: false });
    }
    // --- tags #tag ---
    const tre = /(^|[\s(])#([A-Za-z][\w-]*(?:\/[\w-]+)*)/g; let tm;
    while ((tm = tre.exec(text))) {
      const from = line.from + tm.index + tm[1].length, to = from + 1 + tm[2].length;
      out.push({ from, to, type: 'mark', class: 'cm-hashtag', kind: 'tag' });
    }
  }
  out.sort((a, b) => a.from - b.from || (a.type === 'line' ? -1 : 1));
  return out;
}

// Map descriptors → a real CM6 DecorationSet.
function toDecorationSet(state) {
  const descs = buildDecorations(state);
  const builder = new RangeSetBuilder();
  // line + zero-length decorations first must still be added in from-order; RangeSetBuilder
  // requires sorted, non-decreasing starts which buildDecorations guarantees.
  for (const d of descs) {
    let deco;
    if (d.type === 'line') deco = Decoration.line({ class: d.class });
    else if (d.type === 'mark') deco = Decoration.mark({ class: d.class });
    else if (d.type === 'replace') deco = Decoration.replace({});
    else if (d.type === 'widget') deco = Decoration.replace({ widget: d.kind === 'checkbox' ? new CheckboxWidget(d.checked) : new LinkWidget(d.target) });
    if (deco) builder.add(d.from, d.type === 'line' ? d.from : d.to, deco);
  }
  return builder.finish();
}

/** The live-preview CM6 extension (recomputes on doc/selection change). */
export const livePreview = ViewPlugin.fromClass(
  class {
    constructor(view) { this.decorations = toDecorationSet(view.state); }
    update(u) { if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = toDecorationSet(u.view.state); }
  },
  { decorations: (v) => v.decorations },
);

export const _internal = { CheckboxWidget, LinkWidget, toDecorationSet };
