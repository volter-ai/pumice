// Shared VaultAdapter conformance suite (DoD #12). Any adapter that passes this
// honors the interface: list/read/write/snapshot + round-trip + capability flags.
// Run against the in-memory adapter (and the node-fs adapter as a second backend).
import assert from 'node:assert';
import { memoryAdapter } from '../src/vfs/memoryAdapter.js';
import { listFiles, readFile, writeFile, snapshot } from '../server/vaultFs.js';

async function conform(name, adapter) {
  const fails = [];
  const check = async (label, fn) => {
    try { await fn(); console.log(`  ✓ ${label}`); }
    catch (e) { fails.push(label); console.log(`  ✗ ${label}: ${e.message}`); }
  };

  console.log(`\n[${name}] capabilities: ${JSON.stringify(adapter.capabilities)}`);
  await check('has name + capabilities', async () => {
    assert.ok(typeof adapter.name === 'string');
    assert.ok(adapter.capabilities && typeof adapter.capabilities.write === 'boolean');
  });
  await check('write then read round-trips', async () => {
    await adapter.write('_conform.md', '# hi\n[[X]]\n');
    assert.strictEqual(await adapter.read('_conform.md'), '# hi\n[[X]]\n');
  });
  await check('list includes written file', async () => {
    assert.ok((await adapter.list()).includes('_conform.md'));
  });
  await check('snapshot returns path->content map', async () => {
    const snap = await adapter.snapshot();
    assert.strictEqual(snap['_conform.md'], '# hi\n[[X]]\n');
  });
  await check('overwrite updates content', async () => {
    await adapter.write('_conform.md', 'changed');
    assert.strictEqual(await adapter.read('_conform.md'), 'changed');
  });
  await check('read missing file throws', async () => {
    await assert.rejects(() => adapter.read('_nope_does_not_exist.md'));
  });
  return fails;
}

const nodeFsAdapter = {
  name: 'node-fs',
  capabilities: { write: true, watch: false, sync: true },
  list: listFiles, read: readFile, write: writeFile, snapshot,
};

let total = 0;
for (const [name, a] of [['memory', memoryAdapter()], ['node-fs', nodeFsAdapter]]) {
  total += (await conform(name, a)).length;
}
// cleanup the node-fs artifact
try { const fs = await import('node:fs'); fs.unlinkSync(new URL('../vault/_conform.md', import.meta.url)); } catch {}

console.log(`\n${total === 0 ? 'ADAPTER CONFORMANCE: ALL GREEN' : total + ' FAILURE(S)'}`);
process.exit(total === 0 ? 0 : 1);
