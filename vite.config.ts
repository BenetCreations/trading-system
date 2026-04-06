import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'client',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        configure(proxy) {
          proxy.on('error', (_err, _req, res) => {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Server not ready — retrying…' }));
          });
        },
      },
    },
  },
  build: {
    outDir: '../dist/client',
  },
});
