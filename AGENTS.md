# AGENTS.md - 大荒界 (Matrix DaHuang) 智能体系统指南

## 项目概述

**大荒界 (MDH)** 是一个基于 React + Python FastAPI + AgentScope 的全领域智能体协作系统。用户派发任务后，CEO 智能体利用意图识别引擎拆解任务，动态组建智能体团队并行执行，并由专门的审查智能体把控开发进度与作品完成度；每个领域智能体在使用中不断总结提升自己的技能（skill），技能随用随进化。

### 核心定位
- **意图驱动的任务派发**: 用户派发任务 → CEO 智能体利用意图识别引擎拆解任务（两层复杂度判定：规则引擎 + LLM；四维加权路由：关键词/语义/成功率/优先级）
- **动态团队组装**: 按拆解结果智能创建智能体团队——通过预配置的角色模板组装，或直接选取工具创建
- **并行任务执行**: 任务派发后由团队成员并行执行；复杂任务按 DAG 工作流调度（顺序/并行/混合三种策略）
- **审查智能体把控**: 团队中指定审查智能体全程把控开发进度与作品完成度，输出审查意见并驱动迭代
- **技能随用随进化**: 每个领域智能体对自己使用的技能进行总结提升，技能持久进化，下次加载的是提升后的版本，而非重新加载旧技能
- **虚拟办公室可视化**: 3D 科技大厦场景，实时展示智能体状态
- **本地/远端智能体混合执行**: 每个智能体可独立选择在用户浏览器本地(Node.js)或远端(Python Executor)执行工具调用

---

## 系统架构

### 6层架构链

```
用户需求 → CEO Agent → Project Manager → Team → Role Agent → Skill Pack → Toolkit
```

| 层 | 组件 | 说明 |
|---|---|---|
| L1 | CEO Agent | 意图识别、任务拆解、团队组建决策、任务派发 |
| L2 | Project Manager | 项目创建、技能加载、实例管理 |
| L3 | Team | 团队组装、角色分配、位置选择 |
| L4 | Role Agent | 角色实例、LLM 调用、工具执行、技能总结提升 |
| L5 | Skill Pack | 技能加载、经验注入、技能增量区（随用随进化） |
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
│   ├── meeting_coordinator.py    # 会议协调器（复杂任务协作实现）
│   ├── ceo_agent.py              # CEO 智能体
│   ├── semantic_analyzer.py      # 语义分析器 (DynamicRouter + LLM)
│   ├── complexity_classifier.py  # 复杂度分类器 (规则+LLM 两层)
│   ├── dynamic_router.py         # 动态路由器 (四维加权)
│   ├── simple_executor.py        # 简单任务轻量执行器
│   ├── team.py                   # Team/TeamMember 数据模型
│   ├── team_assembler.py         # TeamAssembler (DAG→Team)
│   ├── project_manager.py        # 项目管理器
│   ├── meeting.py                # 会议会话 + 角色映射
│   ├── discussion_manager.py     # 串行讨论管理器
│   ├── mixed_location_discussion.py # 混合位置并行讨论
│   ├── negotiation.py            # 投票决策引擎
│   ├── agenda.py                 # 议程状态机
│   ├── workflow_engine.py        # 工作流引擎 (DAG执行)
│   ├── task_orchestrator.py      # 任务编排器
│   ├── review_pipeline.py        # 审查流水线 (CriticAgent + GroundingAgent)
│   ├── agent_bridge.py           # TS-Python 桥接
│   ├── cross_network_bridge.py   # 跨网络智能体桥接
│   ├── agent_discovery.py        # 智能体发现服务
│   ├── workspace_sync.py         # 工作区同步器
│   ├── workspace_manager.py      # 工作区管理
│   ├── approval_manager.py       # 审批管理器
│   ├── security.py               # 安全中间件
│   ├── compensation.py           # 检查点管理
│   ├── agent_toolset.py          # Agent 工具集
│   ├── tool_executor.py          # 工具执行器
│   ├── tool_registry.py          # 工具注册表
│   ├── skill_registry.py         # 技能注册中心
│   ├── skill_packager.py         # 技能打包器
│   ├── experience_extractor.py   # 经验提炼器
│   ├── roles_config.yaml         # 角色配置 (1973行，定义所有角色)
│   ├── llm_cache.py              # LLM 响应缓存 (MD5 key, TTL 300s, LRU)
│   ├── message_queue.py          # 异步消息队列 (SQLite 持久化)
│   ├── spec_manager.py           # 规格管理器
│   ├── spec_tree.py              # Spec Tree 数据结构
│   ├── gate_manager.py           # 确定性门禁管理器
│   ├── ears_validator.py         # EARS 验收句式校验
│   ├── evidence_chain.py         # 证据链追踪
│   ├── fallback_chain.py         # 回退链机制
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

