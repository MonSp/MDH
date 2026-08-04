---
feature: offline-ppt-generation
status: delivered
updated: 2026-08-03
branch: main
commits: 386bf7e..33076ed
---

# 离线 PPT 生成（Node.js pptxgenjs）

## Report

**What was built** — Electron 模式下 `create_slide` 工具现在可以离线生成 `.pptx` 文件，不依赖 Python 或公网。核心是新增 `src/services/pptxBuilder.ts`（纯 Node 模块，无 electron 依赖），支持 cover/bullets/chart（bar/pie）三种布局、主题色、多页幻灯片，并通过 `path.relative` 守卫拒绝路径越界（含 sibling-prefix 绕过和绝对路径）。`electron/ipc-handlers.ts` 的 `executeTool` 改为 async 并新增 `create_slide` 分支委托给 `buildPptx`。`pptxgenjs@4.0.1` 由 esbuild 直接 bundle 进 `main.cjs`（690KB），完全离线可用——解决了内网环境无 Python、无公网时无法生成 PPT 的问题。

**Verification** —
- PASS: `npx vitest run` — 993/993 全量前端测试（含 10 个 pptx-builder 测试）
- PASS: `npx vitest run src/modules/__tests__/pptx-builder.test.ts` — 10/10（cover/bullets/chart/pie/多页/主题/路径越界/sibling 绕过/绝对路径）
- PASS: `npm run build:electron` — main.cjs 含 pptx 逻辑（pptxgenjs 成功 bundle）
- PASS: `npx tsc --noEmit` — 修改文件无类型错误
- E2E: buildPptx 实际生成 44KB 有效 .pptx（PK zip 魔数验证）

**Journey log** —
- [lesson] `startsWith(workspace)` 路径守卫可被 sibling-prefix 绕过（`../workspace-evil/x.pptx` 共享前缀）——必须用 `path.relative` + `../` 检查（审查发现并修复）。
- [lesson] Electron 侧 `executeTool` 是同步函数，接入异步生成库需整体改 async 并给调用点补 `await`（esbuild 会报 "await only in async function"）。
- [lesson] vite/vitest 的 `include: src/**` 限制：被测模块必须放 `src/` 下，electron/ 目录内的纯逻辑模块无法被 vitest 直接测试——纯 Node 工具放 `src/services/` 更合理。

## [S1] Problem

用户内网环境（无公网、无 Python）需要 MDH 制作 PPT。当前系统：
1. `create_slide`/`edit_slide`/`ppt_generator` 工具在 `tool_executor.py` 和 Electron `executeTool` 中均无实现——多智能体只能"讨论 PPT 方案"但无法产出 .pptx 文件
2. Python 依赖（python-pptx）在内网不可安装

**决策**：采用 Node.js `pptxgenjs` 库（纯 JS），直接打包进 Electron asar，离线可用，零下载平台。

## [S2] Design

### 工具实现：Electron 主进程 executeTool 新增 create_slide

在 `electron/ipc-handlers.ts` 的 `executeTool()` switch 中新增 `create_slide` 分支：

**输入参数**（LLM 以 tool_call JSON 调用）：
```json
{
  "tool": "create_slide",
  "args": {
    "path": "presentation.pptx",
    "title": "演示标题",
    "slides": [
      {
        "title": "封面",
        "subtitle": "副标题",
        "layout": "cover"
      },
      {
        "title": "要点页",
        "bullets": ["要点一", "要点二"],
        "layout": "bullets"
      },
      {
        "title": "数据页",
        "chart": { "type": "bar", "labels": ["A", "B"], "values": [30, 70] },
        "layout": "chart"
      }
    ]
  }
}
```

**输出**：`.pptx` 文件写入 workspace，返回文件路径。

**布局支持**：
- `cover` — 封面（标题 + 副标题）
- `bullets` — 要点列表
- `chart` — 柱状/饼图（bar/pie）
- 默认回退 `bullets`

**依赖**：`pptxgenjs`（^4.0.1）加入 dependencies，通过 esbuild external 或 asar 打包进应用。

### 打包配置

`electron-builder.yml` 已含 `files: dist/**/*` 和 node_modules 排除规则。pptxgenjs 需确保被打包：
- 方案：不 external，让 esbuild 直接 bundle 进 main.cjs（pptxgenjs 是纯 JS，可 bundle）
- 若 bundle 失败，改为在 `electron-builder.yml` 的 `files` 中保留 `node_modules/pptxgenjs/**`

### 前端提示

`roles_config.yaml` 的 PPT 角色（ppt_lead/slide_designer）工具列表已含 `create_slide`——前端无需改动，LLM 调用 `create_slide` 时由 Electron executeTool 处理。

### 安全

- `path` 限定在 workspace 内（与现有 write_file 一致，用 `join(workspace, args.path)`）
- 输入来自 LLM，PPT 内容本身不执行代码，无注入风险

## [S3] Out of Scope

- Python 后端 `tool_executor.py` 的 create_slide 实现（Electron 场景不需要，Python 场景保留为后续）
- 内网下载平台（本方案零下载）
- 复杂图表库（如 matplotlib 级图表）——pptxgenjs 内置图表足够基础场景
- PPT 模板编辑 UI

## Tasks

- [x] T1: 安装 pptxgenjs 依赖 — acceptance: `pptxgenjs` 出现在 package.json dependencies 且可 import (covers: S2)
- [x] T2: executeTool 新增 create_slide 分支 — acceptance: `electron/ipc-handlers.ts` 的 executeTool 支持 create_slide，生成 .pptx 文件到 workspace，支持 cover/bullets/chart 布局 (covers: S2)
- [x] T3: 测试 — acceptance: 新增 create_slide 测试（生成 .pptx 文件存在、布局参数处理），运行通过 (covers: S2; depends: T2)
- [x] T4: 构建验证 — acceptance: `npm run build:electron` 成功且产物含 pptxgenjs 逻辑 (covers: S2; depends: T3)
