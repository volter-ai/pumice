// Phase 4-render AC: Obsidian-flavored markdown completeness, asserted on the real
// DOM TREE (matching Obsidian's MarkdownRenderer + post-processor contract). Each
// feature is checked via querySelector/textContent; a plugin post-processor is run
// through the same pipeline to prove that contract. Exits nonzero on any miss.
import './dom-bootstrap.mjs'; // installs jsdom + createEl DOM extensions globally
import { renderMarkdown } from '../src/render/obsidian-markdown.js';

const resolve = (name) => `/vault/${encodeURIComponent(name)}.md`;
let pass = 0, fail = 0; const log = [];
function render(content, opts) { const el = document.createElement('div'); renderMarkdown(content, el, { resolve, ...opts }); return el; }
function check(name, content, assert) {
  let ok = false, detail = '';
  try { const el = render(content); const r = assert(el); ok = !!r; if (!ok) detail = 'assertion false'; }
  catch (e) { detail = e.message; }
  if (ok) { pass++; log.push(`  ✓ ${name}`); }
  else { fail++; const el = render(content); log.push(`  ✗ ${name} — ${detail}\n      html: ${el.innerHTML.replace(/\n/g, ' ').slice(0, 160)}`); }
}

const has = (el, sel) => !!el.querySelector(sel);
const txt = (el, sel) => { const n = el.querySelector(sel); return n ? n.textContent : null; };

check('wikilink', 'See [[Note A]].', (el) => { const a = el.querySelector('a.internal-link'); return a && a.getAttribute('data-target') === 'Note A' && a.textContent === 'Note A'; });
check('wikilink alias', 'See [[Note A|the note]].', (el) => { const a = el.querySelector('a.internal-link'); return a.textContent === 'the note' && a.getAttribute('data-target') === 'Note A'; });
check('wikilink heading', 'See [[Note A#Intro]].', (el) => el.querySelector('a.internal-link').getAttribute('data-fragment') === '#Intro');
check('wikilink block', 'See [[Note A#^abc]].', (el) => el.querySelector('a.internal-link').getAttribute('data-fragment') === '#^abc');
check('wikilink href resolved', 'See [[Note A]].', (el) => el.querySelector('a.internal-link').getAttribute('href') === '/vault/Note%20A.md');
check('embed note', '![[Note B]]', (el) => { const d = el.querySelector('.internal-embed'); return d && d.getAttribute('data-embed') === 'note' && d.getAttribute('data-target') === 'Note B'; });
check('embed heading', '![[Note B#Section]]', (el) => el.querySelector('.internal-embed').getAttribute('data-embed') === 'heading');
check('embed block', '![[Note B#^blk]]', (el) => el.querySelector('.internal-embed').getAttribute('data-embed') === 'block');
check('highlight', 'a ==hi== word', (el) => txt(el, 'mark') === 'hi');
check('comment inline removed', 'visible %%secret%% text', (el) => !el.textContent.includes('secret') && el.textContent.includes('visible'));
check('comment block removed', 'a\n\n%%\nblk\ncmt\n%%\n\nb', (el) => !el.textContent.includes('blk') && !el.textContent.includes('cmt') && el.textContent.includes('a') && el.textContent.includes('b'));
check('tag', 'an #important note', (el) => { const a = el.querySelector('a.tag'); return a && a.getAttribute('data-tag') === 'important'; });
check('nested tag', 'a #area/work tag', (el) => el.querySelector('a.tag').getAttribute('data-tag') === 'area/work');
check('callout', '> [!warning] Be careful\n> body text', (el) => { const c = el.querySelector('.callout'); return c && c.getAttribute('data-callout') === 'warning' && txt(el, '.callout-title-inner') === 'Be careful' && has(el, '.callout-content'); });
check('callout default type', '> [!note]\n> hi', (el) => { const c = el.querySelector('.callout'); return c.getAttribute('data-callout') === 'note' && txt(el, '.callout-title-inner') === 'Note'; });
check('callout unknown→note', '> [!bogus] X\n> y', (el) => el.querySelector('.callout').getAttribute('data-callout') === 'note');
check('callout foldable', '> [!tip]- Collapsed\n> body', (el) => el.querySelector('.callout').getAttribute('data-callout-fold') === '-');
check('inline math', 'mass $E=mc^2$ here', (el) => { const m = el.querySelector('.math.math-inline'); return m && m.getAttribute('data-math') === 'inline' && m.textContent === 'E=mc^2'; });
check('block math', '$$\\int x$$', (el) => has(el, '.math.math-block'));
check('math fence', '```math\na^2+b^2\n```', (el) => { const m = el.querySelector('.math.math-block'); return m && m.textContent.includes('a^2+b^2'); });
check('mermaid', '```mermaid\ngraph TD; A-->B;\n```', (el) => { const m = el.querySelector('.mermaid'); return m && m.textContent.includes('graph TD'); });
check('code untouched', '```js\nconst x = [[notALink]];\n```', (el) => { const c = el.querySelector('pre > code'); return c && c.textContent.includes('[[notALink]]') && !has(el, 'a.internal-link'); });
check('block ref anchor', 'A paragraph. ^para1', (el) => { const s = el.querySelector('.block-ref'); return s && s.id === '^para1'; });
check('footnote ref+def', 'Text[^1].\n\n[^1]: The note.', (el) => { const ref = el.querySelector('sup.footnote-ref a'); const def = el.querySelector('section.footnotes li#fn-1'); return ref && ref.getAttribute('href') === '#fn-1' && def && def.textContent === 'The note.'; });
check('table', '| a | b |\n|---|---|\n| 1 | 2 |', (el) => has(el, 'table') && has(el, 'td'));
check('task unchecked', '- [ ] todo', (el) => has(el, 'input[type=checkbox]') || /\[ \]/.test(el.textContent));
check('task checked', '- [x] done', (el) => has(el, 'input[checked]') || /\[x\]/.test(el.textContent));
check('heading', '# Title', (el) => txt(el, 'h1') === 'Title');
check('bold/italic', '**b** and *i*', (el) => txt(el, 'strong') === 'b' && txt(el, 'em') === 'i');
check('returns same el', 'hi', () => { const el = document.createElement('div'); return renderMarkdown('hi', el, { resolve }) === el; });

// Plugin post-processor contract: a post-processor receives (el, ctx) and mutates the DOM.
check('post-processor runs', 'plain text', (el0) => {
  const el = document.createElement('div');
  let gotCtx = null;
  renderMarkdown('plain text', el, { resolve, sourcePath: 'foo.md', postProcessors: [(root, ctx) => { gotCtx = ctx; root.querySelectorAll('p').forEach((p) => p.classList.add('pp-touched')); }] });
  return gotCtx && gotCtx.sourcePath === 'foo.md' && el.querySelector('p.pp-touched');
});

console.log('=== Phase 4-render: Obsidian markdown completeness (DOM tree) ===');
for (const c of log) console.log(c);
console.log(`\n${pass}/${pass + fail} features rendered correctly.`);
if (fail) { console.log(`\nFAIL: ${fail} feature(s) missing.`); process.exit(1); }
console.log('\nAC GREEN: Phase 4-render DOM renderer + post-processor contract verified.');
process.exit(0);
