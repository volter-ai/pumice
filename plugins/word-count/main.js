// A faithful, UNMODIFIED Obsidian plugin: CommonJS, require('obsidian'),
// module.exports = class extends Plugin. This is exactly the shape a bundled
// community plugin ships. It runs as-is against the uicommons shim.
const { Plugin, Notice } = require('obsidian');

module.exports = class WordCountPlugin extends Plugin {
  async onload() {
    new Notice('Vault Word Count: loaded');

    this.addRibbonIcon('dice', 'Count words in vault', async () => {
      new Notice(`Vault has ${await this.countAll()} words`);
    });

    this.addCommand({
      id: 'count-vault-words',
      name: 'Count words across all notes',
      callback: async () => {
        const n = await this.countAll();
        new Notice(`Vault has ${n} words`);
        return n;
      },
    });

    this.registerMarkdownPostProcessor((el) => {
      // (demo hook) a real plugin would decorate rendered notes here
    });
  }

  async countAll() {
    let total = 0;
    for (const file of this.app.vault.getMarkdownFiles()) {
      const text = await this.app.vault.cachedRead(file);
      total += (text.trim().match(/\S+/g) || []).length;
    }
    return total;
  }

  onunload() {}
};
