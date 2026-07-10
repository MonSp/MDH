# AGENTS.md - 大荒界 (Matrix DaHuang) 智能体系统指南

## 项目概述

**大荒界 (MDH)** 是一个基于 React + Python FastAPI + AgentScope 的全领域智能体协作系统。多个 AI 智能体在虚拟办公室中协作，完成从需求分析到代码交付的完整流程。

### 核心定位
- **多智能体协作平台**: 模拟公司组织架构，CEO、架构师、开发、QA、DevOps、项目经理等角色协同工作
- **虚拟办公室可视化**: 3D 科技大厦场景，实时展示智能体状态
- **本地/远端智能体混合执行**: 每个智能体可独立选择在用户浏览器本地(Node.js)或远端(Python Executor)执行工具调用
- **技能进化系统**: 项目执行过程中积累经验，生成可复用的技能包

---

## 系统架构

### 6层架构链

```
用户需求 → CEO Agent → Project Manager → Team → Role Agent → Skill Pack → Toolkit
```

| 层 | 组件 | 说明 |
|---|---|---|
| L1 | CEO Agent | 意图理解、复杂度判定、任务路由 |
| L2 | Project Manager | 项目创建、技能克隆、实例管理 |
| L3 | Team | 团队组装、角色分配、位置选择 |
| L4 | Role Agent | 角色实例、LLM 调用、工具执行 |
| L5 | Skill Pack | 技能包加载、经验注入、增量区 |
| L6 | Toolkit | 工具路由 (local/remote/hybrid) |

### 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | React 18 + TypeScript + Vite 6 + Three.js | 3D 虚拟办公室、实时通信 |
| 后端 | Python 3.11 + FastAPI + WebSocket | 智能体协调、工具执行 |
| AI 引擎 | AgentScope + DeepSeek API | 多模型支持 (DeepSeek/OpenAI/Anthropic) |
| 测试 | Vitest (TS) + pytest (Python) | 865 TS 测试 + 532 Python 测试 |

### 项目结构

