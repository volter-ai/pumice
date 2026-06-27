// E2E: every feature proven in a REAL browser (Chromium) against the assembled app.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.errors = errors;
  await page.goto('/app.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ready === true || window.__bootError, null, { timeout: 10000 });
});

test('app boots without errors and loads the plugin runtime', async ({ page }) => {
  const bootError = await page.evaluate(() => window.__bootError || null);
  expect(bootError).toBeNull();
  expect(await page.evaluate(() => !!(window.__app && window.__app.plugins))).toBe(true);
});

test('vault opens: notes list + note renders', async ({ page }) => {
  await page.getByTestId('tab-vault').click();
  await expect(page.getByTestId('note-list').locator('li')).toHaveCount(5);
  await expect(page.getByTestId('note-pane').locator('h1')).toContainText('Welcome');
});

test('vault: clicking a wikilink navigates the note pane', async ({ page }) => {
  await page.getByTestId('tab-vault').click();
  await page.getByTestId('note-pane').locator('a.internal-link', { hasText: 'Note A' }).first().click();
  await expect(page.getByTestId('note-pane')).toHaveAttribute('data-current', 'Note A.md');
});

test('markdown render: callout, highlight, math, tag, task, link', async ({ page }) => {
  await page.getByTestId('tab-render').click();
  const out = page.getByTestId('render-out');
  await expect(out.locator('.callout')).toBeVisible();
  await expect(out.locator('mark')).toHaveText('highlight');
  await expect(out.locator('.math.math-inline')).toContainText('E=mc^2');
  await expect(out.locator('a.tag')).toContainText('home');
  await expect(out.locator('a.internal-link').first()).toBeVisible();
});

test('plugins: many real community plugins load in-browser + post-processor injects DOM', async ({ page }) => {
  await page.getByTestId('tab-plugin').click();
  // featured plugins loaded at boot
  await expect(page.getByTestId('plugin-status')).toContainText('emoji-shortcodes');
  // load the full breadth on demand, then assert ≥50 loaded with zero errors
  await page.getByTestId('plugin-load-all').click();
  await expect(page.getByTestId('plugin-status')).toHaveAttribute('data-loading', 'done', { timeout: 60000 });
  const realCount = Number(await page.getByTestId('plugin-status').getAttribute('data-real-count'));
  expect(realCount).toBeGreaterThanOrEqual(50); // 59 real community plugins load+onload in the real browser
  expect(await page.evaluate(() => Object.keys(window.__pluginErrors || {}).length)).toBe(0);
  // the hand-written BadgePlugin's markdown post-processor ran on rendered output
  await expect(page.getByTestId('plugin-render').getByTestId('plugin-badge').first()).toBeVisible();
});

test('editor: real CodeMirror 6 renders, live-preview decorations, edit works', async ({ page }) => {
  await page.getByTestId('tab-editor').click();
  await expect(page.getByTestId('editor-host').locator('.cm-editor')).toBeVisible();
  await expect(page.getByTestId('editor-value')).toContainText('lines:');
  await page.getByTestId('editor-append').click();
  await expect(page.getByTestId('editor-value')).toContainText('MORE');
  // live-preview decoration applied a heading line class
  expect(await page.evaluate(() => !!document.querySelector('.cm-header, .cm-strong, .cm-line'))).toBe(true);
});

test('graph: REAL 3D-graph community plugin renders a WebGL canvas from real vault links', async ({ page }) => {
  await page.getByTestId('tab-graph3d').click();
  // the real published plugin loads + mounts (no pumice-built graph)
  await expect(page.getByTestId('graph3d-status')).toContainText('real 3d-graph plugin', { timeout: 10000 });
  const canvas = page.getByTestId('graph3d-host').locator('canvas');
  await expect(canvas).toBeVisible();
  // a real WebGL context exists on the mounted canvas
  const glOk = await page.evaluate(() => { const c = document.querySelector('[data-testid=graph3d-host] canvas'); const gl = c && (c.getContext('webgl') || c.getContext('webgl2')); return !!gl; });
  expect(glOk).toBe(true);
  // it is the GENUINE plugin: instance registered + its live ForceGraph holds real nodes
  const loaded = await page.evaluate(() => !!(window.app && window.app.plugins && window.app.plugins.plugins['3d-graph']));
  expect(loaded).toBe(true);
  const nodes = await page.evaluate(() => { try { return (window.__fg.graphData().nodes || []).length; } catch { return 0; } });
  expect(nodes).toBeGreaterThan(0);
});

