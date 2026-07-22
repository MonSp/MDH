import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: '../dist-electron/preload',
    lib: {
      entry: 'preload.ts',
      formats: ['cjs'],
      fileName: () => 'preload.js',
    },
    rollupOptions: {
      external: ['electron'],
    },
    minify: false,
    sourcemap: true,
  },
});
