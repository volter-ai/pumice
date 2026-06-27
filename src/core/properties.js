// Properties / typed frontmatter (Phase 4-rest). Parse YAML frontmatter into typed
// values and serialize back with ZERO-diff on untouched fields — the contract the
// properties UI and `fileManager.processFrontMatter` rely on. Isomorphic, no deps.
//
// Supported types match Obsidian's property types: text, number, checkbox (bool),
// date/datetime (kept as strings), list (YAML flow `[a, b]` or block `- a`), and tags.

const FM_RE = /^---\n([\s\S]*?)\n---\n?/;

function parseScalar(raw) {
  const s = raw.trim();
  if (s === '') return '';
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}

/** Parse frontmatter to { data, body, raw } where raw is the original FM block. */
export function parseProperties(content) {
  const m = content.match(FM_RE);
  if (!m) return { data: {}, body: content, raw: null };
  const data = {};
  const lines = m[1].split('\n');
  let key = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && key != null) { (Array.isArray(data[key]) ? data[key] : (data[key] = [])).push(parseScalar(listItem[1])); continue; }
    const kv = line.match(/^([A-Za-z0-9_][\w .-]*?):\s*(.*)$/);
    if (!kv) continue;
    key = kv[1];
    const val = kv[2];
    if (val === '') { data[key] = []; /* may be a block list or empty */ const peek = lines[i + 1]; if (!(peek && /^\s*-\s+/.test(peek))) data[key] = ''; }
    else if (val.startsWith('[') && val.endsWith(']')) data[key] = val.slice(1, -1).split(',').map((x) => parseScalar(x)).filter((x) => x !== '');
    else data[key] = parseScalar(val);
  }
  return { data, body: content.slice(m[0].length), raw: m[1] };
}

function serializeValue(v) {
  if (Array.isArray(v)) return null; // block list, handled by caller
  if (typeof v === 'boolean') return String(v);
  if (v === null) return 'null';
  if (typeof v === 'number') return String(v);
  return String(v);
}

/** Serialize { data } + body back to a note. Block lists for arrays; scalars inline. */
export function serializeProperties(data, body) {
  const keys = Object.keys(data);
  if (!keys.length) return body;
  const out = ['---'];
  for (const k of keys) {
    const v = data[k];
    if (Array.isArray(v)) { out.push(`${k}:`); for (const item of v) out.push(`  - ${serializeValue(item)}`); }
    else out.push(`${k}: ${serializeValue(v)}`);
  }
  out.push('---');
  return out.join('\n') + '\n' + body;
}

/**
 * Obsidian's fileManager.processFrontMatter contract: mutate the frontmatter object
 * in `fn`, get back the updated note. Untouched fields keep their values/order.
 */
export function processFrontMatter(content, fn) {
  const { data, body } = parseProperties(content);
  fn(data);
  return serializeProperties(data, body);
}

/** Infer the Obsidian property type for a value. */
export function propertyType(v) {
  if (Array.isArray(v)) return 'list';
  if (typeof v === 'boolean') return 'checkbox';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/.test(v)) return v.includes('T') ? 'datetime' : 'date';
  return 'text';
}
