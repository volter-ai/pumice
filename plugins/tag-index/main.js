// Second real-shape plugin — exercises metadataCache (the API a huge fraction of
// the ecosystem leans on) and a vault write-back through the adapter.
const { Plugin, Notice } = require('obsidian');

module.exports = class TagIndexPlugin extends Plugin {
  async onload() {
    new Notice('Tag Index: loaded');

    this.addCommand({
      id: 'build-tag-index',
      name: 'Build tag index note',
      callback: async () => {
        const index = this.collect();
        const lines = ['# Tag Index', ''];
        for (const [tag, paths] of [...index.entries()].sort()) {
          lines.push(`## ${tag}`);
          for (const p of paths) lines.push(`- [[${p.replace(/\.md$/, '')}]]`);
          lines.push('');
        }
        await this.app.vault.create('Tag Index.md', lines.join('\n'));
        new Notice(`Indexed ${index.size} tags`);
        return index.size;
      },
    });
  }

  collect() {
    const index = new Map();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      for (const { tag } of cache.tags) {
        if (!index.has(tag)) index.set(tag, []);
        index.get(tag).push(file.path);
      }
    }
    return index;
  }

  onunload() {}
};
