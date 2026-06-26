// Node-side implementation of the vault over the real local filesystem.
// This is what the Vite dev server exposes at /api, giving you a "serve your fs
// locally" mode that both the browser SPA and headless AI agents can hit.

import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.env.VAULT_DIR || 'vault');

// Refuse to escape the vault root — agents get write access, so contain it.
function resolveSafe(rel) {
  const p = path.resolve(ROOT, rel);
  if (p !== ROOT && !p.startsWith(ROOT + path.sep)) throw new Error('path escapes vault');
  return p;
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
  return fs.readFile(resolveSafe(rel), 'utf8');
}

export async function writeFile(rel, content) {
  const p = resolveSafe(rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, 'utf8');
}

export async function snapshot() {
  const files = {};
  for (const rel of await listFiles()) files[rel] = await readFile(rel);
  return files;
}
