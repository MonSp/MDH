# Per-Role Agent 实例化方案

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/per-role-agent-instances.md)

## 问题

当前 TS 侧 `TeamCoordinator` 是一个"上帝对象"，所有角色共享同一个 LLM 配置和消息数组。区别仅在 system prompt 模板文本，没有真正的 Agent 实例隔离。

**具体缺陷：**
1. 没有独立的 `Agent` 类 — 角色只是不同 prompt 字符串
2. 没有独立的上下文 — 讨论阶段的消息在执行阶段丢失
3. `system_prompt.md` 从未注入 — skill pack 的专业提示词被忽略
4. 工具集未按角色过滤 — 所有角色共享同一套 `TOOL_DEFINITIONS`
5. 讨论阶段串行执行 — 各角色发言是 for 循环，不是并发

## 设计目标

每个角色成为一个独立的 `RoleAgent` 实例，拥有：
- 自己的 system prompt（prompt template + skill pack system_prompt.md）
- 自己的消息上下文（独立 `messages[]`）
- 自己的工具集（按 roles_config 的 permissions 过滤）
- 自己的 toolkit router（local/remote 按成员路由）
- 可并发执行（讨论阶段多 agent 并行发言）

## 架构

```
TeamCoordinator (编排者，不再是上帝对象)
│
├─ AgentRuntime (运行时环境)
│   ├─ LLMConfig          (共享 LLM 配置)
│   ├─ RouterFactory      (per-member 工具路由)
│   └─ SkillPackLoader    (加载 system_prompt.md)
│
├─ RoleAgent[] (独立实例)
│   ├─ RoleAgent("executor", systemPrompt, tools[], router, workspace)
│   │   └─ messages[]     (独立上下文)
│   ├─ RoleAgent("reviewer", systemPrompt, tools[], router, workspace)
│   │   └─ messages[]     (独立上下文)
│   └─ RoleAgent("coordinator", systemPrompt, tools[], router, workspace)
│       └─ messages[]     (独立上下文)
│
└─ 协调流程
    ├─ 阶段1: 各 agent 讨论（并发 callLLM）
    ├─ 阶段2: executor 执行（tool loop）
    ├─ 阶段3: reviewer 审查（读代码 + callLLM）
    └─ 阶段4: coordinator 总结
```

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `orchestrator/src/agent/role-agent.ts` | **新建** | RoleAgent 类 — 核心 |
| `orchestrator/src/agent/tools.ts` | **新建** | 按角色过滤 ToolDefinition[] |
| `orchestrator/src/agent/system-prompt.ts` | **新建** | 组装 system prompt（template + skill pack） |
| `orchestrator/src/agent/index.ts` | **新建** | barrel export |
| `orchestrator/src/team/coordinator.ts` | **重构** | 改用 RoleAgent 实例 |
| `orchestrator/src/team/templates.ts` | **小改** | 暴露 prompt_templates 查询 |
| `orchestrator/src/skill/loader.ts` | **小改** | 暴露 getSkillPackByRoleId |
| `orchestrator/src/team/types.ts` | **小改** | 新增 AgentConfig 类型 |
| `electron/ipc-handlers.ts` | **重构** | SimpleTeamCoordinator 改用 RoleAgent |
| `orchestrator/src/agent/__tests__/role-agent.test.ts` | **新建** | 测试 |

## 详细设计

### 1. RoleAgent 类 (`orchestrator/src/agent/role-agent.ts`)

