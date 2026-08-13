import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // src/ 下存在编译产物 .js（含已跟踪的 templates.js），源文件以 NodeNext 风格
    // 显式导入 './x.js'——将相对导入的 .js 后缀重写到 .ts，避免陈旧产物遮蔽源文件
    // （"exports is not defined in ES module scope"）。
    alias: [{ find: /^(\.\.?\/.*)\.js$/, replacement: "$1.ts" }],
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
