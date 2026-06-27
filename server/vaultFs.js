// Node-side implementation of the vault over the real local filesystem.
// This is what the Vite dev server exposes at /api, giving you a "serve your fs
// locally" mode that both the browser SPA and headless AI agents can hit.

import { promises as fs, realpathSync } from 'node:fs';
import path from 'node:path';

// Realpath ROOT once (so symlinked roots like macOS /var → /private/var don't make
// every legitimate path look like an escape). Fall back to the lexical path if the
// vault dir doesn't exist yet.
const ROOT_LEXICAL = path.resolve(process.env.VAULT_DIR || 'vault');
let ROOT;
try { ROOT = realpathSync(ROOT_LEXICAL); } catch { ROOT = ROOT_LEXICAL; }

// Refuse to escape the vault root — agents get write access, so contain it.
// Lexical check first (blocks `../`), then a realpath check that also defeats SYMLINKS
// (a symlink inside the vault pointing at /etc/passwd passes the lexical test but
// resolves outside ROOT — realpath catches it). For not-yet-existing paths (writes),
// realpath the nearest existing ancestor.
function resolveSafe(rel) {
  const p = path.resolve(ROOT, rel);
  if (p !== ROOT && !p.startsWith(ROOT + path.sep)) throw new Error('path escapes vault');
  return p;
}

function resolveReal(rel) {
  const p = resolveSafe(rel);
  let probe = p;
  // climb to the nearest existing ancestor, realpath it, confirm it stays in ROOT
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const real = realpathSync(probe);
      if (real !== ROOT && !real.startsWith(ROOT + path.sep)) throw new Error('path escapes vault (symlink)');
      return p;
    } catch (e) {
      if (e && e.code === 'ENOENT' && probe !== ROOT) { probe = path.dirname(probe); continue; }
      if (e && /escapes vault/.test(e.message)) throw e;
      return p; // ROOT itself unresolved or other benign case
    }
  }
}

export function vaultRoot() {
  return ROOT;
}

export async function listFiles() {
  const out = [];
  async function walk(dir, prefix) {
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(path.join(dir, e.name), rel);
      else if (e.name.toLowerCase().endsWith('.md')) out.push(rel);
    }
  }
  await walk(ROOT, '');
  return out.sort();
}

export async function readFile(rel) {
  return fs.readFile(resolveReal(rel), 'utf8');
}

export async function writeFile(rel, content) {
  const p = resolveReal(rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, 'utf8');
}

export async function snapshot() {
  const files = {};
  for (const rel of await listFiles()) files[rel] = await readFile(rel);
  return files;
}
