// CSS settings (the mechanism the Style Settings plugin exposes). A theme/snippet CSS
// file can embed a `/* @settings ... */` YAML block declaring options; toggling an
// option writes a CSS variable or body class to the DOM. This parses that block and
// applies values — the documented behavior a "settings toggle changes DOM" test drives.

/** Parse the `/* @settings ... *\/` block (YAML-ish) into { id, title, settings:[...] }. */
export function parseStyleSettings(css) {
  const m = css.match(/\/\*\s*@settings([\s\S]*?)\*\//);
  if (!m) return null;
  const lines = m[1].split('\n');
  const out = { id: '', title: '', settings: [] };
  let cur = null;
  for (const raw of lines) {
    const line = raw.replace(/^\s*/, '');
    if (!line) continue;
    const top = line.match(/^(id|name|title):\s*(.+)$/);
    if (top && !cur) { out[top[1] === 'name' ? 'title' : top[1]] = top[2].trim(); continue; }
    if (line.startsWith('- ')) { if (cur) out.settings.push(cur); cur = {}; const kv = line.slice(2).match(/^(\w+):\s*(.+)$/); if (kv) cur[kv[1]] = kv[2].trim(); continue; }
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv && cur) cur[kv[1]] = kv[2].trim();
  }
  if (cur) out.settings.push(cur);
  return out;
}

/**
 * Apply a setting value to the DOM root (body), matching Style Settings semantics:
 *  - class-toggle: add/remove `<id>` body class
 *  - variable-*: set a CSS custom property `--<id>`
 * @returns the applied representation for assertion.
 */
export function applyStyleSetting(rootEl, setting, value) {
  const type = setting.type || 'variable-text';
  if (type === 'class-toggle') {
    if (value) rootEl.classList.add(setting.id); else rootEl.classList.remove(setting.id);
    return { kind: 'class', id: setting.id, on: !!value };
  }
  if (type === 'class-select') {
    for (const opt of (setting.options || [])) rootEl.classList.remove(typeof opt === 'string' ? opt : opt.value);
    if (value) rootEl.classList.add(value);
    return { kind: 'class-select', value };
  }
  // variable-number/text/color → CSS var
  const v = setting.type === 'variable-number' && setting.format ? String(value) + setting.format : String(value);
  rootEl.style.setProperty('--' + setting.id, v);
  return { kind: 'var', name: '--' + setting.id, value: v };
}

/** Build a manager that tracks current values + re-applies them (snippet enable flow). */
export function createStyleSettingsManager(rootEl) {
  const values = {};
  return {
    load(css) { const parsed = parseStyleSettings(css); this.parsed = parsed; for (const s of (parsed ? parsed.settings : [])) if ('default' in s) values[s.id] = s.default; return parsed; },
    set(id, value) { const s = (this.parsed.settings || []).find((x) => x.id === id); if (!s) throw new Error('unknown setting ' + id); values[id] = value; return applyStyleSetting(rootEl, s, value); },
    get(id) { return values[id]; },
    applyAll() { for (const s of (this.parsed.settings || [])) if (s.id in values) applyStyleSetting(rootEl, s, values[s.id]); },
  };
}
