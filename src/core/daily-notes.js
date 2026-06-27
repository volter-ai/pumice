// Daily notes + templates (Phase 4-rest). Isomorphic; uses moment for date formats
// (the same `moment` Obsidian exposes). Pure path/string logic — file creation is the
// caller's job via the VaultAdapter, keeping this testable without a vault.
import moment from 'moment';

/**
 * Resolve the path of a daily note for `date` given daily-notes settings.
 * @param {object} settings { format='YYYY-MM-DD', folder='' }
 * @param {Date|moment.Moment|string} [date=now]
 */
export function dailyNotePath(settings = {}, date) {
  const fmt = settings.format || 'YYYY-MM-DD';
  const folder = (settings.folder || '').replace(/\/$/, '');
  const m = date ? moment(date) : moment();
  const name = m.format(fmt);
  return (folder ? folder + '/' : '') + name + '.md';
}

/**
 * Apply a template, expanding Obsidian/Templater-style tokens:
 *   {{title}} {{date}} {{time}} {{date:FORMAT}} {{time:FORMAT}}
 * plus the Templater `tp.date.now("FORMAT")` form for the common case.
 * @param {string} template
 * @param {object} ctx { title, date(Date|moment) }
 */
export function applyTemplate(template, ctx = {}) {
  const m = ctx.date ? moment(ctx.date) : moment();
  const title = ctx.title || '';
  return template
    .replace(/\{\{\s*title\s*\}\}/g, title)
    .replace(/\{\{\s*date\s*:\s*([^}]+?)\s*\}\}/g, (_, f) => m.format(f))
    .replace(/\{\{\s*time\s*:\s*([^}]+?)\s*\}\}/g, (_, f) => m.format(f))
    .replace(/\{\{\s*date\s*\}\}/g, m.format('YYYY-MM-DD'))
    .replace(/\{\{\s*time\s*\}\}/g, m.format('HH:mm'))
    .replace(/<%\s*tp\.date\.now\(\s*["']([^"']+)["']\s*\)\s*%>/g, (_, f) => m.format(f))
    .replace(/<%\s*tp\.file\.title\s*%>/g, title);
}

/**
 * Plan creating a daily note: returns { path, exists, content } so the caller can
 * write it via the adapter. `files` is { path -> content } for the exists check.
 */
export function ensureDailyNote(files, settings = {}, date, template = '') {
  const path = dailyNotePath(settings, date);
  const exists = Object.prototype.hasOwnProperty.call(files, path);
  const content = exists ? files[path] : applyTemplate(template, { title: path.split('/').pop().replace(/\.md$/, ''), date });
  return { path, exists, content };
}
