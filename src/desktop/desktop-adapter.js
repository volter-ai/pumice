// Phase 8 — Desktop shell adapter contract. The desktop (Tauri/Electron) build gives
// the renderer native capabilities a browser can't: a real filesystem (sync + async +
// watch), CORS-free `requestUrl`, and `child_process`. This module is that adapter +
// capability model, implemented over node:fs so the contract is testable in CI; the
// Tauri shell swaps node:fs for its own IPC fs with the same interface.
import { promises as fsp } from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';

/** A real-filesystem VaultAdapter rooted at `base`. Implements the full VFS contract. */
export function desktopAdapter(base, opts = {}) {
  const abs = (p) => path.join(base, p);
  const rel = (p) => path.relative(base, p).split(path.sep).join('/');
  async function walk(dir) {
    const out = [];
    for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...await walk(full));
      else out.push(rel(full));
    }
    return out;
  }
  return {
    name: opts.name || 'desktop-fs',
    capabilities: { write: true, watch: true, sync: true, requestUrl: true, childProcess: true },
    async list() { try { return (await walk(base)).sort(); } catch { return []; } },
    async read(p) { return fsp.readFile(abs(p), 'utf8'); },
    async write(p, content) { await fsp.mkdir(path.dirname(abs(p)), { recursive: true }); return fsp.writeFile(abs(p), content); },
    async stat(p) { try { const s = await fsp.stat(abs(p)); return { type: s.isDirectory() ? 'folder' : 'file', size: s.size, mtime: s.mtimeMs, ctime: s.birthtimeMs }; } catch { return null; } },
    async remove(p) { await fsp.rm(abs(p), { force: true }); },
    async rename(from, to) { await fsp.mkdir(path.dirname(abs(to)), { recursive: true }); await fsp.rename(abs(from), abs(to)); },
    async mkdir(p) { await fsp.mkdir(abs(p), { recursive: true }); },
    async snapshot() { const files = await walk(base).catch(() => []); const out = {}; for (const f of files) out[f] = await fsp.readFile(abs(f), 'utf8'); return out; },
    // sync variants (desktop-only; plugins like templater use them)
    readSync(p) { return fs.readFileSync(abs(p), 'utf8'); },
    writeSync(p, content) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), content); },
    existsSync(p) { return fs.existsSync(abs(p)); },
    // fs.watch — returns an unsubscribe fn; callback gets (eventType, relPath)
    watch(p, cb) { const w = fs.watch(abs(p), { recursive: true }, (type, name) => cb(type, name ? rel(path.join(abs(p), name)) : '')); return () => w.close(); },
  };
}

/**
 * CORS-free requestUrl (Obsidian's desktop `requestUrl`). On desktop the request goes
 * through native networking, so it bypasses browser CORS and can set forbidden headers
 * (Origin, User-Agent, Cookie). `transport` is injectable for tests; defaults to fetch.
 */
export async function requestUrl(options, transport) {
  const opts = typeof options === 'string' ? { url: options } : options;
  const send = transport || (typeof fetch !== 'undefined' ? fetch : null);
  if (!send) throw new Error('no transport available');
  const res = await send(opts.url, { method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return {
    status: res.status,
    headers: res.headers && res.headers.get ? Object.fromEntries((res.headers.entries ? [...res.headers.entries()] : [])) : (res.headers || {}),
    text,
    json,
    arrayBuffer: res.arrayBuffer ? await res.arrayBuffer().catch(() => null) : null,
  };
}

/** Desktop Platform flags (Obsidian's Platform.*). */
export const DesktopPlatform = { isDesktop: true, isMobile: false, isDesktopApp: true, isWin: process.platform === 'win32', isMacOS: process.platform === 'darwin', isLinux: process.platform === 'linux' };

/** child_process capability gate — desktop-only; returns a runner or throws on web. */
export function getProcessRunner(platform = DesktopPlatform) {
  if (!platform.isDesktop) throw new Error('child_process is desktop-only (capability wall)');
  return { async exec(cmd, args = []) { const { execFile } = await import('node:child_process'); return new Promise((resolve, reject) => execFile(cmd, args, (err, stdout, stderr) => (err ? reject(err) : resolve({ stdout, stderr })))); } };
}
