import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: '../dist-electron/main',
    lib: {
      entry: 'main.ts',
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      external: ['electron'],
    },
    minify: false,
    sourcemap: true,
  },
});