```typescript
export interface AgentConfig {
  id: string;                    // "agent-executor"
  roleId: string;                // "executor"
  roleName: string;              // "全栈开发"
  systemPrompt: string;          // 组装后的完整 system prompt
  tools: ToolDefinition[];       // 该角色可用的工具定义
  router: IToolkitRouter;        // 工具执行路由
  workspace: string;             // 工作区路径
  llm: LLMConfig;                // LLM 配置
}

export class RoleAgent {
  readonly id: string;
  readonly roleId: string;
  readonly roleName: string;

  private config: AgentConfig;
  private messages: Message[];     // 独立上下文
  private maxContextChars = 600_000;

  constructor(config: AgentConfig) {
    this.id = config.id;
    this.roleId = config.roleId;
    this.roleName = config.roleName;
    this.config = config;
    this.messages = [
      { role: 'system', content: config.systemPrompt },
    ];
  }

  /** 纯文本调用（讨论阶段） */
  async chat(userMessage: string): Promise<string> {
    this.messages.push({ role: 'user', content: userMessage });
    const response = await callLLMOnce(this.config.llm, this.messages);
    this.messages.push({ role: 'assistant', content: response });
    return response;
  }

  /** 带工具的调用（执行阶段），返回最终文本 */
  async chatWithTools(
    userMessage: string,
    onEvent?: EventHandler,
    maxIterations = 15,
  ): Promise<string> {
    this.messages.push({ role: 'user', content: userMessage });
    let result = '';

    for (let i = 0; i < maxIterations; i++) {
      this.truncateIfNeeded();
      const response = await callLLMWithTools(
        this.config.llm,
        this.messages,
        this.config.tools,
      );

      if (response.content) {
        onEvent?.({
          type: 'agent_message',
          agentId: this.id,
          content: response.content,
          timestamp: Date.now(),
        });
      }

      if (response.tool_calls.length === 0) {
        result = response.content || '';
        break;
      }

      this.messages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.tool_calls,
      });

      for (const tc of response.tool_calls) {
        onEvent?.({ type: 'tool_call', id: tc.id, tool: tc.function.name, args: tc.function.arguments });
        const toolResult = await this.executeTool(tc);
        const resultStr = toolResult.error
          ? `Error: ${toolResult.error}`
          : String(toolResult.result);
        this.messages.push({ role: 'tool', content: resultStr, tool_call_id: tc.id });
        onEvent?.({ type: 'tool_result', id: tc.id, tool: tc.function.name, result: resultStr, success: !toolResult.error });
      }
    }
    return result;
  }

  /** 获取上下文摘要（用于跨 agent 传递） */
  getContextSummary(maxChars = 2000): string {
    const assistantMessages = this.messages
      .filter(m => m.role === 'assistant')
      .map(m => m.content)
      .join('\n---\n');
    return assistantMessages.substring(0, maxChars);
  }

  /** 注入外部上下文（如其他 agent 的讨论结果） */
  injectContext(context: string): void {
    this.messages.push({ role: 'user', content: `[团队上下文]\n${context}` });
  }

  private async executeTool(tc: ToolCall): Promise<ToolResult> {
    let args: Record<string, unknown>;
    try { args = JSON.parse(tc.function.arguments); }
    catch { return { call_id: tc.id, tool_name: tc.function.name, result: null, error: 'Invalid JSON' }; }

    // 路径规范化
    for (const key of ['path', 'directory']) {
      if (typeof args[key] === 'string') {
        args[key] = (args[key] as string).replace(/^\/?workspace\//, '').replace(/^\.\//, '');
      }
    }

    return this.config.router.execute(
      { ...tc, function: { ...tc.function, arguments: JSON.stringify(args) } },
      this.config.workspace,
    );
  }

  private truncateIfNeeded(): void {
    // 复用现有 truncateMessages 逻辑
    let total = this.messages.reduce((s, m) => s + (m.content?.length || 0), 0);
    if (total <= this.maxContextChars) return;

    // 截断过长的 tool 结果
    for (let i = 1; i < this.messages.length - 2 && total > this.maxContextChars; i++) {
      const msg = this.messages[i];
      if (msg.role === 'tool' && msg.content && msg.content.length > 500) {
        const truncated = msg.content.substring(0, 200) + '\n... [截断] ...\n' + msg.content.slice(-100);
        total -= (msg.content.length - truncated.length);
        this.messages[i] = { ...msg, content: truncated };
      }
    }
    // 截断 assistant 消息
    for (let i = 1; i < this.messages.length - 2 && total > this.maxContextChars; i++) {
      const msg = this.messages[i];
      if (msg.role === 'assistant' && msg.content && msg.content.length > 1000) {
        const truncated = msg.content.substring(0, 1000) + '\n... [截断]';
        total -= (msg.content.length - truncated.length);
        this.messages[i] = { ...msg, content: truncated };
      }
    }
    // 删除最早消息
    while (this.messages.length > 7 && total > this.maxContextChars) {
      const removed = this.messages.splice(1, 1)[0];
      total -= (removed.content?.length || 0);
    }
  }
}
```

### 2. System Prompt 组装 (`orchestrator/src/agent/system-prompt.ts`)

