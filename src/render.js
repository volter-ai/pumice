import { marked } from 'marked';
import { splitFrontmatter } from './vfs/links.js';

// Render markdown to HTML, turning [[wikilinks]] into clickable internal links
// BEFORE markdown parsing so they survive as anchors.
export function renderNote(content, onResolve) {
  const { body } = splitFrontmatter(content);
  const withLinks = body.replace(
    /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g,
    (_, target, alias) => {
      const name = target.trim();
      const label = (alias || name).trim();
      const href = onResolve ? onResolve(name) : '#';
      return `<a class="wikilink" data-target="${encodeURIComponent(name)}" href="${href}">${label}</a>`;
    },
  );
  return marked.parse(withLinks);
}
