import { defineConfig } from 'vite';
import { apiMiddleware } from './server/api.js';

// A single `npm run dev` gives you BOTH:
//   • the static SPA (server-optional display layer), and
//   • a local fs API at /api (so agents — or another machine — can read/write).
// The "serve your fs locally" mode is just this middleware over Node's fs.
export default defineConfig({
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
