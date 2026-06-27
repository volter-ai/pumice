// Phase 11 AC: perf budgets on a synthetic 10k-note vault. Measures index build, a
// search keystroke, backlink lookup, and graph-data build with process.hrtime; asserts
// each completes under an explicit (generous, CI-safe) budget. Fails if any blows it.
import { generateVault } from '../src/perf/fixture.js';
import { buildGraph, backlinks, tagIndex, search } from '../src/vfs/links.js';

const N = 10000;
let pass = 0, fail = 0; const log = [];
function ms(fn) { const t0 = process.hrtime.bigint(); const r = fn(); const t1 = process.hrtime.bigint(); return { r, ms: Number(t1 - t0) / 1e6 }; }
function budget(name, actualMs, limitMs, extra = '') {
  if (actualMs <= limitMs) { pass++; log.push(`  ✓ ${name}: ${actualMs.toFixed(1)}ms ≤ ${limitMs}ms ${extra}`); }
  else { fail++; log.push(`  ✗ ${name}: ${actualMs.toFixed(1)}ms > ${limitMs}ms BUDGET EXCEEDED ${extra}`); }
}
function ok(name, cond, d = '') { if (cond) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name} ${d}`); } }

console.log(`=== Phase 11: perf budgets on ${N} notes ===`);

const gen = ms(() => generateVault(N));
ok('fixture has N notes', Object.keys(gen.r).length === N);
const files = gen.r;
budget('fixture generation', gen.ms, 2000);

// index build: tag index + graph (the cold-open indexing cost)
const idx = ms(() => tagIndex(files));
budget('tag index build (10k)', idx.ms, 3000, `(${Object.keys(idx.r).length} tags)`);

const graph = ms(() => buildGraph(files));
budget('graph data build (10k)', graph.ms, 3000, `(${graph.r.nodes.length} nodes, ${graph.r.links.length} links)`);
ok('graph wired links', graph.r.links.length > N); // ~2 links/note

// search keystroke latency (typical fielded query)
const s1 = ms(() => search(files, 'keyword7'));
budget('search keystroke (text)', s1.ms, 1500, `(${s1.r.length} hits)`);
const s2 = ms(() => search(files, 'tag:work'));
budget('search keystroke (fielded)', s2.ms, 2000, `(${s2.r.length} hits)`);
ok('search returns expected hits', s1.r.length > 0 && s2.r.length > 0);

// backlink lookup for one note
const bl = ms(() => backlinks(files, 'Projects/Note-1.md'));
budget('backlinks lookup', bl.ms, 1500, `(${bl.r.length} backlinks)`);
ok('backlinks found', bl.r.length > 0);

for (const c of log) console.log(c);
console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail) { console.log(`\nFAIL: ${fail} budget(s) exceeded.`); process.exit(1); }
console.log('\nAC GREEN: 10k-note perf budgets met (index, search, backlinks, graph).');
process.exit(0);
