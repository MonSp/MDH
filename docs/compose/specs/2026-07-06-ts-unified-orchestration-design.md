# TS 统一编排层架构设计

## [S1] 问题

当前系统存在两套并行的执行路径：

| 路径 | CEO | Team组装 | 工具执行 | 数据源 |
|------|-----|----------|----------|--------|
| Python路径 | `ceo_agent.py` | `meeting_coordinator.py` | `tool_executor.py` | `roles_config.yaml` |
| TS路径 | `coordinator.ts` Phase 0 | `coordinator.ts` Phase 1 | HTTP → Python executor | `roles.json` |

**问题**：
1. 两套 CEO 逻辑（Python + TS）职责重叠，维护成本高
2. 两份角色配置（`roles_config.yaml` + `roles.json`）需要手动同步
3. Python 后端承担了编排+执行双重职责，部署复杂
4. 用户必须同时启动 Python 后端 + TS Orchestrator 才能工作

## [S2] 目标架构

**TypeScript = 编排层**（轻量、跨平台、用户本地运行）
**Python = 执行层**（AgentScope、工具执行、远端集群）

```
┌─────────────────────────────────────────────────────────┐
│  用户本地 (npx mdh)                                     │
│                                                         │
│  TypeScript Orchestrator                                │
│  ┌───────────────────────────────────────────────┐      │
│  │  CEO Agent (coordinator.ts Phase 0)           │      │
│  │  - 意图分析 (LLM)                             │      │
│  │  - 复杂度判定                                  │      │
│  │  - 角色选择                                    │      │
│  ├───────────────────────────────────────────────┤      │
│  │  TeamAssembler (新增)                         │      │
│  │  - 从 roles.json 选角色                       │      │
│  │  - 从 skill_packs/ 匹配技能                   │      │
│  │  - 组装 Team 实例                             │      │
│  ├───────────────────────────────────────────────┤      │
│  │  MeetingEngine (重构 coordinator.ts)          │      │
│  │  - 讨论 (Phase 2)                             │      │
│  │  - 分派 (Phase 3)                             │      │
│  │  - 执行+审查循环 (Phase 4)                    │      │
│  │  - 汇报 (Phase 5)                             │      │
│  ├───────────────────────────────────────────────┤      │
│  │  ToolkitRouter (新增)                         │      │
│  │  - 本地模式: 本地文件系统                      │      │
│  │  - 远端模式: HTTP → Python Executor            │      │
│  └───────────────────────────────────────────────┘      │
│                                                         │
│  数据源 (本地文件)                                       │
│  - roles.json (角色定义, 唯一源)                        │
│  - skill_packs/ (技能包)                                │
│  - .env (LLM配置)                                       │
└─────────────┬───────────────────────────────────────────┘
              │ 远端模式: HTTP POST /execute
              ▼
┌─────────────────────────────────────────────────────────┐
│  远端集群 (Python Executor, port 8767)                   │
│                                                         │
│  纯执行器，无编排逻辑：                                  │
│  - ToolExecutor (bash, file, git, test)                 │
│  - AgentScope 运行时                                    │
│  - 容器化工作区                                         │
└─────────────────────────────────────────────────────────┘
```

## [S3] 数据流

### 角色配置流
```
roles.json (唯一源)
    │
    ├── TS Orchestrator: 直接读取 (loadRoleTemplates())
    │
    └── Python Executor: 不需要角色配置 (纯执行器)
```

### 技能包流
```
skill_packs/
    │
    ├── TS Orchestrator: 读取 manifest.yaml 匹配技能
    │
    └── Python Executor: 不需要技能包 (纯执行器)
```

### 工具执行流
```
TS Orchestrator (LLM 产出 tool_calls)
    │
    ├── 本地模式: 直接操作本地文件系统
    │   (Node.js fs, child_process)
    │
    └── 远端模式: HTTP POST → Python Executor
        (POST /execute {tool_name, arguments, workspace})
```

## [S4] 接口设计

### CEO Agent (Phase 0)
```typescript
interface ICeoAgent {
  analyzeComplexity(task: string): Promise<ComplexityResult>
  selectRoles(task: string, complexity: ComplexityResult): Promise<string[]>
  buildDag(selectedRoles: string[], task: string): Dag
}
```

### TeamAssembler (新增)
```typescript
interface ITeamAssembler {
  assembleFromDag(dag: Dag, projectId: string): Team
  resolveSkillPacks(roleConfig: RoleConfig): SkillPack[]
}

interface Team {
  id: string
  projectId: string
  members: TeamMember[]
  leader: TeamMember
  runtime: TeamRuntime
}

interface TeamMember {
  id: string
  roleName: string
  teamRole: 'Coordinator' | 'Planner' | 'Executor' | 'Reviewer' | 'Monitor'
  skillPack?: SkillPack
  tools: string[]
  dangerousTools: string[]
}

interface TeamRuntime {
  type: 'local' | 'remote'
  workspace: string
  executorUrl?: string
}
```

