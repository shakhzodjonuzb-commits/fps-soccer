// Fayl: vite.config.ts

import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',

  build: {
    target: 'es2022',
    sourcemap: true,
    assetsInlineLimit: 4096,

    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) {
            return 'three';
          }

          if (id.includes('@dimforge/rapier3d-compat')) {
            return 'physics';
          }

          return undefined;
        },
      },
    },
  },

  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },

  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
