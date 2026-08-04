---
feature: electron-bash-python-block
status: delivered
updated: 2026-08-04
branch: main
commits: 73b31a5..aaac3a8
---

# Electron bash 工具拦截 Python 命令

## Report

**What was built** — Electron 纯 Node 离线模式下，`bash` 工具现在拦截 LLM 调用的 `python`/`pip`/`conda` 命令，并引导其改用 `node`。新增 `src/services/bashGuard.ts`（纯函数 `isBlockedBashCommand`），用正则拦截 python 家族命令，覆盖版本号（`python3.11`）、`env`/`sudo`/`nohup` 前缀、绝对路径（`/usr/bin/python3`）、Windows `py` launcher，且不误伤 `pymysql`/`pylint` 等。`electron/ipc-handlers.ts` 的 bash 分支执行前检查，命中返回引导信息；executor system prompt 追加规则 5（无 Python，用 node 验证）。

**Verification** —
- PASS: `npx vitest run` — 1006/1006（含 13 个 bashGuard 测试）
- PASS: `npx vitest run src/services/__tests__/bashGuard.test.ts` — 13/13（7 个禁用 + 5 个放行 + 3 个绕过向量）
- PASS: `npm run build:electron` — main.cjs 含拦截逻辑
- PASS: `npx tsc --noEmit`

**Journey log** —
- [lesson] 前缀黑名单 `cmd.startsWith(p + ' ')` 对已含空格的 `'py '` 会产生双空格 bug（`py  `）——用 `p.endsWith(' ')` 判断避免。
- [lesson] `python3.11`/`env python3`/`sudo python`/绝对路径是真实绕过向量——前缀列表升级为正则（`(?:\.\d+)*` 版本号、`env\s+|sudo\s+` 前缀）才彻底拦截。
- [lesson] `\b` 词边界在 `conda-lock` 上会误命中（`-` 是 non-word 字符）——可接受，因为 conda 生态工具本就不该在纯 Node 环境运行。

## [S1] Problem

Electron 纯本地模式（Node.js 内置，无 Python、无公网）下，用户测试 PPT 任务时 LLM 仍会通过 `bash` 工具调用 `python`/`pip`/`conda` 等命令（如 `python -c "..."` 验证、`pip install` 建环境）。原因：

1. `electron/ipc-handlers.ts` 的 `bash` 工具分支（`execSync(args.command)`）**无任何命令拦截**——LLM 可执行任意命令
2. executor 的 system prompt 说"创建完文件后运行测试验证"，LLM 倾向用 `python` 验证
3. 用户环境没有 Python，命令必然失败；即使有，也违背"纯 Node 本地执行"的设计目标

## [S2] Design

### bash 工具命令拦截

在 `electron/ipc-handlers.ts` 的 `bash` 分支执行前，检查命令是否含被禁命令：

**禁用前缀**（命令开头匹配）：
- `python`、`python2`、`python3`
- `pip`、`pip3`
- `conda`
- `py`（Windows Python launcher）

**拦截逻辑**：
```typescript
const BLOCKED_CMD_PREFIXES = ['python', 'python2', 'python3', 'pip', 'pip3', 'conda', 'py '];
const cmd = (args.command || '').trim();
const blocked = BLOCKED_CMD_PREFIXES.some(p => cmd === p || cmd.startsWith(p + ' '));
if (blocked) {
  return { success: false, output: '本环境为纯 Node.js 离线模式，无 Python。请改用 Node.js（node 命令）完成验证和脚本任务。' };
}
```

**注意**：用"命令前缀 + 空格"匹配而非子串，避免误伤 `python3-dev` 等无关参数；用 `py ` 而非 `py` 前缀避免误伤 `pymysql` 等以 py 开头的包名。

### system prompt 引导（辅助）

在 `buildElectronSystemPrompt` 的 executor 分支追加一条规则，让 LLM 主动避免 python：

```
5. 本环境无 Python，禁止使用 python/pip/conda 命令；验证脚本用 node 命令
```

### 测试

新增测试覆盖：
- `python -c "print(1)"` → 被拦截
- `pip install x` → 被拦截
- `conda create ...` → 被拦截
- `python3 test.py` → 被拦截
- `node test.js` → 放行
- `git status` → 放行
- `echo hello` → 放行

由于 executeTool 依赖 electron 模块无法直接导入 vitest，将拦截逻辑提取为纯函数 `isBlockedBashCommand(cmd)` 放 `src/services/`，executeTool 调用它，测试直接测该函数。

## [S3] Out of Scope

- Python 后端 `tool_executor.py` 的 bash 拦截（Electron 场景专属；Python 场景本身有 Python，无需拦截）
- 更复杂的命令审计（正则白名单）——前缀黑名单足够满足"阻止 LLM 调 python"目标
- 拦截 Docker 等其他环境命令

## Tasks

- [x] T1: 提取 isBlockedBashCommand 纯函数 — acceptance: `src/services/bashGuard.ts` 导出 `isBlockedBashCommand(cmd): boolean`，覆盖 7 个禁用前缀 (covers: S2)
- [x] T2: executeTool bash 分支接入拦截 — acceptance: `electron/ipc-handlers.ts` bash 分支执行前调用 isBlockedBashCommand，命中时返回引导信息 (covers: S2; depends: T1)
- [x] T3: system prompt 追加规则 — acceptance: `buildElectronSystemPrompt` executor 分支含"禁止 python/pip/conda，用 node 验证" (covers: S2; depends: T2)
- [x] T4: 测试 + 构建验证 — acceptance: bashGuard 测试通过（7+ 用例），`npm run build:electron` 成功 (covers: S2; depends: T3)
