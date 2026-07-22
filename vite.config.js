import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',  // 使用相对路径，兼容 Electron 打包
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        company: resolve(__dirname, 'company-app.html'),
      },
    },
  },
  server: {
    host: '0.0.0.0',
    watch: {
      ignored: ['**/data/workspaces/**'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8765',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8765',
        ws: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.svg': 'dataurl',
      },
    },
  },
});
