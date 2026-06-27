// Phase 8 Tauri AC: the native desktop layer is REAL — the Rust core capability tests
// pass (cargo test), the desktop binary + .app bundle exist (built on this host), and
// the JS bridge wires the web app to the native commands. This flips the Tauri binary
// from "deferred" to "proven" because this machine has the Rust/clang/xcode toolchain.
import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTauri } from '../src/desktop/tauri-bridge.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0; const log = [];
const ok = (n, c, d = '') => { if (c) { pass++; log.push(`  ✓ ${n}`); } else { fail++; log.push(`  ✗ ${n} ${d}`); } };
const exists = async (p) => { try { await fs.access(path.join(ROOT, p)); return true; } catch { return false; } };

console.log('=== Phase 8: native Tauri desktop shell ===');

// 1. native core capability tests pass (real fs / child_process / CORS-free HTTP in Rust)
const cargo = spawnSync('cargo', ['test', '-p', 'pumice-core', '--quiet'], { cwd: path.join(ROOT, 'src-tauri'), encoding: 'utf8' });
const cargoOk = cargo.status === 0 && /test result: ok/.test((cargo.stdout || '') + (cargo.stderr || ''));
ok('cargo test pumice-core passes (native fs/process/HTTP)', cargoOk, cargo.status === null ? '(cargo unavailable)' : '');

// 2. the native crate + tauri app are present and wired
ok('native core crate present', await exists('src-tauri/core/src/lib.rs'));
ok('tauri app crate present', await exists('src-tauri/app/src/main.rs') && await exists('src-tauri/app/tauri.conf.json'));
ok('tauri commands wired (read/write/list/net/proc)', await (async () => { const m = await fs.readFile(path.join(ROOT, 'src-tauri/app/src/main.rs'), 'utf8'); return ['vault_read', 'vault_write', 'vault_list', 'net_request', 'proc_run'].every((c) => m.includes(c)); })());

// 3. JS bridge exposes the desktop adapter + isTauri detection
ok('tauri-bridge present + isTauri() false in node', isTauri() === false && await exists('src/desktop/tauri-bridge.js'));

// 4. build artifacts (this host has the toolchain → the binary + .app were built)
const binBuilt = await exists('src-tauri/target/release/pumice') || await exists('src-tauri/target/debug/pumice');
ok('native desktop binary built (Mach-O)', binBuilt);
const appBuilt = await exists('src-tauri/target/release/bundle/macos/Pumice.app/Contents/MacOS/pumice');
ok('macOS .app bundle built', appBuilt);

console.log('');
for (const c of log) console.log(c);
console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail) { console.log(`\nFAIL: ${fail}`); process.exit(1); }
console.log('\nAC GREEN: native Tauri desktop shell built + tested (binary, .app, native commands).');
process.exit(0);
