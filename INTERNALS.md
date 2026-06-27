# INTERNALS.md — the de-facto Obsidian API surface

Real community plugins do not restrict themselves to the documented `obsidian.d.ts`
API. They reach into **undocumented internals** (`app.plugins`, `app.internalPlugins`,
private class prototypes), **monkeypatch** private methods via `monkey-around`, and
reflect on Obsidian's internal editor/embed/graph classes. A drop-in replacement must
therefore reimplement *observed behavior*, not just the published types.

This file classifies every internal symbol our shim implements, and every symbol a
top-plugin references that we **cannot** or **deliberately do not** implement in the
browser (capability walls). CI (`scripts/compat-top100.mjs`) fails if the T2 count
drops below the floor, so this list stays honest.

**Current breadth:** `compat-harness.mjs` 25/25 (curated sample, floor 25) ·
`compat-top100.mjs` **71/78** downloaded top plugins at T2 on a real DOM (floor 71).
The 7 remaining are classified as capability-walls / deep-internal below.

---

## A. Implemented undocumented / de-facto API

These are NOT in `obsidian.d.ts` but are used by shipping plugins, so we implement
behaviorally (`src/obsidian/api.js`, `src/obsidian/runtime.js`):

| Symbol | Used by | Notes |
|---|---|---|
| `app.plugins` (`plugins`, `enabledPlugins`, `getPlugin`, `getPluginById`, `manifests`) | most | inter-plugin API + self-registration before `onload` |
| `app.internalPlugins.plugins.{graph,page-preview,file-explorer}` | hover-editor, page-preview consumers | structural stubs (`instance`, `enabled`, graph `views.localgraph→engine.constructor/renderer`) |
| `app.customCss` (`enabledSnippets`, `readSnippets`, `getSnippetPath`, …) | style/theme plugins | snippet/theme registry facade |
| `app.embedRegistry` (`embedByExtension` Proxy, `isExtensionRegistered`, `getEmbedCreator`) | kanban, map-view | embed creator returns a faux view with `load/editMode` |
| `app.viewRegistry`, `app.metadataTypeManager`, `app.hotkeyManager`, `app.fileManager` | many | registries + `processFrontMatter`/`generateMarkdownLink`/`renameFile` |
| `app.statusBar.containerEl` | commander | status-bar host element |
| `app.isVimEnabled()`, `app.isMobile`, `app.loadLocalStorage/saveLocalStorage` | latex-suite, various | environment probes |
| `vault.adapter` DataAdapter facade (`exists/read/write/list/stat/…`) over the VFS | iconize, templater | the real `DataAdapter` shape over any `VaultAdapter` backend |
| `ConfirmationModal` | templater | undocumented internal modal base (extends `Modal`) |
| `FileSystemAdapter` | templater | desktop `DataAdapter` subtype; `instanceof` is always false in-browser |
| `HoverPopover` | hover-editor | undocumented popover base (extends `Component`) |
| `PopoverSuggest`, `BasesView` | map-view | suggest base + new Bases view base |
| `WorkspaceLeaf`/`Workspace`/`WorkspaceItem`/`WorkspaceSplit`/`WorkspaceTabs`/`MarkdownPreviewView` prototypes | hover-editor, kanban | real prototype methods so `monkey-around` can wrap them |
| `MarkdownPreviewRenderer.registerPostProcessor/unregisterPostProcessor` | iconize | static post-processor registry |
| `Plugin.registerCliHandler` | homepage, templater | CLI command registration |
| `Plugin.registerBasesView` | map-view | Bases view registration |
| `Scope` KeymapEventHandler shape (`{scope, modifiers, key, func}`); suggests pre-register `Escape` | various-complements | plugins look up the Escape handler by key and override `.func` |
| Suggest `suggestEl` / `suggestions` DOM hosts | kanban date-suggest | `PopoverSuggest` DOM surface |
| Embed `editMode` 2-level prototype chain | kanban | plugins reflect `getPrototypeOf(getPrototypeOf(editMode)).constructor` to grab the internal editor base |
| `loadMathJax`, `renderMath`, `finishRenderMath` | latex-suite | MathJax helpers (no-op render in this env) |
| Obsidian DOM extensions (`createEl/createDiv/setText/addClass/on/off/…`) | nearly all | `src/obsidian/dom.js` patches Element/Node/HTMLElement |
| `Array.prototype.{first,last,contains,remove,unique}`, `String.prototype.{contains,format}`, `Number.prototype.clamp` | obsidian-memos, many | Obsidian augments built-in prototypes |
| Component lifecycle (`load/unload/addChild` idempotent, cycle-safe) | quick-explorer, redom plugins | matches Obsidian's `_loaded`-guarded semantics |

