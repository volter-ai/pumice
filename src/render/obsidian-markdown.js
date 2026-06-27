// Obsidian-flavored Markdown renderer (Phase 4-render), DOM-tree output.
//
// Matches Obsidian's actual contract: render the CommonMark/GFM base into a real
// DOM element, then run a chain of POST-PROCESSORS that mutate the live element —
// the same model Obsidian uses, where `MarkdownRenderer.render(app, md, el, path,
// component)` fills an element and registered post-processors receive `(el, ctx)`.
// Building real nodes (not HTML strings) means: automatic escaping, and real plugin
// post-processors can run over the same tree (a Phase-4 requirement).
//
// Needs a DOM (the browser's, or jsdom in tests/server via dom-bootstrap). Uses the
// Obsidian DOM extensions (createEl/createSpan/createDiv) installed by ../obsidian/dom.js.
import { marked } from 'marked';
import { splitFrontmatter } from '../vfs/links.js';

const CALLOUT_TYPES = new Set(['note', 'abstract', 'summary', 'tldr', 'info', 'todo', 'tip', 'hint', 'important', 'success', 'check', 'done', 'question', 'help', 'faq', 'warning', 'caution', 'attention', 'failure', 'fail', 'missing', 'danger', 'error', 'bug', 'example', 'quote', 'cite']);

const SKIP_TAGS = new Set(['CODE', 'PRE', 'A', 'SCRIPT', 'STYLE', 'MARK']);

// Walk text nodes under root (skipping code/pre/links), and for each regex match
// splice in the element returned by make(groups, doc). Earlier patterns win per pass.
function replaceInText(root, doc, regex, make) {
  const walker = doc.createTreeWalker(root, 0x4 /* SHOW_TEXT */, null);
  const targets = [];
  let n;
  while ((n = walker.nextNode())) {
    if (n.parentNode && SKIP_TAGS.has(n.parentNode.nodeName)) continue;
    if (regex.test(n.nodeValue)) targets.push(n);
  }
  for (const node of targets) {
    const text = node.nodeValue;
    const frag = doc.createDocumentFragment();
    let last = 0;
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(text))) {
      if (m.index > last) frag.appendChild(doc.createTextNode(text.slice(last, m.index)));
      const el = make(m, doc);
      if (el) frag.appendChild(el); else frag.appendChild(doc.createTextNode(m[0]));
      last = m.index + m[0].length;
      if (!regex.global) break;
    }
    if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }
}

// --- built-in post-processors (each mutates `el` in place) ---

function ppCallouts(el, doc, resolve) {
  for (const bq of [...el.querySelectorAll('blockquote')]) {
    const first = bq.querySelector('p');
    if (!first) continue;
    // First line carries `[!type][fold] title`; any further lines are body.
    const m = (first.textContent || '').match(/^\s*\[!([A-Za-z-]+)\]([+-]?)[ \t]*([^\n]*)([\s\S]*)$/);
    if (!m) continue;
    const [, type, fold, titleLine, restLines] = m;
    const t = type.toLowerCase();
    const cls = CALLOUT_TYPES.has(t) ? t : 'note';
    const callout = doc.createElement('div');
    callout.className = 'callout';
    callout.setAttribute('data-callout', cls);
    if (fold) callout.setAttribute('data-callout-fold', fold);
    const titleText = titleLine.trim() || t.charAt(0).toUpperCase() + t.slice(1);
    const titleDiv = doc.createElement('div'); titleDiv.className = 'callout-title';
    const titleInner = doc.createElement('div'); titleInner.className = 'callout-title-inner';
    titleInner.textContent = titleText;
    titleDiv.appendChild(titleInner);
    const content = doc.createElement('div'); content.className = 'callout-content';
    // remaining lines from the marker paragraph become the first body paragraph
    const afterFirstLine = restLines.replace(/^\n/, '').trim();
    if (afterFirstLine) { const p = doc.createElement('p'); p.textContent = afterFirstLine; content.appendChild(p); }
    let sib = first.nextSibling;
    while (sib) { const next = sib.nextSibling; content.appendChild(sib); sib = next; }
    callout.appendChild(titleDiv); callout.appendChild(content);
    bq.replaceWith(callout);
  }
}

function ppCodeFences(el, doc) {
  for (const code of [...el.querySelectorAll('pre > code')]) {
    const cls = code.className || '';
    const lang = (cls.match(/language-(\S+)/) || [])[1];
    if (lang === 'mermaid') {
      const div = doc.createElement('div'); div.className = 'mermaid'; div.textContent = code.textContent;
      code.parentElement.replaceWith(div);
    } else if (lang === 'math' || lang === 'latex') {
      const div = doc.createElement('div'); div.className = 'math math-block'; div.setAttribute('data-math', 'display'); div.textContent = code.textContent;
      code.parentElement.replaceWith(div);
    }
  }
}

