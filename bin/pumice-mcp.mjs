#!/usr/bin/env node
// Pumice MCP server — a REAL Model Context Protocol server over stdio (newline-delimited
// JSON-RPC 2.0), so an agent (Claude Desktop, etc.) can connect and drive the vault.
// Wraps createVaultCore + createMcpServer. Backed by a real vault dir (VAULT_DIR), loaded
// into memory at start; writes persist back to disk.
//   VAULT_DIR=/path/to/vault node bin/pumice-mcp.mjs
import readline from 'node:readline';
import { createVaultCore, createMcpServer } from '../src/mcp/server.js';
import { snapshot, writeFile } from '../server/vaultFs.js';

const files = await snapshot().catch(() => ({}));
const store = {
  get() { return files; },
  set(p, c) { files[p] = c; writeFile(p, c).catch(() => {}); },
};
const core = createVaultCore(store);
const server = createMcpServer(core, { allowWrite: process.env.PUMICE_MCP_READONLY ? false : true });

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

async function handle(msg) {
  const { id, method, params } = msg;
  try {
    if (method === 'initialize') {
      return reply(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'pumice', version: '0.1.0' },
      });
    }
    if (method === 'notifications/initialized' || method === 'initialized') return; // notification, no reply
    if (method === 'tools/list') {
      const tools = server.listTools().map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: { type: 'object', properties: Object.fromEntries(Object.entries(t.input || {}).map(([k, ty]) => [k, { type: ty }])) },
      }));
      return reply(id, { tools });
    }
    if (method === 'tools/call') {
      const out = await server.callTool(params.name, params.arguments || {});
      return reply(id, { content: [{ type: 'text', text: JSON.stringify(out) }] });
    }
    if (method === 'ping') return reply(id, {});
    return fail(id, -32601, 'method not found: ' + method);
  } catch (e) {
    return fail(id, -32000, e.message);
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const t = line.trim();
  if (!t) return;
  let msg; try { msg = JSON.parse(t); } catch { return; }
  handle(msg);
});
process.stderr.write('pumice-mcp: ready on stdio\n');