```typescript
import { getTemplate, getPromptTemplate } from '../team/templates.js';
import { getSkillPack } from '../skill/loader.js';

/**
 * 为指定角色组装完整的 system prompt
 *
 * 结构:
 * 1. 角色基础 prompt（来自 prompt_templates[role.prompt_template]）
 * 2. Skill Pack 专业提示词（来自 skill_packs/*/system_prompt.md）
 * 3. 工具使用指南
 */
export function buildSystemPrompt(roleId: string): string {
  const template = getTemplate(roleId);
  if (!template) throw new Error(`Unknown role: ${roleId}`);

  const parts: string[] = [];

  // 1. 角色基础 prompt
  const basePrompt = template.custom_prompt || `你是${template.name}，${template.description}`;
  parts.push(basePrompt);

  // 2. Skill Pack system_prompt.md
  const primarySkill = template.skills?.[0];
  if (primarySkill) {
    const skillPack = getSkillPack(primarySkill);
    if (skillPack?.systemPrompt) {
      parts.push(`\n## 专业技能\n\n${skillPack.systemPrompt}`);
    }
  }

  // 3. 工具使用指南（仅 executor 角色需要详细版）
  if (template.team_role === 'Executor') {
    const toolGuide = getPromptTemplate('tool_guide')
      || '工具：write_file(创建文件) | edit_file(修改文件) | read_file(读取) | list_directory(列目录) | bash(运行命令) | git_*。流程：1.list_directory 2.write_file 3.bash测试 4.git_commit。不要用bash创建文件。';
    parts.push(`\n## 工具指南\n\n${toolGuide}`);
  }

  return parts.join('\n\n');
}
```

### 3. 工具过滤 (`orchestrator/src/agent/tools.ts`)

```typescript
import type { ToolDefinition } from '../llm/types.js';
import { getTemplate } from '../team/templates.js';

// 全量工具定义（从 coordinator.ts 移出）
const ALL_TOOL_DEFINITIONS: ToolDefinition[] = [
  // write_file, read_file, edit_file, list_directory, bash,
  // grep_content, git_status, git_diff, git_commit
  // ... 与现有 TOOL_DEFINITIONS 相同
];

/**
 * 根据角色配置过滤可用工具
 * 对应 Python 侧 AgentToolset._filter_tools()
 */
export function getToolsForRole(roleId: string): ToolDefinition[] {
  const template = getTemplate(roleId);
  if (!template) return ALL_TOOL_DEFINITIONS;

  const allowed = new Set(template.tools);
  return ALL_TOOL_DEFINITIONS.filter(td => allowed.has(td.function.name));
}
```

### 4. 重构 TeamCoordinator (`orchestrator/src/team/coordinator.ts`)

核心改动：将"上帝对象"拆为 AgentRuntime + RoleAgent[] 协作。

```typescript
// 新增：AgentRuntime — 持有共享资源
interface AgentRuntime {
  llm: LLMConfig;
  routerFactory: RouterFactory;
  workspace: string;
}

// 重构：execute() 流程
async execute(userMessage, selectedRoles, onEvent) {
  // 阶段 0: CEO 分析（保持不变，单次 LLM 调用）
  const complexity = await this.analyzeComplexity(userMessage);

  // 阶段 0.5: 工作区确认（保持不变）
  const workspace = await this.confirmWorkspace(userMessage);

  // 阶段 1: 组建团队 — 创建 RoleAgent 实例
  const agents = this.createAgents(rolesToUse, workspace);
  // agents = [RoleAgent("coordinator"), RoleAgent("executor"), RoleAgent("reviewer")]

  // 阶段 2: 讨论 — 并发执行
  if (rolesToUse.length > 1) {
    const discussions = await Promise.all(
      agents.filter(a => a.roleId !== 'coordinator').map(agent =>
        agent.chat(`任务：${userMessage}\n\n请从你的专业角度给出具体建议。`)
      )
    );
    // coordinator 总结，注入讨论上下文
    const coordinator = agents.find(a => a.roleId === 'coordinator');
    coordinator.injectContext(discussions.join('\n---\n'));
    const plan = await coordinator.chat(`根据以上讨论，请给出执行方案。`);
  }

  // 阶段 3: 执行 — executor agent 带工具循环
  const executor = agents.find(a => getTemplate(a.roleId)?.team_role === 'Executor');
  const result = await executor.chatWithTools(userMessage, onEvent);

  // 阶段 4: 审查 — reviewer agent 读代码 + 审查
  const reviewer = agents.find(a => getTemplate(a.roleId)?.team_role === 'Reviewer');
  if (reviewer) {
    const reviewResult = await reviewer.chat(`请审查以下代码：\n${result.substring(0, 3000)}`);
    // 如果不通过，executor 修改
  }

  // 阶段 5: 总结
  const summary = await coordinator.chat(`请总结执行结果。`);
  return summary;
}