```
MDH/
├── src/                          # React + TypeScript 前端
│   ├── components/               # UI 组件
│   │   ├── techtower/            # 3D 科技大厦
│   │   ├── office-team/          # 办公团队面板
│   │   │   ├── VotingPanel.tsx   # 投票面板
│   │   │   ├── ApprovalPanel.tsx # 审批面板
│   │   │   ├── CheckpointPanel.tsx # 检查点面板
│   │   │   ├── AuditLogPanel.tsx # 审计日志面板
│   │   │   └── ...
│   │   ├── skill-evolution/      # 技能进化
│   │   └── cyberpunk/            # 赛博朋克视觉效果
│   ├── hooks/                    # React Hooks
│   │   ├── useMeetingSocket.ts   # WebSocket 会议通信
│   │   ├── useAgentSystem.ts     # TS 智能体系统
│   │   └── useApproval.ts        # 审批队列
│   ├── modules/                  # 核心模块 (45+ 模块)
│   │   ├── webSocketBridge.ts    # TS-Python 桥接
│   │   ├── agentCoordinator.ts   # 智能体协调器
│   │   ├── communicationBus.ts   # 消息总线
│   │   ├── taskAssigner.ts       # 任务分配器
│   │   ├── taskDecomposer.ts     # 任务分解器
│   │   ├── taskPlanner.ts        # 任务规划器
│   │   ├── taskScheduler.ts      # 任务调度器
│   │   ├── negotiationEngine.ts  # 投票协商引擎
│   │   ├── dynamicRouter.ts      # 动态路由器
│   │   ├── workflowEngine.ts     # 工作流引擎
│   │   ├── skillRegistry.ts      # 技能注册表
│   │   ├── skillPackager.ts      # 技能打包器
│   │   ├── experienceExtractor.ts # 经验提炼器
│   │   ├── compensationEngine.ts # 补偿引擎
│   │   ├── checkpointManager.ts  # 检查点管理
│   │   ├── approvalQueue.ts      # 审批队列
│   │   ├── permissionManager.ts  # 权限管理
│   │   ├── deadlockDetector.ts   # 死锁检测
│   │   ├── metricsCollector.ts   # 指标收集
│   │   ├── speakingCoordinator.ts # 发言协调
│   │   └── ...
│   └── services/                 # 服务层
├── backend/                      # Python 后端
│   ├── server.py                 # FastAPI + WebSocket 服务
│   ├── meeting_coordinator.py    # 会议协调器（核心）
│   ├── ceo_agent.py              # CEO 智能体
│   ├── agent_bridge.py           # TS-Python 桥接
│   ├── cross_network_bridge.py   # 跨网络智能体桥接
│   ├── agent_discovery.py        # 智能体发现服务
│   ├── workspace_sync.py         # 工作区同步器
│   ├── mixed_location_discussion.py # 混合位置并行讨论
│   ├── approval_manager.py       # 审批管理器
│   ├── negotiation.py            # 投票决策引擎
│   ├── agenda.py                 # 议程状态机
│   ├── workflow_engine.py        # 工作流引擎
│   ├── task_orchestrator.py      # 任务编排器
│   ├── dynamic_router.py         # 动态路由器
│   ├── security.py               # 安全中间件
│   ├── compensation.py           # 检查点管理
│   ├── meeting.py                # 会议会话
│   ├── agent_toolset.py          # Agent 工具集
│   ├── tool_executor.py          # 工具执行器
│   ├── tool_registry.py          # 工具注册表
│   ├── skill_registry.py         # 技能注册中心
│   ├── skill_packager.py         # 技能打包器
│   ├── experience_extractor.py   # 经验提炼器
│   ├── project_manager.py        # 项目管理器
│   ├── workspace_manager.py      # 工作区管理
│   ├── roles_config.yaml         # 角色配置
│   ├── llm_cache.py              # LLM 响应缓存 (MD5 key, TTL 300s, LRU)
│   ├── message_queue.py          # 异步消息队列 (SQLite 持久化)
│   ├── spec_manager.py           # 规格管理器
│   ├── spec_tree.py              # Spec Tree 数据结构
│   ├── gate_manager.py           # 确定性门禁管理器
│   ├── ears_validator.py         # EARS 验收句式校验
│   ├── evidence_chain.py         # 证据链追踪
│   ├── fallback_chain.py         # 回退链机制
│   ├── complexity_classifier.py  # 复杂度分类器 (规则+LLM 两层)
│   ├── simple_executor.py        # 简单任务轻量执行器
│   ├── parallel_meeting_coordinator.py # 并行会议协调器
│   ├── parallel_discussion_manager.py # 并行讨论管理器
│   ├── agent_pool.py             # Agent 池管理
│   ├── key_manager.py            # API 密钥管理
│   ├── trace.py                  # 结构化日志 + TraceSpan
│   └── tests/                    # Python 测试 (532 tests)
├── mock-sso/                     # Mock SSO 服务 + 后端镜像
│   ├── server.py                 # SSO 服务器
│   ├── login.html                # 登录页面
│   └── collaboration/            # 多智能体协作模块
│       ├── planner_agent.py      # 规划智能体
│       ├── executor_agent.py     # 执行智能体
│       ├── critic_agent.py       # 审查智能体
│       ├── grounding_agent.py    # 接地智能体
│       └── collaborative_agent.py # 协作智能体
├── orchestrator/                 # TS 编排器服务 (用户本地 Node.js)
│   └── src/
│       ├── cli.ts                # CLI 入口
│       ├── server.ts             # HTTP + WebSocket 服务
│       ├── team/                 # 团队管理
│       │   ├── coordinator.ts    # TeamCoordinator
│       │   ├── assembler.ts      # TeamAssembler
│       │   ├── templates.ts      # 角色模板
│       │   └── types.ts          # Team/TeamMember 类型
│       ├── llm/                  # LLM 集成
│       │   ├── openai.ts         # OpenAI 兼容 API
│       │   └── types.ts          # LLMConfig 类型
│       ├── toolkit/              # 工具包路由 (local/remote/hybrid)
│       │   ├── router.ts         # IToolkitRouter 接口 + RouterFactory
│       │   ├── local.ts          # LocalToolkitRouter (本地 Node.js 执行)
│       │   ├── remote.ts         # RemoteToolkitRouter (远端 Python Executor)
│       │   └── hybrid.ts         # HybridToolkitRouter (混合路由)
│       ├── executor/             # 远端执行器客户端
│       │   ├── client.ts         # ExecutorClient
│       │   └── types.ts          # ToolCall/ToolResult 类型
│       ├── skill/                # 技能包加载
│       │   └── loader.ts         # SkillPack 加载器
│       └── loop/                 # 循环执行引擎
│           ├── loop.ts           # 主循环
│           ├── executor.ts       # 循环执行器
│           ├── scanner.ts        # 场景扫描器
│           ├── scheduler.ts      # 调度器
│           ├── validator.ts      # 验证器
│           └── persistence.ts    # 持久化
├── loop-engineering/             # 循环工程优化 (独立产品)
│   └── src/
│       ├── metrics/              # 指标收集
│       │   ├── collector.ts      # 场景指标收集
│       │   ├── calculator.ts     # 质量分数计算
│       │   ├── db.ts             # SQLite 存储层
│       │   └── reporter.ts       # 指标报告
│       ├── evolution/            # 优化策略
│       │   ├── evolver.ts        # Prompt 进化器
│       │   ├── analyzer.ts       # 结果分析器
│       │   └── experimenter.ts   # 实验管理器
│       ├── ci/                   # CI 集成
│       │   ├── gate.ts           # CI 质量门禁
│       │   └── baseline.ts       # 基线管理
│       └── scenarios/            # 测试场景
│           └── registry.ts       # 场景注册表
├── skill_packs/                  # 技能包 (5 个)
│   ├── frontend_dev/             # 前端开发技能
│   ├── backend_dev/              # 后端开发技能
│   ├── code_review/              # 代码审查技能
│   ├── testing/                  # 测试技能
│   └── task_decomposition/       # 任务分解技能
├── protocol/                     # 协议文档
│   ├── V4.6_BRIDGE_PROTOCOL.md
│   ├── V4.8_BRIDGE_PROTOCOL.md
│   └── V4.9_BRIDGE_PROTOCOL.md
├── docs/                         # 文档
│   ├── agent-roles.md            # Agent 角色配置
│   ├── agent-tools.md            # Agent 工具系统
│   ├── design.md                 # 设计文档
│   ├── user-guide.md             # 用户指南
│   └── compose/                  # 设计规格和计划
│       ├── specs/                # 设计规格文档
│       └── plans/                # 实施计划
└── docker-compose.yml            # Docker 编排
```

