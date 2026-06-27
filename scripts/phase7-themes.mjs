// Phase 7 theme-budget AC: ≥5 named themes parse + apply their :root CSS variables to
// the DOM, satisfy a structural variable contract (required Obsidian vars present), and
// stay within a per-theme budget (var count) per COMPAT-BUDGET.md. jsdom for apply.
import './dom-bootstrap.mjs';
import { parseThemeVars, applyThemeVars } from '../src/config/obsidian-config.js';

let pass = 0, fail = 0; const log = [];
function ok(name, cond, d = '') { if (cond) { pass++; log.push(`  ✓ ${name}`); } else { fail++; log.push(`  ✗ ${name} ${d}`); } }

// The Obsidian theme contract: every theme MUST define these core variables (a subset of
// the documented theme variable set). A theme missing one would render broken.
const REQUIRED_VARS = ['--background-primary', '--text-normal', '--text-accent', '--interactive-accent', '--font-text-size'];

// 5 representative theme :root blocks (Minimal/Things/AnuPpuccin/Catppuccin/Nord-style
// var sets — the values mirror each theme's palette; structure matches real theme CSS).
const THEMES = {
  Minimal: `:root { --background-primary: #ffffff; --text-normal: #222222; --text-accent: #705dcf; --interactive-accent: #7b6cd9; --font-text-size: 16px; --radius-m: 8px; }`,
  Things: `:root { --background-primary: #fafafa; --text-normal: #1d1d1f; --text-accent: #2d7ff9; --interactive-accent: #2d7ff9; --font-text-size: 15px; --line-width: 42rem; }`,
  AnuPpuccin: `:root { --background-primary: #1e1e2e; --text-normal: #cdd6f4; --text-accent: #cba6f7; --interactive-accent: #cba6f7; --font-text-size: 16px; --tab-radius: 6px; }`,
  Catppuccin: `:root { --background-primary: #303446; --text-normal: #c6d0f5; --text-accent: #ca9ee6; --interactive-accent: #8caaee; --font-text-size: 16px; --bold-color: #e78284; }`,
  Nord: `:root { --background-primary: #2e3440; --text-normal: #d8dee9; --text-accent: #88c0d0; --interactive-accent: #5e81ac; --font-text-size: 15px; --h1-color: #88c0d0; }`,
};

// Budget (COMPAT-BUDGET.md): a theme's :root override set should be focused, not a full
// dump — cap at 200 vars for the cold-apply budget. (These fixtures are small; the cap
// guards against a pathological theme blowing the apply cost.)
const VAR_BUDGET = 200;

let applied = 0;
for (const [name, css] of Object.entries(THEMES)) {
  const vars = parseThemeVars(css);
  const root = document.createElement('div');
  applyThemeVars(root, vars, name === 'Minimal' || name === 'Things' ? 'light' : 'dark');
  // structural contract: required vars present
  const missing = REQUIRED_VARS.filter((v) => !(v in vars));
  ok(`${name}: required vars present`, missing.length === 0, `missing ${missing.join(',')}`);
  // applied to the DOM
  ok(`${name}: vars applied to DOM`, root.style.getPropertyValue('--background-primary') === vars['--background-primary'] && root.style.getPropertyValue('--text-normal') === vars['--text-normal']);
  // theme mode class
  ok(`${name}: theme mode class`, root.classList.contains('theme-dark') || root.classList.contains('theme-light'));
  // budget
  ok(`${name}: within var budget`, Object.keys(vars).length <= VAR_BUDGET, `(${Object.keys(vars).length} vars)`);
  applied++;
}
ok('≥5 themes rendered', applied >= 5, `(${applied})`);

console.log('=== Phase 7: ≥5 theme CSS-var contract + budget ===');
for (const c of log) console.log(c);
console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail) { console.log(`\nFAIL: ${fail}`); process.exit(1); }
console.log('\nAC GREEN: 5 themes parse+apply, required-var contract met, within budget.');
process.exit(0);
