// Phase 3 plugin-T4 functional specs. Drives the three user-behaviors the named
// plugins provide, end-to-end through the REAL workspace + vault + DOM in jsdom:
//   • style-settings: load a CSS @settings block, toggle an option → DOM var/class changes
//   • tag-wrangler:   rename a tag → propagates across all notes (inline + frontmatter)
//   • calendar:       select a day → opens/creates the daily note via the real Workspace
// (The plugins themselves load to T2 in compat-top100; this proves the app runtime
// supports the behaviors they drive.)
import './dom-bootstrap.mjs';
import { Workspace } from '../src/workspace/workspace.js';
import { createStyleSettingsManager, parseStyleSettings } from '../src/ui/css-settings.js';
import { renameTag } from '../src/core/tag-ops.js';
import { ensureDailyNote } from '../src/core/daily-notes.js';

let pass = 0, fail = 0; const log = [];
function eq(name, got, want) { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name}\n      got:  ${g}\n      want: ${w}`); } }
function ok(name, cond, d = '') { if (cond) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name} ${d}`); } }

// ===== style-settings: settings toggle changes the DOM =====
const themeCss = `/* @settings
id: my-theme
name: My Theme
settings:
  - id: accent-color
    title: Accent
    type: variable-color
    default: '#7b6cd9'
  - id: hide-status
    title: Hide status bar
    type: class-toggle
*/
:root { --accent-color: #7b6cd9; }`;
const parsed = parseStyleSettings(themeCss);
ok('parse @settings block', parsed && parsed.id === 'my-theme' && parsed.settings.length === 2);
const body = document.body;
const mgr = createStyleSettingsManager(body);
mgr.load(themeCss);
// toggle a variable setting → CSS var on the DOM
const r1 = mgr.set('accent-color', '#ff0000');
eq('variable setting writes CSS var', body.style.getPropertyValue('--accent-color'), '#ff0000');
ok('variable apply reported', r1.kind === 'var');
// toggle a class setting → body class on the DOM
mgr.set('hide-status', true);
ok('class-toggle adds body class', body.classList.contains('hide-status'));
mgr.set('hide-status', false);
ok('class-toggle removes body class', !body.classList.contains('hide-status'));

// ===== tag-wrangler: rename propagates across notes =====
const vault = {
  'A.md': '---\ntags: [project, urgent]\n---\n# A\nThis is #project work and #project/sub.',
  'B.md': '# B\nAnother #project here. Not #projector though.',
  'C.md': '# C\nNo tags here.',
};
const { changes, count } = renameTag(vault, 'project', 'work');
eq('rename touched 2 notes', count, 2);
ok('inline tag renamed', changes['A.md'].includes('#work work') && !/#project\b/.test(changes['A.md']));
ok('nested tag renamed', changes['A.md'].includes('#work/sub'));
ok('frontmatter tag renamed', /tags: \[work, urgent\]/.test(changes['A.md']));
ok('does not touch substring #projector', changes['B.md'].includes('#projector'));
ok('renamed in B', changes['B.md'].includes('Another #work here'));
ok('untouched note absent from changes', !('C.md' in changes));

// ===== calendar: day-click opens/creates the daily note via the REAL workspace =====
const app = { name: 'app' };
const ws = new Workspace(app, document);
const files = { 'Daily/2026-06-20.md': 'existing journal' }; // one day already exists
ws.registerViewType('markdown', (leaf) => ({ getViewType: () => 'markdown', getDisplayText: () => leaf.getViewState().state.file || '', containerEl: leaf.containerEl, leaf }));

// simulate selecting a NEW day → ensureDailyNote plans creation, workspace opens it
const newDay = new Date(Date.UTC(2026, 5, 26, 12));
const plan = ensureDailyNote(files, { folder: 'Daily' }, newDay, '# {{date}}\n');
ok('day-click: new note planned', plan.exists === false && plan.path === 'Daily/2026-06-26.md');
if (!plan.exists) files[plan.path] = plan.content; // "create"
const leaf = await ws.openLinkText(plan.path, '', true);
ok('day-click opens a leaf', ws.activeLeaf === leaf && leaf.getViewState().state.file === 'Daily/2026-06-26.md');
ok('created daily note has template', files['Daily/2026-06-26.md'].includes('# 2026-06-26'));

// selecting an EXISTING day → opens it without overwriting
const existDay = new Date(Date.UTC(2026, 5, 20, 12));
const plan2 = ensureDailyNote(files, { folder: 'Daily' }, existDay, '# {{date}}\n');
ok('day-click: existing note not recreated', plan2.exists === true && plan2.content === 'existing journal');
const leaf2 = await ws.openLinkText('Daily/2026-06-20.md', '', false);
ok('opens existing daily note', leaf2.getViewState().state.file === 'Daily/2026-06-20.md');

console.log('=== Phase 3 T4: style-settings + tag-wrangler + calendar behaviors ===');
for (const c of log) console.log(c);
console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail) { console.log(`\nFAIL: ${fail}`); process.exit(1); }
console.log('\nAC GREEN: settings-toggle→DOM, tag-rename propagation, day-click→daily-note verified.');
process.exit(0);
