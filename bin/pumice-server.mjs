#!/usr/bin/env node
// Standalone Pumice server — self-hosting entrypoint (NOT Vite). Serves the built
// static app from dist/ AND the vault /api over the symlink-safe node fs adapter.
//   VAULT_DIR=/path/to/vault PORT=3000 node bin/pumice-server.mjs
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiMiddleware } from '../server/api.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 3000);
const api = apiMiddleware();

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

async function serveStatic(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel === '/') rel = '/index.html';
  // contain to DIST (no traversal)
  const abs = path.join(DIST, rel);
  if (!abs.startsWith(DIST)) { res.writeHead(403).end('forbidden'); return; }
  try {
    const data = await fs.readFile(abs);
    res.writeHead(200, { 'content-type': MIME[path.extname(abs)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
}

const server = http.createServer((req, res) => {
  // /api/* → vault API (symlink-safe); everything else → static dist
  api(req, res, () => serveStatic(req, res));
});

server.listen(PORT, () => {
  console.log(`Pumice server: http://localhost:${PORT}  (vault: ${process.env.VAULT_DIR || 'vault'}, static: dist/)`);
});

export { server };
