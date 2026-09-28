import { defineConfig } from 'vite';

// The API runs separately (platform/server, port 8787). In dev, /api is proxied so the app is same-origin.
export default defineConfig({
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://localhost:8787',
        rewrite: (p) => p.replace(/^\/api/, ''),
        headers: { 'cf-ipcountry': process.env.DEV_COUNTRY ?? 'NZ' },
      },
    },
  },
});
