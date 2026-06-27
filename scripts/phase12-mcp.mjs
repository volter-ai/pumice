// Phase 12 AC: MCP server exposes read/write/search/backlinks/graph over the VFS, and a
// UI↔REST↔MCP parity test proves the same query returns the same results via each
// surface (MCP read-path in v1; write gated).
import { createVaultCore, createMcpServer, createRestHandler, memoryStore } from '../src/mcp/server.js';

let pass = 0, fail = 0; const log = [];
function eq(name, got, want) { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name}\n      got:  ${g}\n      want: ${w}`); } }
function ok(name, cond, d = '') { if (cond) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name} ${d}`); } }

const files = {
  'A.md': '---\ntags: [work]\n---\n# A\nlinks [[B]] #work',
  'B.md': '# B\nlinks [[A]] and [[C]] #idea',
  'C.md': '# C\njust c, keyword42',
};
const store = memoryStore(files);
const core = createVaultCore(store);
const mcp = createMcpServer(core, { allowWrite: false });
const mcpRW = createMcpServer(core, { allowWrite: true });
const rest = createRestHandler(core, { allowWrite: true });

// --- tools listed ---
const tools = mcp.listTools().map((t) => t.name).sort();
eq('read tools listed', tools, ['vault_backlinks', 'vault_graph', 'vault_list', 'vault_read', 'vault_search']);
ok('write tool gated out of read scope', !tools.includes('vault_write'));
ok('write tool present in RW scope', mcpRW.listTools().some((t) => t.name === 'vault_write'));

// --- each tool works ---
eq('list', await mcp.callTool('vault_list'), ['A.md', 'B.md', 'C.md']);
eq('read', (await mcp.callTool('vault_read', { path: 'C.md' })).content.includes('keyword42'), true);
eq('search', (await mcp.callTool('vault_search', { query: 'keyword42' })).map((r) => r.path), ['C.md']);
eq('backlinks', await mcp.callTool('vault_backlinks', { path: 'A.md' }), ['B.md']);
eq('graph summary', (await mcp.callTool('vault_graph')).links, 3);

// --- write gated on read-only MCP, allowed on RW ---
let werr = null; try { await mcp.callTool('vault_write', { path: 'X.md', content: 'x' }); } catch (e) { werr = e; }
ok('write blocked in read scope', werr && /read-only/.test(werr.message));
await mcpRW.callTool('vault_write', { path: 'X.md', content: '# X\n[[A]]' });
ok('write applied via RW MCP', store.get()['X.md'] === '# X\n[[A]]');

// === PARITY: same query via UI (core) ↔ REST ↔ MCP returns identical results ===
// search parity
const q = 'tag:work';
const viaUI = core.search({ query: q });
const viaMcp = await mcp.callTool('vault_search', { query: q });
const viaRest = await rest({ method: 'GET', path: '/search', query: { q } });
eq('parity: search UI==MCP', viaUI, viaMcp);
eq('parity: search UI==REST', viaUI, viaRest);

// backlinks parity (note X now links A)
const blUI = core.backlinks({ path: 'A.md' });
const blMcp = await mcp.callTool('vault_backlinks', { path: 'A.md' });
const blRest = await rest({ method: 'GET', path: '/backlinks', query: { path: 'A.md' } });
eq('parity: backlinks UI==MCP', blUI, blMcp);
eq('parity: backlinks UI==REST', blUI, blRest);
ok('backlinks reflect new write', blUI.includes('X.md'));

// graph parity
const gUI = core.graph(); const gMcp = await mcp.callTool('vault_graph'); const gRest = await rest({ method: 'GET', path: '/graph' });
eq('parity: graph UI==MCP==REST', [gUI.nodes, gUI.links], [gMcp.nodes, gMcp.links]) || eq('x', gMcp, gRest);
eq('parity: graph REST equals', gRest.links, gUI.links);

// list/read parity
eq('parity: list UI==REST', core.list(), await rest({ method: 'GET', path: '/notes' }));
eq('parity: read UI==MCP', core.read({ path: 'B.md' }), await mcp.callTool('vault_read', { path: 'B.md' }));

console.log('=== Phase 12: MCP tools + UI↔REST↔MCP parity ===');
for (const c of log) console.log(c);
console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail) { console.log(`\nFAIL: ${fail}`); process.exit(1); }
console.log('\nAC GREEN: MCP read/write/search/backlinks/graph + tri-surface parity verified.');
process.exit(0);