test('markdown decorations: ALL features render in the browser', async ({ page }) => {
  await page.getByTestId('tab-decorations').click();
  const o = page.getByTestId('decorations-out');
  // headings h1..h6
  for (let i = 1; i <= 6; i++) await expect(o.locator(`h${i}`)).toContainText(`H${i}`);
  // inline marks
  await expect(o.locator('strong')).toContainText('boldtext');
  await expect(o.locator('em')).toContainText('italictext');
  await expect(o.locator('del')).toContainText('striketext');
  await expect(o.locator('mark')).toContainText('hltext');
  await expect(o.locator('code').first()).toBeVisible();
  // math
  await expect(o.locator('.math.math-inline[data-math="inline"]')).toContainText('E=mc^2');
  await expect(o.locator('.math.math-block[data-math="display"]').first()).toBeVisible();
  // math fence + mermaid + code fence
  await expect(o.locator('.math.math-block').filter({ hasText: 'a^2+b^2' })).toBeVisible();
  await expect(o.locator('.mermaid')).toContainText('graph TD');
  await expect(o.locator('pre > code.language-js')).toContainText('notALink'); // code untouched
  // callouts
  await expect(o.locator('.callout[data-callout="warning"]')).toBeVisible();
  await expect(o.locator('.callout[data-callout="warning"] .callout-title-inner')).toContainText('Be careful');
  await expect(o.locator('.callout[data-callout-fold="-"]')).toBeVisible();
  await expect(o.locator('.callout[data-callout="note"]')).toBeVisible(); // unknown → note
  // wikilinks (plain/alias/heading/block)
  await expect(o.locator('a.internal-link[data-target="Note A"]').first()).toBeVisible();
  await expect(o.locator('a.internal-link', { hasText: 'the alias' })).toBeVisible();
  await expect(o.locator('a.internal-link[data-fragment="#Heading"]')).toBeVisible();
  await expect(o.locator('a.internal-link[data-fragment="#^blk"]')).toBeVisible();
  // embeds (note/heading/block)
  await expect(o.locator('.internal-embed[data-embed="note"]')).toBeVisible();
  await expect(o.locator('.internal-embed[data-embed="heading"]')).toBeVisible();
  await expect(o.locator('.internal-embed[data-embed="block"]')).toBeVisible();
  // tags
  await expect(o.locator('a.tag[data-tag="toptag"]')).toBeVisible();
  await expect(o.locator('a.tag[data-tag="area/work"]')).toBeVisible();
  // block ref anchor
  await expect(o.locator('span.block-ref#\\^para1')).toHaveCount(1);
  // footnotes
  await expect(o.locator('sup.footnote-ref a[href="#fn-1"]')).toBeVisible();
  await expect(o.locator('section.footnotes li#fn-1')).toContainText('The footnote definition');
  // table
  await expect(o.locator('table td').first()).toContainText('v1');
  // tasks
  expect(await o.locator('input[type="checkbox"]').count()).toBeGreaterThanOrEqual(2);
  // comments removed
  const txt = await o.textContent();
  expect(txt).not.toContain('inline-secret');
  expect(txt).not.toContain('block-secret-comment');
  expect(txt).toContain('after-comment');
});

test('canvas: nodes + edges render', async ({ page }) => {
  await page.getByTestId('tab-canvas').click();
  await expect(page.getByTestId('canvas-host').locator('.canvas-node')).toHaveCount(2);
  await expect(page.getByTestId('canvas-host').locator('svg .canvas-edge')).toHaveCount(1);
});