// 新增：createAgents()
private createAgents(roleIds: string[], workspace: string): RoleAgent[] {
  const runtime: AgentRuntime = {
    llm: this.config.llm,
    routerFactory: this.config.routerFactory,
    workspace,
  };

  return roleIds.map(roleId => {
    const template = getTemplate(roleId);
    const member = this.team?.members.find(m => m.role === roleId);
    const router = member
      ? runtime.routerFactory.getRouterForMember(member)
      : runtime.routerFactory.getRouterForMember({ location: 'local', runtime: { type: 'local', workspace } } as any);

    return new RoleAgent({
      id: `agent-${roleId}`,
      roleId,
      roleName: template?.name || roleId,
      systemPrompt: buildSystemPrompt(roleId),
      tools: getToolsForRole(roleId),
      router,
      workspace,
      llm: runtime.llm,
    });
  });
}
```

### 5. Electron 适配 (`electron/ipc-handlers.ts`)

`SimpleTeamCoordinator` 改为使用 `RoleAgent`：

```typescript
// 替换现有的讨论阶段
const agents = roles.map(roleId => new RoleAgent({
  id: `agent-${roleId}`,
  roleId,
  roleName: getRoleName(roleId),
  systemPrompt: buildSystemPrompt(roleId),
  tools: getToolsForRole(roleId),
  router: localRouter,
  workspace,
  llm: currentLlm,
}));

// 讨论：并发
const opinions = await Promise.all(
  agents.filter(a => a.roleId !== 'ceo').map(a => a.chat(`任务：${task}`))
);

