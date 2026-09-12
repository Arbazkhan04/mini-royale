import { defineConfig } from 'vite';

// Relative base keeps the build portable for static hosting / YouTube Playables.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 8192,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
  server: {
    // Honour PORT so the dev server can be launched on whatever port is free.
    port: Number(process.env.PORT) || 5173,
    host: true,
  },
});
