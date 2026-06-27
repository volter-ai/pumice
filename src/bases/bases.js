// Phase 6 — Bases. Model a `.base` (views + filters + formulas + properties) and
// evaluate it against the vault's notes (frontmatter properties). Produces table rows
// and card rows; filters and formulas use the expr engine. Save is zero-diff: the raw
// source is retained and re-emitted verbatim for untouched bases.
import { parseProperties } from '../core/properties.js';
import { evaluate, parseExpr, evalExpr } from './expr.js';

/** Accept a parsed object (or pre-parsed). Keeps the raw text for zero-diff save. */
export function parseBase(input) {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  return {
    filters: data.filters || null,
    formulas: data.formulas || {},
    properties: data.properties || {},
    views: data.views || [],
    _raw: typeof input === 'string' ? input : null,
    _data: data,
  };
}

/** Zero-diff save: untouched base re-emits the original text byte-for-byte. */
export function serializeBase(model) {
  if (model._raw != null) return model._raw;
  return JSON.stringify(model._data, null, '\t');
}

// Build the evaluation context for one note: file.* + frontmatter props at top level.
export function noteContext(path, content) {
  const { data } = parseProperties(content);
  const name = (path.split('/').pop() || path).replace(/\.md$/i, '');
  return { ...data, file: { name, path, ext: 'md', size: content.length }, note: data };
}

function passesFilter(filter, ctx) {
  if (filter == null) return true;
  if (typeof filter === 'string') return !!evaluate(filter, ctx);
  if (Array.isArray(filter)) return filter.every((f) => passesFilter(f, ctx)); // implicit AND
  if (filter.and) return filter.and.every((f) => passesFilter(f, ctx));
  if (filter.or) return filter.or.some((f) => passesFilter(f, ctx));
  if (filter.not) return !passesFilter(filter.not, ctx);
  return true;
}

function computeRow(ctx, model, columns) {
  const values = {};
  for (const col of columns) {
    if (model.formulas && col in model.formulas) values[col] = evaluate(model.formulas[col], ctx);
    else values[col] = col.includes('.') ? evaluate(col, ctx) : ctx[col];
  }
  return values;
}

/**
 * Evaluate one view against the note set `files` ({path->content}). Returns
 * { type, name, columns, rows:[{ path, values }] } honoring global + view filters,
 * ordering, and the view's column list (defaults to declared properties + formulas).
 */
export function evaluateView(model, view, files) {
  const columns = view.order || view.columns || [
    'file.name',
    ...Object.keys(model.properties || {}).map((k) => k.replace(/^note\./, '')),
    ...Object.keys(model.formulas || {}),
  ];
  const rows = [];
  for (const [path, content] of Object.entries(files)) {
    const ctx = noteContext(path, content);
    if (!passesFilter(model.filters, ctx)) continue;
    if (!passesFilter(view.filters, ctx)) continue;
    rows.push({ path, values: computeRow(ctx, model, columns) });
  }
  // ordering: first order key, ascending
  if (view.order && view.order.length) {
    const key = view.order[0];
    rows.sort((a, b) => { const x = a.values[key], y = b.values[key]; return x < y ? -1 : x > y ? 1 : 0; });
  }
  return { type: view.type, name: view.name, columns, rows };
}

/** Evaluate all views. */
export function evaluateBase(model, files) { return model.views.map((v) => evaluateView(model, v, files)); }

/** Render a table view into a DOM element (real <table>). */
export function renderTableView(viewResult, el) {
  const doc = el.ownerDocument || globalThis.document;
  const table = doc.createElement('table'); table.className = 'bases-table';
  const thead = doc.createElement('thead'); const htr = doc.createElement('tr');
  for (const c of viewResult.columns) { const th = doc.createElement('th'); th.textContent = c; htr.appendChild(th); }
  thead.appendChild(htr); table.appendChild(thead);
  const tbody = doc.createElement('tbody');
  for (const row of viewResult.rows) { const tr = doc.createElement('tr'); tr.setAttribute('data-path', row.path); for (const c of viewResult.columns) { const td = doc.createElement('td'); td.textContent = row.values[c] == null ? '' : String(row.values[c]); tr.appendChild(td); } tbody.appendChild(tr); }
  table.appendChild(tbody); el.appendChild(table);
  return table;
}

/** Render a cards view (one .bases-card per row). */
export function renderCardsView(viewResult, el) {
  const doc = el.ownerDocument || globalThis.document;
  const wrap = doc.createElement('div'); wrap.className = 'bases-cards';
  for (const row of viewResult.rows) {
    const card = doc.createElement('div'); card.className = 'bases-card'; card.setAttribute('data-path', row.path);
    for (const c of viewResult.columns) { const f = doc.createElement('div'); f.className = 'bases-card-field'; f.setAttribute('data-field', c); f.textContent = row.values[c] == null ? '' : String(row.values[c]); card.appendChild(f); }
    wrap.appendChild(card);
  }
  el.appendChild(wrap);
  return wrap;
}

export { evaluate, parseExpr, evalExpr };
