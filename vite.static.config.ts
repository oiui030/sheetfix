import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig({
  root: 'static',
  publicDir: '../public',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../dist-static',
    emptyOutDir: true,
    chunkSizeWarningLimit: 800,
  },
  server: {host: '0.0.0.0', port: 4173, allowedHosts: true},
  preview: {host: '0.0.0.0', port: 4173, allowedHosts: true},
});
