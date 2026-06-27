# Legal & provenance (clean-room stance)

Pumice is an independent, open-source application that opens Obsidian-format vaults and
runs community plugins via a **clean-room behavioral reimplementation** of the public
plugin API. This document is the SPDX/legal gate referenced by the Definition of Done.

## What we reimplement, and from what

- The plugin-facing API is reimplemented **behaviorally** against the **MIT-licensed
  `obsidian.d.ts`** type declarations (which Obsidian publishes under MIT) and against
  **observed runtime behavior** of community plugins. We implement *what plugins
  observably require*, not Obsidian's source.
- We treat the type surface as an interface specification. Reimplementing an interface
  for interoperability is supported by **Google v. Oracle** (US fair use of an API's
  structure/SSO) and, in the EU, by **SAS Institute v. World Programming** (functionality,
  programming languages, and file formats are not protected by copyright).

## What we never do

- **No copying, decompilation, or bundling** of Obsidian's proprietary application
  (`app.asar`, `app.js`, minified bundles, icons, or CSS). No Obsidian-derived code is
  present in this repository.
- We do **not** ship Obsidian's name/logo as our own; "Obsidian" is referenced only
  nominatively (to describe compatibility). Our product name is **Pumice**.

## Capability walls (no misrepresentation of scope)

Features that require native/desktop capabilities a browser cannot provide are **walled
and documented**, never faked. See `INTERNALS.md` §C (capability walls) and §D
(frontier). Examples: CORS-free `requestUrl` (desktop net), `child_process`/`electron`
(desktop only), `FileSystemAccess` (Chromium only). On the web build these are absent and
the UI documents the subset (DoD #5).

## SPDX / dependency licensing

- Our own code: **MIT** (see `LICENSE`).
- Runtime deps are permissively licensed (MIT/ISC/Apache-2.0/BSD): `@codemirror/*`,
  `@lezer/*` (MIT), `marked` (MIT), `moment` (MIT), `3d-force-graph` (MIT). The SPDX
  gate (`scripts/dod-checklist.mjs` item 8/15) fails CI if a copyleft/again-incompatible
  license is introduced.
- Contributor provenance is tracked in `CONTRIBUTORS.lock`.

## Trademark / naming

"Obsidian" is a trademark of Dynalist Inc. Pumice is not affiliated with or endorsed by
Obsidian. Compatibility claims are nominative fair use. See `SUPPORT_POLICY.md` for the
pinned-API and naming policy.