角色模板是动态团队组装的基础：CEO 按任务拆解结果从预配置的角色模板中选取角色组建团队，也可以直接选取工具创建团队角色；每个角色实例独立挂载技能与工具权限。

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

### 执行主线

用户派发任务后，系统按以下主线协作：

```
用户派发任务
    ↓
CEO 智能体（意图识别引擎拆解任务）
    ↓
动态组建智能体团队（预配置角色模板 / 直接选取工具）
    ↓
并行派发执行（DAG 工作流调度：顺序/并行/混合）
    ↓
审查智能体把控开发进度与作品完成度
    ↓
各领域智能体对所用技能总结提升（技能随用随进化）
```

| 阶段 | 负责人 | 说明 |
|------|--------|------|
| 意图识别与任务拆解 | CeoAgent + SemanticAnalyzer | 两层复杂度判定（规则引擎 + LLM）识别意图，拆解为可执行的子任务 |
| 团队组装 | TeamAssembler | 按拆解结果从预配置角色模板中选取角色（或直接选取工具）动态组建团队 |
| 并行派发执行 | WorkflowEngine / TaskOrchestrator | 子任务并行派发给团队成员执行；复杂任务按 DAG 调度 |
| 审查把控 | Reviewer（审查智能体） | 全程把控开发进度与作品完成度，输出审查意见，驱动迭代（最多 3 轮） |
| 技能总结提升 | 各领域智能体 | 对自己使用的技能进行总结提升，持久保存，下次加载提升后的版本 |

### 路径选择

系统根据任务复杂度动态选择执行路径：

| 路径 | 触发条件 | 流程 |
|------|----------|------|
| **简单路径** | `level=="simple" && confidence>=0.7` | CEO → SimpleExecutor → 单人助理 → 直接执行 → 轻量验收 |
| **复杂路径** | 其余情况（默认宁重勿轻） | CEO 拆解 → 团队组装 → 并行派发执行 → 审查把控 → 技能总结提升 |

- 复杂路径内部，SemanticAnalyzer 检测到跨部门复杂任务时生成 WorkflowDefinition（DAG），由 WorkflowEngine 按顺序/并行/混合三种策略执行（详见"工作流引擎"章节）。
- 简单路径验收失败时自动升级为复杂路径（`upgrade_to_complex`）。

### 各路径详细流程

#### 简单路径

| 阶段 | 负责人 | 说明 |
|------|--------|------|
| 复杂度判定 | ComplexityClassifier | 规则引擎快速匹配，置信度 >= 0.7 时直接走简单路径 |
| 直接执行 | SimpleExecutor | 单人助理使用工具直接完成任务 |
| 轻量验收 | SimpleExecutor | 检查工具错误和结果非空 |
| 路径升级 | CeoAgent | 验收失败时自动升级为复杂路径 |

#### 复杂路径（含工作流分支）

| 阶段 | 负责人 | 说明 |
|------|--------|------|
| 意图拆解 | CeoAgent + SemanticAnalyzer | 语义分析识别意图，检测跨部门复杂任务，拆解子任务并生成 WorkflowDefinition（DAG） |
| 团队组装 | TeamAssembler | 按拆解结果从预配置角色模板选取角色（或直接选取工具）动态组装 Team |
| 工作区确认 | CeoAgent | 询问用户选择工作区类型（独立工作区 / Git Worktree） |
| 并行派发执行 | WorkflowEngine / Executor | DAG 调度（顺序/并行/混合），团队成员并行执行，支持本地/远端混合执行 |
| 审查把控 | Reviewer（CriticAgent + GroundingAgent） | 审查智能体把控开发进度与作品完成度，代码审查 + 接地验证，最多 3 轮迭代 |
| 技能总结提升 | ExperienceExtractor + SkillPackager | 各领域智能体总结提升所用技能，写入增量区；项目结束可打包升级版技能包 |