---

## 智能体角色系统

### 核心角色

| 角色 | ID | 职责 | 工具权限 | 技能 |
|------|-----|------|----------|------|
| **CEO/CTO** | `ceo` | 技术决策、团队协调、资源分配 | read_file, list_directory, git_status | task_decomposition, risk_management, architecture |
| **系统架构师** | `planner` | 系统设计、技术选型、任务分解 | read_file, list_directory, search_files, grep_content, git_* | architecture, task_decomposition, api_design |
| **全栈开发** | `executor` | 代码实现、功能开发 | read_file, write_file, edit_file, list_directory, bash, git_* | frontend_dev, backend_dev, fullstack_dev, testing |
| **QA工程师** | `reviewer` | 代码审查、测试、安全审计 | read_file, list_directory, bash, grep_content, run_tests, run_linter | code_review, testing, security_audit |
| **DevOps** | `monitor` | CI/CD、容器化、系统监控 | read_file, list_directory, bash, write_file, git_* | devops, monitoring, deployment |
| **产品经理** | `coordinator` | 需求分析、任务分解、进度跟踪 | read_file, list_directory, git_status, git_log | task_decomposition, progress_tracking, risk_management, architecture |

### 协作智能体模块 (collaboration/)

除核心角色外，系统还包含专用协作智能体：

