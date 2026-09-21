import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 8192,
    rollupOptions: {
      // Stable names, so redeploying the built game replaces its files
      // instead of piling up hashed copies beside them.
      output: {
        entryFileNames: 'assets/game.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/game.[ext]',
      },
    },
  },
});
