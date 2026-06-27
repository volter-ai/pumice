# E2E.md — real-browser end-to-end coverage

`npm run e2e` (Playwright + real Chromium) drives the **assembled app** (`app.html` +
`src/app/workbench.js`, which integrates every subsystem) and proves each feature in a
real browser — not jsdom. This closes the gap between "the libraries pass unit tests"
and "the app actually works". **19/19 green**, including the real 3D/WebGL graph, the
full markdown decoration set, and **59 real community plugins** loading in-browser.

| # | Feature | What the e2e test asserts (in real Chromium) |
|---|---|---|
| 1 | App boots + plugin runtime | no page error; `app.plugins` live |
| 2 | Vault opens | notes list (5) + note renders with `<h1>` |
| 3 | Wikilink navigation | clicking `[[Note A]]` switches the note pane |
| 4 | Markdown render | callout + `<mark>` + inline math + tag + internal-link all in DOM |
| 5 | **Plugins (breadth)** | **59 real community plugins** load + run `onload()` in the real browser (glob-loaded, real CodeMirror externals, zero errors); a plugin markdown post-processor injects a ★ badge into rendered DOM |
| 5b | **3D graph** | the real `3d-force-graph` (Three.js) mounts a **WebGL** canvas headless (SwiftShader); valid GL context, 5 nodes/4 links |
| 5c | **All markdown decorations** | every feature renders in-browser: h1–h6, bold/italic/strike/highlight/code, inline+block+fence math, mermaid, code-untouched, callouts (+fold/+default), wikilinks (plain/alias/heading/block), embeds (note/heading/block), tags+nested, block-ref anchor, footnotes (ref+def), tables, tasks, comment-removal |
| 6 | Editor (CM6) | real `.cm-editor` renders; edit appends; live-preview decoration classes present |
| 7 | Canvas | 2 node cards + 1 SVG edge render |
| 8 | Bases | table view filters to 2 books + formula column shows `60` |
| 9 | Properties | 4 typed widgets; `getData` round-trip (`rating:5`, `published:true`) |
| 10 | Search | `tag:home` → 1 result; `task-todo:` → 2 |
| 11 | 2D graph | 5 SVG node circles + links |
| 12 | Backlinks | computed; contains `Note A.md` |
| 13 | Page preview | hovering a link shows a rendered `.hover-popover` |
| 14 | Daily note | create-today → `Daily/2026-06-26.md` with template |
| 15 | Theme | toggling a style setting changes `--accent-color` (computed style) |
| 16 | Tag rename | `#demo → #sample` propagates across 2 notes |
| 17 | MCP | UI↔REST↔MCP parity in the browser (`data-parity=true`) |

## Honest scope of the e2e layer

- **Proven in-browser:** the integrated app + all features above, the **3D WebGL graph**,
  the **full markdown decoration set**, and **59 real community plugins** loading + running
  `onload()` in real Chromium with zero errors.
- **Capability-walled (excluded from the in-browser batch, documented):** plugins needing
  native/external libs a browser can't provide — excalidraw, leaflet/map-view, charts,
  Git (`child_process`), pandoc, etc. Listed in `WALLED` (workbench) + `INTERNALS.md` §C/§D.
- **Still jsdom (faster, environment-equivalent):** the regression-gated `compat-top100.mjs`
  breadth sweep — same real-DOM load path; the browser e2e now also proves 59 of them live.
- **Genuinely deferred (need a native build host / external review):** the **Tauri desktop
  binary** + **mobile shell**.

Run: `npm run e2e` (browser) · `npm test` (jsdom gates) · `npm run test:all` (both).
