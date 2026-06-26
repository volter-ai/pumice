// Headless proof: load REAL-shape Obsidian plugins against the VFS and run their
// commands — no browser, no Electron. Demonstrates the shim subset works.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { listFiles, readFile, writeFile, snapshot } from '../server/vaultFs.js';
import { marked } from 'marked';
import { createApp } from '../src/obsidian/runtime.js';
import { setNoticeSink } from '../src/obsidian/api.js';
import { activatePlugin } from '../src/obsidian/loader.js';

// Adapter: Obsidian's Vault will consume THIS — the same VaultAdapter shape the
// browser and agent API use.
const adapter = {
  name: 'node-fs',
  capabilities: { write: true, watch: false, sync: true },
  list: listFiles,
  read: readFile,
  write: writeFile,
  snapshot,
};

const notices = [];
setNoticeSink((m) => notices.push(m));

const app = await createApp(adapter, async (md) => marked.parse(md));

const pluginsDir = new URL('../plugins/', import.meta.url).pathname;
const ids = (await fs.readdir(pluginsDir, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

let failures = 0;
const loaded = [];
for (const id of ids) {
  const dir = path.join(pluginsDir, id);
  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
  const source = await fs.readFile(path.join(dir, 'main.js'), 'utf8');
  try {
    const p = await activatePlugin({ app, manifest, source });
    loaded.push(p);
    console.log(`✓ loaded "${manifest.name}" — ${p.commands.length} command(s), ${p.ribbon.length} ribbon item(s)`);
  } catch (e) {
    failures++;
    console.log(`✗ failed "${manifest.name}": ${e.message}`);
  }
}

console.log('\n--- running commands ---');
const wc = await app.commands.executeCommandById('count-vault-words');
console.log('count-vault-words →', wc, typeof wc === 'number' && wc > 0 ? 'OK' : 'FAIL');
if (!(typeof wc === 'number' && wc > 0)) failures++;

const tagCount = await app.commands.executeCommandById('build-tag-index');
console.log('build-tag-index →', tagCount, 'tags');
const wrote = (await listFiles()).includes('Tag Index.md');
console.log('Tag Index.md written back through VFS →', wrote ? 'OK' : 'FAIL');
if (!wrote) failures++;

console.log('\n--- notices emitted ---');
notices.forEach((n) => console.log('  •', n));

console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
process.exit(failures === 0 ? 0 : 1);
