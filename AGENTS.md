# Working with this vault as an AI agent

This project is a **storage-agnostic display layer** for a Markdown vault. When the
dev server is running (`npm run dev`), the vault is exposed over a small REST API
that you — an AI agent — can drive directly. It is the *same* API the browser SPA
uses, so anything the UI can do, you can do headless.

## Base URL
`http://localhost:5173/api` (Vite's default port; check console output).

## Endpoints
| Method | Path | Body / Query | Purpose |
|---|---|---|---|
| GET  | `/health` | — | sanity + capabilities |
| GET  | `/files` | — | list all note paths |
| GET  | `/file` | `?path=Note.md` | read one note |
| PUT  | `/file` | `{ "path", "content" }` | write/overwrite a note |
| POST | `/append` | `{ "path", "content" }` | append (cheaper than read-modify-write) |
| POST | `/search` | `{ "query" }` | search; supports `tag:x` and `path:y` fields |
| GET  | `/backlinks` | `?path=Note.md` | notes linking to this one |
| GET  | `/graph` | — | `{ nodes, links }` link graph |

## Examples
```bash
curl localhost:5173/api/files
curl 'localhost:5173/api/file?path=Welcome.md'
curl -XPUT localhost:5173/api/file -H 'content-type: application/json' \
  -d '{"path":"Ideas.md","content":"# Ideas\n\nlinks to [[Welcome]]"}'
curl -XPOST localhost:5173/api/search -H 'content-type: application/json' \
  -d '{"query":"tag:intro graph"}'
```

## Conventions
- Notes are Markdown. Links are `[[Note Name]]` (resolved by basename, case-insensitive).
- Writes are confined to `VAULT_DIR` (default `./vault`); paths escaping it are rejected.
- Prefer `/append` for adding to a note, `/search` before creating duplicates, and
  `/backlinks` to understand context before editing.
