// Phase 2a — source-mode editor + Obsidian `Editor` API over a real CodeMirror 6
// EditorView. Plugins use `editor.getValue()/replaceSelection()/getCursor()` etc. and
// reach `editor.cm` for the raw view. Backed by a live CM6 instance so editor-extension
// plugins (which pass `@codemirror/*` extensions) operate on the real thing.
import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';

// Obsidian EditorPosition {line, ch} ↔ CM6 absolute offset.
function posToOffset(state, pos) {
  const line = state.doc.line(Math.min(Math.max(pos.line + 1, 1), state.doc.lines));
  return Math.min(line.from + Math.max(pos.ch, 0), line.to);
}
function offsetToPos(state, offset) {
  const line = state.doc.lineAt(Math.min(Math.max(offset, 0), state.doc.length));
  return { line: line.number - 1, ch: offset - line.from };
}

export class Editor {
  /** @param {HTMLElement} parent  @param {object} [opts] { doc, extensions } */
  constructor(parent, opts = {}) {
    const extensions = [history(), keymap.of([...defaultKeymap, ...historyKeymap]), ...(opts.extensions || [])];
    this.cm = new EditorView({ state: EditorState.create({ doc: opts.doc || '', extensions }), parent });
  }
  get state() { return this.cm.state; }
  // --- content ---
  getValue() { return this.cm.state.doc.toString(); }
  setValue(v) { this.cm.dispatch({ changes: { from: 0, to: this.cm.state.doc.length, insert: v } }); }
  getLine(n) { return this.cm.state.doc.line(n + 1).text; }
  setLine(n, text) { const l = this.cm.state.doc.line(n + 1); this.cm.dispatch({ changes: { from: l.from, to: l.to, insert: text } }); }
  lineCount() { return this.cm.state.doc.lines; }
  lastLine() { return this.cm.state.doc.lines - 1; }
  // --- selection / cursor ---
  getCursor(which = 'head') { const r = this.cm.state.selection.main; return offsetToPos(this.cm.state, which === 'from' ? r.from : which === 'to' ? r.to : which === 'anchor' ? r.anchor : r.head); }
  setCursor(line, ch) { const pos = typeof line === 'object' ? line : { line, ch: ch || 0 }; const off = posToOffset(this.cm.state, pos); this.cm.dispatch({ selection: { anchor: off } }); }
  setSelection(anchor, head) { this.cm.dispatch({ selection: { anchor: posToOffset(this.cm.state, anchor), head: posToOffset(this.cm.state, head || anchor) } }); }
  // Multi-cursor selection list (outliner reads/writes these).
  listSelections() { return this.cm.state.selection.ranges.map((r) => ({ anchor: offsetToPos(this.cm.state, r.anchor), head: offsetToPos(this.cm.state, r.head) })); }
  setSelections(ranges) {
    if (!ranges || !ranges.length) return;
    const sel = EditorSelection.create(ranges.map((r) => EditorSelection.range(posToOffset(this.cm.state, r.anchor), posToOffset(this.cm.state, r.head || r.anchor))));
    this.cm.dispatch({ selection: sel });
  }
  getSelection() { const r = this.cm.state.selection.main; return this.cm.state.sliceDoc(r.from, r.to); }
  somethingSelected() { return !this.cm.state.selection.main.empty; }
  // --- ranges ---
  getRange(from, to) { return this.cm.state.sliceDoc(posToOffset(this.cm.state, from), posToOffset(this.cm.state, to)); }
  replaceRange(text, from, to) { const a = posToOffset(this.cm.state, from); const b = to ? posToOffset(this.cm.state, to) : a; this.cm.dispatch({ changes: { from: a, to: b, insert: text } }); }
  replaceSelection(text) { this.cm.dispatch(this.cm.state.replaceSelection(text)); }
  // Obsidian's batched edit (paste-image-rename rewrites embed lines via this).
  transaction(tx) {
    const spec = {};
    if (tx.changes) {
      spec.changes = (Array.isArray(tx.changes) ? tx.changes : [tx.changes]).map((c) => ({
        from: posToOffset(this.cm.state, c.from),
        to: c.to ? posToOffset(this.cm.state, c.to) : posToOffset(this.cm.state, c.from),
        insert: c.text != null ? c.text : (c.insert || ''),
      }));
    }
    if (tx.selection) spec.selection = { anchor: posToOffset(this.cm.state, tx.selection.from || tx.selection.anchor), head: posToOffset(this.cm.state, tx.selection.to || tx.selection.head || tx.selection.from || tx.selection.anchor) };
    this.cm.dispatch(spec);
  }
  // --- offsets ---
  posToOffset(pos) { return posToOffset(this.cm.state, pos); }
  offsetToPos(off) { return offsetToPos(this.cm.state, off); }
  wordAt(pos) { const off = posToOffset(this.cm.state, pos); const w = this.cm.state.wordAt(off); return w ? { from: offsetToPos(this.cm.state, w.from), to: offsetToPos(this.cm.state, w.to) } : null; }
  // --- misc Obsidian Editor surface ---
  focus() { this.cm.focus(); }
  blur() { this.cm.contentDOM.blur && this.cm.contentDOM.blur(); }
  refresh() {}
  getDoc() { return this; }
  destroy() { this.cm.destroy(); }
}
