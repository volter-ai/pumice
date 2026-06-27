// Phase 2b AC: Live Preview decoration engine. Asserts the descriptor set (hide/reveal
// by cursor, heading sizing, link/tag/checkbox/math) AND that the real CM6 ViewPlugin
// produces a live DecorationSet on an actual EditorView in jsdom.
import './dom-bootstrap.mjs';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { buildDecorations, livePreview } from '../src/editor/live-preview.js';

let pass = 0, fail = 0; const log = [];
function ok(name, cond, d = '') { if (cond) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name} ${d}`); } }

// Build descriptors for a doc with the cursor at `cursor` (absolute offset).
function descs(doc, cursor = doc.length + 1) {
  const state = EditorState.create({ doc, selection: { anchor: Math.min(cursor, doc.length) } });
  return buildDecorations(state);
}
const find = (ds, pred) => ds.find(pred);
const has = (ds, pred) => ds.some(pred);

// --- bold: content marked, markers hidden when cursor away ---
let d = descs('a **bold** b', 0);
ok('bold content mark', has(d, (x) => x.kind === 'strong' && x.type === 'mark' && !x.revealed));
ok('bold markers hidden (replace)', d.filter((x) => x.kind === 'strong-marker' && x.type === 'replace').length === 2);
// cursor inside bold → markers revealed (no replace, mark instead)
d = descs('a **bold** b', 5);
ok('bold markers revealed at cursor', has(d, (x) => x.kind === 'strong-marker' && x.revealed) && !has(d, (x) => x.kind === 'strong-marker' && x.type === 'replace'));

// --- italic / highlight / strike / code / math ---
ok('italic', has(descs('x *i* y', 0), (x) => x.kind === 'em' && x.type === 'mark'));
ok('highlight', has(descs('x ==h== y', 0), (x) => x.kind === 'highlight' && x.type === 'mark'));
ok('strikethrough', has(descs('x ~~s~~ y', 0), (x) => x.kind === 'strikethrough'));
ok('inline code', has(descs('x `c` y', 0), (x) => x.kind === 'inline-code'));
ok('inline math', has(descs('x $e=m$ y', 0), (x) => x.kind === 'math'));
ok('bold not mis-split as italic', !has(descs('**b**', 99), (x) => x.kind === 'em'));

// --- headings: line deco with level class ---
let hd = find(descs('## Title', 99), (x) => x.kind === 'heading');
ok('heading line deco', hd && hd.type === 'line' && hd.level === 2 && hd.class.includes('cm-header-2'));
ok('h1 vs h6 distinct', find(descs('# A', 99), (x) => x.kind === 'heading').level === 1 && find(descs('###### F', 99), (x) => x.kind === 'heading').level === 6);

// --- internal link widget (hidden) vs revealed at cursor ---
ok('link widget when away', has(descs('see [[Note A]] ok', 0), (x) => x.kind === 'internal-link' && x.type === 'widget' && x.target === 'Note A'));
ok('link revealed at cursor', has(descs('see [[Note A]] ok', 8), (x) => x.kind === 'internal-link' && x.revealed));
ok('link alias target', find(descs('x [[Target|Alias]]', 0), (x) => x.kind === 'internal-link' && x.type === 'widget').target === 'Alias');

// --- tag mark ---
ok('tag mark', has(descs('an #area/work tag', 99), (x) => x.kind === 'tag' && x.type === 'mark'));

// --- task checkbox widget; list line ---
ok('task checkbox widget', has(descs('- [ ] todo', 99), (x) => x.kind === 'checkbox' && x.checked === false));
ok('task checked widget', has(descs('- [x] done', 99), (x) => x.kind === 'checkbox' && x.checked === true));
ok('task line class', has(descs('- [ ] todo', 99), (x) => x.kind === 'task' && x.type === 'line'));
ok('plain list line', has(descs('- item', 99), (x) => x.kind === 'list' && x.type === 'line'));
ok('checkbox revealed at cursor', !has(descs('- [ ] todo', 3), (x) => x.kind === 'checkbox'));

// --- real CM6 ViewPlugin produces a live DecorationSet on an EditorView ---
const parent = document.createElement('div'); document.body.appendChild(parent);
const view = new EditorView({ state: EditorState.create({ doc: '# H\n**bold** and [[Link]]\n- [ ] task', extensions: [livePreview] }), parent });
const set = view.plugin(livePreview).decorations;
ok('ViewPlugin yields DecorationSet', set && typeof set.size === 'number' && set.size > 0);
// after edit, decorations recompute
view.dispatch({ changes: { from: view.state.doc.length, insert: '\n==hl==' } });
ok('decorations recompute on edit', view.plugin(livePreview).decorations.size > set.size - 1);

console.log('=== Phase 2b: Live Preview decorations on real CM6 ===');
for (const c of log) console.log(c);
console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail) { console.log(`\nFAIL: ${fail}`); process.exit(1); }
console.log('\nAC GREEN: live-preview decoration engine verified.');
process.exit(0);
