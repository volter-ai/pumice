// One CI runner for every roadmap AC gate. Runs each in a child process, reports
// pass/fail, exits nonzero if any gate regresses. Keeps "all gates green" a single
// command as the roadmap loop adds phases.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const GATES = [
  ['Phase 1  · curated breadth (25, floor 25)', 'compat-harness.mjs'],
  ['Phase 1  · full breadth (78, floor 71)', 'compat-top100.mjs'],
  ['Phase 1  · 5-plugin real-DOM AC', 'triage-real-dom.mjs'],
  ['VFS      · adapter conformance', 'test-adapters.mjs'],
  ['Security · vault fs path/symlink containment', 'security-vaultfs.mjs'],
  ['Phase 2a · editor on real CM6', 'phase2-editor.mjs'],
  ['Phase 2b · live-preview decorations', 'phase2-livepreview.mjs'],
  ['Phase 3  · workspace leaves/splits/tabs', 'phase3-workspace.mjs'],
  ['Phase 3  · plugin-T4 behaviors (style/tag/cal)', 'phase3-t4.mjs'],
  ['Phase 4r · markdown DOM render', 'phase4-render.mjs'],
  ['Phase 4r · search/switcher/panes', 'phase4-rest.mjs'],
  ['Phase 4r · properties/daily/templates', 'phase4-core.mjs'],
  ['Phase 4r · composer/recovery/bookmarks', 'phase4-compose.mjs'],
  ['Phase 4r · page-preview/properties-UI/graph', 'phase4-ui.mjs'],
  ['Phase 5  · canvas parse/render/zero-diff', 'phase5-canvas.mjs'],
  ['Phase 6  · bases table/card/filter/formula', 'phase6-bases.mjs'],
  ['Phase 7  · config round-trip + theme vars', 'phase7-config.mjs'],
  ['Phase 7  · 5-theme CSS-var contract + budget', 'phase7-themes.mjs'],
  ['Phase 8  · desktop adapter + requestUrl', 'phase8-desktop.mjs'],
  ['Phase 9  · git + notion storage adapters', 'phase9-storage.mjs'],
  ['Phase 10 · mobile platform + isDesktopOnly', 'phase10-mobile.mjs'],
  ['Phase 11 · perf budgets (10k notes)', 'phase11-perf.mjs'],
  ['Phase 12 · MCP tools + tri-surface parity', 'phase12-mcp.mjs'],
  ['Phase 8  · native Tauri desktop (binary+.app)', 'phase8-tauri.mjs'],
  ['Dev-SDK  · setupPluginHost embedding', 'sdk-embed.mjs'],
  ['Dev-SDK  · npm package exports + types', 'package-exports.mjs'],
  ['Agent    · MCP stdio JSON-RPC server', 'mcp-stdio.mjs'],
  ['Web      · drag-drop + published viewer', 'drop-publish.mjs'],
  ['DoD v1.0 · 16 Definition-of-Done gates', 'dod-checklist.mjs'],
];

let failed = 0;
console.log('=== ROADMAP CI: all AC gates ===\n');
for (const [label, script] of GATES) {
  const r = spawnSync(process.execPath, [path.join(here, script)], { encoding: 'utf8' });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${label}`);
  if (!ok) console.log((r.stdout || '').split('\n').filter((l) => /✗|FAIL|REGRESS/.test(l)).slice(0, 5).map((l) => '       ' + l).join('\n'));
}
console.log(`\n${GATES.length - failed}/${GATES.length} gates green.`);
process.exit(failed ? 1 : 0);
