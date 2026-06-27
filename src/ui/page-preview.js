// Phase 4-rest — page preview (hover popover). Obsidian shows a rendered preview of a
// note when you hover an internal link. This resolves the link target via the vault,
// renders its markdown into a popover element (using the same renderMarkdown DOM
// renderer), and returns the element. Pure DOM; positioning is the caller's.
import { renderMarkdown } from '../render/obsidian-markdown.js';
import { noteName } from '../vfs/links.js';

/** Resolve a link target (note name or path) to a vault path. */
export function resolveLink(files, linktext) {
  if (linktext in files) return linktext;
  const want = noteName(linktext).toLowerCase();
  for (const p of Object.keys(files)) if (noteName(p).toLowerCase() === want) return p;
  return null;
}

/**
 * Build a hover preview popover for `linktext`. Returns { el, path } or { el, path:null }
 * if unresolved (shows a "No note" placeholder, like Obsidian).
 * @param {object} files  { path -> content }
 * @param {string} linktext  the [[target]] (optionally with #heading / #^block)
 * @param {object} [opts] { doc, resolve }
 */
export function createPagePreview(files, linktext, opts = {}) {
  const doc = opts.doc || globalThis.document;
  const base = linktext.split('#')[0].trim();
  const path = resolveLink(files, base);
  const pop = doc.createElement('div');
  pop.className = 'hover-popover popover-preview';
  pop.setAttribute('data-link', base);
  if (!path) {
    pop.classList.add('is-empty');
    pop.textContent = `No note found for "${base}"`;
    return { el: pop, path: null };
  }
  pop.setAttribute('data-path', path);
  const content = doc.createElement('div'); content.className = 'markdown-embed-content';
  renderMarkdown(files[path], content, { resolve: opts.resolve || ((n) => '#' + encodeURIComponent(n)) });
  pop.appendChild(content);
  return { el: pop, path };
}

/**
 * Attach hover-preview behavior to a container of internal links. Returns a teardown fn.
 * On mouseenter of an `a.internal-link`, builds + shows a preview; removes it on leave.
 */
export function registerPagePreviews(container, files, opts = {}) {
  const doc = container.ownerDocument || globalThis.document;
  const handlers = [];
  for (const a of container.querySelectorAll('a.internal-link')) {
    const enter = () => {
      const target = decodeURIComponent(a.getAttribute('data-target') || a.textContent);
      const { el } = createPagePreview(files, target, { doc, ...opts });
      el.classList.add('mod-active');
      doc.body.appendChild(el);
      a._preview = el;
    };
    const leave = () => { if (a._preview) { a._preview.remove(); a._preview = null; } };
    a.addEventListener('mouseenter', enter); a.addEventListener('mouseleave', leave);
    handlers.push([a, enter, leave]);
  }
  return () => { for (const [a, e, l] of handlers) { a.removeEventListener('mouseenter', e); a.removeEventListener('mouseleave', l); } };
}
