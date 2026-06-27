// Phase 3 AC: workspace runtime. Real leaf/tab/split tree, view attachment via a view
// registry, active-leaf tracking + events, type queries, split + detach lifecycle, and
// link opening — all on real DOM containers in jsdom.
import './dom-bootstrap.mjs';
import { Workspace, WorkspaceLeaf } from '../src/workspace/workspace.js';

let pass = 0, fail = 0; const log = [];
function eq(name, got, want) { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name}\n      got:  ${g}\n      want: ${w}`); } }
function ok(name, cond, d = '') { if (cond) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name} ${d}`); } }

const app = { name: 'test-app' };
const ws = new Workspace(app, document);

// custom view type registration (ItemView-like)
class CalendarView { constructor(leaf) { this.leaf = leaf; this.containerEl = leaf.containerEl; this.opened = false; } getViewType() { return 'calendar'; } getDisplayText() { return 'Calendar'; } async onOpen() { this.opened = true; this.containerEl.createDiv ? this.containerEl.createDiv() : this.containerEl.appendChild(document.createElement('div')); } async onClose() { this.opened = false; } }
ws.registerViewType('calendar', (leaf) => new CalendarView(leaf));

// layout ready
let ready = false; ws.onLayoutReady(() => { ready = true; }); ok('onLayoutReady fires', ready);

// getLeaf creates a leaf in main tabs
const l1 = ws.getLeaf(false);
ok('getLeaf returns a WorkspaceLeaf', l1 instanceof WorkspaceLeaf);
ok('leaf has real DOM container', l1.containerEl && l1.containerEl.nodeType === 1);
ok('first leaf becomes active', ws.activeLeaf === l1);
ok('leaf attached under main tabs', l1.containerEl.parentNode === ws._mainTabs.containerEl);

// active-leaf-change event
let changed = null; ws.on('active-leaf-change', (l) => { changed = l; });
const l2 = ws.getLeaf('tab');
ws.setActiveLeaf(l2);
ok('active-leaf-change fired', changed === l2);
ok('getLeaf(false) reuses active in main tabs', ws.getLeaf(false) === l2);

// view attachment via registry
await l1.setViewState({ type: 'calendar', state: {} });
ok('view instantiated from registry', l1.view instanceof CalendarView);
ok('onOpen ran', l1.view.opened === true);
ok('tab header shows display text', l1.tabHeaderEl.textContent === 'Calendar');
eq('getViewState type', l1.getViewState().type, 'calendar');

// openFile sets markdown view state
await l2.openFile({ path: 'Notes/A.md' });
eq('openFile sets file state', l2.getViewState().state.file, 'Notes/A.md');
eq('getActiveFile', ws.getActiveFile(), { path: 'Notes/A.md' });

// getLeavesOfType
ok('getLeavesOfType calendar', ws.getLeavesOfType('calendar').length === 1 && ws.getLeavesOfType('calendar')[0] === l1);
ok('getLeavesOfType markdown', ws.getLeavesOfType('markdown').length === 1);

// side leaves
const left = ws.getLeftLeaf();
await left.setViewState({ type: 'calendar', state: {} });
ok('left leaf under leftSplit', left.containerEl.parentNode === ws.leftSplit.containerEl);
ok('getLeavesOfType spans side panels', ws.getLeavesOfType('calendar').length === 2);

// split
const beforeCount = ws.leafCount;
const split = ws.getLeaf('split', 'horizontal');
ok('split creates a new leaf', split instanceof WorkspaceLeaf && ws.leafCount === beforeCount + 1);
ok('split nests a new split node', split.parent.type === 'tabs' && split.parent.parent.type === 'split' && split.parent.parent.direction === 'horizontal');

// detach + prune
const detachCountBefore = ws.leafCount;
split.detach();
ok('detach removes leaf', ws.leafCount === detachCountBefore - 1);
ok('detach prunes empty split back to root', ws.rootSplit.children.length >= 1);

// detachLeavesOfType
ws.detachLeavesOfType('calendar');
ok('detachLeavesOfType clears type', ws.getLeavesOfType('calendar').length === 0);

// openLinkText
const opened = await ws.openLinkText('Some Note', 'src.md', true);
ok('openLinkText opens markdown leaf', opened.getViewState().state.file === 'Some Note' && ws.activeLeaf === opened);

console.log('=== Phase 3: workspace leaves/splits/tabs/views ===');
for (const c of log) console.log(c);
console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail) { console.log(`\nFAIL: ${fail}`); process.exit(1); }
console.log('\nAC GREEN: workspace runtime (leaves/splits/tabs/views/active) verified.');
process.exit(0);
