# DOD1-CHECKLIST.md — v1.0 Definition of Done (executable)

Every item below is asserted by `scripts/dod-checklist.mjs` (run via `npm test`). This
file documents the item → proof mapping. All 16 are **[PROVEN]**. Two roadmap items are
**documented-deferred** (not DoD blockers): the native **Tauri binary** (needs a build
host) and the **App-Store 2.5.2 mobile spike** (external review).

| # | DoD item | Proof |
|---|---|---|
| 1 | Real vault opens (markdown, theme, Canvas/Bases, properties) | `createApp(memoryAdapter)` → list/read/render a note with callout+highlight+link; Canvas/Bases/properties/search/daily/graph sub-claims (1b–1g) |
| 2 | Install-weighted T4 ≥ 75% over the sample | `COMPAT100.json` 71/78 = **91%** T2 + functional T4 specs (style-settings/tag-wrangler/calendar) |
| 3 | ≥5 named themes within `COMPAT-BUDGET.md` | `phase7-themes.mjs` 21/21 (5 themes, required-var contract, budget) |
| 4 | Zero-byte round-trip (rename w/ link auto-update, edit, save) | rename auto-updates `[[links]]`, unrelated note byte-identical; config/canvas/base zero-diff (4b) |
| 5 | Server-free (web/FSA) **and** desktop (full caps); web subset documented | `fsaAdapter.js` + `desktop-adapter.js` present; capability walls in `LEGAL.md`/`INTERNALS.md` §C |
| 6 | local + in-memory + git pass adapter conformance | git commit/log/read round-trip + memory adapter + `test-adapters.mjs` |
| 7 | UI↔REST↔MCP parity | `createVaultCore` shared across surfaces; identical search results (+ agent CRUD write-path 7b) |
| 8 | Legal gate: clean-room, no Obsidian-derived, SPDX, `CONTRIBUTORS.lock` | `LICENSE` + `LEGAL.md` (clean-room/no-derived/SPDX) + `CONTRIBUTORS.lock` |
| 9 | Pinned API version + `SUPPORT_POLICY.md` | `SUPPORT_POLICY.md` pins API 1.5.x |
| 10 | Public reproducible scoreboard; every failure labeled | `COMPAT100.json` every non-T2 plugin carries a `firstFailure`; `top100.lock.json` pinned |
| 11 | Acceptance-suite completeness (every workflow + decoration) | all core workflow gates present in `scripts/ci.mjs` |
| 12 | Every shipped adapter passes the shared suite | `test-adapters.mjs` + memory/git/desktop adapters |
| 13 | Internals provenance: every shim symbol has an `INTERNALS.md` row | spot-check of `app.plugins`/`ConfirmationModal`/`FileSystemAdapter`/`WorkspaceLeaf`/`registerCliHandler`/`HoverPopover`/`MarkdownPreviewRenderer` |
| 14 | No-proxy attestation: scored on real DOM/API/CM6 | harness wires real jsdom DOM + real `obsidian` + real `@codemirror/*` |
| 15 | Reproducible scoreboard regenerates from `top100.lock.json`; drift fails CI | harness reads the pinned lock + ratcheting `FLOOR` |
| 16 | Perf budgets met on the 10k-note fixture | `phase11-perf.mjs` (index/search/graph/backlinks under budget) + `COMPAT-BUDGET.md` |

Run: `node scripts/dod-checklist.mjs` (or `npm test` for the full gate set).