| 智能体 | 文件 | 职责 |
|--------|------|------|
| **PlannerAgent** | `collaboration/planner_agent.py` | 任务规划、DAG 生成、子任务分配 |
| **ExecutorAgent** | `collaboration/executor_agent.py` | 迭代执行、经验提取、状态报告 |
| **CriticAgent** | `collaboration/critic_agent.py` | 伴随式审查、发现漏洞和矛盾约束 |
| **GroundingAgent** | `collaboration/grounding_agent.py` | 接地验证、确保结论有真实代码/文件出处 |
| **CollaborativeAgent** | `collaboration/collaborative_agent.py` | 协调器，组合 Planner + Executors |

通信接口：`CommunicationInterface` (InMemoryCommunication 实现)

### 扩展角色 (自定义)

系统支持通过 `roles_config.yaml` 定义自定义角色，支持角色混搭：

```yaml
custom_roles:
  security_dev:
    base_role: executor
    extra_tools: ["grep_content", "run_linter"]
    extra_skills: ["security_audit"]
    name: "安全开发工程师"
```

### 角色团队配置

系统支持多种团队配置：
- **软件开发团队**: coordinator + planner + executor + reviewer + monitor
- **内容创作团队**: content_director + screenwriter + content_writer + content_editor
- **数据团队**: data_lead + data_analyst + data_engineer + data_visualizer
- **AI影视团队**: director + screenwriter + image_artist + video_artist + sound_designer

---

## 工具系统

### 工具清单 (18种)

#### 文件操作
| 工具 | 描述 | 安全级别 |
|------|------|----------|
| `read_file` | 读取文件内容 | 安全 |
| `write_file` | 写入/创建文件 | 危险 |
| `edit_file` | 查找替换编辑 | 危险 |
| `list_directory` | 列出目录内容 | 安全 |

#### Git 操作
| 工具 | 描述 | 安全级别 |
|------|------|----------|
| `git_status` | 查看 git 状态 | 安全 |
| `git_commit` | 提交更改 | 危险 |
| `git_push` | 推送到远程 | 危险 |
| `git_branch` | 创建/切换分支 | 危险 |
| `git_diff` | 查看差异 | 安全 |
| `git_log` | 查看提交日志 | 安全 |

#### 搜索工具
| 工具 | 描述 | 安全级别 |
|------|------|----------|
| `search_files` | 搜索文件 | 安全 |
| `grep_content` | 搜索文件内容 | 安全 |

#### 测试工具
| 工具 | 描述 | 安全级别 |
|------|------|----------|
| `run_tests` | 运行测试套件 | 危险 |
| `run_linter` | 运行代码检查 | 安全 |

#### 文档工具
| 工具 | 描述 | 安全级别 |
|------|------|----------|
| `create_document` | 创建文档 | 安全 |
| `edit_document` | 编辑文档 | 安全 |

#### Web 工具
| 工具 | 描述 | 安全级别 |
|------|------|----------|
| `web_fetch` | 获取网页内容 | 安全 |

---

## 协作流程

### 完整工作流

```
用户需求 → CEO 交接 → 需求确认 → 语义分析 → 项目规划 → 讨论 → 投票 → 分派 → 审批 → 执行 → 审查 → 总结
```

### 各阶段说明

| 阶段 | 负责人 | 说明 |
|------|--------|------|
| CEO 交接 | CEO | 接收用户需求，转交项目经理 |
| 需求确认 | 项目经理 | 确认需求细节和复杂度 |
| 语义分析 | 项目经理 | 分析意图，确定目标智能体 |
| 项目规划 | 项目经理 | 制定 4 阶段计划 |
| 讨论 | 全体 | 多角色讨论方案 |
| 投票 | 全体 | 对方案进行投票 |
| 分派 | 项目经理 | 将任务分派给执行者 |
| 审批 | 人工 | 高风险操作需人工审批 |
| 执行 | 执行者 | 编写代码、执行任务 |
| 审查 | QA | 质量审查，最多 3 轮迭代 |
| 总结 | 项目经理 | 生成报告，提取经验 |

