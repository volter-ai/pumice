# 🪨 Pumice

**A virtual Obsidian.** Pumice is an open-source, Obsidian-compatible note system that runs entirely on an **in-browser virtual filesystem** — no backend required. It opens existing Obsidian vaults unchanged, aims to run unmodified community plugins and themes, and is built on a storage-agnostic VFS with a first-class agent API.

> Pumice is the same volcanic glass family as obsidian — but light enough to float. Same vault, no server, runs anywhere.

## Why

- **Backend-free** — the vault lives in a virtual filesystem in the browser (IndexedDB and friends). Host it as static files, or run it server-optional.
- **Obsidian-compatible** — opens existing vaults as-is; targets the documented plugin and theme contracts rather than a fork.
- **Storage-agnostic** — pluggable VFS backends; your notes aren't locked to one provider.
- **Agent-native** — the same REST API the SPA uses is exposed for AI agents, so anything the UI can do, an agent can do headless (see [`AGENTS.md`](./AGENTS.md)).

## Quick start

```bash
npm install
npm run dev      # Vite dev server (vault exposed at http://localhost:5173)
npm run build    # production build
npm run preview  # preview the build
```

## Project layout

| Path | What |
|---|---|
| `src/` | the SPA + virtual filesystem |
| `server/` | optional dev server / REST API |
| `plugins/`, `real-plugins/` | plugin layer and compatibility shims |
| `vault/` | sample vault |
| [`ROADMAP.md`](./ROADMAP.md) | goals, compatibility tiers, capability walls |
| [`AGENTS.md`](./AGENTS.md) | driving the vault headlessly as an AI agent |
| [`COMPAT.json`](./COMPAT.json) | compatibility matrix |

## Status

Early development. Compatibility targets and scope are tracked in [`ROADMAP.md`](./ROADMAP.md).

## License

[MIT](./LICENSE) © Volter AI, Inc. Obsidian is a trademark of Dynalist Inc.; Pumice is an independent, unaffiliated project.