### 辅助机制：讨论与投票（可选）

当方案存在分歧、需要多方决策时，团队成员可启动讨论与投票作为辅助决策手段（非默认主线）：

| 阶段 | 负责人 | 说明 |
|------|--------|------|
| 并行讨论 | 团队成员 | asyncio.gather 并行讨论，多轮收敛判定（立场一致性 + 置信度阈值 > 0.8） |
| 经验注入 | ExperienceExtractor | 检索相关经验规则注入讨论上下文 |
| 投票 | NegotiationEngine | 基于讨论 stance 和 confidence 投票（simple_majority / weighted_vote / argument_based） |
| 共识后执行 | 团队 | 达成共识后按主线派发执行 |

---

## 复杂度判定与执行路径

系统自动判定任务复杂度，选择不同执行路径：

### 两层分类器 (ComplexityClassifier)

`complexity_classifier.py` 实现两层判定策略：

#### 第一层：规则引擎（快速）

```python
# 简单模式匹配 (SIMPLE_PATTERNS)
r'打开\s*\S+', r'搜索\s*\S+', r'点击\s*\S+', r'截图', ...

# 复杂模式匹配 (COMPLEX_PATTERNS)
r'首先.*然后.*最后', r'前端.*后端', r'设计.*开发', r'工作流', ...

# 跨部门关键词计数
CROSS_DEPT_KEYWORDS = ['前端', '后端', '数据库', '测试', '部署', ...]
# >= 2 个关键词 → complex (confidence=0.9)

# 动词计数
VERBS = ['设计', '开发', '实现', '测试', '部署', '分析', ...]
# >= 3 个动词 → complex (confidence=0.85)
```

#### 第二层：LLM 语义分析（精确）

当规则引擎置信度 < 0.7 时，调用 CEO 模型进行语义分析：

```python
prompt = "请分析以下用户消息的任务复杂度..."
# 返回: {"level": "simple/complex", "confidence": 0.0-1.0, "reason": "..."}
```

#### 降级策略

如果规则引擎和 LLM 均无法确定，默认走复杂路径（宁重勿轻）。

### 动态路由 (DynamicRouter)

`dynamic_router.py` 实现四维加权路由：

```python
final_score = keyword_score * 0.4    # 关键词匹配
            + semantic_score * 0.3   # 语义相似度（Jaccard）
            + success_rate * 0.2     # 历史成功率（自适应学习）
            + priority * 0.1         # 部门优先级
```

**关键特性**：
- 支持中英文混合分词（英文正则 + 中文 2-4 字滑动窗口）
- 路由表持久化为 JSON，线程安全读写
- `update_stats(dept_id, success)` 更新部门成功率，实现自适应学习
- 置信度计算：top-2 分数差 + 基础分数

### 语义分析器 (SemanticAnalyzer)

`semantic_analyzer.py` 整合 DynamicRouter 和 LLM：

```
用户消息 → DynamicRouter.route() → 路由结果
         → _detect_complex_task() → 复杂任务检测
         → LLM 意图分析 → SemanticAnalysisResult
```

**复杂任务检测**：匹配跨部门关键词组合、多步骤动词（>=3）、依赖关系描述

**工作流生成**：检测到复杂任务时，自动生成 WorkflowDefinition（DAG），包含前端/后端/测试/部署节点

### 执行路径

| 路径 | 触发条件 | 流程 |
|------|----------|------|
| **简单路径** | `level=="simple" && confidence>=0.7` | CEO → SimpleExecutor → 单人助理 → 直接执行 → 轻量验收 |
| **复杂路径** | 其余情况（默认宁重勿轻） | CEO 拆解 → 团队组装 → 并行派发执行 → 审查把控 → 技能总结提升 |
| **工作流分支** | `is_workflow==true`（跨部门复杂任务，复杂路径内子分支） | SemanticAnalyzer → WorkflowEngine → DAG 执行（顺序/并行/混合） |
| **讨论投票（辅助）** | 复杂任务存在方案分歧时可选 | 并行讨论 → 投票收敛 → 按主线派发执行 |

### 简单任务特征

- 创建/修改少量文件（1-3个）
- 单步浏览器操作（打开、搜索、点击）
- 简单脚本、配置文件修改
- 读取/查看操作