### 复杂度判定

系统自动判定任务复杂度：
- **简单任务**: 创建/修改少量文件（1-3个）、简单脚本、单文件工具
- **复杂任务**: 需要架构设计、多模块协作、前后端联调

简单任务走轻量执行路径，复杂任务走完整会议流程。

---

## 复杂度判定与执行路径

系统自动判定任务复杂度，选择不同执行路径：

### 两层分类器 (ComplexityClassifier)

1. **规则引擎** (快速): 正则匹配简单模式（打开网页、搜索、点击等）
2. **LLM 语义分析** (精确): 分析任务意图，返回 `simple` 或 `complex`

### 执行路径

| 路径 | 触发条件 | 流程 |
|------|----------|------|
| **简单路径** | 单步操作、1-3个文件 | CEO → SimpleExecutor → 单人助理 → 直接执行 → 轻量验收 |
| **复杂路径** | 多模块、架构设计 | CEO → MeetingCoordinator → 讨论 → 投票 → 分派 → 执行 → 审查 |

### 简单任务特征

- 创建/修改少量文件（1-3个）
- 单步浏览器操作（打开、搜索、点击）
- 简单脚本、配置文件修改
- 读取/查看操作

---

## 技能进化系统

### 技能包结构

```
skill_packs/<skill_name>/
├── manifest.yaml        # 技能元数据
├── system_prompt.md     # 系统提示词
├── rules/               # 经验规则
├── knowledge/           # 领域知识
└── examples/            # 示例代码
```

### 技能进化流程

1. **项目启动**: 从技能注册中心克隆基础技能包
2. **执行过程**: 智能体在工作区执行任务，积累经验
3. **经验提炼**: 从执行日志中提取可复用的规则
4. **技能打包**: 项目结束时合并基础技能包与增量，生成升级版技能包

### 经验规则格式

```yaml
rules:
- rule_id: <uuid>
  trigger_condition: "task_type is software-dev and role is executor"
  action: "建议采用事件驱动架构..."
  note: "来自executor的讨论建议"
  rule_type: success_pattern
  status: approved
  keywords: [executor, software-dev, support]
```

---

## WebSocket 消息协议

### 前端 → 后端

| 消息类型 | 说明 |
|----------|------|
| `start_meeting` | 启动会议 |
| `meeting_message` | 发送会议消息 |
| `task_assign` | 手动分派任务 |
| `end_meeting` | 结束会议 |
| `create_proposal` | 创建提案 |
| `cast_vote` | 投票 |
| `evaluate_consensus` | 评估共识 |
| `request_approval` | 请求人工审批 |
| `human_approval_response` | 审批响应 |
| `checkpoint_save` | 保存检查点 |
| `checkpoint_restore` | 恢复检查点 |
| `bridge_register_agent` | 注册 TS 智能体到 Python |
| `bridge_message` | TS↔Python 智能体消息 |

### 后端 → 前端

| 消息类型 | 说明 |
|----------|------|
| `meeting_started` | 会议已启动 |
| `meeting_ended` | 会议已结束 |
| `agent_message` | 智能体消息（含 delta 流式） |
| `task_assigned` | 任务已分派 |
| `agenda_update` | 议程状态更新 |
| `proposal` | 提案推送 |
| `vote` | 投票推送 |
| `vote_result` | 投票结果 |
| `human_approval_request` | 审批请求 |
| `checkpoint_saved` | 检查点已保存 |
| `checkpoint_restored` | 检查点已恢复 |
| `bridge_agent_registered` | TS 智能体注册确认 |
| `bridge_message` | Python→TS 智能体消息 |

---

## 关键基础设施模块

