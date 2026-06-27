// Tauri bridge — when Pumice runs inside the native desktop shell, this exposes a
// VaultAdapter (and requestUrl / runCommand) backed by the REAL native commands in
// `src-tauri/core` (Rust), invoked over Tauri IPC. In the browser, `isTauri()` is false
// and the app uses the web adapters instead. Same VaultAdapter interface either way.

export function isTauri() {
  return typeof window !== 'undefined' && !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

async function invoke(cmd, args) {
  // Tauri v2 exposes invoke on window.__TAURI__.core.invoke (or via @tauri-apps/api).
  const core = window.__TAURI__ && window.__TAURI__.core;
  if (!core || !core.invoke) throw new Error('Tauri invoke unavailable (not running in the desktop shell)');
  return core.invoke(cmd, args);
}

/** A real-filesystem VaultAdapter over the native Rust commands. `base` is the vault root. */
export function tauriAdapter(base) {
  return {
    name: 'tauri-fs',
    capabilities: { write: true, watch: false, sync: false, requestUrl: true, childProcess: true },
    async list() { return invoke('vault_list', { base }); },
    async read(p) { return invoke('vault_read', { base, path: p }); },
    async write(p, content) { return invoke('vault_write', { base, path: p, content }); },
    async remove(p) { return invoke('vault_remove', { base, path: p }); },
    async rename(from, to) { return invoke('vault_rename', { base, from, to }); },
    async stat(p) { return invoke('vault_stat', { base, path: p }); },
    async snapshot() { const files = await invoke('vault_list', { base }); const out = {}; for (const f of files) out[f] = await invoke('vault_read', { base, path: f }); return out; },
  };
}

/** CORS-free requestUrl via native net (Obsidian desktop parity). */
export async function requestUrl(options) {
  const o = typeof options === 'string' ? { url: options } : options;
  const headers = Object.entries(o.headers || {}).map(([k, v]) => [k, String(v)]);
  const r = await invoke('net_request', { url: o.url, method: o.method || 'GET', headers, body: o.body || null });
  let json = null; try { json = JSON.parse(r.text); } catch {}
  return { status: r.status, text: r.text, json, headers: {} };
}

/** child_process via native exec (desktop-only). */
export async function runCommand(cmd, args = []) {
  return invoke('proc_run', { cmd, args });
}
