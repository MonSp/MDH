import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // 与 orchestrator 一致：相对导入的 .js 后缀重写到 .ts，避免根目录 React vite.config.js
    // 被 vitest 向上查找误载（react-babel 插件、__dirname 等与 loop-engineering 无关）。
    alias: [{ find: /^(\.\.?\/.*)\.js$/, replacement: "$1.ts" }],
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