### LLM 缓存 (llm_cache.py)

- MD5 key: role + model + prompt
- TTL: 300 秒
- LRU 淘汰策略
- max_size: 100
- 仅缓存 `semantic_analyze` 结果

### 消息队列 (message_queue.py)

- 异步消息队列，SQLite 持久化
- 支持优先级: LOW / NORMAL / HIGH / URGENT
- 支持重试机制 (max_retries: 3)
- 死信队列处理

### 结构化日志 (trace.py)

- TraceSpan: trace_id + span_id + parent_span_id
- 支持因果链追踪 (causal_message_id)
- StructuredLogger: 环形缓冲区，max_size 1000

### Spec Tree 系统 (spec_tree.py)

- 需求→设计→任务层级结构
- EARS (Event-Driven Acceptance Requirements) 验收句式
- Gate Manager: 确定性门禁校验
- Evidence Chain: 决策证据链追踪

### 回退链 (fallback_chain.py)

- FallbackStep: 主路径失败时的备选方案
- 支持顺序/并行回退策略
- 最大尝试次数: 3
- 全部失败触发 CompensationEngine

---

## REST API

### 工作流引擎

| 端点 | 说明 |
|------|------|
| `POST /api/workflow/create` | 创建工作流 |
| `POST /api/workflow/execute/{id}` | 执行工作流 |
| `POST /api/workflow/pause/{id}` | 暂停工作流 |
| `POST /api/workflow/resume/{id}` | 恢复工作流 |
| `POST /api/workflow/cancel/{id}` | 取消工作流 |
| `GET /api/workflow/status/{id}` | 获取状态 |

### 角色管理

| 端点 | 说明 |
|------|------|
| `GET /api/roles/config` | 获取角色配置 |
| `POST /api/roles/{id}` | 创建角色 |
| `PUT /api/roles/{id}` | 更新角色 |
| `DELETE /api/roles/{id}` | 删除角色 |

### 监控

| 端点 | 说明 |
|------|------|
| `GET /health` | 健康检查 |
| `GET /metrics` | Prometheus 指标 |

---

## Docker 部署

### 服务组成

```yaml
services:
  frontend:      # React 前端 (端口 8080)
  backend:       # Python 后端 (端口 8765)
  mock-sso:      # Mock SSO 服务 (端口 8766)
  executor:      # 工具执行器 (端口 8767)
  orchestrator:  # 编排器 (端口 9090)
```

### 快速启动

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 DEEPSEEK_API_KEY

# 2. 构建并启动
docker compose up -d

# 3. 访问
# 前端: http://localhost:8080
# 后端: http://localhost:8765
# 健康检查: http://localhost:8765/health
```

### 环境变量

```env
DEEPSEEK_API_KEY=your_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
EXECUTOR_URL=http://localhost:8767
EXECUTOR_TOKEN=
```

---

## 运行时进程架构

系统运行时包含 3 个独立进程：

```
┌─────────────────────────────────────────────────────────────┐
│  用户浏览器 (Chrome Side Panel)                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  React 前端 (端口 8080)                              │    │
│  │  - 3D 虚拟办公室                                     │    │
│  │  - WebSocket 客户端                                  │    │
│  │  - Per-Agent Location 选择 UI                        │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
        │ WebSocket                          │ HTTP
        ▼                                    ▼
┌───────────────────────┐          ┌───────────────────────┐
│  TS Orchestrator      │          │  Python Backend       │
│  (端口 8080)          │          │  (端口 8765)          │
│  - TeamCoordinator    │          │  - MeetingCoordinator │
│  - LLM 调用           │          │  - CEO Agent          │
│  - 本地工具执行        │          │  - 投票/审批          │
│  - 远端工具路由        │          │  - 技能进化           │
└───────────┬───────────┘          └───────────────────────┘
            │ HTTP POST /execute
            ▼
