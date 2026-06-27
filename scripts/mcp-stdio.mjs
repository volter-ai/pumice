// MCP transport AC: spawn the real MCP stdio server as a child process and speak
// JSON-RPC 2.0 over its stdin/stdout — the exact path an agent (Claude Desktop) uses.
// Proves the server isn't just in-process functions: a separate process answers.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const child = spawn(process.execPath, [path.join(ROOT, 'bin/pumice-mcp.mjs')], {
  env: { ...process.env, VAULT_DIR: path.join(ROOT, 'vault') },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buf = '';
const pending = new Map();
child.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.id != null && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  }
});
function rpc(id, method, params) {
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => reject(new Error('timeout ' + method)), 5000);
  });
}

let pass = 0, fail = 0; const log = [];
const ok = (n, c, d = '') => { if (c) { pass++; log.push('  ✓ ' + n); } else { fail++; log.push('  ✗ ' + n + ' ' + d); } };

try {
  const init = await rpc(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {} });
  ok('initialize handshake', init.result && init.result.serverInfo && init.result.serverInfo.name === 'pumice');

  const tools = await rpc(2, 'tools/list', {});
  const names = (tools.result.tools || []).map((t) => t.name);
  ok('tools/list returns vault tools', names.includes('vault_search') && names.includes('vault_read') && names.includes('vault_list'));
  ok('tools have inputSchema', tools.result.tools.every((t) => t.inputSchema && t.inputSchema.type === 'object'));

  const list = await rpc(3, 'tools/call', { name: 'vault_list', arguments: {} });
  const listed = JSON.parse(list.result.content[0].text);
  ok('tools/call vault_list returns paths', Array.isArray(listed) && listed.length > 0);

  const search = await rpc(4, 'tools/call', { name: 'vault_search', arguments: { query: 'Adapters' } });
  ok('tools/call vault_search works over the wire', /Adapters/.test(search.result.content[0].text));

  const bad = await rpc(5, 'unknown/method', {});
  ok('unknown method → JSON-RPC error', bad.error && bad.error.code === -32601);
} catch (e) {
  ok('mcp stdio session', false, e.message);
}
child.kill();

console.log('=== MCP: real stdio JSON-RPC server ===');
for (const l of log) console.log(l);
console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail) { console.log('\nFAIL'); process.exit(1); }
console.log('\nAC GREEN: an agent can connect to the MCP server over stdio.');
process.exit(0);
