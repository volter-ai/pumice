// Phase 11 — synthetic vault fixture generator for perf budgets. Deterministic (no
// randomness), so perf runs are reproducible. Each note has frontmatter tags, a few
// wikilinks to neighbors, headings, and tasks — representative of a real vault.
export function generateVault(n, opts = {}) {
  const files = {};
  const folders = ['Daily', 'Projects', 'Areas', 'Resources', 'Archive'];
  const tags = ['work', 'personal', 'idea', 'todo', 'reference', 'meeting', 'project/active', 'project/done'];
  for (let i = 0; i < n; i++) {
    const folder = folders[i % folders.length];
    const path = `${folder}/Note-${i}.md`;
    const tag = tags[i % tags.length];
    const link1 = `Note-${(i + 1) % n}`;
    const link2 = `Note-${(i + 7) % n}`;
    files[path] = `---\ntags: [${tag}]\nindex: ${i}\n---\n# Note ${i}\n\nLinks to [[${link1}]] and [[${link2}]]. A #${tag.split('/')[0]} note.\n\n## Tasks\n- [${i % 3 === 0 ? 'x' : ' '}] task for note ${i}\n\nBody text paragraph number ${i} with some searchable content like keyword${i % 50}.`;
  }
  return files;
}
