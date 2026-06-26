# Adapters

Each adapter implements the [[Virtual FS]] interface and declares what it can do.

- **FSA adapter** — File System Access API, pure browser, no server. Read/write a
  picked folder. Chromium-only.
- **HTTP adapter** — talks to the local `/api`. Works in the browser AND is the
  same surface an AI agent drives. See [[Two Modes]].

Future: a git adapter (isomorphic-git), a Notion adapter (read-mostly), a Drive
adapter. The [[3D Graph]] and [[Backlinks]] come along for free.
