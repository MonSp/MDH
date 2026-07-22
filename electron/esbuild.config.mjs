import { build } from 'esbuild';
import { resolve } from 'path';

// 编译 Electron 主进程和 preload
async function buildElectron() {
  // 编译 main.ts (CJS 格式，Electron 要求)
  // 使用 packages 选项强制将 orchestrator 视为外部包
  await build({
    entryPoints: [resolve('electron/main.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: 'dist-electron/main.js',
    external: ['electron', 'electron-updater'],
    sourcemap: true,
    minify: false,
    // 将 orchestrator 视为外部依赖，不打包
    // 运行时通过 require 动态加载
  });

  // 编译 preload.ts (CJS 格式，Electron preload 要求)
  await build({
    entryPoints: [resolve('electron/preload.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: 'dist-electron/preload.js',
    external: ['electron'],
    sourcemap: true,
    minify: false,
  });

  console.log('✓ Electron main process built');
  console.log('✓ Electron preload built');
}

buildElectron().catch(console.error);
