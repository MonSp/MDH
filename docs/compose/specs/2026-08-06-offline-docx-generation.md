---
feature: offline-docx-generation
status: delivered
updated: 2026-08-06
branch: main
commits: c84dd99..2ae486d
---

# 离线 Word 文档生成（Node.js docx）

## Report

**What was built** — Electron 模式下 `create_document` 工具现在可以离线生成真正的 `.docx` Word 文档，不依赖 Python 或公网。核心是新增 `src/services/docxBuilder.ts`（纯 Node 模块，无 electron 依赖），支持段落/项目符号/编号列表/标题/表格五种块类型、文档标题、多 section，并通过 `path.relative` + `isAbsolute` 守卫拒绝路径越界（含 sibling-prefix 绕过和绝对路径）。`electron/ipc-handlers.ts` 的 `executeTool` 新增 `create_document` 分支委托给 `buildDocx`，并给 11 个文档相关角色（content_director/technical_writer/product_manager 等）注入 create_document 工具说明。`docx@9.7.1` 由 esbuild 直接 bundle 进 `main.cjs`，完全离线可用。

**Verification** —
- PASS: `npx vitest run` — 1016/1016 全量测试（含 10 个 docxBuilder 测试）
- PASS: `npx vitest run src/services/__tests__/docxBuilder.test.ts` — 10/10（5 块类型 + 标题 + 多 section + 3 路径守卫）
- PASS: `npm run build:electron` — main.cjs 含 docx 逻辑
- PASS: `npx tsc --noEmit` — 修改文件无类型错误
- PASS: E2E — technical_writer 调用 create_document 生成真实 .docx

**Journey log** —
- [lesson] docx 的 `numbering.config` 必须放 `Document` 构造器层级（不是 section properties），否则类型不匹配（TS2345/TS2322）。
- [lesson] `buildParagraphs` 返回 `Paragraph[]` 但 table 块是 `Table` 类型——需放宽返回类型为 `(Paragraph | Table)[]`（TS2345）。
- [lesson] ppt_lead 同时属于 pptRoles 和 docRoles，prompt 会注入两份"可用工具"节——冗余但不冲突（create_slide/create_document 是不同工具），可接受。

## [S1] Problem

内网环境（无 Python、无公网）下，MDH 需要生成 Word 文档。当前系统：

1. `create_document` 工具（`backend/tool_executor.py:686`）只是写**纯文本/Markdown 文件**，不是真正的 .docx——Word 无法直接打开
2. Electron 侧 `executeTool` 完全没有 create_document 分支，LLM 只能靠 write_file 写文本
3. Python 依赖（python-docx）在内网不可安装

**决策**：采用 Node.js `docx` 库（npm docx@9.7.1，纯 JS），直接打包进 Electron asar，离线生成真正的 .docx，与 pptxgenjs 方案一致，零下载平台。

## [S2] Design

### 工具实现：Electron 主进程 executeTool 新增 create_document

在 `electron/ipc-handlers.ts` 的 `executeTool()` switch 中新增 `create_document` 分支。

**核心模块**：`src/services/docxBuilder.ts`（纯 Node，无 electron 依赖，与 pptxBuilder.ts 同模式）

**输入参数**（LLM 以 tool_call JSON 调用）：
```json
{
  "tool": "create_document",
  "args": {
    "path": "report.docx",
    "title": "报告标题",
    "sections": [
      { "heading": "第一章", "paragraphs": ["正文段落一", "正文段落二"] },
      { "heading": "第二章", "bullets": ["要点一", "要点二"] }
    ]
  }
}
```

**输出**：`.docx` 文件写入 workspace，返回文件路径。

**支持的块类型**（section 内的段落元素）：
- `paragraphs: string[]` — 普通正文段落
- `bullets: string[]` — 项目符号列表
- `numbered: string[]` — 编号列表
- `heading: string` — 标题（用 HeadingLevel）
- `table: { headers: string[], rows: string[][] }` — 表格
- 默认：若无 sections，生成单段落文档

**依赖**：`docx`（^9.7.1）加入 dependencies，esbuild 直接 bundle 进 main.cjs。

### 安全

- `path` 用 `path.relative` 检查限定在 workspace 内（复用 pptxBuilder 的守卫模式，防 sibling-prefix 绕过）
- 拒绝绝对路径参数
- 输入来自 LLM，内容本身无代码执行，无注入风险

### 角色工具注入

复用 PPT 角色的注入模式：给文档相关角色（content_writer、content_editor、coordinator 等含 create_document 权限的角色）的 system prompt 注入 create_document 工具说明，让 LLM 知道用该工具生成 .docx。

## [S3] Out of Scope

- Python 后端 `tool_executor.py` 的 create_document 升级（Electron 场景专属，Python 场景保留纯文本）
- docx 模板/样式编辑 UI
- 复杂排版（页眉页脚、分节、样式主题）——docx 库基础能力足够常规文档
- 读取/编辑已有 .docx（只做创建）

## Tasks

- [x] T1: 安装 docx 依赖并验证 bundle — acceptance: `docx` 在 package.json dependencies，esbuild bundle 后生成有效 .docx（PK zip） (covers: S2)
- [x] T2: 实现 docxBuilder — acceptance: `src/services/docxBuilder.ts` 导出 `buildDocx(workspace, spec)`，支持 paragraphs/bullets/numbered/heading/table，路径守卫防越界 (covers: S2; depends: T1)
- [x] T3: executeTool 接入 create_document — acceptance: `electron/ipc-handlers.ts` 新增 create_document 分支委托 buildDocx，系统 prompt 给文档角色注入工具说明 (covers: S2; depends: T2)
- [x] T4: 测试 + 构建验证 — acceptance: docxBuilder 测试通过（10+ 用例含路径守卫），`npm run build:electron` 成功且产物含 docx 逻辑 (covers: S2; depends: T3)
