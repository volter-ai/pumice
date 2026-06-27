// Phase 4-rest AC (properties + daily notes + templates): typed frontmatter parse +
// ZERO-diff round-trip, processFrontMatter contract, daily-note path resolution, and
// template token expansion. Pure logic, isomorphic. Exits nonzero on any miss.
import { parseProperties, serializeProperties, processFrontMatter, propertyType } from '../src/core/properties.js';
import { dailyNotePath, applyTemplate, ensureDailyNote } from '../src/core/daily-notes.js';

let pass = 0, fail = 0; const log = [];
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; log.push(`  ✓ ${name}`); }
  else { fail++; log.push(`  ✗ ${name}\n      got:  ${g}\n      want: ${w}`); }
}
function ok(name, cond, detail = '') { if (cond) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name} ${detail}`); } }

// ---- properties: typed parse ----
const note = `---\ntitle: My Note\ncount: 42\nratio: 1.5\ndone: true\ndue: 2026-06-26\nstamp: 2026-06-26T09:30\ntags:\n  - work\n  - active\naliases: [Alt, Other]\n---\n# Body\nhello`;
const { data, body } = parseProperties(note);
eq('parse text', data.title, 'My Note');
eq('parse number int', data.count, 42);
eq('parse number float', data.ratio, 1.5);
eq('parse checkbox', data.done, true);
eq('parse block list', data.tags, ['work', 'active']);
eq('parse flow list', data.aliases, ['Alt', 'Other']);
eq('parse keeps body', body.trim(), '# Body\nhello');
eq('type: text', propertyType('x'), 'text');
eq('type: number', propertyType(42), 'number');
eq('type: checkbox', propertyType(true), 'checkbox');
eq('type: list', propertyType([1]), 'list');
eq('type: date', propertyType('2026-06-26'), 'date');
eq('type: datetime', propertyType('2026-06-26T09:30'), 'datetime');

// ---- properties: zero-diff round-trip ----
const rt = serializeProperties(data, body);
const reparse = parseProperties(rt).data;
eq('round-trip data identical', reparse, data);

// ---- processFrontMatter contract (mutate + reserialize) ----
const updated = processFrontMatter(note, (fm) => { fm.count = 43; fm.newField = 'added'; });
const up = parseProperties(updated).data;
eq('pFM updates field', up.count, 43);
eq('pFM adds field', up.newField, 'added');
eq('pFM preserves others', up.title, 'My Note');
ok('pFM preserves body', parseProperties(updated).body.includes('hello'));

// ---- daily notes ----
const d = new Date(Date.UTC(2026, 5, 26, 12, 0, 0));
eq('daily path default', dailyNotePath({}, d), '2026-06-26.md');
eq('daily path folder+format', dailyNotePath({ folder: 'Daily/', format: 'YYYY/MM/DD' }, d), 'Daily/2026/06/26.md');
const ddn = ensureDailyNote({}, { folder: 'Journal' }, d, '# {{date}}\n');
eq('ensureDailyNote path', ddn.path, 'Journal/2026-06-26.md');
ok('ensureDailyNote not-exists', ddn.exists === false);
ok('ensureDailyNote applies template', ddn.content.includes('# 2026-06-26'), ddn.content);
const existing = ensureDailyNote({ '2026-06-26.md': 'kept' }, {}, d, '# {{date}}');
ok('ensureDailyNote keeps existing', existing.exists === true && existing.content === 'kept');

// ---- templates ----
eq('tpl title', applyTemplate('# {{title}}', { title: 'Hi' }), '# Hi');
eq('tpl date default', applyTemplate('{{date}}', { date: d }), '2026-06-26');
eq('tpl date format', applyTemplate('{{date:YYYY/MM}}', { date: d }), '2026/06');
eq('tpl templater date', applyTemplate('<% tp.date.now("YYYY-MM-DD") %>', { date: d }), '2026-06-26');
eq('tpl templater title', applyTemplate('<% tp.file.title %>', { title: 'T' }), 'T');

console.log('=== Phase 4-rest: properties + daily notes + templates ===');
for (const c of log) console.log(c);
console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail) { console.log(`\nFAIL: ${fail}`); process.exit(1); }
console.log('\nAC GREEN: properties round-trip + daily notes + templates verified.');
process.exit(0);