function ppInline(el, doc, resolve) {
  // ==highlight==
  replaceInText(el, doc, /==([^=]+)==/g, (m, d) => { const x = d.createElement('mark'); x.textContent = m[1]; return x; });
  // inline %%comment%% (use the passed doc, not a bare global — keeps the renderer
  // host-agnostic so it works as a standalone library without globalThis.document)
  replaceInText(el, doc, /%%[^%]*%%/g, (m, d) => d.createTextNode(''));
  // block math $$...$$ (single text node)
  replaceInText(el, doc, /\$\$([^$]+)\$\$/g, (m, d) => { const x = d.createElement('span'); x.className = 'math math-block'; x.setAttribute('data-math', 'display'); x.textContent = m[1].trim(); return x; });
  // inline math $...$
  replaceInText(el, doc, /\$(?!\s)([^$\n]+?)(?<!\s)\$/g, (m, d) => { const x = d.createElement('span'); x.className = 'math math-inline'; x.setAttribute('data-math', 'inline'); x.textContent = m[1].trim(); return x; });
  // embeds ![[target#frag|alias]]
  replaceInText(el, doc, /!\[\[([^\]|#^]+)(#\^?[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (m, d) => {
    const name = m[1].trim(), frag = (m[2] || '').trim(), alias = m[3];
    const div = d.createElement('div');
    div.className = 'internal-embed markdown-embed';
    div.setAttribute('data-embed', frag.startsWith('#^') ? 'block' : frag.startsWith('#') ? 'heading' : 'note');
    div.setAttribute('data-target', name);
    div.setAttribute('data-fragment', frag);
    const a = d.createElement('a'); a.className = 'markdown-embed-link'; a.href = resolve ? resolve(name) : '#';
    a.textContent = (alias || (name + frag)).trim();
    div.appendChild(a);
    return div;
  });
  // wikilinks [[target#frag|alias]]
  replaceInText(el, doc, /\[\[([^\]|#^]+)(#\^?[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (m, d) => {
    const name = m[1].trim(), frag = (m[2] || '').trim(), alias = m[3];
    const a = d.createElement('a');
    a.className = 'internal-link';
    a.setAttribute('data-target', name);
    a.setAttribute('data-fragment', frag);
    a.href = resolve ? resolve(name) : '#';
    a.textContent = (alias || (name + frag)).trim();
    return a;
  });
  // tags #tag, #nested/tag (require a boundary before #)
  replaceInText(el, doc, /(^|[\s(])#([A-Za-z][\w-]*(?:\/[\w-]+)*)/g, (m, d) => {
    const frag = d.createDocumentFragment();
    if (m[1]) frag.appendChild(d.createTextNode(m[1]));
    const a = d.createElement('a'); a.className = 'tag'; a.setAttribute('data-tag', m[2]); a.href = '#'; a.textContent = '#' + m[2];
    frag.appendChild(a);
    return frag;
  });
  // block-ref anchor: trailing ^id
  replaceInText(el, doc, /[ \t]+\^([A-Za-z0-9-]+)\s*$/g, (m, d) => { const x = d.createElement('span'); x.className = 'block-ref'; x.id = '^' + m[1]; return x; });
}

function ppFootnotes(el, doc) {
  // collect defs from paragraphs that are `[^id]: text`
  const defs = new Map();
  for (const p of [...el.querySelectorAll('p')]) {
    const m = (p.textContent || '').match(/^\[\^([^\]]+)\]:\s+([\s\S]+)$/);
    if (m) { defs.set(m[1], m[2].trim()); p.remove(); }
  }
  // refs [^id] → sup anchor
  let counter = 0; const order = [];
  replaceInText(el, doc, /\[\^([^\]]+)\]/g, (m, d) => {
    const id = m[1]; if (!order.includes(id)) order.push(id); counter++;
    const sup = d.createElement('sup'); sup.className = 'footnote-ref';
    const a = d.createElement('a'); a.id = 'fnref-' + id; a.href = '#fn-' + id; a.textContent = '[' + counter + ']';
    sup.appendChild(a); return sup;
  });
  if (defs.size) {
    const section = doc.createElement('section'); section.className = 'footnotes';
    const ol = doc.createElement('ol');
    for (const id of order.length ? order : [...defs.keys()]) {
      const li = doc.createElement('li'); li.id = 'fn-' + id; li.className = 'footnote-item'; li.textContent = defs.get(id) || '';
      ol.appendChild(li);
    }
    section.appendChild(ol); el.appendChild(section);
  }
}

/**
 * Render Obsidian markdown INTO a DOM element (Obsidian's MarkdownRenderer contract).
 * @param {string} content raw note content (frontmatter stripped)
 * @param {HTMLElement} el target element (filled in place)
 * @param {object} [opts]
 * @param {(name:string)=>string} [opts.resolve] link/embed href resolver
 * @param {string} [opts.sourcePath] path passed to post-processors
 * @param {Array<(el:HTMLElement, ctx:object)=>void>} [opts.postProcessors] plugin post-processors
 * @returns {HTMLElement} el
 */
export function renderMarkdown(content, el, opts = {}) {
  const { resolve, postProcessors = [], sourcePath = '' } = opts;
  const doc = el.ownerDocument || globalThis.document;
  const { body } = splitFrontmatter(content);
  // strip block comments %% ... %% before the base parse
  const base = body.replace(/%%[\s\S]*?%%/g, '');
  el.innerHTML = marked.parse(base, { gfm: true });
  // built-in post-processors, in order
  ppCallouts(el, doc, resolve);
  ppCodeFences(el, doc);
  ppInline(el, doc, resolve);
  ppFootnotes(el, doc);
  // external/plugin post-processors (same contract Obsidian gives plugins)
  const ctx = { sourcePath, getSectionInfo: () => null, frontmatter: splitFrontmatter(content).frontmatter };
  for (const pp of postProcessors) { try { pp(el, ctx); } catch {} }
  return el;
}

/**
 * Convenience: render to an HTML string (server/agent path). Builds a detached
 * element via the ambient document and returns its innerHTML.
 */
export function renderToString(content, opts = {}) {
  const doc = (opts.document) || globalThis.document;
  if (!doc) throw new Error('renderToString needs a DOM (browser or jsdom). Use renderMarkdown(content, el) directly, or pass opts.document.');
  const el = doc.createElement('div');
  renderMarkdown(content, el, opts);
  return el.innerHTML;
}

export const _internal = { ppCallouts, ppCodeFences, ppInline, ppFootnotes, replaceInText };
