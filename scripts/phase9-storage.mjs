// Phase 9 AC: git adapter passes commit/log/checkout round-trip + typed conflict on
// divergent merge; Notion adapter reads a page tree into the VFS as markdown and throws
// a typed NotSupported error on write. Pure logic, no network.
import { gitAdapter, GitConflictError } from '../src/vfs/gitAdapter.js';
import { notionAdapter, NotSupportedError, blockToMarkdown } from '../src/vfs/notionAdapter.js';

let pass = 0, fail = 0; const log = [];
function eq(name, got, want) { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name}\n      got:  ${g}\n      want: ${w}`); } }
function ok(name, cond, d = '') { if (cond) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name} ${d}`); } }

// ---- git adapter ----
const git = gitAdapter({ 'README.md': 'v1' });
const c1 = git.commit('init');
await git.write('README.md', 'v2');
await git.write('Notes/A.md', 'note a');
const c2 = git.commit('edit + add');
eq('working tree after edits', await git.read('README.md'), 'v2');
eq('list includes new file', await git.list(), ['Notes/A.md', 'README.md']);
// history
eq('log has 2 commits newest-first', git.log().map((c) => c.message), ['edit + add', 'init']);
ok('head is latest commit', git.head() === c2);
// checkout past commit restores working tree (round-trip)
git.checkout(c1);
eq('checkout restores old content', await git.read('README.md'), 'v1');
ok('checkout removes later-added file', !(await git.list()).includes('Notes/A.md'));
git.checkout(c2);
eq('checkout forward restores', await git.read('README.md'), 'v2');

// pull: non-conflicting merge auto-merges
const base = gitAdapter({ 'shared.md': 'base', 'mine.md': 'base' });
base.commit('base');
base.write('mine.md', 'my change'); base.commit('mine');
const theirs = { 'shared.md': 'base', 'mine.md': 'base', 'theirs.md': 'their new file' };
const mergeCommit = base.pull(theirs);
ok('pull auto-merges non-conflicting', (await base.read('theirs.md')) === 'their new file' && (await base.read('mine.md')) === 'my change');
ok('merge creates a commit', base.head() === mergeCommit);

// pull: divergent change → typed conflict
const div = gitAdapter({ 'f.md': 'base' });
div.commit('base');
div.write('f.md', 'ours'); div.commit('ours');
let conflict = null;
try { div.pull({ 'f.md': 'theirs' }); } catch (e) { conflict = e; }
ok('divergent change raises GitConflictError', conflict instanceof GitConflictError);
eq('conflict lists the path', conflict.conflicts, ['f.md']);

// ---- Notion read-into-VFS ----
const blocks = {
  root: [{ type: 'heading_1', heading_1: { rich_text: [{ plain_text: 'Welcome' }] } }, { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Hello ' }, { plain_text: 'world', annotations: { bold: true } }] } }, { type: 'to_do', to_do: { checked: true, rich_text: [{ plain_text: 'done task' }] } }],
  child: [{ type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ plain_text: 'item' }] } }],
};
const pages = { root: { properties: { Name: { type: 'title', title: [{ plain_text: 'Home' }] } } }, child: { properties: { Name: { type: 'title', title: [{ plain_text: 'Sub Page' }] } } } };
const children = { root: [{ id: 'child' }], child: [] };
const client = { getPage: async (id) => pages[id], getBlocks: async (id) => blocks[id], listChildren: async (id) => children[id] };

eq('block→md heading', blockToMarkdown(blocks.root[0]), '# Welcome'),
eq('block→md bold inline', blockToMarkdown(blocks.root[1]), 'Hello **world**');
eq('block→md checked todo', blockToMarkdown(blocks.root[2]), '- [x] done task');

const notion = await notionAdapter(client, ['root']);
eq('notion maps tree to paths', await notion.list(), ['Home.md', 'Home/Sub Page.md']);
ok('notion page content', (await notion.read('Home.md')).startsWith('# Welcome'));
ok('notion nested page content', (await notion.read('Home/Sub Page.md')).includes('- item'));
ok('notion is read-only capability', notion.capabilities.readonly === true && notion.capabilities.write === false);
let writeErr = null;
try { await notion.write('x.md', 'y'); } catch (e) { writeErr = e; }
ok('notion write throws typed NotSupported', writeErr instanceof NotSupportedError && writeErr.op === 'write');

console.log('=== Phase 9: git + Notion storage adapters ===');
for (const c of log) console.log(c);
console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail) { console.log(`\nFAIL: ${fail}`); process.exit(1); }
console.log('\nAC GREEN: git commit/log/checkout/merge-conflict + Notion read-into-VFS verified.');
process.exit(0);
