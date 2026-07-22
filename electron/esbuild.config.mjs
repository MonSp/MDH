import { build } from 'esbuild';
import { resolve } from 'path';

// 编译 Electron 主进程和 preload
async function buildElectron() {
  // 编译 main.ts (CJS 格式，使用 .cjs 扩展名避免 ESM/CMS 冲突)
  await build({
    entryPoints: [resolve('electron/main.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: 'dist-electron/main.cjs',
    external: ['electron', 'electron-updater'],
    sourcemap: true,
    minify: false,
  });

  // 编译 preload.ts (CJS 格式，使用 .cjs 扩展名)
  await build({
    entryPoints: [resolve('electron/preload.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: 'dist-electron/preload.cjs',
    external: ['electron'],
    sourcemap: true,
    minify: false,
  });

  console.log('✓ Electron main process built (main.cjs)');
  console.log('✓ Electron preload built (preload.cjs)');
}

buildElectron().catch(console.error);
