// esbuild.config.mjs
import esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['plugin-shell.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  outfile: 'dist/plugin-shell.js',
});
