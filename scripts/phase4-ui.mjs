// Phase 4-rest UI leftovers AC: page-preview hover model + properties-UI widgets on a
// real DOM. (The Pumice-built 2D graph layout was a SUBSTITUTE and is RETIRED — graph
// visualization is now the REAL 3D-graph community plugin; see src/app/workbench.js
// mountRealGraph + the browser pass.)
import './dom-bootstrap.mjs';
import { createPagePreview, resolveLink, registerPagePreviews } from '../src/ui/page-preview.js';
import { buildPropertyWidget, buildPropertiesPanel } from '../src/ui/properties-ui.js';
import { renderMarkdown } from '../src/render/obsidian-markdown.js';

let pass = 0, fail = 0; const log = [];
function eq(name, got, want) { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name}\n      got:  ${g}\n      want: ${w}`); } }
function ok(name, cond, d = '') { if (cond) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name} ${d}`); } }

// ---------- page preview ----------
const files = { 'Notes/Target.md': '# Target\nbody with [[Other]] link and **bold**.', 'Notes/Other.md': '# Other' };
eq('resolveLink by name', resolveLink(files, 'Target'), 'Notes/Target.md');
ok('resolveLink miss → null', resolveLink(files, 'Nope') === null);
const pv = createPagePreview(files, 'Target');
ok('preview resolves path', pv.path === 'Notes/Target.md');
ok('preview is a popover', pv.el.classList.contains('hover-popover'));
ok('preview rendered markdown', pv.el.querySelector('h1') && pv.el.querySelector('strong'));
ok('preview rendered nested link', pv.el.querySelector('a.internal-link'));
const miss = createPagePreview(files, 'Ghost');
ok('missing preview is empty placeholder', miss.path === null && miss.el.classList.contains('is-empty'));

// hover registration fires preview into the DOM
const host = document.createElement('div'); document.body.appendChild(host);
renderMarkdown('see [[Target]] here', host, { resolve: (n) => '#' + n });
const teardown = registerPagePreviews(host, files);
const link = host.querySelector('a.internal-link');
link.dispatchEvent(new window.MouseEvent('mouseenter'));
ok('hover shows preview in body', !!document.querySelector('.hover-popover.mod-active'));
link.dispatchEvent(new window.MouseEvent('mouseleave'));
ok('leave removes preview', !document.querySelector('.hover-popover.mod-active'));
teardown();

// ---------- properties UI ----------
let changed = null;
const wText = buildPropertyWidget('title', 'Hello', (v) => { changed = v; });
ok('text widget type', wText.type === 'text' && wText.el.querySelector('input[type=text]').value === 'Hello');
const ti = wText.el.querySelector('input'); ti.value = 'Edited'; ti.dispatchEvent(new window.Event('input'));
ok('text widget edits fire onChange', changed === 'Edited' && wText.getValue() === 'Edited');

const wNum = buildPropertyWidget('count', 42, () => {});
ok('number widget', wNum.type === 'number' && wNum.getValue() === 42);
const wBool = buildPropertyWidget('done', true, () => {});
ok('checkbox widget reflects', wBool.el.querySelector('input').checked === true && wBool.getValue() === true);
const wDate = buildPropertyWidget('due', '2026-06-26', () => {});
ok('date widget', wDate.type === 'date' && wDate.el.querySelector('input').type === 'date');
const wList = buildPropertyWidget('tags', ['a', 'b'], () => {});
ok('list widget renders chips', wList.el.querySelectorAll('.multi-select-pill').length === 2 && JSON.stringify(wList.getValue()) === '["a","b"]');

const panel = buildPropertiesPanel({ title: 'T', count: 3, done: false, tags: ['x'] });
ok('panel one row per key', panel.el.querySelectorAll('.metadata-property').length === 4);
eq('panel getData reconstructs', panel.getData(), { title: 'T', count: 3, done: false, tags: ['x'] });
ok('panel keys typed', panel.el.querySelector('[data-property-key=count]').getAttribute('data-property-type') === 'number');

console.log('=== Phase 4-rest UI: page-preview + properties-UI (graph = real 3D-graph plugin) ===');
for (const c of log) console.log(c);
console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail) { console.log(`\nFAIL: ${fail}`); process.exit(1); }
console.log('\nAC GREEN: page-preview + properties widgets verified (graph supplied by real 3D-graph plugin).');
process.exit(0);
