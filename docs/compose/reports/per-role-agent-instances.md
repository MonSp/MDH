---
feature: per-role-agent-instances
status: delivered
specs: []
plans:
  - docs/compose/plans/2026-07-13-per-role-agent-instances.md
branch: main
commits: be100ae..c6298c3
---

# Per-Role Agent 实例化 — Final Report

## What Was Built

TS 侧（Orchestrator + Electron）的每个团队角色现在是独立的 `RoleAgent` 实例，拥有自己的消息上下文、system prompt（含 skill pack 专业提示词）和按角色过滤的工具集。此前所有角色只是 `TeamCoordinator` 内部的不同 prompt 字符串，共享同一个消息数组，`skill_packs/*/system_prompt.md` 从未注入。

实现分为三个新模块（`orchestrator/src/agent/`）加两处集成：

- **`role-agent.ts`** — `RoleAgent` 类：独立 `messages[]`、`chat()`（纯文本）、`chatWithTools()`（OpenAI function calling 工具循环）、`getContextSummary()` / `injectContext()`（跨 agent 上下文传递）、上下文截断。
- **`system-prompt.ts`** — `buildSystemPrompt(roleId)`：组装 角色基础 prompt + skill pack `system_prompt.md` + 工具指南（仅 Executor）。
- **`tools.ts`** — `getToolsForRole(roleId)`：按角色权限过滤 `ToolDefinition[]`（对应 Python 侧 `AgentToolset._filter_tools()`）。

`TeamCoordinator` 从"上帝对象"重构为编排者：创建 `RoleAgent[]`、讨论阶段并发发言、执行阶段委托 executor agent、审查阶段委托 reviewer agent。Electron 因 CJS 打包限制内联了 `ElectronRoleAgent`，实现同样的独立上下文和并发讨论。

## Architecture

```
orchestrator/src/agent/
├── role-agent.ts       RoleAgent 类（核心，独立上下文 + 工具循环）
├── system-prompt.ts    buildSystemPrompt() — 注入 skill pack 提示词
├── tools.ts            getToolsForRole() — 按角色过滤工具
└── index.ts            barrel export

orchestrator/src/team/coordinator.ts  →  编排 RoleAgent[]，不再内联 LLM/工具逻辑
electron/ipc-handlers.ts              →  内联 ElectronRoleAgent（CJS 兼容）
```

**数据流：**
1. `execute()` 解析角色列表 → `createAgents()` 为每个角色构造 `RoleAgent`（独立 system prompt + 工具集 + router）
2. 讨论阶段：`Promise.all(agents.map(a => a.chat(...)))` 并发发言，讨论记录注入 coordinator agent
3. 执行阶段：`executorAgent.chatWithTools(task, onEvent)` 带工具循环（独立上下文累积工具结果）
4. 审查阶段：`reviewerAgent.chat(...)` 用独立上下文审查，不通过则 executor 下一轮修改
5. 总结阶段：coordinator agent 汇总

**关键接口：**
```typescript
class RoleAgent {
  constructor(config: AgentConfig)  // id, roleId, roleName, systemPrompt, tools, router, workspace, llm
  chat(userMessage: string): Promise<string>
  chatWithTools(userMessage: string, onEvent?, maxIterations?): Promise<string>
  getContextSummary(maxChars?): string
  injectContext(context: string): void
}
```

### Design Decisions

- **RoleAgent 封装全部 agent 状态**：独立 `messages[]` 是核心——executor 的工具结果不会污染 reviewer 的上下文，讨论发言不会丢失在执行阶段。
- **system_prompt.md 注入**：选择角色的主技能（`template.skills[0]`）加载对应 skill pack 的 `system_prompt.md`，与角色基础 prompt 拼接。这样之前补全的 42 个 skill pack 提示词真正生效。
- **工具按角色过滤**：reviewer 只有 `read_file`/`grep_content`（无 `write_file`），coordinator 无 `bash`——与 Python 侧 `AgentToolset` 行为对齐。
- **Electron 内联而非复用**：Electron 主进程以 CJS 打包（`format: 'cjs'`），而 orchestrator 是 ESM（`"type": "module"`），直接 import 会因 `import.meta.url` 等 ESM 特性在 CJS 下崩溃（历史已确认）。故内联轻量 `ElectronRoleAgent`，复用现有 `chatCompletion`/`executeTool`/`extractCodeBlocks`。
- **公共 API 不变**：`TeamCoordinator.execute()` 签名和 EventHandler 消息格式不变，前端零改动。

## Usage

**Orchestrator（本地服务模式）**：无需改动——`server.ts` 的 `new TeamCoordinator({...})` 调用不变，内部自动创建 RoleAgent 实例。

**Electron 桌面端**：无需改动——`SimpleTeamCoordinator` 内部改用 `ElectronRoleAgent`，IPC 接口不变。

**新角色接入**：在 `roles_config.yaml`（Python）或 `orchestrator/templates/roles.json`（TS）添加角色定义，`getToolsForRole()` 和 `buildSystemPrompt()` 自动生效。角色主技能对应 `skill_packs/<skill>/system_prompt.md` 会注入。

## Verification

- **orchestrator 测试 60/60 通过**（10 个测试文件）：
  - `tools.test.ts` (6) — 各角色工具过滤正确
  - `system-prompt.test.ts` (6) — skill pack 提示词注入验证（executor 含"组件驱动开发"、reviewer 含"导师式审查"）
  - `role-agent.test.ts` (6) — 独立上下文、chat/chatWithTools、injectContext
  - `integration.test.ts` (4) — 多 agent 工具集和 prompt 完全不同、上下文隔离
  - `loader.test.ts` 更新为 42+ skill packs
- **Electron 测试 49/49 通过**（electron-ipc + useIpcBridge）
- **Electron 构建成功**：`npm run build:electron` 产出 `dist-electron/main.cjs` + `preload.cjs`
- **TypeScript 检查**：`coordinator.ts` 和 `agent/` 目录无类型错误（剩余 14 个错误均为预存，位于 executor/client.ts、assembler.ts 等无关文件）

## Journey Log

- [lesson] 块注释中含 `skill_packs/*/system_prompt.md` 时 `*/` 会提前终止注释导致 oxc 解析失败——路径描述避开 `*/` 序列。
- [lesson] Electron 主进程是 CJS，orchestrator 是 ESM（`"type": "module"`），两者不能互相 import——Electron 侧必须内联实现。
- [lesson] orchestrator 内存在两份 `TeamMember` 类型（`types.ts` 与 `team.ts`），`RouterFactory.getRouterForMember` 需要 `team.ts` 版，跨文件传参会触发类型错误。

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `docs/compose/plans/2026-07-13-per-role-agent-instances.md` | 实施计划 | 完整 6 任务 TDD 计划 |
| `orchestrator/src/agent/role-agent.ts` | 核心实现 | RoleAgent 类 |
| `orchestrator/src/agent/system-prompt.ts` | 实现 | buildSystemPrompt |
| `orchestrator/src/agent/tools.ts` | 实现 | getToolsForRole |
| `orchestrator/src/team/coordinator.ts` | 重构 | 编排 RoleAgent[] |
| `electron/ipc-handlers.ts` | 适配 | ElectronRoleAgent 内联 |
