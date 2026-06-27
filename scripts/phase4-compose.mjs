// Phase 4-rest AC (note composer + file recovery + bookmarks). Pure logic, isomorphic.
import { splitAtHeading, mergeNotes, extractRange, extractedNotePath } from '../src/core/note-composer.js';
import { createSnapshotStore, addSnapshot, listSnapshots, snapshotAt, diffLines, diffStat } from '../src/core/recovery.js';
import { createBookmarks, addBookmark, removeBookmark, isBookmarked, allBookmarks, moveBookmark } from '../src/core/bookmarks.js';

let pass = 0, fail = 0; const log = [];
function eq(name, got, want) { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name}\n      got:  ${g}\n      want: ${w}`); } }
function ok(name, cond, d = '') { if (cond) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name} ${d}`); } }

// ---- note composer ----
const doc = `# Main\nintro\n\n## Section A\nbody a\nmore a\n\n## Section B\nbody b`;
const sp = splitAtHeading(doc, 'Section A', { ref: 'link' });
ok('split extracts section', sp.extracted.startsWith('## Section A') && sp.extracted.includes('more a'));
ok('split stops at next heading', !sp.extracted.includes('Section B'));
ok('split leaves a link', sp.kept.includes('[[Section A]]') && !sp.kept.includes('more a'));
ok('split keeps other sections', sp.kept.includes('## Section B'));
const spE = splitAtHeading(doc, 'Section A', { ref: 'embed', newName: 'A' });
ok('split embed ref', spE.kept.includes('![[A]]'));
ok('split missing heading is no-op', splitAtHeading(doc, 'Nope').extracted === null);
eq('merge appends (blank-line sep)', mergeNotes('# T\nx', 'y'), '# T\nx\n\ny\n');
ok('merge under heading', mergeNotes('# T\nx', 'y', { heading: 'Merged' }).includes('## Merged'));
const er = extractRange('l0\nl1\nl2\nl3', 1, 3, { newName: 'Extracted' });
eq('extractRange extracted', er.extracted, 'l1\nl2\n');
ok('extractRange leaves link', er.kept === 'l0\n[[Extracted]]\nl3');
eq('extracted path beside source', extractedNotePath('Folder/Note.md', 'New One'), 'Folder/New One.md');

// ---- file recovery ----
const store = createSnapshotStore();
addSnapshot(store, 'a.md', 'v1', 1000);
addSnapshot(store, 'a.md', 'v2', 2000);
addSnapshot(store, 'a.md', 'v2', 2500); // identical → coalesced
addSnapshot(store, 'a.md', 'v3', 3000);
eq('snapshots coalesce no-ops', listSnapshots(store, 'a.md').map((s) => s.content), ['v3', 'v2', 'v1']);
eq('snapshotAt before ts', snapshotAt(store, 'a.md', 2200).content, 'v2');
eq('snapshotAt exact', snapshotAt(store, 'a.md', 3000).content, 'v3');
ok('snapshotAt none before', snapshotAt(store, 'a.md', 500) === null);
const cap = createSnapshotStore();
for (let i = 0; i < 40; i++) addSnapshot(cap, 'x.md', 'c' + i, i, 25);
ok('snapshot history capped', listSnapshots(cap, 'x.md').length === 25);
const d = diffLines('a\nb\nc', 'a\nB\nc\nd');
eq('diff ops', d.map((x) => x.op).join(''), ' -+ +');
eq('diffStat', diffStat('a\nb\nc', 'a\nB\nc\nd'), { added: 2, removed: 1 });

// ---- bookmarks ----
let bm = createBookmarks();
addBookmark(bm, { type: 'file', path: 'A.md', title: 'A' });
addBookmark(bm, { type: 'file', path: 'A.md', title: 'A' }); // dup
addBookmark(bm, { type: 'search', query: 'tag:x', title: 'search x' });
eq('bookmarks dedup', bm.items.length, 2);
ok('isBookmarked true', isBookmarked(bm, { type: 'file', path: 'A.md' }));
ok('isBookmarked false', !isBookmarked(bm, { type: 'file', path: 'Z.md' }));
addBookmark(bm, { type: 'file', path: 'B.md', title: 'B' }, ['Group 1']);
ok('grouped bookmark nested', bm.items.some((x) => x.type === 'group' && x.title === 'Group 1'));
eq('allBookmarks flattens with group', allBookmarks(bm).find((b) => b.path === 'B.md').group, ['Group 1']);
removeBookmark(bm, { type: 'file', path: 'A.md' });
ok('remove bookmark', !isBookmarked(bm, { type: 'file', path: 'A.md' }));
let bm2 = createBookmarks();
addBookmark(bm2, { type: 'file', path: '1.md' });
addBookmark(bm2, { type: 'file', path: '2.md' });
addBookmark(bm2, { type: 'file', path: '3.md' });
moveBookmark(bm2, [], 2, 0);
eq('move reorders', bm2.items.map((x) => x.path), ['3.md', '1.md', '2.md']);

console.log('=== Phase 4-rest: note composer + file recovery + bookmarks ===');
for (const c of log) console.log(c);
console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail) { console.log(`\nFAIL: ${fail}`); process.exit(1); }
console.log('\nAC GREEN: note composer + snapshots + bookmarks verified.');
process.exit(0);
