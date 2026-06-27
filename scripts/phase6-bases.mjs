// Phase 6 AC: a real .base opens in table + card views; filters + ≥1 formula evaluate
// vs a fixture; save zero-diff. jsdom for the table/card DOM render.
import './dom-bootstrap.mjs';
import { parseBase, serializeBase, evaluateView, evaluateBase, renderTableView, renderCardsView } from '../src/bases/bases.js';
import { evaluate } from '../src/bases/expr.js';

let pass = 0, fail = 0; const log = [];
function eq(name, got, want) { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name}\n      got:  ${g}\n      want: ${w}`); } }
function ok(name, cond, d = '') { if (cond) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name} ${d}`); } }

// fixture vault: notes with frontmatter properties
const files = {
  'Books/Dune.md': `---\ntype: book\nprice: 20\nqty: 3\nstatus: read\n---\nDune`,
  'Books/Hobbit.md': `---\ntype: book\nprice: 10\nqty: 5\nstatus: reading\n---\nHobbit`,
  'Misc/Note.md': `---\ntype: note\nstatus: read\n---\njust a note`,
};

// a .base model (as parsed structure)
const base = {
  filters: 'type == "book"',
  formulas: { total: 'price * qty' },
  properties: { 'note.status': { displayName: 'Status' }, 'note.price': {} },
  views: [
    { type: 'table', name: 'Inventory', order: ['file.name', 'price', 'status', 'total'] },
    { type: 'cards', name: 'Cards', filters: 'status == "read"', order: ['file.name', 'total'] },
  ],
};
const model = parseBase(base);

// --- expr engine sanity ---
eq('expr arithmetic', evaluate('2 + 3 * 4', {}), 14);
eq('expr comparison', evaluate('price > 15', { price: 20 }), true);
eq('expr dotted id', evaluate('file.name', { file: { name: 'X' } }), 'X');
eq('expr logical', evaluate('a && !b', { a: true, b: false }), true);
eq('expr function', evaluate('upper(status)', { status: 'read' }), 'READ');
eq('expr string concat', evaluate('"#" + status', { status: 'read' }), '#read');

// --- table view: global filter (books only) + formula column ---
const table = evaluateView(model, model.views[0], files);
eq('table type', table.type, 'table');
eq('table filters to books', table.rows.map((r) => r.path).sort(), ['Books/Dune.md', 'Books/Hobbit.md']);
eq('table ordered by file.name', table.rows.map((r) => r.values['file.name']), ['Dune', 'Hobbit']);
eq('formula total computed', table.rows.find((r) => r.path === 'Books/Dune.md').values.total, 60);
eq('formula total computed 2', table.rows.find((r) => r.path === 'Books/Hobbit.md').values.total, 50);
eq('property column present', table.rows[0].values.status, 'read');

// --- cards view: global filter AND view filter (status==read) ---
const cards = evaluateView(model, model.views[1], files);
eq('cards filters books+read', cards.rows.map((r) => r.path), ['Books/Dune.md']);

// --- render table + cards to DOM ---
const el = document.createElement('div'); document.body.appendChild(el);
renderTableView(table, el);
eq('table headers', [...el.querySelectorAll('thead th')].map((t) => t.textContent), ['file.name', 'price', 'status', 'total']);
eq('table body rows', el.querySelectorAll('tbody tr').length, 2);
ok('table cell value', [...el.querySelectorAll('tbody tr')][0].querySelectorAll('td')[3].textContent === '60');
const el2 = document.createElement('div');
renderCardsView(cards, el2);
eq('one card rendered', el2.querySelectorAll('.bases-card').length, 1);
ok('card field value', el2.querySelector('.bases-card-field[data-field=total]').textContent === '60');

// --- evaluateBase runs all views ---
eq('evaluateBase returns both views', evaluateBase(model, files).map((v) => v.type), ['table', 'cards']);

// --- zero-diff save: untouched base round-trips byte-identical ---
const rawYamlish = JSON.stringify(base, null, '\t');
const m2 = parseBase(rawYamlish);
eq('untouched base round-trip byte-identical', serializeBase(m2), rawYamlish);

console.log('=== Phase 6: Bases table/card + filters + formula ===');
for (const c of log) console.log(c);
console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail) { console.log(`\nFAIL: ${fail}`); process.exit(1); }
console.log('\nAC GREEN: .base opens in table+card, filters + formula evaluate, zero-diff save.');
process.exit(0);
