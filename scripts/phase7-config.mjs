// Phase 7 AC: a real vault's .obsidian/ config round-trips (zero-diff on untouched
// files, changed files re-serialize), ≥1 theme's :root vars apply to the DOM, and
// snippet enable/disable works. jsdom for the CSS-var apply.
import './dom-bootstrap.mjs';
import { ConfigManager, parseConfig, serializeConfig, setConfigKey, applyThemeVars, parseThemeVars, toggleSnippet } from '../src/config/obsidian-config.js';
import { memoryAdapter } from '../src/vfs/memoryAdapter.js';

let pass = 0, fail = 0; const log = [];
function eq(name, got, want) { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name}\n      got:  ${g}\n      want: ${w}`); } }
function ok(name, cond, d = '') { if (cond) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name} ${d}`); } }

// fixture .obsidian config files (as a real vault would have)
const appJson = JSON.stringify({ legacyEditor: false, livePreview: true, tabSize: 4, attachmentFolderPath: 'attachments' }, null, 2);
const appearanceJson = JSON.stringify({ accentColor: '', theme: 'obsidian', cssTheme: 'Minimal', enabledCssSnippets: ['custom'] }, null, 2);
const communityJson = JSON.stringify(['dataview', 'templater-obsidian'], null, 2);
const hotkeysJson = JSON.stringify({ 'editor:toggle-bold': [{ modifiers: ['Mod'], key: 'B' }] }, null, 2);

const files = {
  '.obsidian/app.json': appJson,
  '.obsidian/appearance.json': appearanceJson,
  '.obsidian/community-plugins.json': communityJson,
  '.obsidian/hotkeys.json': hotkeysJson,
};
const adapter = memoryAdapter(files);

// --- load + typed access ---
const mgr = await new ConfigManager(adapter).load();
eq('app.json loaded', mgr.get('app.json').tabSize, 4);
eq('appearance theme', mgr.theme().cssTheme, 'Minimal');
eq('enabled community plugins', mgr.enabledPlugins(), ['dataview', 'templater-obsidian']);
ok('hotkeys loaded', mgr.get('hotkeys.json')['editor:toggle-bold'][0].key === 'B');

// --- zero-diff: untouched config re-serializes byte-identical ---
eq('untouched app.json byte-identical', serializeConfig(mgr.configs['app.json']), appJson);
eq('untouched appearance byte-identical', serializeConfig(mgr.configs['appearance.json']), appearanceJson);

// --- change one key → that file dirty + re-serialized; others untouched ---
mgr.set('app.json', 'tabSize', 2);
await mgr.save();
const reread = await new ConfigManager(adapter).load();
eq('changed key persisted', reread.get('app.json').tabSize, 2);
eq('untouched key preserved', reread.get('app.json').attachmentFolderPath, 'attachments');
eq('other config untouched (community)', await adapter.read('.obsidian/community-plugins.json'), communityJson);

// --- standalone config helpers ---
const cfg = parseConfig(appJson);
setConfigKey(cfg, 'livePreview', false);
eq('setConfigKey nested', parseConfig(serializeConfig(cfg)).data.livePreview, false);

// --- CSS-variable contract: theme :root vars apply to DOM ---
const themeCss = ':root {\n  --text-normal: #222222;\n  --background-primary: #ffffff;\n  --accent: #7b6cd9;\n}';
const vars = parseThemeVars(themeCss);
eq('parsed theme var', vars['--text-normal'], '#222222');
const root = document.createElement('div');
applyThemeVars(root, vars, 'light');
ok('theme-light class applied', root.classList.contains('theme-light'));
eq('css var set on element', root.style.getPropertyValue('--text-normal'), '#222222');
eq('accent var set', root.style.getPropertyValue('--accent'), '#7b6cd9');

// --- snippet enable/disable ---
const apCfg = mgr.configs['appearance.json'];
toggleSnippet(apCfg, 'extra', true);
ok('snippet enabled', apCfg.data.enabledCssSnippets.includes('extra'));
toggleSnippet(apCfg, 'custom', false);
ok('snippet disabled', !apCfg.data.enabledCssSnippets.includes('custom'));

console.log('=== Phase 7: .obsidian config round-trip + theme CSS vars ===');
for (const c of log) console.log(c);
console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail) { console.log(`\nFAIL: ${fail}`); process.exit(1); }
console.log('\nAC GREEN: config zero-diff round-trip + theme vars + snippets verified.');
process.exit(0);