### MeetingEngine (重构 coordinator.ts)
```typescript
interface IMeetingEngine {
  start(team: Team, task: string): Promise<void>
  discuss(topic: string): Promise<DiscussionResult>
  assignTask(member: TeamMember, task: SubTask): Promise<void>
  execute(member: TeamMember, task: SubTask): Promise<ExecutionResult>
  review(reviewer: TeamMember, result: ExecutionResult): Promise<ReviewResult>
  summarize(): Promise<string>
}
```

### ToolkitRouter (新增)
```typescript
interface IToolkitRouter {
  execute(toolCall: ToolCall, runtime: TeamRuntime): Promise<ToolResult>
}

// 本地模式实现
class LocalToolkitRouter implements IToolkitRouter {
  async execute(toolCall: ToolCall): Promise<ToolResult> {
    // Node.js fs / child_process
  }
}

// 远端模式实现
class RemoteToolkitRouter implements IToolkitRouter {
  constructor(private executorUrl: string) {}
  async execute(toolCall: ToolCall): Promise<ToolResult> {
    // HTTP POST to executor
  }
}
```

## [S5] 文件结构

```
orchestrator/
├── src/
│   ├── cli.ts                    # 入口 (不变)
│   ├── server.ts                 # HTTP + WS 服务 (简化)
│   ├── team/
│   │   ├── ceo.ts                # 新增: CEO Agent (从 coordinator.ts 提取 Phase 0)
│   │   ├── assembler.ts          # 新增: TeamAssembler
│   │   ├── meeting.ts            # 重构: MeetingEngine (从 coordinator.ts 提取 Phase 2-5)
│   │   ├── coordinator.ts        # 重构: 简化为消息路由器
│   │   ├── templates.ts          # 修改: 直接读 roles.json, 移除 API fetch
│   │   └── types.ts              # 修改: 新增 Team, TeamMember, TeamRuntime 类型
│   ├── toolkit/
│   │   ├── router.ts             # 新增: ToolkitRouter (本地/远端切换)
│   │   ├── local.ts              # 新增: 本地工具执行 (Node.js)
│   │   └── remote.ts             # 新增: 远端工具执行 (HTTP client, 从 executor/ 迁移)
│   ├── skill/
│   │   ├── loader.ts             # 新增: SkillPack 加载器
│   │   └── types.ts              # 新增: SkillPack 类型
│   ├── llm/                      # 不变
│   └── loop/                     # 不变
├── templates/
│   └── roles.json                # 角色定义 (唯一源, 不再从 Python API 获取)
└── skill_packs/ → ../skill_packs/  # 符号链接到项目根目录的技能包
```

## [S6] 迁移策略

### 阶段 1: 提取 CEO + TeamAssembler (不改变行为)
1. 从 `coordinator.ts` 提取 Phase 0 (CEO 分析) → `ceo.ts`
2. 从 `coordinator.ts` 提取 Phase 1 (团队组装) → `assembler.ts`
3. `coordinator.ts` 保持不变，调用新模块

### 阶段 2: 新增 ToolkitRouter (不改变行为)
1. 创建 `toolkit/router.ts` 接口
2. 迁移 `executor/client.ts` → `toolkit/remote.ts`
3. 创建 `toolkit/local.ts` (本地文件系统执行)
4. `coordinator.ts` 使用 ToolkitRouter 替代直接调用 ExecutorClient

### 阶段 3: 新增 SkillLoader (不改变行为)
1. 创建 `skill/loader.ts` 读取 `skill_packs/`
2. TeamAssembler 使用 SkillLoader 匹配技能包

### 阶段 4: 重构 MeetingEngine (改变行为)
1. 从 `coordinator.ts` 提取 Phase 2-5 → `meeting.ts`
2. `coordinator.ts` 简化为消息路由器
3. 移除 `templates.ts` 中的 API fetch 逻辑

### 阶段 5: 清理
1. 删除 `executor/` 目录 (迁移到 `toolkit/remote.ts`)
2. 更新 `server.ts` 简化消息处理
3. 更新测试

## [S7] 向后兼容

- Python Executor 保持不变，仍然提供 `POST /execute` 端点
- `roles.json` 保持与 `roles_config.yaml` 相同的结构
- WebSocket 消息格式不变，前端无需修改
- `npx mdh` 命令不变

## [S8] 关键决策

1. **roles.json 是唯一源** — 不再从 Python API 获取角色配置
2. **skill_packs/ 是本地目录** — TS 直接读取 YAML，不通过 API
3. **ToolkitRouter 支持本地/远端切换** — 用户可选择在本地或远端执行工具
4. **CEO 始终在 TS 层** — 无论本地还是远端模式，编排逻辑都在 TS
5. **Python 只做执行** — Python 后端降级为纯工具执行器
