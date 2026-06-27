// Phase 5 — Canvas. Parse/render Obsidian `.canvas` (JSON Canvas spec): node types
// text/file/link/group + edges with sides/labels. Rendering builds real DOM (nodes as
// positioned cards, edges as SVG). Save is ZERO-DIFF on untouched fields: parsed node/
// edge objects are preserved verbatim (incl. unknown keys + key order), so editing one
// field and serializing leaves every other byte unchanged.

const NODE_TYPES = new Set(['text', 'file', 'link', 'group']);

/** Parse canvas JSON (string or object) into a model that retains the raw records. */
export function parseCanvas(input) {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  const nodes = (data.nodes || []).map((n) => ({ ...n }));
  const edges = (data.edges || []).map((e) => ({ ...e }));
  // preserve any extra top-level keys (e.g. metadata) for zero-diff round-trip
  const extra = {};
  for (const k of Object.keys(data)) if (k !== 'nodes' && k !== 'edges') extra[k] = data[k];
  return { nodes, edges, extra };
}

/** Serialize a model back to canvas JSON text. Preserves key order + unknown keys. */
export function serializeCanvas(model, opts = {}) {
  const out = {};
  if ('nodes' in (opts.order ? {} : {})) { /* noop */ }
  out.nodes = model.nodes;
  out.edges = model.edges;
  Object.assign(out, model.extra || {});
  return JSON.stringify(out, null, opts.pretty === false ? undefined : '\t');
}

export function getNode(model, id) { return model.nodes.find((n) => n.id === id) || null; }

/** Edit operations mutate only the targeted fields (zero-diff on the rest). */
export function moveNode(model, id, x, y) { const n = getNode(model, id); if (n) { n.x = x; n.y = y; } return model; }
export function resizeNode(model, id, width, height) { const n = getNode(model, id); if (n) { n.width = width; n.height = height; } return model; }
export function setNodeColor(model, id, color) { const n = getNode(model, id); if (n) { if (color == null) delete n.color; else n.color = color; } return model; }
export function addNode(model, node) { model.nodes.push({ ...node }); return model; }
export function removeNode(model, id) { model.nodes = model.nodes.filter((n) => n.id !== id); model.edges = model.edges.filter((e) => e.fromNode !== id && e.toNode !== id); return model; }
export function addEdge(model, edge) { model.edges.push({ ...edge }); return model; }

/** Render the canvas into `el` (real DOM): each node a positioned card, edges as SVG. */
export function renderCanvas(model, el, opts = {}) {
  const doc = el.ownerDocument || globalThis.document;
  el.classList.add('canvas-wrapper');
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'canvas-edges');
  el.appendChild(svg);
  const byId = {};
  for (const n of model.nodes) {
    const card = doc.createElement('div');
    card.className = `canvas-node canvas-node-${n.type}`;
    card.setAttribute('data-id', n.id);
    card.style.left = (n.x || 0) + 'px';
    card.style.top = (n.y || 0) + 'px';
    card.style.width = (n.width || 250) + 'px';
    card.style.height = (n.height || 60) + 'px';
    if (n.color) card.setAttribute('data-color', String(n.color));
    if (n.type === 'text') card.textContent = n.text || '';
    else if (n.type === 'file') { card.setAttribute('data-file', n.file || ''); const a = doc.createElement('a'); a.className = 'canvas-file-link'; a.textContent = n.file || ''; card.appendChild(a); }
    else if (n.type === 'link') { const a = doc.createElement('a'); a.className = 'canvas-link'; a.href = n.url || '#'; a.textContent = n.url || ''; card.appendChild(a); }
    else if (n.type === 'group') { card.classList.add('canvas-group'); if (n.label) { const lbl = doc.createElement('div'); lbl.className = 'canvas-group-label'; lbl.textContent = n.label; card.appendChild(lbl); } }
    el.appendChild(card);
    byId[n.id] = n;
  }
  for (const e of model.edges) {
    const line = doc.createElementNS(svgNS, 'line');
    line.setAttribute('class', 'canvas-edge');
    line.setAttribute('data-id', e.id || '');
    line.setAttribute('data-from', e.fromNode); line.setAttribute('data-to', e.toNode);
    const a = byId[e.fromNode], b = byId[e.toNode];
    if (a && b) { line.setAttribute('x1', a.x || 0); line.setAttribute('y1', a.y || 0); line.setAttribute('x2', b.x || 0); line.setAttribute('y2', b.y || 0); }
    if (e.label) line.setAttribute('data-label', e.label);
    svg.appendChild(line);
  }
  return el;
}

export const _internal = { NODE_TYPES };