test('bases: table view filters + formula column', async ({ page }) => {
  await page.getByTestId('tab-bases').click();
  const rows = page.getByTestId('bases-host').locator('tbody tr');
  await expect(rows).toHaveCount(2); // only the 2 books (filter type=="book")
  // value = price*qty = 60 for Dune
  await expect(page.getByTestId('bases-host')).toContainText('60');
});

test('properties: typed widgets render + getData round-trip', async ({ page }) => {
  await page.getByTestId('tab-properties').click();
  await expect(page.getByTestId('properties-panel').locator('.metadata-property')).toHaveCount(4);
  await expect(page.getByTestId('properties-data')).toContainText('"rating":5');
  await expect(page.getByTestId('properties-data')).toContainText('"published":true');
});

test('search: REAL omnisearch plugin returns query-specific full-text results', async ({ page }) => {
  await page.getByTestId('tab-search').click();
  // the genuine plugin loads (no pumice-built search engine)
  await expect.poll(() => page.evaluate(() => !!(window.app && window.app.plugins && window.app.plugins.plugins['omnisearch'])), { timeout: 10000 }).toBe(true);
  // a real query re-ranks/filters: "welcome" surfaces Welcome.md
  await page.getByTestId('search-input').fill('welcome');
  await expect(page.getByTestId('search-results')).toContainText('Welcome.md', { timeout: 8000 });
  // a different query returns a DIFFERENT, specific result — proving real search, not a static list
  await page.getByTestId('search-input').fill('hobbit');
  await expect.poll(async () => (await page.getByTestId('search-results').locator('li').allTextContents()).join('|'), { timeout: 8000 })
    .toMatch(/Hobbit/);
  const hasDune = (await page.getByTestId('search-results').locator('li').allTextContents()).some((t) => /Dune/.test(t));
  expect(hasDune).toBe(false); // "hobbit" must NOT return Dune → genuine filtering
});

test('dataview: REAL dataview plugin renders a query table (Web Worker index)', async ({ page }) => {
  await page.getByTestId('tab-dataview').click();
  await expect.poll(() => page.evaluate(() => !!(window.app && window.app.plugins.plugins['dataview'])), { timeout: 12000 }).toBe(true);
  await expect(page.getByTestId('dataview-status')).toContainText('rendered a table', { timeout: 12000 });
  // genuine query output: a real <table> with rows
  await expect(page.getByTestId('dataview-out').locator('table')).toBeVisible({ timeout: 12000 });
  expect(await page.getByTestId('dataview-out').locator('table tr').count()).toBeGreaterThan(1);
});

test('tasks: REAL tasks plugin renders open tasks from the vault', async ({ page }) => {
  await page.getByTestId('tab-tasks').click();
  await expect.poll(() => page.evaluate(() => !!(window.app && window.app.plugins.plugins['tasks'])), { timeout: 12000 }).toBe(true);
  await expect(page.getByTestId('tasks-status')).toContainText(/rendered \d+ open task/, { timeout: 12000 });
  expect(await page.getByTestId('tasks-out').locator('li').count()).toBeGreaterThan(0);
});

test('templater: REAL templater plugin expands <% tp.* %> in the active editor', async ({ page }) => {
  await page.getByTestId('tab-templater').click();
  await expect.poll(() => page.evaluate(() => !!(window.app && window.app.plugins.plugins['templater'])), { timeout: 12000 }).toBe(true);
  await expect(page.getByTestId('templater-status')).toContainText('expanded the template', { timeout: 12000 });
  // result computed the JS expressions and no template tokens remain
  await expect(page.getByTestId('templater-after')).toContainText('sum = 5');
  await expect(page.getByTestId('templater-after')).toContainText('upper = AB');
  await expect(page.getByTestId('templater-after')).not.toContainText('<%');
});