### 路径升级机制

简单路径执行失败时，自动升级为复杂路径：

```python
# simple_executor.py
if result.retry_with_complex:
    upgrade_result = await self.upgrade_to_complex(session, content, send_progress)
    return {"type": "task_result", "path_used": "complex", "upgraded_from": "simple"}
```

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

技能的定位是**随用随进化**：每个领域智能体在执行任务时，对自己使用的技能（skill）进行总结提升；技能持久保存，下一次加载的即是提升后的版本，而不是每次重新加载旧的技能。

1. **技能加载**: 智能体组建时加载自身领域的最新技能（基础技能 + 历次总结提升的增量）
2. **使用中总结提升**: 执行过程中，智能体对自己使用的技能进行总结——记录成功方案、踩坑与解法，提炼为可复用的经验规则
3. **经验注入**: 后续任务执行时自动检索并注入相关经验规则，避免重复踩坑
4. **技能持久化**: 总结提升的规则写入技能增量区，作为该技能的持久改进；项目结束时可合并打包（含脱敏），生成可复用、可分享的升级版技能包

实现细节（Copy-on-Write）：技能以"只读基础 + 可写增量"组织，增量区承载每次总结提升，避免直接改写基础技能。

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

## 并行讨论机制

> 讨论与投票是复杂决策的**可选辅助机制**，主线执行流程见"协作流程"章节。

生产路径由 `mixed_location_discussion.py` 的 `MixedLocationDiscussion` 实现真正的并行智能体讨论；并行实现的独立版本已移除（生产走 MixedLocationDiscussion）。

#### 核心机制

```python
# 使用 asyncio.gather 实现并行
async with asyncio.Semaphore(max_concurrent):  # 并发控制（默认5）
    results = await asyncio.gather(*agent_tasks, return_exceptions=True)

# 每个智能体有独立的超时控制
response = await asyncio.wait_for(agent.reply(msg), timeout=timeout)
```

#### 多轮收敛判定

讨论不是简单的"所有人同时发言"，而是有收敛判定的迭代过程：

```python
def _evaluate_convergence(stances, confidences):
    # 1. 所有立场一致 → 达成共识
    if all(s == stances[0] for s in stances):
        return True
    # 2. 平均置信度 > 0.8 → 达成共识
    if mean(confidences) > 0.8:
        return True
    # 3. 否则继续下一轮讨论
    return False
```

#### 立场解析

从 LLM 响应中解析结构化立场：

```python
# 支持的立场标签
[STANCE:support]   # 支持
[STANCE:oppose]    # 反对
[STANCE:modify]    # 修改建议
[STANCE:neutral]   # 中立

# 置信度标签
[CONFIDENCE:0.85]  # 0.0-1.0
```

### MixedLocationDiscussion

`mixed_location_discussion.py` 支持混合位置的并行讨论：

- 追踪每个 TeamMember 的 `local` / `remote` 位置
- 使用相同的 `asyncio.gather` 并行模式
- 支持位置感知的日志和统计

### 讨论与投票的集成

讨论结果直接影响投票行为：

```python
# meeting_coordinator.py
for dr in discussion_results:
    stance = dr.get("stance", "neutral")
    if stance == "support":
        vote_approve = True
    elif stance == "oppose":
        vote_approve = False
    elif stance == "modify":
        vote_approve = True  # 有条件批准
    elif stance == "neutral":
        vote_approve = confidence >= 0.4  # 中立时根据置信度决定
```

---

## 工作流引擎

### WorkflowEngine

`workflow_engine.py` 实现基于 DAG 的工作流执行：

#### 三种执行策略

| 策略 | 方法 | 说明 |
|------|------|------|
| **顺序执行** | `_execute_sequential` | Kahn 拓扑排序，按依赖顺序执行 |
| **并行执行** | `_execute_parallel` | BFS 层级执行，`asyncio.gather` 并发 |
| **混合执行** | `_execute_mixed` | 无条件节点并行，条件节点顺序 |

#### DAG 节点与边

```python
@dataclass
class WorkflowNode:
    node_id: str
    task_description: str
    dept_id: str              # 部门映射
    status: WorkflowNodeStatus  # PENDING/RUNNING/COMPLETED/FAILED/SKIPPED

@dataclass
class WorkflowEdge:
    source_node_id: str
    target_node_id: str
    condition: str = ""       # 条件表达式（可选）
```

