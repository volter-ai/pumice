// Phase 2a AC: source-mode editor + Obsidian Editor API over a REAL CodeMirror 6
// EditorView in jsdom. Asserts the Editor facade + that a plugin-supplied CM6
// extension actually takes effect on the live instance.
import './dom-bootstrap.mjs';
import { Editor } from '../src/editor/editor.js';
import { EditorView } from '@codemirror/view';
import { StateField } from '@codemirror/state';

let pass = 0, fail = 0; const log = [];
function eq(name, got, want) { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name}\n      got:  ${g}\n      want: ${w}`); } }
function ok(name, cond, d = '') { if (cond) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name} ${d}`); } }

const parent = document.createElement('div'); document.body.appendChild(parent);
const ed = new Editor(parent, { doc: 'hello world\nsecond line\nthird' });

ok('real CM6 EditorView', ed.cm instanceof EditorView);
eq('getValue', ed.getValue(), 'hello world\nsecond line\nthird');
eq('lineCount', ed.lineCount(), 3);
eq('lastLine', ed.lastLine(), 2);
eq('getLine', ed.getLine(1), 'second line');
ed.setValue('new content here');
eq('setValue', ed.getValue(), 'new content here');
ed.setValue('hello world\nsecond line\nthird');

// cursor / selection
ed.setCursor(1, 3);
eq('getCursor', ed.getCursor(), { line: 1, ch: 3 });
ed.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 5 });
eq('getSelection', ed.getSelection(), 'hello');
ok('somethingSelected', ed.somethingSelected());
ed.replaceSelection('HELLO');
eq('replaceSelection', ed.getLine(0), 'HELLO world');

// ranges
eq('getRange', ed.getRange({ line: 0, ch: 0 }, { line: 0, ch: 5 }), 'HELLO');
ed.replaceRange('X', { line: 2, ch: 0 }, { line: 2, ch: 5 });
eq('replaceRange', ed.getLine(2), 'X');

// offsets
eq('posToOffset', ed.posToOffset({ line: 1, ch: 0 }), 'HELLO world\n'.length);
eq('offsetToPos', ed.offsetToPos(0), { line: 0, ch: 0 });
ed.setValue('alpha beta gamma');
eq('wordAt', ed.wordAt({ line: 0, ch: 8 }), { from: { line: 0, ch: 6 }, to: { line: 0, ch: 10 } });

// setLine
ed.setValue('a\nb\nc');
ed.setLine(1, 'BEE');
eq('setLine', ed.getValue(), 'a\nBEE\nc');

// A plugin-supplied CM6 extension takes effect on the live editor (editor-extension API).
let counted = -1;
const counter = StateField.define({ create: (s) => s.doc.length, update: (v, tr) => tr.newDoc.length });
const ed2 = new Editor(document.createElement('div'), { doc: 'abc', extensions: [counter] });
counted = ed2.cm.state.field(counter);
eq('plugin CM6 extension active', counted, 3);
ed2.replaceRange('de', { line: 0, ch: 3 });
eq('extension updates on change', ed2.cm.state.field(counter), 5);

console.log('=== Phase 2a: source editor + Obsidian Editor API on real CM6 ===');
for (const c of log) console.log(c);
console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail) { console.log(`\nFAIL: ${fail}`); process.exit(1); }
console.log('\nAC GREEN: Editor API over real CodeMirror 6 verified.');
process.exit(0);