┌───────────────────────┐
│  Python Executor      │
│  (端口 8767)          │
│  - ToolExecutor       │
│  - 18 种内置工具      │
│  - 工作区隔离         │
└───────────────────────┘
```

| 进程 | 技术 | 端口 | 职责 |
|------|------|------|------|
| **React 前端** | React + TypeScript | 8080 | UI、WebSocket 客户端 |
| **TS Orchestrator** | Node.js + TypeScript | 8080 | 本地 LLM 调用、团队管理、本地工具执行 |
| **Python Backend** | Python + FastAPI | 8765 | 会议协调、CEO 智能体、投票/审批、技能进化 |
| **Python Executor** | Python + FastAPI | 8767 | 远端工具执行、工作区隔离 |

---

## 开发指南

### 前端开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 运行测试
npm run test

# 构建
npm run build
```

### 后端开发

```bash
# 安装依赖
pip install -r backend/requirements.txt

# 配置 API Key
cp .env.example .env

# 启动后端
python backend/server.py

# 运行测试
cd backend && python -m pytest tests/ --timeout=10
```

### 测试覆盖率

| 目录 | Stmts | Branch | Funcs |
|------|-------|--------|-------|
| src/modules | 84.39% | 87.85% | 85.02% |
| src/hooks | 92.86% | 75.36% | 91.66% |

---

## 关键设计决策

### 1. TS-Python 桥接

- 前端 TS 智能体和后端 Python AgentScope 智能体可互相通信
- 通过 WebSocket 复用现有连接，新增 `bridge_*` 消息类型
- 维护 TS_ID ↔ PY_ID 双向映射

### 2. 本地/远端智能体混合执行架构

MDH 支持每个智能体实例独立选择工具执行位置，实现灵活的本地/远端混合执行：

#### 架构概览

```
用户浏览器 (Chrome Side Panel)
┌─────────────────────────────────────────────────────────────┐
│  TS Orchestrator (Node.js, 端口 8080)                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  TeamCoordinator                                    │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐            │    │
│  │  │ Agent A │  │ Agent B │  │ Agent C │  ...        │    │
│  │  │ local   │  │ remote  │  │ local   │            │    │
│  │  └────┬────┘  └────┬────┘  └────┬────┘            │    │
│  │       │            │            │                  │    │
│  │  ┌────▼────┐  ┌────▼────┐  ┌────▼────┐            │    │
│  │  │ Local   │  │ Router  │  │ Local   │            │    │
│  │  │ Toolkit │  │ Factory │  │ Toolkit │            │    │
│  │  └─────────┘  └────┬────┘  └─────────┘            │    │
│  └─────────────────────┼───────────────────────────────┘    │
│                        │                                     │
└────────────────────────┼─────────────────────────────────────┘
                         │ HTTP POST /execute
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Python Executor (端口 8767)                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  RemoteToolkitRouter → ToolExecutor                 │    │
│  │  (文件操作、Git、搜索、测试等)                         │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

#### 核心组件

| 组件 | 文件 | 职责 |
|------|------|------|
| **IToolkitRouter** | `orchestrator/src/toolkit/router.ts` | 工具路由接口 + RouterFactory 工厂 |
| **LocalToolkitRouter** | `orchestrator/src/toolkit/local.ts` | 本地 Node.js 执行 (child_process) |
| **RemoteToolkitRouter** | `orchestrator/src/toolkit/remote.ts` | 远端 Python Executor HTTP 调用 |
| **HybridToolkitRouter** | `orchestrator/src/toolkit/hybrid.ts` | 混合路由策略 |
| **ExecutorClient** | `orchestrator/src/executor/client.ts` | Python Executor HTTP 客户端 |

#### Per-Agent 路由机制

每个 TeamMember 独立标记 `location: 'local' | 'remote'`，RouterFactory 按 `member.location` 返回对应 router：

```typescript
// orchestrator/src/toolkit/router.ts
interface IToolkitRouter {
  executeToolCall(call: ToolCall): Promise<ToolResult>;
}

class RouterFactory {
  constructor(
    private localRouter: LocalToolkitRouter,
    private remoteRouter: RemoteToolkitRouter
  ) {}

