// Phase 4-rest — Properties UI widget builder. Obsidian's properties panel shows one
// typed editor per frontmatter field. This builds the per-type DOM widget that both
// reflects a value and edits it (calling onChange with the typed value). Uses the
// property type inference from core/properties.js.
import { propertyType } from '../core/properties.js';

/**
 * Build a property-row widget for { key, value }. Returns { el, getValue } where el is
 * `.metadata-property` containing a key label + a type-appropriate input, and getValue
 * reads the current typed value. `onChange(newValue)` fires on edits.
 */
export function buildPropertyWidget(key, value, onChange = () => {}, opts = {}) {
  const doc = opts.doc || globalThis.document;
  const type = opts.type || propertyType(value);
  const row = doc.createElement('div');
  row.className = 'metadata-property';
  row.setAttribute('data-property-key', key);
  row.setAttribute('data-property-type', type);
  const keyEl = doc.createElement('span'); keyEl.className = 'metadata-property-key'; keyEl.textContent = key;
  row.appendChild(keyEl);
  const valWrap = doc.createElement('div'); valWrap.className = 'metadata-property-value';
  row.appendChild(valWrap);

  let getValue;
  if (type === 'checkbox') {
    const input = doc.createElement('input'); input.type = 'checkbox'; input.checked = !!value;
    input.addEventListener('change', () => onChange(input.checked));
    valWrap.appendChild(input);
    getValue = () => input.checked;
  } else if (type === 'number') {
    const input = doc.createElement('input'); input.type = 'number'; input.value = String(value ?? '');
    input.addEventListener('input', () => onChange(input.value === '' ? null : Number(input.value)));
    valWrap.appendChild(input);
    getValue = () => (input.value === '' ? null : Number(input.value));
  } else if (type === 'date' || type === 'datetime') {
    const input = doc.createElement('input'); input.type = type === 'datetime' ? 'datetime-local' : 'date'; input.value = String(value ?? '');
    input.addEventListener('change', () => onChange(input.value));
    valWrap.appendChild(input);
    getValue = () => input.value;
  } else if (type === 'list') {
    const list = Array.isArray(value) ? [...value] : [];
    const chips = doc.createElement('div'); chips.className = 'metadata-property-chips';
    const render = () => {
      chips.replaceChildren();
      list.forEach((item, i) => {
        const chip = doc.createElement('span'); chip.className = 'multi-select-pill'; chip.setAttribute('data-index', i); chip.textContent = String(item);
        const x = doc.createElement('span'); x.className = 'multi-select-pill-remove';
        x.addEventListener('click', () => { list.splice(i, 1); render(); onChange([...list]); });
        chip.appendChild(x); chips.appendChild(chip);
      });
    };
    render();
    valWrap.appendChild(chips);
    valWrap._addItem = (v) => { list.push(v); render(); onChange([...list]); };
    getValue = () => [...list];
  } else {
    const input = doc.createElement('input'); input.type = 'text'; input.value = String(value ?? '');
    input.addEventListener('input', () => onChange(input.value));
    valWrap.appendChild(input);
    getValue = () => input.value;
  }
  return { el: row, getValue, type };
}

/**
 * Build the full properties panel for a data object: one widget per key. Returns
 * { el, getData } where getData() reconstructs the (possibly edited) object.
 */
export function buildPropertiesPanel(data, opts = {}) {
  const doc = opts.doc || globalThis.document;
  const panel = doc.createElement('div'); panel.className = 'metadata-properties';
  const widgets = {};
  for (const [key, value] of Object.entries(data)) {
    const w = buildPropertyWidget(key, value, () => {}, opts);
    widgets[key] = w;
    panel.appendChild(w.el);
  }
  return { el: panel, getData: () => Object.fromEntries(Object.keys(widgets).map((k) => [k, widgets[k].getValue()])), widgets };
}