## B. Environment globals provided (not obsidian API, but Obsidian's runtime exposes them)

`scripts/dom-bootstrap.mjs`: `MutationObserver`, `Text`/`CharacterData`/`DocumentType`
and all jsdom DOM interface constructors (bulk-copied), `location`, `history`,
`addEventListener`, `requestAnimationFrame`, `matchMedia`, `regeneratorRuntime`,
legacy `CodeMirror`/`CodeMirrorAdapter` (CM5), real CodeMirror 6 (`@codemirror/*`,
`@lezer/*`) as plugin externals, and permissive `L` (Leaflet) / `Prism` proxies.

## C. Capability walls — deliberately NOT implemented in-browser

| Symbol / capability | Plugin(s) | Why walled | Plan |
|---|---|---|---|
| `requestUrl` CORS-free fetch | many | desktop Electron bypasses CORS; browser cannot | server-proxy adapter (Phase 7) |
| `child_process`, `electron`, native `fs` | git, pandoc | desktop-only | Tauri desktop shell (Phase 9) |
| `FileSystemAdapter` real filesystem | templater, pandoc | desktop-only | always-false `instanceof`; VFS adapter substitutes |
| Leaflet `L` native map runtime (`L.map().disable()` …) | obsidian-leaflet, obsidian-map-view* | external native lib Obsidian doesn't ship; plugin expects a global map engine | host real Leaflet as an optional external (Phase 8) — *map-view now reaches T2 via the `L` proxy* |
| Prism `markup-templating` plugin methods (`Prism.languages.markup.tag.addAttribute`) | text-generator | external Prism plugin not bundled | host real Prism + plugins (Phase 8) |

## D. Remaining frontier (the 7 not yet at T2) — deep internals, deferred to Phase 3+

| Plugin | First failure | Category |
|---|---|---|
| hover-editor | `internalPlugins.plugins.switcher.instance` | needs faithful QuickSwitcher + graph + page-preview-hover internals; partial stubs corrupt other plugins, so deferred to a real Phase-3 workspace/internal-plugin subsystem |
| obsidian-quick-explorer | `Maximum call stack` | redom ↔ Component mount recursion; needs exact DOM mount/append semantics |
| obsidian-memos | `r.set` | reflects Obsidian's internal `MarkdownEditor` class (CM6 compartment Map); needs the real embedded editor |
| cm-editor-syntax-highlight | `…cypher=` | legacy CodeMirror 5 mode internals (`CodeMirror.modes`) |
| obsidian-consistent-attachments | custom `AggregateError` | bulk fs rename across the VFS; needs richer adapter rename/trash semantics |
| obsidian-leaflet | `L.…disable` | external Leaflet native lib (capability wall C) |
| text-generator | `Prism.…addAttribute` | external Prism plugin (capability wall C) |

Each is tracked; none is a missing *documented* symbol. The path to closing them is
the real Phase-3 workspace/editor subsystem + Phase-8 external-lib hosting, not more
stubs (which risk overfitting and cross-plugin corruption, as the isolation harness in
`compat-top100.mjs` demonstrates).
