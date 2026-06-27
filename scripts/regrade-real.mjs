// HONEST re-grade: does the REAL plugin actually FUNCTION on the shim, not just onload?
// T2 (the old metric) = "onload didn't throw". This harness asserts real behavior:
//   - the shim now feeds genuine MetadataCache data (resolvedLinks/listItems/tags/backlinks)
//   - a real plugin's own index/feature produces real output
// Each probe reports pass/fail WITH the concrete reason, so the failing tail is a
// precise shim-gap list — not a vanity number.
import { window } from './dom-bootstrap.mjs'; // MUST be first — sets global DOM
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { memoryAdapter } from '../src/vfs/memoryAdapter.js';
import { createApp } from '../src/obsidian/runtime.js';
import { activatePlugin } from '../src/obsidian/loader.js';
import * as cmState from '@codemirror/state';
import * as cmView from '@codemirror/view';
import * as cmLanguage from '@codemirror/language';
import * as cmCommands from '@codemirror/commands';
import * as cmAutocomplete from '@codemirror/autocomplete';
import * as cmSearch from '@codemirror/search';
import * as lezerCommon from '@lezer/common';
import * as lezerHighlight from '@lezer/highlight';

const REAL_EXTERNALS = {
  '@codemirror/state': cmState, '@codemirror/view': cmView, '@codemirror/language': cmLanguage,
  '@codemirror/commands': cmCommands, '@codemirror/autocomplete': cmAutocomplete, '@codemirror/search': cmSearch,
  '@lezer/common': lezerCommon, '@lezer/highlight': lezerHighlight,
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGINS_DIR = path.join(__dirname, '..', 'real-plugins');

// Deterministic fixture with tasks, tags, links, frontmatter.
const FIXTURE = {
  'Project.md': `---\ntags: [project, active]\naliases: [Proj]\n---\n# Project\nSee [[Tasks]] and [[Ideas]]. This is #urgent.\n`,
  'Tasks.md': `# Tasks\n- [ ] open task about [[Project]]\n- [x] done task #done\n- [ ] another #todo\n`,
  'Ideas.md': `# Ideas\nBack to [[Project]].\n\n## Sub\nsome text\n`,
};

const renderMarkdown = async (md, el) => { el.innerHTML = marked.parse(md, { gfm: true }); return el; };

function ok(cond, detail) { return { pass: !!cond, detail }; }

async function main() {
  const app = await createApp(memoryAdapter(FIXTURE), renderMarkdown);
  const mc = app.metadataCache;
  const file = (p) => app.vault.getAbstractFileByPath(p);

  const results = [];

  // ---- Foundation probes: the shim data real plugins read (was empty before keystone) ----
  results.push(['shim: resolvedLinks', (() => {
    const r = mc.resolvedLinks;
    const proj = r['Project.md'] || {};
    return ok(proj['Tasks.md'] === 1 && proj['Ideas.md'] === 1 && (r['Ideas.md'] || {})['Project.md'] === 1,
      `Project.md -> ${JSON.stringify(proj)}`);
  })()]);

  results.push(['shim: getFileCache.listItems+tasks', (() => {
    const c = mc.getFileCache(file('Tasks.md'));
    const tasks = (c.listItems || []).filter((i) => 'task' in i);
    const open = tasks.filter((t) => t.task === ' ').length, done = tasks.filter((t) => t.task === 'x').length;
    return ok(tasks.length === 3 && open === 2 && done === 1, `${tasks.length} list items, ${open} open / ${done} done`);
  })()]);

  results.push(['shim: tags (inline + frontmatter)', (() => {
    const t = mc.getTags();
    return ok(t['#project'] && t['#active'] && t['#urgent'] && t['#todo'], JSON.stringify(t));
  })()]);

  results.push(['shim: getBacklinksForFile', (() => {
    const bl = mc.getBacklinksForFile(file('Project.md'));
    return ok(bl.data.has('Tasks.md') && bl.data.has('Ideas.md'), `backlinks: ${[...bl.data.keys()].join(', ')}`);
  })()]);

  results.push(['shim: headings+positions', (() => {
    const c = mc.getFileCache(file('Ideas.md'));
    const h = c.headings || [];
    return ok(h.length === 2 && h[1].heading === 'Sub' && typeof h[1].position?.start?.line === 'number',
      `${h.length} headings, positions=${!!h[0]?.position}`);
  })()]);

  results.push(['shim: metadataCache fires resolve/changed on write', await (async () => {
    let resolved = 0, changed = 0;
    mc.on('resolved', () => resolved++); mc.on('changed', () => changed++);
    await app.vault.modify(file('Ideas.md'), '# Ideas\nNow links [[Tasks]] too. [[Project]]\n');
    const r = mc.resolvedLinks['Ideas.md'] || {};
    return ok(resolved > 0 && changed > 0 && r['Tasks.md'] === 1, `resolved+=${resolved} changed+=${changed}, Ideas->${JSON.stringify(r)}`);
  })()]);

  // ---- Real-plugin functional probe: Dataview's own index (was empty: no resolve events) ----
  let dvDetail = '';
  const dvProbe = await (async () => {
    try {
      const source = await fs.readFile(path.join(PLUGINS_DIR, 'dataview.js'), 'utf8');
      const manifest = { id: 'dataview', name: 'Dataview', version: '0.5.0', minAppVersion: '0.13.0' };
      const { instance } = await activatePlugin({ app, manifest, source, externals: REAL_EXTERNALS });
      // Dataview builds its FullIndex from metadataCache; nudge a resolved cycle.
      app.metadataCache.trigger('resolved');
      app.workspace.trigger?.('resolved');
      await new Promise((r) => setTimeout(r, 50));
      const idx = instance.index;
      const pages = idx?.pages?.size ?? idx?.pages?.length;
      dvDetail = `index=${!!idx} pages=${pages}`;
      return ok(idx && pages > 0, dvDetail);
    } catch (e) { dvDetail = 'threw: ' + e.message; return ok(false, dvDetail); }
  })();
  results.push(['dataview: builds real page index', dvProbe]);

  // ---- Report ----
  let pass = 0;
  console.log('\n  REAL-FUNCTION RE-GRADE (bar = actually works, not just onload)\n');
  for (const [name, r] of results) {
    console.log(`  ${r.pass ? '✅' : '❌'} ${name.padEnd(44)} ${r.detail || ''}`);
    if (r.pass) pass++;
  }
  console.log(`\n  ${pass}/${results.length} functional probes pass\n`);
  process.exit(pass === results.length ? 0 : 1);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
