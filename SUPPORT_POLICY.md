# Support policy & pinned API (Pumice)

The DoD support gate (#9). Defines the compatibility contract and naming policy.

## Pinned plugin API version

Pumice targets a **pinned Obsidian plugin API version**: `1.5.x` (the `obsidian.d.ts`
surface our shim reimplements). `requireApiVersion()` reports this. Plugins declaring a
higher `minAppVersion` are gated (`canLoadPlugin`, `src/mobile/platform.js`).

| Surface | Version | Notes |
|---|---|---|
| Plugin API (`obsidian`) | 1.5.x pinned | clean-room reimpl; see `INTERNALS.md` |
| JSON Canvas | 1.0 | parse/serialize zero-diff |
| Bases | 1.0 (table/cards/filters/formulas) | |
| CodeMirror | 6 (real `@codemirror/*`) | plugin editor extensions run on the real instance |

## Compatibility tiers

T0 loads · T1 constructs · T2 `onload` on real DOM+externals · T3 registers ·
T4 committed functional spec passes · T5 differential vs installed Obsidian. The public
scoreboard (`COMPAT.json`/`COMPAT100.json`) regenerates from `top100.lock.json`
(DoD #10/#15); drift fails CI.

## What we support / don't

- **Supported:** opening real vaults read+write, running plugins to their functional
  tier, Canvas, Bases, themes, properties, search, daily notes, graph.
- **Capability-walled (documented, not faked):** desktop-only `requestUrl`/`child_process`,
  Chromium-only FSA. See `LEGAL.md` and `INTERNALS.md` §C.
- **Deferred:** the native Tauri desktop binary (needs a build host) and the App-Store
  2.5.2 mobile spike (external review). Tracked as such in `ROADMAP.md`.

## Naming

Product name **Pumice**. "Obsidian" referenced nominatively for compatibility only; no
affiliation/endorsement. See `LEGAL.md`.
