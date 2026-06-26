// The /api surface — a Connect-style middleware mounted by Vite (see vite.config.js).
// One JSON REST API serves THREE clients identically:
//   • the browser SPA (httpAdapter)
//   • AI agents / CLIs (curl, fetch, an MCP shim)
//   • any other machine on your LAN
//
// Endpoints (all under /api):
//   GET  /health                      -> { ok, vault, capabilities }
//   GET  /files                       -> { files: string[] }
//   GET  /file?path=note.md           -> { path, content }
//   PUT  /file        {path,content}  -> { ok }
//   POST /append      {path,content}  -> { ok }      (agent-friendly partial write)
//   POST /search      {query}         -> { results }  (supports tag:/path: fields)
//   GET  /backlinks?path=note.md      -> { path, backlinks }
//   GET  /graph                       -> { nodes, links }

import { listFiles, readFile, writeFile, snapshot, vaultRoot } from './vaultFs.js';
import { buildGraph, backlinks, search } from '../src/vfs/links.js';

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  // Same-origin in the SPA, but permissive so local agents can call cross-tool.
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,PUT,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

export function apiMiddleware() {
  return async (req, res, next) => {
    const u = new URL(req.url, 'http://localhost');
    if (!u.pathname.startsWith('/api/')) return next();
    const route = u.pathname.slice(4); // strip "/api"

    try {
      if (req.method === 'OPTIONS') return send(res, 204, {});

      if (route === '/health') {
        return send(res, 200, {
          ok: true,
          vault: vaultRoot(),
          capabilities: { write: true, watch: false, sync: true },
        });
      }
      if (route === '/files') {
        return send(res, 200, { files: await listFiles() });
      }
      if (route === '/file' && req.method === 'GET') {
        const path = u.searchParams.get('path');
        return send(res, 200, { path, content: await readFile(path) });
      }
      if (route === '/file' && req.method === 'PUT') {
        const { path, content } = await readBody(req);
        await writeFile(path, content);
        return send(res, 200, { ok: true, path });
      }
      if (route === '/append' && req.method === 'POST') {
        const { path, content } = await readBody(req);
        const cur = await readFile(path).catch(() => '');
        await writeFile(path, cur + content);
        return send(res, 200, { ok: true, path });
      }
      if (route === '/search' && req.method === 'POST') {
        const { query } = await readBody(req);
        return send(res, 200, { results: search(await snapshot(), query || '') });
      }
      if (route === '/backlinks') {
        const path = u.searchParams.get('path');
        return send(res, 200, { path, backlinks: backlinks(await snapshot(), path) });
      }
      if (route === '/graph') {
        return send(res, 200, buildGraph(await snapshot()));
      }
      if (route === '/snapshot') {
        return send(res, 200, { files: await snapshot() });
      }
      return send(res, 404, { error: 'no such route', route });
    } catch (e) {
      return send(res, 500, { error: String(e && e.message || e) });
    }
  };
}
