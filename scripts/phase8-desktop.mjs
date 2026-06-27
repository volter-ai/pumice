// Phase 8 AC: desktop adapter contract. Real-fs VaultAdapter (async+sync+watch) passes
// a read/write/list/stat/rename/remove round-trip; CORS-free requestUrl returns the
// normalized shape and forwards browser-forbidden headers; child_process gated to
// desktop; Platform.isDesktop. (Full Tauri-Playwright with the 3 native-anchor plugins
// is the shell-integration step; this proves the adapter + capability contract in CI.)
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { desktopAdapter, requestUrl, DesktopPlatform, getProcessRunner } from '../src/desktop/desktop-adapter.js';

let pass = 0, fail = 0; const log = [];
function eq(name, got, want) { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name}\n      got:  ${g}\n      want: ${w}`); } }
function ok(name, cond, d = '') { if (cond) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name} ${d}`); } }

const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'pumice-vault-'));
const a = desktopAdapter(base);

// --- capabilities ---
eq('capabilities', a.capabilities, { write: true, watch: true, sync: true, requestUrl: true, childProcess: true });

// --- async fs round-trip ---
await a.write('Notes/Hello.md', '# Hi\nbody');
await a.write('Daily/2026.md', 'daily');
eq('list', await a.list(), ['Daily/2026.md', 'Notes/Hello.md']);
eq('read', await a.read('Notes/Hello.md'), '# Hi\nbody');
const st = await a.stat('Notes/Hello.md');
ok('stat type+size', st.type === 'file' && st.size === '# Hi\nbody'.length);
ok('stat missing → null', (await a.stat('nope.md')) === null);
await a.rename('Daily/2026.md', 'Daily/2026-06.md');
ok('rename', (await a.list()).includes('Daily/2026-06.md') && !(await a.list()).includes('Daily/2026.md'));
await a.remove('Daily/2026-06.md');
ok('remove', !(await a.list()).includes('Daily/2026-06.md'));
const snap = await a.snapshot();
eq('snapshot', snap['Notes/Hello.md'], '# Hi\nbody');

// --- sync variants (desktop-only) ---
a.writeSync('Sync/s.md', 'sync content');
eq('writeSync+readSync', a.readSync('Sync/s.md'), 'sync content');
ok('existsSync', a.existsSync('Sync/s.md') && !a.existsSync('Sync/nope.md'));

// --- fs.watch fires on change ---
let watched = null;
const unwatch = a.watch('Notes', () => { watched = true; });
await a.write('Notes/Hello.md', 'changed');
await new Promise((r) => setTimeout(r, 120));
unwatch();
ok('watch returns unsubscribe', typeof unwatch === 'function');
ok('watch fired on change', watched === true);

// --- CORS-free requestUrl with injected transport (deterministic) ---
let sentHeaders = null, sentUrl = null;
const fakeTransport = async (url, init) => { sentUrl = url; sentHeaders = init.headers; return { status: 200, headers: { get: () => null, entries: () => [['content-type', 'application/json']] }, text: async () => '{"ok":true}', arrayBuffer: async () => new ArrayBuffer(2) }; };
const resp = await requestUrl({ url: 'https://api.example.com/x', headers: { Origin: 'app://obsidian.md', 'User-Agent': 'Obsidian', Cookie: 'a=1' } }, fakeTransport);
eq('requestUrl status', resp.status, 200);
eq('requestUrl json parsed', resp.json, { ok: true });
eq('requestUrl text', resp.text, '{"ok":true}');
eq('requestUrl headers normalized', resp.headers['content-type'], 'application/json');
ok('CORS-free: forwards forbidden headers', sentHeaders.Origin === 'app://obsidian.md' && sentHeaders.Cookie === 'a=1');
eq('requestUrl url', sentUrl, 'https://api.example.com/x');

// --- Platform + child_process gate ---
ok('Platform.isDesktop', DesktopPlatform.isDesktop === true && DesktopPlatform.isMobile === false);
ok('child_process available on desktop', typeof getProcessRunner().exec === 'function');
let threw = false; try { getProcessRunner({ isDesktop: false }); } catch { threw = true; }
ok('child_process walled on web', threw);

await fsp.rm(base, { recursive: true, force: true });

console.log('=== Phase 8: desktop adapter + requestUrl + capabilities ===');
for (const c of log) console.log(c);
console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail) { console.log(`\nFAIL: ${fail}`); process.exit(1); }
console.log('\nAC GREEN: desktop fs adapter + CORS-free requestUrl + capability gating verified.');
process.exit(0);
