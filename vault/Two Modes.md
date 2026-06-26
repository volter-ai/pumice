# Two Modes

1. **No server** — click *Open folder*. The [[Virtual FS]] is backed by the File
   System Access API. Nothing runs but the tab.
2. **Served** — `npm run dev` exposes the vault at `/api`. The browser uses the
   HTTP [[Adapters|adapter]], and so can an AI agent.

Both render the same notes, [[Backlinks]], and [[3D Graph]].
