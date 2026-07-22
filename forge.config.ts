import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerDeb } from '@electron-forge/maker-deb';
import { VitePlugin } from '@electron-forge/plugin-vite';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: './public/favicon',
    name: 'MDH',
    executableName: 'mdh',
  },
  makers: [
    new MakerSquirrel({
      name: 'MDH',
    }),
    new MakerDMG({
      format: 'ULFO',
    }),
    new MakerDeb({
      options: {
        maintainer: 'MDH Team',
        homepage: 'https://github.com/mdh-team/mdh',
      },
    }),
  ],
  plugins: [
    new VitePlugin({
      // 主进程构建配置
      build: [
        {
          entry: 'electron/main.ts',
          config: 'electron/vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'electron/preload.ts',
          config: 'electron/vite.preload.config.ts',
          target: 'preload',
        },
      ],
      // 渲染进程使用项目根目录的 vite.config.js
      renderer: [],
    }),
  ],
};

export default config;