#### 工作流生成

SemanticAnalyzer 根据用户消息自动生成工作流：

```python
# semantic_analyzer.py
def _generate_workflow_definition(user_message, routing_decision):
    nodes = []
    edges = []

    # 根据关键词检测需要的部门
    if '前端' in user_message:
        nodes.append(WorkflowNode(dept_id="dept-frontend", ...))
    if '后端' in user_message:
        nodes.append(WorkflowNode(dept_id="dept-backend", ...))
    if '测试' in user_message:
        nodes.append(WorkflowNode(dept_id="dept-qa", ...))
    if '部署' in user_message:
        nodes.append(WorkflowNode(dept_id="dept-devops", ...))

    # 按部门顺序创建边
    dept_order = ["dept-frontend", "dept-backend", "dept-qa", "dept-devops"]
    # ... 创建顺序边 ...

    return WorkflowDefinition(
        execution_strategy="mixed",  # 默认混合策略
        nodes=nodes,
        edges=edges,
    )
```

#### 条件分支与跳过传播

```python
# 条件评估
def _evaluate_simple_condition(condition, results):
    # 支持 "field=value" 和 "field!=value" 表达式
    ...

# 跳过传播：当节点被跳过时，递归跳过所有下游节点
def _propagate_skip(node_id, edges, nodes):
    for edge in edges:
        if edge.source_node_id == node_id:
            nodes[edge.target_node_id].status = SKIPPED
            _propagate_skip(edge.target_node_id, edges, nodes)
```

#### 生命周期管理

```python
# 支持暂停/恢复/取消
await engine.pause_workflow(workflow_id)
await engine.resume_workflow(workflow_id)
await engine.cancel_workflow(workflow_id)

# 失败节点重试
await engine.retry_node(workflow_id, node_id)
```

---

## 动态团队组装

### TeamAssembler

`team_assembler.py` 从 DAG 动态组装 Team：CEO 按任务拆解结果确定所需角色（预配置角色模板），用户也可手动选择角色组合；组装流程如下：

#### 组装流程

```
用户选择角色 (selected_roles)
    ↓
_build_dag(selected_roles, roles_config, task_description, role_locations)
    ↓
ProjectManager.instantiate_project(project_id, dag)
    ↓
TeamAssembler.assemble_from_dag(dag, project_id, runtime)
    ↓
Team (包含 TeamMember 列表，每个成员有 location 标记)
```

#### 技能到角色的映射

```python
SKILL_TO_TEAM_ROLE = {
    "frontend_dev": "Executor",
    "backend_dev": "Executor",
    "fullstack_dev": "Executor",
    "testing": "Reviewer",
    "code_review": "Reviewer",
    "architecture": "Planner",
    "task_decomposition": "Planner",
    "progress_tracking": "Coordinator",
    # ...
}
```

#### 角色选择策略

```python
def _select_roles_for_dag(dag):
    needed_team_roles = set()
    needed_team_roles.add("Coordinator")  # 始终需要协调者

    for task in tasks:
        for skill in task.get("required_skills", []):
            team_role = SKILL_TO_TEAM_ROLE.get(skill, "Executor")
            needed_team_roles.add(team_role)

    # 每种 team_role 只选第一个匹配的角色，避免团队臃肿
    for role_name, role_config in self._base_roles.items():
        if role_config.get("team_role") in needed_team_roles:
            selected_roles.append((role_name, team_role))
            needed_team_roles.discard(team_role)

    return selected_roles
```

### 用户自定义团队

前端 `CeoChatPanel.tsx` 支持：

- 用户手动选择角色组合
- 每个角色独立选择执行位置（local/remote）
- 自动模式：系统根据任务自动选择角色

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
| `complexity_result` | 复杂度判定结果 (level, confidence, reason, method) |
| `path_selected` | 执行路径选择 (simple/complex) |
| `path_upgrade` | 路径升级通知 (from: simple, to: complex) |
| `workspace_confirm_request` | 工作区确认请求 (含建议类型和选项) |
| `workspace_created` | 工作区已创建 (workspace_id, path, branch) |
| `meeting_started` | 会议已启动 (meeting_id, agents, project_id) |
| `meeting_ended` | 会议已结束 |
| `meeting_error` | 会议错误通知 |
| `agent_message` | 智能体消息（含 delta 流式） |
| `task_auto_assigned` | 任务自动分配结果 |
| `task_assigned` | 任务已分派 |
| `workflow_executed` | 工作流执行结果 |
| `structured_feedback` | 结构化审查反馈 |
| `iteration_update` | 迭代状态更新 (current_iteration, max_iterations) |
| `review_completed` | 审查完成 (critic_result, grounding_result) |
| `task_result` | 任务最终结果 (path_used, success, written_files) |
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

