import { defineConfig } from 'vite';
import { apiMiddleware } from './server/api.js';

// A single `npm run dev` gives you BOTH:
//   • the static SPA (server-optional display layer), and
//   • a local fs API at /api (so agents — or another machine — can read/write).
// The "serve your fs locally" mode is just this middleware over Node's fs.
export default defineConfig({
  // Relative base (or VITE_BASE override) so the built app works under ANY path —
  // domain root, a GitHub-Pages /repo/ subpath, or file://. Absolute '/assets/...'
  // paths were the reason subpath deploys 404'd.
  base: process.env.VITE_BASE || './',
  build: { rollupOptions: { input: { main: "index.html", app: "app.html" } } },
  plugins: [
    {
      name: 'uicommons-vault-api',
      configureServer(server) {
        server.middlewares.use(apiMiddleware());
      },
      // Also expose it in `vite preview` for a production-ish local serve.
      configurePreviewServer(server) {
        server.middlewares.use(apiMiddleware());
      },
    },
  ],
});
