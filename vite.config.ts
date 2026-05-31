import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy API calls to the Express server during development so the client
    // can use same-origin /api paths in both dev and production.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
