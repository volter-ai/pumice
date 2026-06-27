import { defineConfig } from '@playwright/test';

// E2E config: real Chromium against the assembled app, auto-starting the Vite dev server.
// Every feature is proven here (real browser), not in jsdom.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 15000,
  use: {
    baseURL: 'http://localhost:5179',
    headless: true,
    actionTimeout: 5000,
    launchOptions: {
      // Software WebGL (SwiftShader) so the real 3D graph (Three.js) renders headless.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
    },
  },
  webServer: {
    command: 'node_modules/.bin/vite --port 5179 --strictPort',
    url: 'http://localhost:5179/app.html',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