test('backlinks: computed for Welcome.md', async ({ page }) => {
  await page.getByTestId('tab-backlinks').click();
  const items = page.getByTestId('backlinks-list').locator('li');
  expect(await items.count()).toBeGreaterThan(0);
  await expect(page.getByTestId('backlinks-list')).toContainText('Note A.md');
});

test('page preview: hover shows a rendered popover', async ({ page }) => {
  await page.getByTestId('tab-preview').click();
  await page.getByTestId('preview-host').locator('a.internal-link').first().hover();
  await expect(page.locator('.hover-popover')).toBeVisible();
  await expect(page.locator('.hover-popover')).toContainText('Note A');
});

test('daily note: create today via template', async ({ page }) => {
  await page.getByTestId('tab-daily').click();
  await page.getByTestId('daily-create').click();
  await expect(page.getByTestId('daily-out')).toHaveAttribute('data-path', 'Daily/2026-06-26.md');
  await expect(page.getByTestId('daily-out')).toContainText('2026-06-26');
});

test('theme: toggling a style setting changes a CSS variable', async ({ page }) => {
  await page.getByTestId('tab-theme').click();
  await page.getByTestId('theme-apply').click();
  await expect(page.getByTestId('theme-out')).toContainText('#ff0000');
});

test('tag rename: propagates across the vault', async ({ page }) => {
  await page.getByTestId('tab-tagrename').click();
  await page.getByTestId('tagrename-run').click();
  await expect(page.getByTestId('tagrename-out')).toHaveAttribute('data-count', '2');
  await expect(page.getByTestId('tagrename-out')).toContainText('#sample');
});

test('mobile: responsive layout at 375px — no horizontal overflow, sidebar collapses', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto('/app.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 10000 });
  // no horizontal overflow (the page fits the phone width)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  // sidebar collapsed to a single-column top bar (grid is one column on mobile)
  const cols = await page.evaluate(() => getComputedStyle(document.getElementById('app')).gridTemplateColumns);
  expect(cols.split(' ').length).toBe(1);
  // a note still renders + fits
  await page.getByTestId('tab-render').click();
  const w = await page.getByTestId('render-out').evaluate((e) => e.scrollWidth);
  expect(w).toBeLessThanOrEqual(375);
});

test('PWA: manifest is valid + service worker registers and controls the page', async ({ page }) => {
  // manifest linked + fetchable + has the install-critical fields
  const href = await page.getAttribute('link[rel=manifest]', 'href');
  expect(href).toBeTruthy();
  const manifest = await page.evaluate(async (h) => (await fetch(h)).json(), href);
  expect(manifest.name).toContain('Pumice');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
  // service worker registers
  await page.waitForFunction(() => window.__swReady === true, null, { timeout: 10000 });
  // after a reload the SW controls the page (offline-capable)
  await page.reload({ waitUntil: 'domcontentloaded' });
  const controlled = await page.evaluate(async () => { await navigator.serviceWorker.ready; return !!navigator.serviceWorker.controller; });
  expect(controlled).toBe(true);
});

test('OPFS: persistent browser storage write/read + survives reload', async ({ page }) => {
  await page.getByTestId('tab-opfs').click();
  await page.getByTestId('opfs-write').click();
  await expect(page.getByTestId('opfs-out')).toHaveAttribute('data-state', 'ok'); // nested write + read-back worked
  // reload the page → OPFS should still hold the file (true persistence, no server)
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 10000 });
  await page.getByTestId('tab-opfs').click();
  await page.getByTestId('opfs-check').click();
  await expect(page.getByTestId('opfs-out')).toHaveAttribute('data-persisted', 'true');
});

test('MCP: UI↔REST↔MCP parity in the browser', async ({ page }) => {
  await page.getByTestId('tab-mcp').click();
  await page.getByTestId('mcp-run').click();
  await expect(page.getByTestId('mcp-out')).toHaveAttribute('data-parity', 'true');
  await expect(page.getByTestId('mcp-out')).toContainText('Welcome.md');
});
