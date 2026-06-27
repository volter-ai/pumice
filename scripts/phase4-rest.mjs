// Phase 4-rest AC — search/index. The rich Obsidian-operator search engine and the
// quick-switcher fuzzy ranker were Pumice-built SUBSTITUTES and have been RETIRED:
// user-facing search is now the REAL omnisearch plugin (proven in scripts/regrade-real
// + the browser pass), and the agent/host surface uses the VFS-core primitives in
// vfs/links.js. This test verifies those surviving HOST primitives (search/tagIndex/
// backlinks) — no Pumice-built search module remains.
import { search, tagIndex, backlinks, buildGraph } from '../src/vfs/links.js';

const files = {
  'Projects/Alpha.md': `---\ntags: [active, work]\n---\n# Alpha\nThe alpha project tracks [[Beta]] work.\nSome #urgent note here.`,
  'Projects/Beta.md': `# Beta\nBeta depends on [[Alpha]].\nA ticket ABC-1234.`,
  'Daily/2026-06-26.md': `# Journal\nTalked to team about alpha and beta.\n#daily standup done.`,
  'Archive/Old.md': `# Old\nDeprecated.\n`,
};

let pass = 0, fail = 0; const log = [];
const paths = (rows) => rows.map((r) => r.path).sort();
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; log.push(`  ✓ ${name}`); }
  else { fail++; log.push(`  ✗ ${name}\n      got:  ${g}\n      want: ${w}`); }
}
function ok(name, cond, detail = '') { if (cond) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name} ${detail}`); } }

// ---- host VFS search (tag: / path: / free text) ----
eq('text search (AND)', paths(search(files, 'alpha beta')), ['Daily/2026-06-26.md', 'Projects/Alpha.md', 'Projects/Beta.md']);
eq('path: field', paths(search(files, 'path:Projects')), ['Projects/Alpha.md', 'Projects/Beta.md']);
eq('tag: inline', paths(search(files, 'tag:urgent')), ['Projects/Alpha.md']);
eq('tag: frontmatter', paths(search(files, 'tag:active')), ['Projects/Alpha.md']);
ok('text miss → empty', search(files, 'nonexistentterm').length === 0);

// ---- host tag index + backlinks + graph (the agent/MCP surface) ----
const tags = tagIndex(files);
eq('tag index: active', tags.active, ['Projects/Alpha.md']);
eq('tag index: daily', tags.daily, ['Daily/2026-06-26.md']);
eq('tag index: urgent', tags.urgent, ['Projects/Alpha.md']);
eq('backlinks to Alpha', backlinks(files, 'Projects/Alpha.md').sort(), ['Projects/Beta.md']);
const g = buildGraph(files);
ok('graph nodes = files', g.nodes.length === 4, `got ${g.nodes.length}`);
ok('graph links Alpha<->Beta', g.links.some((l) => /Alpha/.test(l.source) && /Beta/.test(l.target)), `links=${JSON.stringify(g.links)}`);

console.log('=== Phase 4-rest: host VFS search/tag/backlink primitives (rich search = real omnisearch) ===');
for (const c of log) console.log(c);
console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail) { console.log(`\nFAIL: ${fail}`); process.exit(1); }
console.log('\nAC GREEN: Phase 4-rest host search/index verified (omnisearch supplies user-facing search).');
process.exit(0);
