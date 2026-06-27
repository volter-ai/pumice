import { httpAdapter } from './vfs/httpAdapter.js';
import { pickFolderAdapter } from './vfs/fsaAdapter.js';
import { backlinks as backlinksOf } from './vfs/links.js';
import { renderMarkdown } from './render/obsidian-markdown.js';
// Graph visualization is provided by the REAL 3D-graph Obsidian plugin in the workbench
// (src/app/workbench.js) — no Pumice-built graph here.

const els = {
  list: document.getElementById('list'),
  note: document.getElementById('note'),
  backlinks: document.getElementById('backlinks'),
  graph: document.getElementById('graph'),
  title: document.getElementById('title'),
  mode: document.getElementById('mode'),
  pick: document.getElementById('pick'),
  serve: document.getElementById('serve'),
};

let adapter = null;
let snapshot = {}; // path -> content
let nameToPath = new Map();

function indexNames() {
  nameToPath = new Map();
  for (const p of Object.keys(snapshot)) {
    const n = (p.split('/').pop() || p).replace(/\.md$/i, '').toLowerCase();
    nameToPath.set(n, p);
  }
}

async function load(adp) {
  adapter = adp;
  els.mode.textContent = `mode: ${adapter.name} ${adapter.capabilities.write ? '(read/write)' : '(read-only)'}`;
  snapshot = await adapter.snapshot();
  indexNames();
  renderList();
  const first = Object.keys(snapshot)[0];
  if (first) openByPath(first);
}

function renderList() {
  els.list.innerHTML = '';
  for (const p of Object.keys(snapshot).sort()) {
    const li = document.createElement('li');
    li.textContent = p.replace(/\.md$/i, '');
    li.onclick = () => openByPath(p);
    els.list.appendChild(li);
  }
}

function openByPath(path) {
  const content = snapshot[path];
  if (content == null) return;
  els.title.textContent = path.replace(/\.md$/i, '');
  els.note.replaceChildren();
  renderMarkdown(content, els.note, { resolve: (name) => '#' + encodeURIComponent(name) });
  els.note.querySelectorAll('a.internal-link').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const name = decodeURIComponent(a.dataset.target).toLowerCase();
      const tgt = nameToPath.get(name);
      if (tgt) openByPath(tgt);
    });
  });
  const bl = backlinksOf(snapshot, path);
  els.backlinks.innerHTML = bl.length
    ? bl.map((p) => `<li data-p="${p}">${p.replace(/\.md$/i, '')}</li>`).join('')
    : '<li class="muted">no backlinks</li>';
  els.backlinks.querySelectorAll('li[data-p]').forEach((li) =>
    li.addEventListener('click', () => openByPath(li.dataset.p)),
  );
}

// Two ways in, same interface behind them:
els.pick.onclick = async () => {
  try {
    await load(await pickFolderAdapter()); // no server
  } catch (e) {
    alert(e.message);
  }
};
els.serve.onclick = () => load(httpAdapter()); // local Vite fs API (also what agents use)

// Auto-connect to the served vault if the API is up (the default dev experience).
fetch('/api/health')
  .then((r) => (r.ok ? r.json() : null))
  .then((h) => h && load(httpAdapter()))
  .catch(() => {});
