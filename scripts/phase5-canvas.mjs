// Phase 5 AC: a real .canvas opens; all node types + edges render; edit→save is
// ZERO-DIFF on untouched fields (incl. unknown keys). jsdom for the DOM render.
import './dom-bootstrap.mjs';
import { parseCanvas, serializeCanvas, renderCanvas, moveNode, setNodeColor, addNode, removeNode, getNode } from '../src/canvas/canvas.js';

let pass = 0, fail = 0; const log = [];
function eq(name, got, want) { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name}\n      got:  ${g}\n      want: ${w}`); } }
function ok(name, cond, d = '') { if (cond) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name} ${d}`); } }

// A real-shaped canvas with all node types, edges, and some unknown/extra fields.
const canvasObj = {
  nodes: [
    { id: 'n1', type: 'text', text: 'Hello **world**', x: 0, y: 0, width: 250, height: 60, color: '4' },
    { id: 'n2', type: 'file', file: 'Notes/A.md', subpath: '#Heading', x: 300, y: 0, width: 400, height: 300 },
    { id: 'n3', type: 'link', url: 'https://obsidian.md', x: 0, y: 200, width: 250, height: 120 },
    { id: 'n4', type: 'group', label: 'My Group', x: -50, y: -50, width: 800, height: 500, background: 'bg.png', backgroundStyle: 'cover' },
  ],
  edges: [
    { id: 'e1', fromNode: 'n1', fromSide: 'right', toNode: 'n2', toSide: 'left', label: 'links to', color: '2' },
    { id: 'e2', fromNode: 'n3', fromSide: 'top', toNode: 'n1', toSide: 'bottom' },
  ],
  metadata: { version: '1.0-1.0', frontmatter: {} }, // unknown top-level key
};
const json = JSON.stringify(canvasObj, null, '\t');

// --- parse ---
const model = parseCanvas(json);
eq('parses all nodes', model.nodes.length, 4);
eq('parses all edges', model.edges.length, 2);
ok('node types present', ['text', 'file', 'link', 'group'].every((t) => model.nodes.some((n) => n.type === t)));
eq('preserves unknown top-level key', model.extra.metadata.version, '1.0-1.0');
eq('preserves node extra field (subpath)', getNode(model, 'n2').subpath, '#Heading');

// --- render: all node types + edges produce DOM ---
const el = document.createElement('div'); document.body.appendChild(el);
renderCanvas(model, el);
eq('renders 4 node cards', el.querySelectorAll('.canvas-node').length, 4);
ok('text node content', el.querySelector('.canvas-node-text').textContent.includes('Hello'));
ok('file node data-file', el.querySelector('.canvas-node-file').getAttribute('data-file') === 'Notes/A.md');
ok('link node href', el.querySelector('.canvas-node-link a').getAttribute('href') === 'https://obsidian.md');
ok('group node label', el.querySelector('.canvas-group-label').textContent === 'My Group');
ok('node positioned', el.querySelector('[data-id=n2]').style.left === '300px');
eq('renders 2 edges', el.querySelectorAll('.canvas-edge').length, 2);
ok('edge endpoints wired', el.querySelector('[data-id=e1]').getAttribute('data-from') === 'n1');

// --- ZERO-DIFF: unmodified round-trip is byte-identical ---
const rt = serializeCanvas(parseCanvas(json));
eq('unmodified round-trip byte-identical', rt, json);

// --- edit ONE field → only that field changes, everything else byte-identical ---
const m2 = parseCanvas(json);
moveNode(m2, 'n1', 10, 20);
const edited = serializeCanvas(m2);
const reparsed = JSON.parse(edited);
eq('edited node x', reparsed.nodes[0].x, 10);
eq('edited node y', reparsed.nodes[0].y, 20);
// every OTHER node + all edges + metadata identical to original
eq('untouched nodes unchanged', reparsed.nodes.slice(1), canvasObj.nodes.slice(1));
eq('untouched edges unchanged', reparsed.edges, canvasObj.edges);
eq('untouched metadata unchanged', reparsed.metadata, canvasObj.metadata);
eq('edited node keeps unknown order/fields', Object.keys(reparsed.nodes[0]), Object.keys(canvasObj.nodes[0]));

// --- color set/clear, add/remove node maintain integrity ---
setNodeColor(m2, 'n1', null);
ok('clear color removes key', !('color' in getNode(m2, 'n1')));
addNode(m2, { id: 'n5', type: 'text', text: 'new', x: 1, y: 1, width: 10, height: 10 });
ok('add node', getNode(m2, 'n5') !== null);
removeNode(m2, 'n1');
ok('remove node drops it', getNode(m2, 'n1') === null);
ok('remove node prunes its edges', !m2.edges.some((e) => e.fromNode === 'n1' || e.toNode === 'n1'));

console.log('=== Phase 5: Canvas parse/render/zero-diff save ===');
for (const c of log) console.log(c);
console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail) { console.log(`\nFAIL: ${fail}`); process.exit(1); }
console.log('\nAC GREEN: Canvas opens, all node types + edges render, edit→save zero-diff.');
process.exit(0);
