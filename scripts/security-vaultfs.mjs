// Security gate: the server-side vault fs must NOT let a client escape the vault root,
// including via SYMLINKS (a symlink inside the vault pointing at /etc/passwd passes a
// lexical `../` check but realpath-resolves outside ROOT). Proves the fix in vaultFs.js.
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = await fs.mkdtemp(path.join(os.tmpdir(), 'pumice-sec-'));
const vault = path.join(base, 'vault');
await fs.mkdir(vault, { recursive: true });
await fs.writeFile(path.join(vault, 'ok.md'), '# ok');
// a secret OUTSIDE the vault, and a symlink INSIDE the vault pointing at it
const secret = path.join(base, 'secret.txt');
await fs.writeFile(secret, 'TOP SECRET');
await fs.symlink(secret, path.join(vault, 'leak.md')).catch(() => {});

process.env.VAULT_DIR = vault;
const { readFile, writeFile } = await import('../server/vaultFs.js?sec=' + Date.now());

let pass = 0, fail = 0; const log = [];
const ok = (n, c) => { if (c) { pass++; log.push('  ✓ ' + n); } else { fail++; log.push('  ✗ ' + n); } };

// normal read works
ok('reads a normal vault file', (await readFile('ok.md')) === '# ok');

// `../` traversal blocked
let blocked = false; try { await readFile('../secret.txt'); } catch { blocked = true; }
ok('blocks ../ path traversal on read', blocked);

// symlink traversal blocked (the actual vuln)
let symBlocked = false; let leaked = null;
try { leaked = await readFile('leak.md'); } catch { symBlocked = true; }
ok('blocks SYMLINK traversal on read (no secret leaked)', symBlocked && leaked !== 'TOP SECRET');

// write traversal blocked
let writeBlocked = false; try { await writeFile('../escape.md', 'x'); } catch { writeBlocked = true; }
ok('blocks ../ path traversal on write', writeBlocked);
ok('no escape file written outside vault', !(await fs.access(path.join(base, 'escape.md')).then(() => true).catch(() => false)));

await fs.rm(base, { recursive: true, force: true });

console.log('=== Security: vault fs path/symlink containment ===');
for (const l of log) console.log(l);
console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail) { console.log('\nFAIL'); process.exit(1); }
console.log('\nAC GREEN: vault fs blocks ../ and symlink traversal.');
process.exit(0);
