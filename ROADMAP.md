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
| VFS interface + FSA + HTTP adapters | `[PROVEN]` | code in `src/vfs/`; served live |
| **In-memory adapter + shared conformance suite** (memory + node-fs green) | `[PROVEN]` | `test-adapters.mjs` ALL GREEN |
| Served `/api` (health/files/graph/search/backlinks/file PUT) | `[PROVEN]` | all endpoints verified live |
| Markdown + wikilinks + backlinks + graph/search (isomorphic) | `[PROVEN]` | `test-plugins.mjs` + API |
| 2 hand-written plugins load + run + write back via VFS | `[PROVEN]` | `test-plugins.mjs` ALL GREEN |
| Real plugins `onload` on a REAL DOM: **4/5** (AC-gated) | `[PROVEN]` | `triage-real-dom.mjs` exit 0 |
| **Phase-1 breadth scoreboard: 12/25 top plugins at T2** (regression-gated) | `[PROVEN]` | `compat-harness.mjs` → `COMPAT.json`, exit 0 (floor 12) |
| Obsidian DOM extensions (`createEl/createDiv/setText/addClass/on/off/...`) | `[PROVEN]` | `src/obsidian/dom.js`; unblocks style-settings + tag-wrangler |
| De-facto API: `app.plugins`/`customCss`/`embedRegistry`/`viewRegistry`/`fileManager`, `vault.adapter` DataAdapter facade, Setting `*Component`s, `View`/`FileView`/`TextFileView` | `[PROVEN]` | moved iconize+periodic-notes to T2; `src/obsidian/{api,runtime}.js` |
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

**AC:** legal GO on file (NO-GO blocks public ship); in-mem adapter passes conformance; harness v2 emits a real-DOM scoreboard with a **machine-checked 0 proxy-fallbacks** assertion. **`[AC-DEFINED]`** *(in-mem adapter + real-DOM harness are buildable now — convertible to `[PROVEN]` immediately).*

### Phase 1 — De-facto API breadth
- `FileManager`, `Vault.rename/delete/trash/createBinary`, `MetadataCache.getBacklinksForFile/resolvedLinks`, real `Setting` builders (return `this`), `Platform`, workspace events; **`app.plugins` registry** + inter-plugin API; `monkey-around` prototype-shape stability.

**AC:** every symbol referenced by any top-100 `main.js` (static+runtime trace) is implemented or labeled capability-walled in `INTERNALS.md` (CI fails on unclassified); **≥35/100 at T2** with real externals. **`[PARTIAL]`** — `compat-harness.mjs` runs a 25-plugin sample at **12/25 T2** on a real DOM (regression-gated); remaining blockers cluster on CodeMirror (`defineMode`/`getLanguage` → Phase 2), ES5 base-class `__extends` (mind-map/sliding-panes), and deep internals. Full top-100 `top100.lock.json` + `INTERNALS.md` still pending.

### Phase 2 — CodeMirror 6 editor
- **2a:** source mode + `Editor` API; expose `editor.cm` + named state fields. **AC:** source-mode editing + editor-extension plugins load on real CM6. **`[AC-DEFINED]`**
- **2b (v1-capped):** enumerated decoration set — hide/reveal for bold/italic/strike/highlight/inline-code, heading sizing, internal-link & tag widgets, callout titles, lists/checkboxes, inline math. **AC:** each passes `decorations.spec`; Dataview inline output matches Obsidian baseline within T5 budget; every other decoration has a `LIVEPREVIEW-COMPAT.md` row. **`[AC-DEFINED]`**

### Phase 3 — Workspace + UI runtime
- Leaves/splits/tabs/`ItemView`/custom views/pop-out; file explorer; palette; hotkeys; settings tabs (real widgets); menus/modals/suggest.

**AC:** style-settings + tag-wrangler + Calendar each pass their `compat/<id>.spec` T4 test (settings toggle changes DOM; right-click rename propagates; day-click opens/creates daily note). **`[AC-DEFINED]`**

### Phase 4 — Core-app parity
- **4-render (MVP):** callouts, math (MathJax), Mermaid, embeds/transclusion (`![[note#h]]`, `![[note^block]]`), block-ref index, footnotes, tables, tasks, highlights, comments, nested tags, aliases.
- **4-rest:** quick switcher; search operators `{path:,file:,tag:,line:,section:,block:,task:,/regex/,AND/OR/-,nesting}`; backlinks/outline/tag panes; daily notes; templates; page preview; bookmarks; note composer; **file recovery (snapshots)**; **properties UI** + typed metadata; **2D graph**.

