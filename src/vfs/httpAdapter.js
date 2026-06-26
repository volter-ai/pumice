// HTTP adapter — talks to the local Vite server's /api endpoints.
// This is the SAME interface the browser FSA adapter implements, but backed by
// the server's view of the filesystem. Because the endpoints are plain REST,
// an AI agent can drive the exact same API with curl/fetch — no browser needed.

/** @returns {import('./types.js').VaultAdapter} */
export function httpAdapter(base = '/api') {
  const j = async (url, opts) => {
    const r = await fetch(base + url, opts);
    if (!r.ok) throw new Error(`${url} -> ${r.status}`);
    return r.json();
  };
  return {
    name: 'http',
    capabilities: { write: true, watch: false, sync: true },
    async list() {
      return (await j('/files')).files;
    },
    async read(path) {
      return (await j('/file?path=' + encodeURIComponent(path))).content;
    },
    async write(path, content) {
      await j('/file', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path, content }),
      });
    },
    async snapshot() {
      return (await j('/snapshot')).files;
    },
  };
}
