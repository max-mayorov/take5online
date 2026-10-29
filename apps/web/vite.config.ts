import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development, `wrangler dev` (port 8787) serves the API and WebSockets.
export default defineConfig({
  plugins: [react()],
  // CI uploads the maps to PostHog so its error tracking shows real stack traces; public/.assetsignore
  // keeps them off the site.
  build: { sourcemap: true },
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
});