**AC:** `phase4.spec` passes on the fixture vault (links/embeds/block-refs resolve; search returns expected hits; switcher opens targets; daily-note/template commands create correct files; properties reflect frontmatter). **`[AC-DEFINED]`**

### Phase 5 — Canvas
**AC:** a real `.canvas` opens; all node types + edges render; edit→save zero JSON diff on untouched fields (`canvas.spec`). **`[AC-DEFINED]`**

### Phase 6 — Bases
**AC:** a real `.base` opens in table + card views; filters + ≥1 formula evaluate vs a fixture; save zero-diff. **`[AC-DEFINED]`**

### Phase 7 — Themes + `.obsidian/` config *(CSS contract seeds P3/P4)*
- Full `.obsidian/` round-trip; CSS-compat contract (DOM structure + class names + full variable set).

**AC:** a real vault opens looking/behaving like Obsidian; **≥5 named themes** render within `COMPAT-BUDGET.md`; settings round-trip. **`[AC-DEFINED]`**

### Phase 8 — Desktop shell (Tauri) ⭐ MVP anchor
- Tauri shell; desktop adapter (real fs sync+async, `fs.watch`, native `net` ⇒ CORS-free `requestUrl`, `child_process`); multi-window; PDF export.

**AC:** ≥1 named anchor per native class runs on desktop — a `child_process` plugin (Obsidian Git), a `requestUrl`-CORS plugin, an `electron` plugin — each Tauri-Playwright tested. **`[AC-DEFINED]`**

### Phase 9 — Storage adapters + sync
- git (isomorphic-git), Notion (read+create), Drive; layered cache; conflict policy.

**AC:** git passes conformance incl. commit/pull round-trip; Notion reads a page tree into the VFS, writes throw a typed error; conflict policy tested. **`[AC-DEFINED]`**

### Phase 10 — Mobile *(post-v1, spike-gated)*
**AC:** App-Store 2.5.2 spike returns GO; then Capacitor + native fs + mobile UI; `isDesktopOnly`/`Platform.isMobile` honored. **`[AC-DEFINED]`**

### Phase 11 — Ecosystem reach
- Installer + capability badges + SPDX gate; top-100→top-500 climb; perf.

**AC:** installer SPDX-green; perf budgets on a 10k-note fixture (cold-open <3 s, search keystroke→results <150 ms, graph render <2 s). **`[AC-DEFINED]`**

### Phase 12 — Agent-native (MCP)
- MCP server (read/write/search/backlinks/graph) + scoped tokens + audit log; reference bulk-rename workflow.

**AC:** UI↔REST↔MCP parity test passes; a script does CRUD/rename/search/backlinks via each surface (MCP read-path in v1). **`[AC-DEFINED]`**

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

1. Real vault opens → passes `DOD1-CHECKLIST.md` (markdown completeness; theme contract; Canvas/Bases open; properties UI). **`[AC-DEFINED]`**
2. Install-weighted **T4 ≥ 75%** over `top100.lock.json`, tail categorized. **`[AC-DEFINED]`**
3. ≥5 named themes render within `COMPAT-BUDGET.md`. **`[AC-DEFINED]`**
4. **Zero-byte round-trip** on a 10k-note vault (open→rename w/ link auto-update→edit→save); fails on any unintended hunk. **`[AC-DEFINED]`**
5. Works server-free (Chromium/FSA) **and** desktop (full caps); web documents its subset. **`[AC-DEFINED]`**
6. local + in-memory + git pass adapter conformance; Notion or Drive in beta. **`[AC-DEFINED]`**
7. UI↔REST↔MCP parity test passes (MCP read-path v1). **`[AC-DEFINED]`**
8. Legal gate: clean-room provenance complete; no Obsidian-derived code; name/trademark policy live; SPDX-green; `CONTRIBUTORS.lock` complete. **`[AC-DEFINED]`**
9. Pinned API version + `SUPPORT_POLICY.md` published. **`[AC-DEFINED]`**
10. Public reproducible install-weighted scoreboard; every top-100 failure labeled. **`[AC-DEFINED]`**
11. Acceptance-suite completeness: every Appendix-C workflow + v1 decoration has a referencing test. **`[AC-DEFINED]`**
12. Adapter conformance: every shipped adapter passes the shared suite. **`[AC-DEFINED]`**
13. Internals provenance: every shim `app.*`/prototype symbol has an `INTERNALS.md` row. **`[AC-DEFINED]`**
14. No-proxy attestation: harness asserts 0 scored plugins ran on proxies. **`[AC-DEFINED]`**
15. Reproducible scoreboard: regenerates from `top100.lock.json`; drift fails CI. **`[AC-DEFINED]`**
16. Perf budgets met on the 10k-note fixture. **`[AC-DEFINED]`**

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