  getRouterForMember(member: TeamMember): IToolkitRouter {
    return member.location === 'local' 
      ? this.localRouter 
      : this.remoteRouter;
  }
}
```

#### 前端 UI 集成

CeoChatPanel.tsx 提供 Per-Agent Location 选择：

- `roleLocations` state: `Record<string, 'local' | 'remote'>`
- 每个已选角色旁有独立 💻(本地) / ☁️(远端) 徽章
- WebSocket 发送 `role_locations` alongside meeting start
- 用户可任意组合 team 成员的执行位置

#### 执行流程

```
1. 用户在前端选择角色 + 位置 (local/remote)
2. 前端发送 start_meeting + role_locations
3. Orchestrator 创建 Team，每个 member 带 location 标记
4. Coordinator 调用工具时:
   - local → LocalToolkitRouter → Node.js child_process 执行
   - remote → RemoteToolkitRouter → HTTP POST 到 Python Executor
5. 结果统一返回给 LLM 继续推理
```

#### 配置方式

```bash
# CLI 启动时指定默认路由
node orchestrator/src/cli.ts --executor=http://localhost:8767

# 环境变量
EXECUTOR_URL=http://localhost:8767
EXECUTOR_TOKEN=your_token_here
```

#### 安全机制

- **API Token 认证**: Executor 通过 Bearer token 验证请求
- **工作区隔离**: 每个智能体独立工作区目录
- **路径遍历保护**: 所有文件操作限制在工作区内
- **Shell 命令白名单**: 只允许预定义的安全命令

### 3. 投票决策系统

- 支持 3 种共识策略: simple_majority / weighted_vote / argument_based
- 提案 → 投票 → 共识评估 → 执行

### 4. 人工审批流程

- 高危操作（bash、git_push 等）需要人工审批
- 异步等待 + 超时处理
- 前端 `useApproval` hook 集成

### 5. 检查点系统

- 任务执行状态的保存与恢复
- 支持会议快照的保存和恢复
- 断点续跑能力

### 6. 技能进化

- 项目执行过程中积累经验
- 经验提炼器从执行日志中提取规则
- 项目结束时生成可复用的技能包

### 7. 跨网络协作

- 本地TS智能体与远端Python/TS智能体的消息路由
- 智能体发现服务 - 发现网络中的可用智能体
- 工作区同步器 - 同步本地和远端的工作区状态
- 心跳检测 - 监控智能体在线状态

---

## 安全机制

1. **路径遍历保护**: 所有文件操作限制在工作区目录内
2. **Shell 命令白名单**: 只允许预定义的安全命令
3. **危险工具标记**: 标记潜在危险操作，需要额外确认
4. **超时控制**: 长时间运行的命令自动超时
5. **审计日志**: 所有操作记录审计追踪
6. **API Token 认证**: Executor 通过 Bearer token 验证请求
7. **双签名机制**: 高危操作需 dual-signature 确认
8. **文件锁定**: 工作区同步时的文件锁定机制

---

## 常见问题

### API Key 配置

如果遇到 "未配置API密钥" 错误，检查以下位置：
1. `.env` 文件中的 `DEEPSEEK_API_KEY`
2. 前端 localStorage 中的 `deepseek_api_key`
3. WebSocket 会话中的 `api_key`

### WebSocket 连接

- 默认连接: `ws://localhost:8765/ws`
- 确保后端服务已启动
- 检查防火墙设置

### 工具执行失败

- 检查工作区路径是否正确
- 确认工具权限配置
- 查看后端日志获取详细错误信息

---

## 相关文档

- [Agent 角色配置](docs/agent-roles.md)
- [Agent 工具系统](docs/agent-tools.md)
- [设计文档](docs/design.md)
- [用户指南](docs/user-guide.md)
- [集成测试报告](docs/integration-test-report.md)
- [Docker 部署指南](DOCKER_README.md)
- [项目规则](project_rules.md)