### 动态路由器 (dynamic_router.py)

- 四维加权评分: keyword×0.4 + semantic×0.3 + success_rate×0.2 + priority×0.1
- 中英文混合分词: 英文正则 + 中文 2-4 字滑动窗口
- 路由表持久化: JSON 存储，线程安全读写（threading.Lock）
- 自适应学习: `update_stats(dept_id, success)` 更新部门成功率
- 置信度计算: top-2 分数差 + 基础分数

### 语义分析器 (semantic_analyzer.py)

- 整合 DynamicRouter + LLM 意图分析
- 复杂任务检测: 跨部门关键词组合、多步骤动词、依赖关系描述
- 工作流自动生成: 检测到复杂任务时生成 WorkflowDefinition（DAG）
- 回退策略: LLM 失败时使用路由结果（置信度 >= 0.6）

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
| **Python Backend** | Python + FastAPI | 8765 | 智能体协调（CEO 拆解/团队组装/审查）、投票审批（辅助）、技能进化 |
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

### 3. 讨论与投票决策系统（辅助机制）

- 复杂决策存在分歧时启用的可选辅助机制，主线为拆解→组队→并行执行→审查
- 并行讨论（stance + confidence 收敛判定）→ 提案 → 投票 → 共识评估 → 执行
- 支持 3 种共识策略: simple_majority / weighted_vote / argument_based

### 4. 人工审批流程

- 高危操作（bash、git_push 等）需要人工审批
- 异步等待 + 超时处理
- 前端 `useApproval` hook 集成

### 5. 检查点系统

- 任务执行状态的保存与恢复
- 支持会议快照的保存和恢复
- 断点续跑能力

### 6. 技能随用随进化

- 每个领域智能体对自己使用的技能进行总结提升，技能持久进化，下次加载提升后的版本
- 经验提炼器从执行记录中提取可复用的经验规则，写入技能增量区
- 项目结束时可合并基础与增量（含脱敏），生成可复用、可分享的升级版技能包

### 7. 跨网络协作

- 本地TS智能体与远端Python/TS智能体的消息路由
- 智能体发现服务 - 发现网络中的可用智能体
- 工作区同步器 - 同步本地和远端的工作区状态
- 心跳检测 - 监控智能体在线状态

### 8. 动态路由与意图识别

- **两层复杂度判定**：规则引擎（快速）+ LLM（精确），置信度阈值 0.7
- **四维加权路由**：keyword×0.4 + semantic×0.3 + success_rate×0.2 + priority×0.1
- **自适应学习**：`update_stats(dept_id, success)` 更新部门成功率
- **中英文混合分词**：英文正则 + 中文 2-4 字滑动窗口
- **路由表持久化**：JSON 存储，线程安全读写

### 9. 并行讨论与收敛判定（辅助决策机制）

- **asyncio.gather 并行**：多智能体同时讨论，信号量控制并发（默认5）
- **多轮收敛判定**：立场一致性 + 置信度阈值（>0.8）判断是否达成共识
- **结构化解析**：从 LLM 响应中提取 `[STANCE:support/oppose/modify/neutral]` 和 `[CONFIDENCE:0.0-1.0]`
- **讨论→投票集成**：讨论 stance 直接映射为投票行为

### 10. DAG 工作流引擎

- **三种执行策略**：顺序（Kahn拓扑排序）、并行（BFS层级+asyncio.gather）、混合（无条件并行+条件顺序）
- **自动生成**：SemanticAnalyzer 根据跨部门关键词自动生成 WorkflowDefinition
- **条件分支**：支持 `field=value` 和 `field!=value` 条件表达式
- **跳过传播**：节点被跳过时，递归跳过所有下游节点
- **生命周期管理**：暂停/恢复/取消/重试

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
