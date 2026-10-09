import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Vite dev server runs on 5173 and forwards any /api request to the
// Express backend. This way the browser only ever talks to one origin in
// development and we do not need a CORS package.
const API_PROXY_TARGET = 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API_PROXY_TARGET,
        changeOrigin: true,
      },
    },
  },
});
