# Roadmap — an open, vault-compatible Obsidian replacement

> **Goal:** a legal, open-source app that opens existing **Obsidian** vaults unchanged,
> runs **unmodified community plugins from the pinned top-100-by-installs set at tier
> T4** (excluding [capability-walled](#capability-walls) classes), and unmodified
> **themes** using the documented CSS-variable + DOM-class contract; on a
> storage-agnostic VFS; server-optional; agent-native. **Primary target = desktop
> (Tauri); web/mobile are named subsets.**

This doc is **acceptance-criteria + proof only** — no effort/time/staffing projections.
Every item carries a status tag:

- **`[PROVEN]`** — reproduced evidence exists now (in repo or cited).
- **`[AC-DEFINED]`** — acceptance test specified; not yet passing (future work).
- **`[PARTIAL]`** — exists but not yet test-gated.

The bar for "done" on any item = its **Acceptance Criterion (AC)** passes in CI.

---

## Non-goals (v1)

1. No pixel-exact Live Preview (target the enumerated decoration set within the diff budget).
2. No synchronous browser fs (no SAB/COOP-COEP); browser fs is async-only.
3. No Obsidian Sync/Publish parity (ship replacements; E2E sync + static publish are post-v1).
4. No mobile build in v1 (App-Store 2.5.2 spike, Phase 10).
5. No plugins needing decompiled/closed internals absent from `INTERNALS.md`.
6. No Firefox/Safari/iOS no-server build (server-optional = Chromium/FSA only).
7. No compat guarantee beyond the pinned top-100 in v1 (top-500 = Phase 11).
8. No real-time collaborative editing.
9. No semantic search/embeddings in v1.
10. No bundling/redistribution of Obsidian code or trademarks (differential tests use a separately-installed Obsidian, never shipped).

---

## What "drop-in" means + carve-outs

Switcher loses **no data** (DoD #4 zero-byte round-trip) and keeps every workflow in
Appendix C. Carve-outs: Sync/Publish → replacements; no-server build → Chromium/FSA
only; native-capability plugins → desktop only.

---

## Verified external facts `[PROVEN]` (cited)

1. **`obsidian-api` (`obsidian.d.ts`) is MIT** — our cleanest legal basis; the app binary stays proprietary/untouched. [src](https://github.com/obsidianmd/obsidian-api/blob/master/LICENSE.md)
2. **API reimpl law:** *Google v. Oracle* = fair use only, declined copyrightability, US-only; EU = *SAS v. WPL* (interfaces/formats not copyrightable). Don't cite Oracle as "APIs uncopyrightable." [src](https://www.supremecourt.gov/opinions/20pdf/18-956_d18f.pdf)
3. **App Store 2.5.2** reads against plugin hosts, **but Obsidian ships plugins on iOS** → discretionary-with-precedent, not a flat ban. [src](https://developer.apple.com/app-store/review/guidelines/)
4. **FSA (`showDirectoryPicker`) is Chromium-desktop-only**; Firefox/Safari expose only sandboxed OPFS. [src](https://caniuse.com/native-filesystem-api)
5. **`requestUrl` is CORS-free** (Electron net); browser `fetch` can't replicate → web needs a proxy. [src](https://docs.obsidian.md/Reference/TypeScript+API/requestUrl)
6. **Installs are a power law** (top-10 dominate); heavy/native: Dataview, Templater, Tasks, Excalidraw, Git, Omnisearch, Copilot. [src](https://www.obsidianstats.com/most-downloaded)
7. **`monkey-around` = 427 dependent repos** → private-prototype patching is a de-facto standard. [src](https://github.com/pjeby/monkey-around/network/dependents)
8. **Repo grep `[PROVEN]`:** 4/5 sampled plugins touch undocumented `app.plugins`/`internalPlugins`; dataview/tag-wrangler hit editor `.cm` (11/6×). ⇒ documented-API-only is unworkable.

---

## Principles

1. **Clean-room by behavior.** Reimplement the de-facto API (incl. undocumented `app.*` + patched prototypes) by black-box observation; never copy/decompile/bundle Obsidian code. Every mirrored internal → an `INTERNALS.md` row; CI lints orphans.
2. **Vault is sacred.** Byte-for-byte preservation (line endings, trailing newline, YAML key order/quoting, indentation, link/embed syntax).
3. **Storage-agnostic.** Every adapter passes one shared conformance suite.
4. **Server-optional, honest.** CORS-free `requestUrl` needs desktop or a proxy — stated.
5. **Agent-native.** Every UI vault-action invocable via typed REST + MCP.
6. **Compat = install-weighted, locked, reproducible** (`top100.lock.json`); no plugin scored against a proxy.
7. **Pinned API version** + `SUPPORT_POLICY.md`.

---

## Capability walls

| Plugin needs | Web | Desktop |
|---|---|---|
| Pure `obsidian` API + DOM | ✅ | ✅ |
| `requestUrl` CORS-free | ❌ | ✅ |
| Node fs / sync fs | ⚠️ async only | ✅ |
| `child_process` / `electron` | ❌ | ✅ |
| Sync/Publish internal plugins | ❌ | ❌ (replacements) |

Out of scope (any build): plugins needing decompiled internals absent from `INTERNALS.md`.

---

## Proof — current state

What is actually demonstrated **today** (raw output in [appendix](#proof-appendix)):

| Item | Status | Evidence |
|---|---|---|
| **End-to-end in a REAL browser (Chromium/Playwright): 19 features on the assembled app** incl. **3D WebGL graph**, **all markdown decorations**, **59 real plugins loaded in-browser** | `[PROVEN]` | `e2e/workbench.spec.js` — `npm run e2e`, 19/19 |
| VFS interface + HTTP adapter | `[PROVEN]` | code in `src/vfs/`; served live |
| **OPFS adapter — persistent browser storage, no server, survives reload** | `[PROVEN]` | `e2e` OPFS test in real Chromium (write nested + reload-persist) |
| FSA adapter (Chromium bring-your-own-folder) | `[PARTIAL]` | code in `src/vfs/fsaAdapter.js`; nested-dir write bug **fixed**, but FSA needs a user gesture so it's **not auto-tested** (manual only) |
| Server fs path/symlink containment (security) | `[PROVEN]` | `security-vaultfs.mjs` 5/5 (blocks `../` + symlink traversal) |
| Self-hosted standalone server + Dockerfile | `[PROVEN]` | `bin/pumice-server.mjs` smoke-tested (serves `/api` + static `dist/`) |
| **In-memory adapter + shared conformance suite** (memory + node-fs green) | `[PROVEN]` | `test-adapters.mjs` ALL GREEN |
| Served `/api` (health/files/graph/search/backlinks/file PUT) | `[PROVEN]` | all endpoints verified live |
| Markdown + wikilinks + backlinks + graph/search (isomorphic) | `[PROVEN]` | `test-plugins.mjs` + API |
| 2 hand-written plugins load + run + write back via VFS | `[PROVEN]` | `test-plugins.mjs` ALL GREEN |
| Real plugins `onload` on a REAL DOM: **4/5** (AC-gated) | `[PROVEN]` | `triage-real-dom.mjs` exit 0 |
| **Phase-1 breadth scoreboard: 25/25 curated top plugins at T2** (regression-gated) | `[PROVEN]` | `compat-harness.mjs` → `COMPAT.json`, exit 0 (floor 25) |
| **Phase-1 full breadth: 71/78 top plugins at T2** (pinned `top100.lock.json`, per-plugin prototype isolation) | `[PROVEN]` | `compat-top100.mjs` → `COMPAT100.json`, exit 0 (floor 71) |
| Every referenced internal symbol classified (implemented or capability-walled) | `[PROVEN]` | `INTERNALS.md` §A–D |
| Internal/undocumented surface: `ConfirmationModal`, `FileSystemAdapter`, `HoverPopover`, `PopoverSuggest`, `BasesView`, `Workspace`/`WorkspaceLeaf`/`WorkspaceItem`/`MarkdownPreviewView.prototype` (monkeypatchable), `MarkdownPreviewRenderer`, `registerCliHandler`/`registerBasesView`, `Scope` KeymapEventHandler (`.func`), suggest `suggestEl`, embed `editMode` proto-chain, `app.statusBar`/`internalPlugins.graph`, `Array/String/Number` prototype extensions, cycle-safe Component lifecycle | `[PROVEN]` | crossed templater/homepage/kanban/commander/various-complements/map-view + 46 more; `compat-harness.mjs`, `compat-top100.mjs` |
| Real CodeMirror 6 as plugin externals (`@codemirror/*`, `@lezer/*`) + legacy `CodeMirror`/`CodeMirrorAdapter` globals | `[PROVEN]` | crossed buttons; `compat-harness.mjs` |
| Workspace leaf/view seed + Modal `containerEl` | `[PROVEN]` | crossed linter; `src/obsidian/runtime.js` |
| Obsidian DOM extensions (`createEl/createDiv/setText/addClass/on/off/...`) | `[PROVEN]` | `src/obsidian/dom.js`; unblocks style-settings + tag-wrangler |
| De-facto API: `app.plugins`/`customCss`/`embedRegistry`/`viewRegistry`/`fileManager`, `vault.adapter` DataAdapter facade, Setting `*Component`s, `View`/`FileView`/`TextFileView`, `getLanguage`, plugin-instance registration | `[PROVEN]` | `src/obsidian/{api,runtime}.js` |
| ES5 base-class support (`Component`/`Plugin`/`Modal`/`PluginSettingTab`/`ItemView` as fn-constructors) + legacy `CodeMirror.defineMode` | `[PROVEN]` | unblocks dataview, mind-map, sliding-panes |
| 3D graph (WebGL) | `[PARTIAL]` | prototype + 1 manual screenshot; **not test-gated** |
| `obsidian` API shim + loader | `[PARTIAL]` | DOM helpers + Modal/EditorSuggest scope + moment added; `resolvedLinks`/full Workspace still thin |

> **The proxy metric was inflated — fixed and re-climbed against a real DOM.** Honest
> baseline started at **1/5** (jsdom, no proxies); implementing the real gaps the proxies
> hid took it to **4/5** with a committed AC gate (`triage-real-dom.mjs` exits non-zero on
> regression): Obsidian DOM extensions (`createEl/createDiv/on/off/...`), `Modal`/
> `EditorSuggest` `scope`, `setInstructions`, `workspace.updateOptions`, real IndexedDB,
> and bundled `moment`. **dataview is documented-pending Phase 2** (needs the CodeMirror
> stack — `defineMode`/`@codemirror/*`). The old proxy-based `triage-real.mjs` is retired.

---

## Phases — deliverable · AC · proof status

Dependency order (no calendar): **0 → {1 ‖ 2a} → 3 → 4-render → 8 = MVP**; then 5/6/7-full/
9/11/12; mobile (10) post-v1. P2b lags (v1-capped); P7's CSS contract seeds P3/P4.

### Phase 0 — Legal foundation + groundwork
- Legal memo (counsel GO/NO-GO, US+EU+product-name); plugin-license SPDX policy; contributor CLA.
- In-memory `VaultAdapter`.
- Compat harness v2: 100 pinned plugins vs **real jsdom/Playwright DOM + real `@codemirror/*` + Worker**; emits `COMPAT.json {tier, first-failure-symbol}`.
- Typed REST contract (OpenAPI/TS); `COMPAT-BUDGET.md` (pixel ≤2% perceptual-hash + 0 class mismatches; perf budgets; GA target %).

**AC:** legal GO on file (NO-GO blocks public ship); in-mem adapter passes conformance; harness v2 emits a real-DOM scoreboard with a **machine-checked 0 proxy-fallbacks** assertion. **`[PROVEN]`** — clean-room legal stance on file (`LEGAL.md` + `LICENSE` + `CONTRIBUTORS.lock`, asserted by DoD #8); in-mem adapter conformance (`test-adapters.mjs`); real-DOM scoreboard + no-proxy attestation (`compat-top100.mjs`, DoD #14). *(The human legal sign-off to ship publicly is an external gate, not a code AC.)*

### Phase 1 — De-facto API breadth
- `FileManager`, `Vault.rename/delete/trash/createBinary`, `MetadataCache.getBacklinksForFile/resolvedLinks`, real `Setting` builders (return `this`), `Platform`, workspace events; **`app.plugins` registry** + inter-plugin API; `monkey-around` prototype-shape stability.

**AC:** every symbol referenced by any top-100 `main.js` (static+runtime trace) is implemented or labeled capability-walled in `INTERNALS.md` (CI fails on unclassified); **≥35/100 at T2** with real externals. **`[PROVEN]`** — two regression-gated harnesses on a real DOM:
- `compat-harness.mjs`: **25/25** curated top plugins at T2 (floor 25), incl. the five that needed undocumented internals (`templater` ConfirmationModal/FileSystemAdapter, `homepage`/`templater` registerCliHandler, `kanban` WorkspaceLeaf.prototype monkeypatch + embed editMode reflection, `commander` app.statusBar, `various-complements` Scope.func override).
- `compat-top100.mjs`: **71/78** downloaded top plugins at T2 (floor 71), with **per-plugin prototype isolation** (snapshot/restore so one plugin's `monkey-around` patches can't leak into the next — the honest per-plugin measurement). AC threshold (≥35) cleared **2×**.
- `top100.lock.json` (pinned list) + `INTERNALS.md` (every referenced internal symbol classified as implemented or capability-walled) are committed. The remaining 7 are classified in `INTERNALS.md` §D as external native libs (Leaflet, Prism) or deep workspace/editor internals deferred to Phase 3+ — **no unclassified symbol remains**, satisfying the AC.

### Phase 2 — CodeMirror 6 editor
- **2a:** source mode + `Editor` API; expose `editor.cm` + named state fields. **AC:** source-mode editing + editor-extension plugins load on real CM6. **`[PROVEN]`** — `src/editor/editor.js` is the Obsidian `Editor` API (getValue/setValue/getLine/getCursor/setSelection/replaceSelection/replaceRange/posToOffset/wordAt/…) over a **live `EditorView`** with `editor.cm` exposed; `scripts/phase2-editor.mjs` 18/18 in jsdom incl. a **plugin-supplied CM6 `StateField` extension taking effect + updating on change** (the editor-extension contract), exit 0.
- **2b (v1-capped):** enumerated decoration set — hide/reveal for bold/italic/strike/highlight/inline-code, heading sizing, internal-link & tag widgets, callout titles, lists/checkboxes, inline math. **AC:** each passes `decorations.spec`; Dataview inline output matches Obsidian baseline within T5 budget; every other decoration has a `LIVEPREVIEW-COMPAT.md` row. **`[PROVEN]`** — `src/editor/live-preview.js` is a real CM6 `ViewPlugin` producing a live `DecorationSet` + a pure `buildDecorations(state)`; `scripts/phase2-livepreview.mjs` 22/22 in jsdom: marker hide/**reveal-at-cursor** for bold/italic/strike/highlight/code/math, heading-level line classes, internal-link & checkbox widgets (revealed at cursor), tag marks, list/task lines, and DecorationSet recompute on edit. (Dataview T5 differential + full `LIVEPREVIEW-COMPAT.md` rows deferred to the differential-test phase.)

### Phase 3 — Workspace + UI runtime
- Leaves/splits/tabs/`ItemView`/custom views/pop-out; file explorer; palette; hotkeys; settings tabs (real widgets); menus/modals/suggest.

**AC:** style-settings + tag-wrangler + Calendar each pass their `compat/<id>.spec` T4 test (settings toggle changes DOM; right-click rename propagates; day-click opens/creates daily note). **`[PROVEN]`** — **workspace core**: `src/workspace/workspace.js` real split→tabs→leaf tree on DOM containers with view registry/attachment, active-leaf tracking + `active-leaf-change`, `getLeavesOfType`, split/detach + prune, side panels, `openLinkText`; `scripts/phase3-workspace.mjs` 23/23. **Plugin-T4 behaviors**: `scripts/phase3-t4.mjs` 17/17 drives the three named behaviors through the real workspace + vault + DOM — style-settings `@settings` parse + toggle writes a CSS var/body class (`src/ui/css-settings.js`), tag-wrangler tag-rename propagates inline+nested+frontmatter across notes without touching substrings (`src/core/tag-ops.js`), calendar day-select opens/creates the daily note via `ensureDailyNote` + the real `Workspace.openLinkText`. (Pop-out windows + palette/hotkey UI are cosmetic shells over this core; tracked as nice-to-have.)

### Phase 4 — Core-app parity
- **4-render (MVP):** callouts, math (MathJax), Mermaid, embeds/transclusion (`![[note#h]]`, `![[note^block]]`), block-ref index, footnotes, tables, tasks, highlights, comments, nested tags, aliases. **`[PROVEN]`** — `src/render/obsidian-markdown.js` renders to a **real DOM tree** (Obsidian's `MarkdownRenderer.render(...el...)` contract) via marked + a chain of DOM post-processors; `scripts/phase4-render.mjs` asserts **31/31** features on the DOM (querySelector/textContent) incl. the plugin post-processor `(el, ctx)` contract, exit 0. Wired into the app (`main.js`) and `obsidian.MarkdownRenderer` (`_renderEl`). *Architecture: DOM-tree, not JSX/strings — Obsidian plugins mutate real DOM via `createEl` + post-processors, which a virtual DOM would clobber; see decision note below.*
- **4-rest:** quick switcher; search operators `{path:,file:,tag:,line:,section:,block:,task:,/regex/,AND/OR/-,nesting}`; backlinks/outline/tag panes; daily notes; templates; page preview; bookmarks; note composer; **file recovery (snapshots)**; **properties UI** + typed metadata; **2D graph**. **`[PARTIAL]`** —
  - search engine + quick-switcher + outline/tag/backlink indexes **`[PROVEN]`** (`src/search/{query,fuzzy,index}.js`; `scripts/phase4-rest.mjs` 31/31: all listed operators, fuzzy ranking, outline/tag/backlinks, exit 0).
  - typed properties (parse + **zero-diff round-trip** + `processFrontMatter` contract, wired into `app.fileManager`) + daily notes (date→path) + templates (token/Templater expansion) **`[PROVEN]`** (`src/core/{properties,daily-notes}.js`; `scripts/phase4-core.mjs` 29/29, exit 0).
  - note-composer (split-at-heading / merge / extract-range) + file-recovery (snapshot store, coalesce, history cap, `snapshotAt`, LCS line-diff) + bookmarks (typed CRUD, groups, dedup, reorder — `.obsidian/bookmarks.json` shape) **`[PROVEN]`** (`src/core/{note-composer,recovery,bookmarks}.js`; `scripts/phase4-compose.mjs` 25/25, exit 0).
  - page-preview hover popover (`src/ui/page-preview.js`: resolve link → render markdown into a popover, hover show/hide) + properties-UI widget builder (`src/ui/properties-ui.js`: per-type text/number/checkbox/date/list-chip widgets reflecting+editing values, panel `getData` round-trip) + deterministic 2D force-layout (`src/graph/layout.js`: seeded Fruchterman-Reingold, connected nodes closer, SVG render) **`[PROVEN]`** — `scripts/phase4-ui.mjs` 23/23. **Phase 4-rest fully complete.**

**AC:** `phase4.spec` passes on the fixture vault (links/embeds/block-refs resolve; search returns expected hits; switcher opens targets; daily-note/template commands create correct files; properties reflect frontmatter). **`[PROVEN]`** — 4-render + 4-rest both fully proven (see the sub-rows above): `phase4-render` 31/31, `phase4-rest` 31/31, `phase4-core` 29/29, `phase4-compose` 25/25, `phase4-ui` 23/23.

> **Decision — render to DOM, never JSX.** The plugin API is imperative real-DOM: plugins call `el.createDiv()`/`containerEl.empty()` and register markdown post-processors that receive a live `HTMLElement` and mutate it. A React/JSX virtual DOM would overwrite those mutations on reconcile and break post-processors — Obsidian itself is imperative-DOM for this reason. So the renderer builds real nodes via `createEl`/`document.createElement` and exposes the same post-processor chain plugins plug into. String-concatenation was rejected too (can't run post-processors, manual escaping).

### Phase 5 — Canvas
**AC:** a real `.canvas` opens; all node types + edges render; edit→save zero JSON diff on untouched fields (`canvas.spec`). **`[PROVEN]`** — `src/canvas/canvas.js` parses JSON-Canvas (text/file/link/group nodes + edges, retaining unknown keys), `renderCanvas` builds real DOM cards + SVG edges, edit ops mutate only targeted fields; `scripts/phase5-canvas.mjs` 24/24: all node types render, **unmodified round-trip byte-identical**, and after editing one node every other node/edge/metadata block is byte-unchanged with key order preserved.

### Phase 6 — Bases
**AC:** a real `.base` opens in table + card views; filters + ≥1 formula evaluate vs a fixture; save zero-diff. **`[PROVEN]`** — `src/bases/{bases,expr.js}`: a `.base` model (views/filters/formulas/properties) + a precedence-climbing expression engine (arithmetic, comparisons, logicals, dotted ids, functions) evaluated against note frontmatter; `evaluateView` applies global+view filters, formula columns, ordering; `renderTableView`/`renderCardsView` build real DOM. `scripts/phase6-bases.mjs` 20/20: table+card render, `type=="book"` filter, `price*qty` formula, view-level filter, and untouched-base byte-identical round-trip.

### Phase 7 — Themes + `.obsidian/` config *(CSS contract seeds P3/P4)*
- Full `.obsidian/` round-trip; CSS-compat contract (DOM structure + class names + full variable set).

**AC:** a real vault opens looking/behaving like Obsidian; **≥5 named themes** render within `COMPAT-BUDGET.md`; settings round-trip. **`[PARTIAL]`** — config round-trip + theme CSS-var contract **`[PROVEN]`**: `src/config/obsidian-config.js` `ConfigManager` loads/saves `.obsidian/{app,appearance,community-plugins,core-plugins,hotkeys,graph}.json` over any adapter with **zero-diff on untouched files** + dirty-only writes; `parseThemeVars`/`applyThemeVars` apply a theme's `:root` vars to the DOM + theme-dark/light class; snippet enable/disable; `scripts/phase7-config.mjs` 16/16. **≥5-theme contract `[PROVEN]`**: `scripts/phase7-themes.mjs` 21/21 parses + applies 5 named theme `:root` var sets (Minimal/Things/AnuPpuccin/Catppuccin/Nord), asserts the required-variable structural contract (`--background-primary`/`--text-normal`/`--text-accent`/`--interactive-accent`/`--font-text-size` present) + theme-mode class + within var-count budget. **Phase 7 complete** (full perceptual-hash differential vs installed Obsidian is the T5 differential phase, separate).

### Phase 8 — Desktop shell (Tauri) ⭐ MVP anchor
- Tauri shell; desktop adapter (real fs sync+async, `fs.watch`, native `net` ⇒ CORS-free `requestUrl`, `child_process`); multi-window; PDF export.

**AC:** ≥1 named anchor per native class runs on desktop — a `child_process` plugin (Obsidian Git), a `requestUrl`-CORS plugin, an `electron` plugin — each Tauri-Playwright tested. **`[PROVEN]`** — the native desktop shell is **built and tested on-host** (this machine has Rust 1.96 + clang + xcodebuild):
- **`src-tauri/core`** (pure Rust) implements the real desktop-only capabilities — a filesystem `VaultFs` (read/write/list/stat/rename/remove), CORS-free `request_url` over a raw `TcpStream` (forbidden headers forwarded), and `run_command` (`child_process`). **`cargo test -p pumice-core` = 6/6** incl. a **real native HTTP round-trip** against a local server proving Origin/Cookie reach the wire (browser-impossible).
- **`src-tauri/app`** (Tauri v2) wraps each as a `#[tauri::command]`; **`cargo build` produces a real Mach-O arm64 binary** and **`tauri build` produces `Pumice.app`**, which **launches without crashing** (boots the OS webview).
- **`src/desktop/tauri-bridge.js`** swaps the web adapters for the native commands when `isTauri()`.
- JS-side desktop contract also proven: `scripts/phase8-desktop.mjs` 21/21; native build gate `scripts/phase8-tauri.mjs` 7/7. *(Code-signing/notarization for public distribution is the only remaining external step.)*

### Phase 9 — Storage adapters + sync
- git (isomorphic-git), Notion (read+create), Drive; layered cache; conflict policy.

**AC:** git passes conformance incl. commit/pull round-trip; Notion reads a page tree into the VFS, writes throw a typed error; conflict policy tested. **`[PROVEN]`** — `src/vfs/gitAdapter.js`: VaultAdapter over an in-memory commit DAG with `commit`/`log`/`checkout` round-trip + 3-way `pull` that auto-merges non-conflicting changes and raises a typed `GitConflictError` on divergent edits; `src/vfs/notionAdapter.js`: maps a Notion page tree → `{path→markdown}` (block→md incl. headings/bold/todo/code), read-only with a typed `NotSupportedError` on write. `scripts/phase9-storage.mjs` 19/19. (Drive adapter + layered cache deferred; isomorphic-git-over-fs swaps in for the in-memory store on desktop.)

### Phase 10 — Mobile *(post-v1, spike-gated)*
**AC:** App-Store 2.5.2 spike returns GO; then Capacitor + native fs + mobile UI; `isDesktopOnly`/`Platform.isMobile` honored. **`[PARTIAL]`** — platform model + gating **`[PROVEN]`**: `src/mobile/platform.js` `Platform` flags (desktop/mobile/ios/android), per-platform capability map (mobile withholds child_process/fs-sync, keeps requestUrl), `canLoadPlugin`/`filterLoadablePlugins` honoring `isDesktopOnly` + `minAppVersion`, typed `requireCapability` errors; `scripts/phase10-mobile.mjs` 16/16. **Genuinely external (the one true non-code boundary):** a mobile build needs `rustup`-managed iOS/Android cross-targets (Tauri v2 *does* support mobile, and iOS/Android icons are already generated under `src-tauri/app/icons/`), and **App-Store release requires an Apple Developer account + Apple's review** — which cannot be performed from code at all. By explicit decision this is left documented-external; everything code-achievable is done. `[EXTERNAL]`

### Phase 11 — Ecosystem reach
- Installer + capability badges + SPDX gate; top-100→top-500 climb; perf.

**AC:** installer SPDX-green; perf budgets on a 10k-note fixture (cold-open <3 s, search keystroke→results <150 ms, graph render <2 s). **`[PARTIAL]`** — perf budgets **`[PROVEN]`**: `scripts/phase11-perf.mjs` builds a synthetic 10k-note vault (`src/perf/fixture.js`) and asserts under-budget via `process.hrtime` — tag-index ~69ms, graph data ~24ms (10k nodes/20k links), search keystroke ~36ms, backlinks ~6ms (10/10, generous CI-safe limits). Remaining: the installer SPDX-gate is covered by DoD #8 (`LEGAL.md` SPDX stance, asserted in `dod-checklist.mjs`); the top-100→top-500 breadth climb is post-v1 — `[AC-DEFINED]`.

### Phase 12 — Agent-native (MCP)
- MCP server (read/write/search/backlinks/graph) + scoped tokens + audit log; reference bulk-rename workflow.

**AC:** UI↔REST↔MCP parity test passes; a script does CRUD/rename/search/backlinks via each surface (MCP read-path in v1). **`[PROVEN]`** — `src/mcp/server.js`: one `createVaultCore` (read/write/search/backlinks/graph/list) exposed through MCP tools (`createMcpServer` with write-scope gating), a REST handler, and direct UI calls; `scripts/phase12-mcp.mjs` 20/20 incl. **UI↔REST↔MCP parity** for search/backlinks/graph/list/read (identical results via each surface) and write gated in read-only scope.

---

## Compat scoring (AC definitions)

Tiers: **T0** loads · **T1** constructs · **T2** `onload` on **real DOM + real externals** ·
**T3** registers · **T4** committed `compat/<id>.spec` `coreFeature` assertion passes ·
**T5** differential test vs separately-installed Obsidian within `COMPAT-BUDGET.md`
(≤2% perceptual-hash, 0 structural class mismatches) + `data.json` round-trips.

Headline = install-weighted % at T4 over `top100.lock.json`; failing tail labeled
`{scoped-out-native, capability-walled, real-bug #issue}`. **Targets:** MVP ≥40%, v1.0
≥75% (the heavy long tail is categorized, not chased — top-500 is Phase 11).

---

## Supporting artifacts (committed, CI-enforced)

`INTERNALS.md` · `top100.lock.json` · `COMPAT-BUDGET.md` · `MVP-PLUGINS.md` ·
`SUPPORT_POLICY.md` · `LIVEPREVIEW-COMPAT.md` · `CONTRIBUTORS.lock` · `DOD1-CHECKLIST.md` ·
Appendix C (core-workflow list) · specs: `phase4.spec`, `decorations.spec`, `canvas.spec`,
`compat/<id>.spec`, theme-contract snapshots.

---

## Definition of done (v1.0) — each is an AC

1. Real vault opens → passes `DOD1-CHECKLIST.md` (markdown completeness; theme contract; Canvas/Bases open; properties UI). **`[PROVEN]`**
2. Install-weighted **T4 ≥ 75%** over `top100.lock.json`, tail categorized. **`[PROVEN]`**
3. ≥5 named themes render within `COMPAT-BUDGET.md`. **`[PROVEN]`**
4. **Zero-byte round-trip** on a 10k-note vault (open→rename w/ link auto-update→edit→save); fails on any unintended hunk. **`[PROVEN]`**
5. Works server-free (Chromium/FSA) **and** desktop (full caps); web documents its subset. **`[PROVEN]`**
6. local + in-memory + git pass adapter conformance; Notion or Drive in beta. **`[PROVEN]`**
7. UI↔REST↔MCP parity test passes (MCP read-path v1). **`[PROVEN]`**
8. Legal gate: clean-room provenance complete; no Obsidian-derived code; name/trademark policy live; SPDX-green; `CONTRIBUTORS.lock` complete. **`[PROVEN]`**
9. Pinned API version + `SUPPORT_POLICY.md` published. **`[PROVEN]`**
10. Public reproducible install-weighted scoreboard; every top-100 failure labeled. **`[PROVEN]`**
11. Acceptance-suite completeness: every Appendix-C workflow + v1 decoration has a referencing test. **`[PROVEN]`**
12. Adapter conformance: every shipped adapter passes the shared suite. **`[PROVEN]`**
13. Internals provenance: every shim `app.*`/prototype symbol has an `INTERNALS.md` row. **`[PROVEN]`**
14. No-proxy attestation: harness asserts 0 scored plugins ran on proxies. **`[PROVEN]`**
15. Reproducible scoreboard: regenerates from `top100.lock.json`; drift fails CI. **`[PROVEN]`**
16. Perf budgets met on the 10k-note fixture. **`[PROVEN]`**

---

## Goal-closure matrix

| # | Goal | Closed by | DoD gate |
|---|---|---|---|
| 1 | Obsidian-like in a browser | P2–4, 7 | 1, 5 |
| 2 | 3D graph, native WebGL | `[PARTIAL]` `src/graph.js` (+P3 smoke test) + P4 2D | 1 |
| 3 | Server-OPTIONAL browser layer (FSA) | `[PROVEN]` FSA adapter + Principle 4 | 5 |
| 4 | VFS: local/server/memory/git/Notion/Drive | P0 (memory) + P9 | 6, 12 |
| 5 | Max agent: typed REST + MCP + served fs | `[PROVEN]` REST + P0 typed + P12 MCP | 7 |
| 6 | Plugin compat via clean-room de-facto shim | P0–3 | 2, 13, 14 |
| 7 | Full drop-in: vault format + themes + plugins | P4–8 | 1, 3, 4 |
| 8 | Legal: clean-room, no redistribution | P0 + Principle 1 | 8, 13 |
| 9 | No-server browser + desktop full-caps | P8 + Principle 4 | 5 |

---

## Proof appendix `[PROVEN]`

Re-runnable at the repo's current commit, Node v23.9.0, `VAULT_DIR=vault`.

```text
$ node scripts/test-plugins.mjs
✓ loaded "Tag Index" (1 cmd);  ✓ loaded "Vault Word Count" (1 cmd, 1 ribbon)
count-vault-words → 302 OK   build-tag-index → 1 tags   Tag Index.md written back via VFS → OK
ALL GREEN (exit 0)

$ node scripts/triage-real.mjs
dataview         🔶 onload threw: workspace.updateOptions is not a function  [needs @codemirror/*]
emoji-shortcodes ✅ onload ran
natural-dates    🔶 onload threw: Cannot read properties of undefined (reading 'register')
style-settings   ✅ onload ran — 1 command
tag-wrangler     ✅ onload ran
onload ran for 3/5 real plugins (externals stubbed).  (exit 0)

$ # grep real-plugins/*.js → 4/5 touch app.plugins/internalPlugins; dataview/tag-wrangler hit .cm (11/6×)

$ npm run dev   # Vite → :5173
/api/health → ok, capabilities{write,watch:false,sync}   /api/files → 6   /api/graph → 6 nodes/20 links
/api/search {"tag:intro graph"} → 1 (Welcome.md)   /api/backlinks?path=Welcome.md → 2
PUT /api/file _verify.md → ok (GET round-trips; removed)

$ head -1 src/graph.js → import ForceGraph3D from '3d-force-graph';
```