// 执行：executor 带工具循环
const executor = agents.find(a => a.roleId === roles[roles.length - 1]);
const result = await executor.chatWithTools(task, onEvent);
```

## 依赖关系

```
Task 1: tools.ts (工具过滤)
Task 2: system-prompt.ts (prompt 组装)
Task 3: role-agent.ts (核心类) ← 依赖 Task 1, 2
Task 4: coordinator.ts 重构 ← 依赖 Task 3
Task 5: Electron 适配 ← 依赖 Task 3
Task 6: 测试 ← 依赖 Task 3
```

## 并发讨论的 LLM 调用量

| 场景 | 现在 | 改后 |
|------|------|------|
| 3 角色讨论 | 3 次串行 | 3 次并发（~1/3 时间） |
| 执行 + 审查 | N 次（executor） + 1 次（reviewer） | 相同，但 executor 和 reviewer 有独立上下文 |
| 总计 | ~N+4 次 | ~N+4 次（总 token 相同，讨论阶段提速） |

## 向后兼容

- `TeamCoordinator` 的公共 API（`execute()`, `EventHandler`）不变
- 前端不需要改动 — 消息格式（`agent_message`, `tool_call` 等）不变
- `assembleTeam()` 和 `Team` 类型不变 — RoleAgent 是 coordinator 内部实现
- Electron IPC 接口不变 — 只是内部实现从 prompt 切换改为 RoleAgent 实例

## 验证标准

1. 每个 RoleAgent 有独立的 `messages[]`，互不干扰
2. 讨论阶段各角色并发发言，时间从 ~9s 降到 ~3s（3 角色）
3. executor 的 system prompt 包含 skill pack 的 `system_prompt.md` 内容
4. reviewer 角色只能使用 `read_file` + `grep_content`，不能 `write_file`
5. 所有现有测试通过

---

# 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task.

**Goal:** 让 TS 侧每个团队角色成为独立的 RoleAgent 实例，拥有独立上下文、system prompt 和工具集

**Architecture:** 新增 `orchestrator/src/agent/` 模块，包含 RoleAgent 类、工具过滤、system prompt 组装。重构 TeamCoordinator 从"上帝对象"改为编排 RoleAgent[] 协作。Electron SimpleTeamCoordinator 同步适配。

**Tech Stack:** TypeScript, Vitest, OpenAI-compatible function calling API

## Global Constraints

- 公共 API（`TeamCoordinator.execute()`、EventHandler 消息格式）不变，前端零改动
- `assembleTeam()` 和 `Team`/`TeamMember` 类型不变
- LLM 调用复用现有 `chatStream` 函数
- Skill pack 加载复用现有 `loadSkillPacks` / `getSkillPack`
- 工具定义从 coordinator.ts 移出，按角色过滤

---

## Task 1: 工具过滤模块

**Files:**
- Create: `orchestrator/src/agent/tools.ts`
- Modify: `orchestrator/src/team/coordinator.ts` (移出 TOOL_DEFINITIONS)
- Test: `orchestrator/src/agent/__tests__/tools.test.ts`

**Interfaces:**
- Produces: `getToolsForRole(roleId: string): ToolDefinition[]`、`ALL_TOOL_DEFINITIONS`

- [ ] **Step 1: 创建 agent 目录和 tools.ts**

从 `coordinator.ts:32-145` 提取 `TOOL_DEFINITIONS` 到独立模块，增加按角色过滤功能。

- [ ] **Step 2: 写测试**

验证 executor 有 write_file/bash，reviewer 有 read_file/grep_content 无 write_file，coordinator 只有 read_file/git_status。

- [ ] **Step 3: 运行测试验证通过**

Run: `cd /home/test/MDH && npx vitest run orchestrator/src/agent/__tests__/tools.test.ts`

- [ ] **Step 4: Commit**

---

## Task 2: System Prompt 组装模块

**Files:**
- Create: `orchestrator/src/agent/system-prompt.ts`
- Test: `orchestrator/src/agent/__tests__/system-prompt.test.ts`

**Interfaces:**
- Consumes: `getTemplate()`, `getPromptTemplate()` from `templates.ts`, `getSkillPack()` from `skill/loader.ts`
- Produces: `buildSystemPrompt(roleId: string): string`

- [ ] **Step 1: 创建 system-prompt.ts**

组装逻辑：角色基础 prompt + skill pack system_prompt.md + 工具指南（仅 Executor）。

- [ ] **Step 2: 写测试**

验证 executor 包含"垂直切片"（fullstack_dev 的 system_prompt.md），reviewer 包含"导师式审查"，coordinator 不含工具指南。

- [ ] **Step 3: 运行测试**

Run: `cd /home/test/MDH && npx vitest run orchestrator/src/agent/__tests__/system-prompt.test.ts`

- [ ] **Step 4: Commit**

---

## Task 3: RoleAgent 核心类

**Files:**
- Create: `orchestrator/src/agent/role-agent.ts`
- Create: `orchestrator/src/agent/index.ts`
- Test: `orchestrator/src/agent/__tests__/role-agent.test.ts`

**Interfaces:**
- Consumes: `buildSystemPrompt()` from Task 2, `getToolsForRole()` from Task 1, `chatStream` from `llm/openai.ts`, `IToolkitRouter` from `toolkit/router.ts`
- Produces: `RoleAgent` class with `chat()`, `chatWithTools()`, `getContextSummary()`, `injectContext()`

- [ ] **Step 1: 创建 role-agent.ts**

核心类，封装独立 messages[]、LLM 调用、工具执行、上下文截断。

- [ ] **Step 2: 创建 barrel export (index.ts)**

- [ ] **Step 3: 写测试**

验证 constructor 初始化、chat() 追加消息、两个 agent 上下文独立、getContextSummary、injectContext。

- [ ] **Step 4: 运行测试**

Run: `cd /home/test/MDH && npx vitest run orchestrator/src/agent/__tests__/role-agent.test.ts`

- [ ] **Step 5: Commit**

---

## Task 4: 重构 TeamCoordinator 使用 RoleAgent

**Files:**
- Modify: `orchestrator/src/team/coordinator.ts`

**Interfaces:**
- Consumes: `RoleAgent`, `buildSystemPrompt`, `getToolsForRole` from Task 1-3
- Public API unchanged: `execute()`, `EventHandler`

- [ ] **Step 1: 添加 import，移除内联 TOOL_DEFINITIONS**

- [ ] **Step 2: 删除已内置于 RoleAgent 的方法**

删除 `callLLMWithTools()`, `callLLMOnce()`, `executeToolCall()`, `truncateMessages()`。

- [ ] **Step 3: 新增 createAgents() 方法**

- [ ] **Step 4: 重构 execute() 使用 RoleAgent**

讨论阶段并发 `Promise.all`，执行阶段 `executor.chatWithTools()`，审查阶段 `reviewer.chat()`。

- [ ] **Step 5: 运行现有测试确认不回归**

Run: `cd /home/test/MDH && npx vitest run orchestrator/src/team/`

- [ ] **Step 6: Commit**

---

## Task 5: Electron SimpleTeamCoordinator 适配

**Files:**
- Modify: `electron/ipc-handlers.ts`

- [ ] **Step 1: 添加 RoleAgent import（或内联）**

- [ ] **Step 2: 替换讨论阶段串行为并发**

- [ ] **Step 3: 替换执行阶段代码块解析为 RoleAgent.chatWithTools**

- [ ] **Step 4: 验证 Electron 构建**

Run: `cd /home/test/MDH && npm run build:electron`

- [ ] **Step 5: Commit**

---

## Task 6: 集成测试

**Files:**
- Create: `orchestrator/src/agent/__tests__/integration.test.ts`

- [ ] **Step 1: 写集成测试验证完整流程**

验证 executor system prompt 包含 fullstack_dev 技能、reviewer 工具集不含 write_file、多 agent 上下文隔离。

- [ ] **Step 2: 运行全量测试**

Run: `cd /home/test/MDH && npx vitest run orchestrator/src/`

- [ ] **Step 3: Commit**
