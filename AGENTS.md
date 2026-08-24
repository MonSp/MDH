# AGENTS.md - 大荒界 (Matrix DaHuang) 智能体系统指南

## 项目概述

**大荒界 (MDH)** 是一个基于 React + Python FastAPI + AgentScope 的全领域智能体协作系统。用户派发任务后，CEO 智能体利用意图识别引擎拆解任务，动态组建智能体团队并行执行，并由专门的审查智能体把控开发进度与作品完成度；每个领域智能体在使用中不断总结提升自己的技能（skill），技能随用随进化。

### 核心定位
- **意图驱动的任务派发**: 用户派发任务 → CEO 智能体利用意图识别引擎拆解任务（两层复杂度判定：规则引擎 + LLM；五维加权路由 + 自适应加成：关键词/语义/成功率/优先级/技能等级）
- **动态团队组装**: 按拆解结果智能创建智能体团队——通过预配置的角色模板组装，或直接选取工具创建
- **并行任务执行**: 任务派发后由团队成员并行执行；复杂任务按 DAG 工作流调度（顺序/并行/混合三种策略）
- **审查智能体把控**: 团队中指定审查智能体全程把控开发进度与作品完成度，输出审查意见并驱动迭代
- **技能随用随进化**: 每个领域智能体对自己使用的技能进行总结提升，技能持久进化，下次加载的是提升后的版本，而非重新加载旧技能
- **虚拟办公室可视化**: 3D 科技大厦场景，实时展示智能体状态
- **本地/远端智能体混合执行**: 每个智能体可独立选择在用户浏览器本地(Node.js)或远端(Python Executor)执行工具调用

### 版本历史

| 版本 | 日期 | 主题 |
|------|------|------|
| **1.0.0** | 2026-08-14 | 初始版本基线（项目启动至产品定型） |
| **1.1.0** | 2026-08-16 | 会议纪要全链路 + 资产沉淀闭环（M3/M4/M5） |
| **1.2.0** | 2026-08-17 | 调研驱动 14 项全栈改进 + 技能市场三阶段 + 模型自产工作流 |
| **1.2.1** | 2026-08-18 | Bug fixes + Docker healthcheck + 路由模块就绪 |
| **1.2.2** | 2026-08-19 | TS 能力补齐（HITL/LLM 守卫/渐进加载/4 新 LLM 提供商） + server.py 端点迁移 |
| **1.3.0** | 2026-08-19 | Playwright 浏览器自动化（25 工具，TS + Python 双端） |
| **1.3.1** | 2026-08-19 | 前端架构治理（handler 拆分 5 模块 + Zustand store + 52 测试） |
| **1.3.2** | 2026-08-20 | 大文件拆分（16 文件 -3500 行） + code review 修复 |
| **1.3.3** | 2026-08-20 | 循环导入修复 + 类型安全（any 清零） |
| **1.3.4** | 2026-08-20 | 资产-技能协作闭环增强（人工审核/资产编辑/复用率仪表盘/双端注入） |
| **1.3.5** | 2026-08-20 | 规则有效性追踪 + 自动降级 + 告警 + 统计报表 + 报表导出 |
| **1.3.6** | 2026-08-20 | 跨团队技能共享质量门禁 + 自适应路由闭环修复 |
| **1.4.0** | 2026-08-20 | 数字员工职业发展核心数据层（AgentProfile + XP + 技能树 + 角色晋升） |
| **1.4.1** | 2026-08-20 | 职业发展前端面板（CareerPathPanel + SkillTreeView + 部门筛选） |
| **1.5.0** | 2026-08-21 | 路由感知技能等级 + 晋升驱动任务分配 + 真实 AI 闭环验证 |
| **1.5.6** | 2026-08-22 | 规则自进化（低分规则自动生成改进版） |
| **1.5.7** | 2026-08-22 | 联动进化（规则→资产→技能网络级联更新） |
| **1.5.8** | 2026-08-22 | 反思优先级队列（自驱动选择反思目标） |
| **1.5.9** | 2026-08-22 | 抗过拟合（多样性检查+老化+探索/利用平衡） |
| **1.5.10** | 2026-08-22 | 多团队进化联邦（信任评分+智能订阅+跨团队有效性） |
| **1.5.11** | 2026-08-22 | CI/CD 进化健康度门禁 + GitHub Actions |
| **1.5.12** | 2026-08-22 | 能力边界感知（置信度地图+未知领域检测） |
| **1.5.13** | 2026-08-22 | 系统自省（功能利用率+模块健康度+改进提案） |
| **1.5.14** | 2026-08-22 | 人机协作反馈回路（结构化反馈→规则转化） |
| **1.5.15** | 2026-08-22 | 前端协作改进（内联反馈+技能徽章+进化通知） |
| **1.5.16** | 2026-08-22 | 文档感知协作（文档解析+上下文注入） |
| **1.5.17** | 2026-08-22 | 活文档协作（代码感知+数据感知+产出物追踪） |
| **1.5.18** | 2026-08-22 | Agent 持久记忆（持久记忆文件+自动摘要+老化） |
| **1.5.19** | 2026-08-22 | 跨会话学习闭环（任务前检索+任务后写入） |
| **1.5.20** | 2026-08-22 | 自主交付（Git交付+通知+报告） |
| **1.5.21** | 2026-08-22 | Agent 自省优化（表现分析+弱项识别） |
| **1.5.22** | 2026-08-22 | 主动式监控（健康巡检+风险预警） |
| **1.5.23** | 2026-08-22 | 团队协同优化（协同分析+瓶颈识别） |
| **1.5.24** | 2026-08-22 | 端到端集成验证（4 条链路 8 个测试） |
| **1.6.3** | 2026-08-22 | API 文档与一致性（OpenAPI 标签分组 + CHANGELOG 同步） |
| **1.6.4** | 2026-08-22 | 性能优化与缓存（TTLCache + 热数据缓存） |
| **1.6.5** | 2026-08-22 | 开发者体验（Makefile + 架构文档） |
| **1.6.6** | 2026-08-22 | 多租户基础（租户管理 + 团队级 API key） |
| **1.6.7** | 2026-08-22 | 多模型支持（9 个提供商 + 模型路由 + 自动降级） |
| **1.6.8** | 2026-08-22 | Webhook 集成（事件注册 + 签名验证 + 投递日志） |
| **1.6.9** | 2026-08-22 | 集成验证 + 文档同步 |
| **1.6.10** | 2026-08-22 | E2E 测试强化（5 条关键路径 14 个测试） |
| **1.6.11** | 2026-08-22 | 错误处理标准化（标准错误码 + 静默异常修复） |
| **1.6.12** | 2026-08-24 | 季度路线图 18 项 + v1.6.x 审查 14 项修复 + 评测基准 + 性能优化 |
| **1.7.0** | 2026-08-26 | Agent OS 架构：A2A 协议基础设施 + TS Orchestrator 瘦身 + 双层状态同步 |
| **1.7.1** | 2026-08-26 | Claude Code A2A 适配器 + A2A 生产加固（SSRF 防护/Prometheus 指标/HTTP 复用） |
| **1.7.2** | 2026-08-26 | E2E A2A 测试 (31项) + 前端 A2A 管理面板 + Docker Claude Code 适配器 + AGENTS.md 架构更新 |
| **1.7.3** | 2026-08-26 | AGENTS.md 架构全面更新 + 前端 A2A 面板接入导航 + TS Orchestrator 清理 |
| **1.7.4** | 2026-08-26 | A2A WebSocket 实时推送 + Orchestrator 遗留清理 + 冒烟测试 |
| **1.7.5** | 2026-08-26 | A2A 任务可观测性（日志+耗时指标）+ E2E 验证增强（31→40 项） |
| **1.7.6** | 2026-08-26 | A2A 代码审查修复（SSRF DNS 防护/内存泄漏/阻塞修复/URL 可配置/认证绕过） |
| **1.7.7** | 2026-08-26 | A2A 代码审查收尾（async 回调/死连接清理/废弃 API/并发防护/差异文档化） |
| **1.8.0** | 2026-08-26 | 智能调度：A2A 自动路由集成（SimpleExecutor A2A 路径 + 前端执行偏好 + E2E 测试） |
| **1.8.1** | 2026-08-26 | A2A 经验闭环（A2APostProcessor：经验提炼 + XP 授予 + 记忆写入 + 路由统计） |
| **1.8.2** | 2026-08-26 | A2A 路由质量提升（阈值 0.7 + 本地执行守卫 + execution_preference 端到端传递） |
| **1.8.3** | 2026-08-26 | A2A 经验闭环修复（AgentProfileManager 接入 + XP 授予目标修正） |
| **1.8.4** | 2026-08-26 | 集成差距修复（SimpleExecutor 进化管线 + A2A API 签名修正 + Webhook 接入） |
| **1.8.5** | 2026-08-26 | 集成差距修复续（TeamSynergy 自动记录 + ProactiveMonitor 后台调度） |
| **1.8.6** | 2026-08-26 | 集成差距修复终章（AssetInjection 接入 MeetingCoordinator + CapabilityBoundary 接入任务流） |
| **1.8.7** | 2026-08-26 | A2A 代码审查 P1 修复（readBody 限制 + 竞态锁 + YAML→JSON + agent_id 可配置 + 重试机制） |
| **1.8.8** | 2026-08-26 | A2A 代码审查 P2 修复（10 项 Minor：未使用导入 + 健康持久化 + awaitable + 关键词去重 + Card 去重） |

详细变更记录见 [CHANGELOG.md](CHANGELOG.md)。

---

## 系统架构

### 6层架构链 + A2A 执行节点

```
用户需求 → CEO Agent → Project Manager → Team → Role Agent → Skill Pack → Toolkit
                                                                              ↓
                                                              A2A 协议 → 执行节点 (TS/Claude Code/...)
```

| 层 | 组件 | 说明 |
|---|---|---|
| L1 | CEO Agent | 意图识别、任务拆解、团队组建决策、任务派发 |
| L2 | Project Manager | 项目创建、技能加载、实例管理 |
| L3 | Team | 团队组装、角色分配、位置选择 |
| L4 | Role Agent | 角色实例、LLM 调用、工具执行、技能总结提升 |
| L5 | Skill Pack | 技能加载、经验注入、技能增量区（随用随进化） |
| L6 | Toolkit | 工具路由 (local/remote/hybrid) + A2A 执行节点调度 |

### 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | React 18 + TypeScript + Vite 6 + Three.js | 3D 虚拟办公室、实时通信 |
| 后端 | Python 3.11 + FastAPI + WebSocket | 智能体协调、工具执行 |
| AI 引擎 | AgentScope + DeepSeek API | 多模型支持 (DeepSeek/OpenAI/Anthropic/Gemini/Ollama 等 9 个提供商) |
| 测试 | Vitest (TS) + pytest (Python) | 1726 TS 测试用例（前端 1726 + orchestrator 214）+ 1759 Python 测试 |

### 项目结构

```
MDH/
├── src/                          # React + TypeScript 前端
│   ├── components/               # UI 组件
│   │   ├── techtower/            # 3D 科技大厦 (BuildingScene, TowerScene, SidePanel)
│   │   ├── office-team/          # 办公团队面板
│   │   │   ├── CeoChatPanel.tsx  # CEO 对话面板（含角色选择+位置选择）
│   │   │   ├── VotingPanel.tsx   # 投票面板
│   │   │   ├── ApprovalPanel.tsx # 审批面板
│   │   │   ├── CheckpointPanel.tsx # 检查点面板
│   │   │   ├── AuditLogPanel.tsx # 审计日志面板
│   │   │   ├── SkillMarketplace.tsx # 技能市场面板 (v1.2.0)
│   │   │   ├── AssetBrowserPanel.tsx # 资产浏览器面板
│   │   │   ├── McpConfigPanel.tsx # MCP 配置面板
│   │   │   ├── RoleEditorPanel.tsx # 角色编辑面板
│   │   │   ├── TaskAssignPanel.tsx # 任务分派面板
│   │   │   ├── HistoryPanel.tsx  # 历史记录面板
│   │   │   ├── MeetingChatPanel.tsx # 会议聊天面板
│   │   │   ├── AgendaPanel.tsx   # 议程面板
│   │   │   └── ...
│   │   ├── skill-evolution/      # 技能进化
│   │   │   ├── SkillEvolutionDashboard.tsx # 技能进化仪表盘
│   │   │   ├── SkillEvolutionPanel.tsx # 技能进化面板
│   │   │   ├── SkillRegistryPanel.tsx # 技能注册面板
│   │   │   ├── SkillPackagePreview.tsx # 技能包预览
│   │   │   ├── ExperienceRulePanel.tsx # 经验规则面板
│   │   │   ├── AgentProfilePanel.tsx # Agent 职业档案面板 (v1.4.1)
│   │   │   ├── CareerPathPanel.tsx # 部门职业路径面板 (v1.4.1)
│   │   │   ├── SkillTreeView.tsx   # 技能树可视化 (v1.4.1)
│   │   │   ├── RouteTablePanel.tsx # 路由表面板
│   │   │   └── ...
│   │   ├── cyberpunk/            # 赛博朋克视觉效果
│   │   ├── AgentRoleCard.tsx     # 智能体角色卡片
│   │   ├── AgentStatusPanel.tsx  # 智能体状态面板
│   │   ├── CollaborationVisualizer.tsx # 协作可视化
│   │   ├── ConversationStream.tsx # 对话流
│   │   ├── MeetingTable.tsx      # 会议桌
│   │   ├── TaskDecompositionGraph.tsx # 任务分解图
│   │   ├── WorkflowPanel.tsx     # 工作流面板
│   │   └── ...
│   ├── hooks/                    # React Hooks
│   │   ├── useMeetingSocket.ts   # WebSocket 会议通信
│   │   ├── useAgentSystem.ts     # TS 智能体系统
│   │   ├── useApproval.ts        # 审批队列
│   │   ├── useBrowserStorage.ts  # 浏览器存储
│   │   └── ...
│   ├── modules/                  # 核心模块 (60+ 模块)
│   │   ├── webSocketBridge.ts    # TS-Python 桥接
│   │   ├── agentCoordinator.ts   # 智能体协调器
│   │   ├── communicationBus.ts   # 消息总线
│   │   ├── taskAssigner.ts       # 任务分配器
│   │   ├── taskDecomposer.ts     # 任务分解器
│   │   ├── taskPlanner.ts        # 任务规划器
│   │   ├── taskScheduler.ts      # 任务调度器
│   │   ├── negotiationEngine.ts  # 投票协商引擎
│   │   ├── dynamicRouter.ts      # 动态路由器
│   │   ├── dynamicRouterLocal.ts # 本地动态路由器
│   │   ├── workflowEngine.ts     # 工作流引擎
│   │   ├── workflowEngineLocal.ts # 本地工作流引擎
│   │   ├── skillRegistry.ts      # 技能注册表
│   │   ├── skillPackager.ts      # 技能打包器
│   │   ├── skillPackagerLocal.ts # 本地技能打包器
│   │   ├── skillStore.ts         # 技能存储
│   │   ├── skillParser.ts        # 技能解析器
│   │   ├── experienceExtractor.ts # 经验提炼器
│   │   ├── careerDevelopment.ts  # 职业发展 API (v1.4.1)
│   │   ├── careerDevelopment.types.ts # 职业发展类型 (v1.4.1)
│   │   ├── experienceExtractorLocal.ts # 本地经验提炼器
│   │   ├── compensationEngine.ts # 补偿引擎
│   │   ├── checkpointManager.ts  # 检查点管理
│   │   ├── approvalQueue.ts      # 审批队列
│   │   ├── permissionManager.ts  # 权限管理
│   │   ├── deadlockDetector.ts   # 死锁检测
│   │   ├── metricsCollector.ts   # 指标收集
│   │   ├── speakingCoordinator.ts # 发言协调
│   │   ├── agentPool.ts          # 智能体池
│   │   ├── agentRegistry.ts      # 智能体注册表
│   │   ├── agentTypes.ts         # 智能体类型定义
│   │   ├── agentReferenceSystem.ts # 智能体引用系统
│   │   ├── agentDiscoveryLocal.ts # 本地智能体发现
│   │   ├── collaboration/        # 协作模块
│   │   │   ├── planner_agent.ts  # 规划智能体
│   │   │   ├── executor_agent.ts # 执行智能体
│   │   │   ├── critic_agent.ts   # 审查智能体
│   │   │   └── grounding_agent.ts # 接地智能体
│   │   ├── collaborationState.ts # 协作状态
│   │   ├── communicationProtocol.ts # 通信协议
│   │   ├── complexityClassifier.ts # 复杂度分类器
│   │   ├── configSchema.ts       # 配置模式
│   │   ├── conversationFlowController.ts # 对话流控制器
│   │   ├── crossNetworkBridgeLocal.ts # 本地跨网络桥接
│   │   ├── deadLetterQueue.ts    # 死信队列
│   │   ├── dependencyAnalyzer.ts # 依赖分析器
│   │   ├── earsValidator.ts      # EARS 验证器
│   │   ├── evidenceChain.ts      # 证据链
│   │   ├── fallbackChain.ts      # 回退链
│   │   ├── gateManager.ts        # 门禁管理器
│   │   ├── gitIntegration.ts     # Git 集成
│   │   ├── llmCache.ts           # LLM 缓存
│   │   ├── meetingProtocol.ts    # 会议协议
│   │   ├── messageQueue.ts       # 消息队列
│   │   ├── multiAgentConversation.ts # 多智能体对话
│   │   ├── officeStateManager.ts # 办公室状态管理
│   │   ├── officeWorkflow.ts     # 办公室工作流
│   │   ├── pageContextStore.ts   # 页面上下文存储
│   │   ├── parallelDiscussionManagerLocal.ts # 本地并行讨论管理
│   │   ├── projectManager.ts     # 项目管理器
│   │   ├── projectManagerLocal.ts # 本地项目管理器
│   │   ├── retry.ts              # 重试机制
│   │   ├── specTreeValidator.ts  # Spec Tree 验证器
│   │   ├── structuredLogger.ts   # 结构化日志
│   │   ├── traceContext.ts       # 追踪上下文
│   │   ├── workspaceSyncLocal.ts # 本地工作区同步
│   │   ├── codeExtractor.ts      # 代码提取器
│   │   └── ...
│   ├── services/                 # 服务层
│   │   ├── apiFetch.ts           # API 请求封装
│   │   ├── bashGuard.ts          # Bash 命令守卫
│   │   ├── browserStorage.ts     # 浏览器存储服务
│   │   ├── docxBuilder.ts        # DOCX 文档构建器
│   │   ├── pptxBuilder.ts        # PPTX 演示构建器
│   │   ├── electronStorage.ts    # Electron 存储服务
│   │   └── fileSystemStorage.ts  # 文件系统存储
│   └── ...
├── backend/                      # Python 后端
│   ├── server.py                 # FastAPI + WebSocket 服务
│   ├── meeting_coordinator.py    # 会议协调器（复杂任务协作实现）
│   ├── ceo_agent.py              # CEO 智能体
│   ├── semantic_analyzer.py      # 语义分析器 (DynamicRouter + LLM)
│   ├── complexity_classifier.py  # 复杂度分类器 (规则+LLM 两层)
│   ├── dynamic_router.py         # 动态路由器 (五维加权 + 自适应加成)
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
│   ├── approval_manager.py       # 审批管理器 + HITL 分级
│   ├── security.py               # 安全中间件
│   ├── compensation.py           # 检查点管理
│   ├── agent_toolset.py          # Agent 工具集
│   ├── tool_executor.py          # 工具执行器
│   ├── tool_registry.py          # 工具注册表
│   ├── skill_registry.py         # 技能注册中心
│   ├── skill_packager.py         # 技能打包器
│   ├── experience_extractor.py   # 经验提炼器
│   ├── roles_config.yaml         # 角色配置
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
│   │── protocol.py               # 全局数据结构与协议定义 (64 个类/函数)
│   ├── schemas.py                # REST API Pydantic 验证模型
│   ├── session.py                # WebSocket 会话管理
│   ├── config.py                 # 全局配置常量
│   ├── agent.py                  # AgentScope 智能体流式调用封装
│   ├── model_factory.py          # 共享 LLM Agent 创建工厂
│   ├── model_manager.py          # 模型生命周期管理 (创建/缓存/故障转移)
│   ├── gate_engine.py            # 确定性门禁引擎 (lint/test 检查)
│   ├── routing_stats_manager.py  # 路由统计管理器
│   ├── discussion_utils.py       # 讨论投影共享辅助函数
│   ├── code_extractor.py         # 代码块提取器
│   ├── employee_directory.py     # 员工目录
│   ├── git_integration.py        # Git 操作封装 (分支/commit/push/PR)
│   ├── template_confirmation.py  # 模板固化流程 (评测→把关→入库)
│   ├── minutes_workflow.py       # 会议纪要 DAG 构建
│   ├── agentscope_task_bridge.py # 工作流↔AgentScope Task 桥接
│   ├── executor_server.py        # 远端工具执行服务 (local/docker/nfs/s3)
│   ├── skill_evolution.py        # 技能进化接线 (反馈→经验→增量区)
│   ├── skill_generator.py        # AI 技能生成服务
│   ├── skills.py                 # 浏览器自动化技能管理
│   ├── llm_guard.py              # LLM 调用超时守卫 (v1.2.0)
│   ├── skill_bridge.py           # 统一技能加载接口 (v1.2.0)
│   ├── progressive_skill_loader.py # 四层渐进披露加载器 (v1.2.0)
│   ├── skill_router.py           # 技能路由桥接器 (v1.2.0)
│   ├── shared_experience_pool.py # 共享经验池管理器 (v1.2.0)
│   ├── skill_fork_manager.py     # 技能包 Fork 管理器 (v1.2.0)
│   ├── skill_exporter.py         # 技能包导入导出器 (v1.2.0)
│   ├── registry_client.py        # Git 注册表客户端 (v1.2.0)
│   ├── registry_server.py        # HTTP 注册表服务 (v1.2.0)
│   ├── migrate_skills.py         # 技能格式迁移工具 (v1.2.0)
│   ├── mcp_adapter.py            # MCP 协议集成适配器 (v1.2.0)
│   ├── mcp_config.py             # MCP 服务器配置管理器 (v1.2.0)
│   ├── mcp_server.py             # MDH 内置工具暴露为 MCP 服务器 (v1.2.0)
│   ├── asset_store.py            # 资产存储：知识库+模板库 (v1.2.0)
│   ├── asset_evaluator.py        # 资产入库前质量评测器 (v1.2.0)
│   ├── asset_judge.py            # LLM judge 资产质量评分 (v1.2.0)
│   ├── asset_judge_benchmark.py  # LLM judge 评测基准 (v1.2.0)
│   ├── asset_benchmark_gate.py   # LLM judge 质量 CI 门禁 (v1.2.0)
│   ├── asset_injection.py        # 会议节点注入团队资产 (v1.2.0)
│   ├── asset_search.py           # 三类资产合并检索 (v1.2.0)
│   ├── agent_profile_manager.py  # Agent 持久档案管理 (v1.4.0)
│   ├── agent_memory.py           # Agent 持久记忆 (v1.5.18)
│   ├── agent_optimizer.py        # Agent 自省优化 (v1.5.21)
│   ├── capability_boundary.py    # 能力边界感知 (v1.5.12)
│   ├── delivery_engine.py        # 自主交付引擎 (v1.5.20)
│   ├── document_parser.py        # 文档感知解析 (v1.5.16)
│   ├── human_feedback.py         # 人机协作反馈 (v1.5.14)
│   ├── knowledge_network.py      # 知识网络联动 (v1.5.7)
│   ├── live_document.py          # 活文档协作 (v1.5.17)
│   ├── proactive_monitor.py      # 主动式监控 (v1.5.22)
│   ├── reflection_priority.py    # 反思优先级队列 (v1.5.8)
│   ├── system_introspection.py   # 系统自省 (v1.5.13)
│   ├── team_federation.py        # 多团队进化联邦 (v1.5.10)
│   ├── team_synergy.py           # 团队协同优化 (v1.5.23)
│   ├── promotion_engine.py       # 角色晋升引擎 (v1.4.0)
│   ├── routers/                  # API 路由模块
│   │   ├── workflow.py           # 工作流 API
│   │   ├── marketplace.py        # 技能市场 API (v1.2.0)
│   │   ├── community.py          # 社区市场 API (v1.2.0)
│   │   ├── skills.py             # 技能管理 API
│   │   └── mcp_config.py         # MCP 配置 API (v1.2.0)
│   └── tests/                    # Python 测试 (89 测试文件)
├── orchestrator/                 # TS 编排器服务 (用户本地 Node.js)
│   └── src/
│       ├── cli.ts                # CLI 入口
│       ├── server.ts             # HTTP + WebSocket 服务
│       ├── agent/                # 智能体核心
│       │   ├── index.ts          # 智能体入口
│       │   ├── role-agent.ts     # 角色智能体
│       │   ├── system-prompt.ts  # 系统提示词
│       │   └── tools.ts          # 工具定义
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
│       ├── mcp/                  # MCP 客户端
│       │   └── client.ts         # MCP 客户端
│       └── loop/                 # 循环执行引擎
│           ├── loop.ts           # 主循环
│           ├── executor.ts       # 循环执行器
│           ├── scanner.ts        # 场景扫描器
│           ├── scheduler.ts      # 调度器
│           ├── validator.ts      # 验证器
│           ├── snapshot.ts       # 快照管理
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
│       ├── replay/               # 回放引擎
│       └── scenarios/            # 测试场景
│           └── registry.ts       # 场景注册表
├── electron/                     # Electron 桌面应用
│   ├── main.ts                   # 主进程入口
│   ├── preload.ts                # 预加载脚本
│   └── ipc-handlers.ts           # IPC 处理器
├── skill_packs/                  # 技能包 (43 个)
│   ├── frontend_dev/             # 前端开发
│   ├── backend_dev/              # 后端开发
│   ├── fullstack_dev/            # 全栈开发
│   ├── code_review/              # 代码审查
│   ├── testing/                  # 测试
│   ├── task_decomposition/       # 任务分解
│   ├── architecture/             # 架构设计
│   ├── api_design/               # API 设计
│   ├── database/                 # 数据库
│   ├── devops/                   # DevOps
│   ├── deployment/               # 部署
│   ├── monitoring/               # 监控
│   ├── performance/              # 性能优化
│   ├── security_audit/           # 安全审计
│   ├── incident_response/        # 事件响应
│   ├── data_analysis/            # 数据分析
│   ├── data_engineering/         # 数据工程
│   ├── data_visualization/       # 数据可视化
│   ├── data_presentation/        # 数据展示
│   ├── ml_engineering/           # ML 工程
│   ├── image_generation/         # 图像生成
│   ├── video_generation/         # 视频生成
│   ├── video_editing/            # 视频编辑
│   ├── sound_design/             # 音效设计
│   ├── script_writing/           # 剧本写作
│   ├── content_writing/          # 内容写作
│   ├── content_editing/          # 内容编辑
│   ├── copywriting/              # 文案写作
│   ├── graphic_design/           # 平面设计
│   ├── brand_identity/           # 品牌标识
│   ├── brand_strategy/           # 品牌策略
│   ├── brand_voice/              # 品牌声音
│   ├── ppt_design/               # PPT 设计
│   ├── presentation_coaching/    # 演示辅导
│   ├── persona_development/      # 人设开发
│   ├── user_research/            # 用户研究
│   ├── usability_testing/        # 可用性测试
│   ├── competitive_analysis/     # 竞品分析
│   ├── sales_enablement/         # 销售赋能
│   ├── sales_qualification/      # 销售资质
│   ├── progress_tracking/        # 进度跟踪
│   └── risk_management/          # 风险管理
├── data/                         # 运行时数据
│   ├── exports/                  # 导出文件
│   ├── mailbox/                  # 消息信箱
│   ├── routing_table.json        # 路由表持久化
│   └── workspaces/               # 工作区目录
├── research/                     # 调研文档
├── docs/                         # 文档
│   ├── agent-roles.md            # Agent 角色配置
│   ├── agent-tools.md            # Agent 工具系统
│   ├── design.md                 # 设计文档
│   ├── user-guide.md             # 用户指南
│   ├── guides/                   # 使用指南
│   │   ├── improvements-guide.md # v1.2.0 改进使用指南
│   │   └── integration-test-report-2026-08-17.md # 集成测试报告
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

除核心角色外，系统还包含专用协作智能体（后端 `backend/collaboration/` + 前端 `src/modules/collaboration/` 双端实现）：

| 智能体 | 后端文件 | 前端文件 | 职责 |
|--------|----------|----------|------|
| **PlannerAgent** | `backend/collaboration/planner_agent.py` | `src/modules/collaboration/plannerAgent.ts` | 任务规划、DAG 生成、子任务分配 |
| **ExecutorAgent** | `backend/collaboration/executor_agent.py` | `src/modules/collaboration/executorAgent.ts` | 迭代执行、经验提取、状态报告 |
| **CriticAgent** | `backend/collaboration/critic_agent.py` | `src/modules/collaboration/criticAgent.ts` | 伴随式审查、发现漏洞和矛盾约束 |
| **GroundingAgent** | `backend/collaboration/grounding_agent.py` | `src/modules/collaboration/groundingAgent.ts` | 接地验证、确保结论有真实代码/文件出处 |
| **CollaborativeAgent** | `backend/collaboration/collaborative_agent.py` | `src/modules/collaboration/collaborativeAgent.ts` | 协调器，组合 Planner + Executors |

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

`dynamic_router.py` 实现五维加权路由 + 自适应加成：

```python
final_score = keyword_score * 0.35    # 关键词匹配
            + semantic_score * 0.25   # 语义相似度（Jaccard）
            + success_rate * 0.20     # 历史成功率（自适应学习）
            + priority * 0.10         # 部门优先级
            + skill_level * 0.10      # agent 技能等级
            + skill_level_boost       # 技能升级自适应加成（持久化，随升级累积，上限 0.3）
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

    # 依赖推断：实现类部门并行，qa 依赖实现类节点，devops 依赖 qa 与实现类节点
    # ... 创建依赖边 ...

    return WorkflowDefinition(
        execution_strategy=推导的策略  # 按根节点数推导（根>1 → parallel，否则 sequential）
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

- 五维加权评分 + 自适应加成: keyword×0.35 + semantic×0.25 + success_rate×0.20 + priority×0.10 + skill_level×0.10 + skill_level_boost
- 中英文混合分词: 英文正则 + 中文 2-4 字滑动窗口
- 路由表持久化: JSON 存储，线程安全读写（threading.Lock）
- 自适应学习: `update_stats(dept_id, success)` 更新部门成功率
- 置信度计算: top-2 分数差 + 基础分数
- **技能等级感知（v1.5.0）**：路由公式新增第五维度 `skill_level`（权重 0.10），按部门职业路径查询 AgentProfile 技能最高等级归一化为 0-1 得分
- **技能升级自适应**：agent 技能升级时部门 `skill_level_boost` +0.05（上限 0.3），持久化到路由表 JSON，形成正反馈循环

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

### 资产管理系统 (v1.2.0)

资产即知识：产出物（artifacts）+ 模板（templates）+ 技能规则，团队级目录 + JSON 索引。

| 模块 | 职责 |
|------|------|
| `asset_store.py` | 知识库+模板库存储，团队级目录结构，审批流程（approve/reject） |
| `asset_evaluator.py` | 资产入库前确定性检查 + 可注入 LLM judge |
| `asset_judge.py` | LLM judge 资产质量评分（0-1），标准库 urllib 直调 OpenAI 兼容 API |
| `asset_judge_benchmark.py` | LLM judge 评测基准：准确率/校准/区分度 |
| `asset_benchmark_gate.py` | LLM judge 质量 CI 门禁 |
| `asset_injection.py` | 会议节点执行时注入团队资产上下文 |
| `asset_search.py` | 三类资产合并检索（产出物+模板+技能规则） |
| `template_confirmation.py` | 模板固化流程：评测→员工把关→入库/拒绝 |

### MCP 协议集成 (v1.2.0)

| 模块 | 职责 |
|------|------|
| `mcp_adapter.py` | MCP 客户端适配器：Stdio 传输连接外部 MCP 服务器，工具发现与调用 |
| `mcp_config.py` | MCP 服务器配置管理：增删改查 + 连接测试，配置持久化 |
| `mcp_server.py` | MDH 内置工具暴露为 MCP 服务器（含注入防护），Phase 1-3 分阶段实现 |

### 模型管理层 (v1.2.0)

| 模块 | 职责 |
|------|------|
| `model_factory.py` | 共享 LLM Agent 创建工厂，消除重复 provider registry 调用 |
| `model_manager.py` | 模型生命周期管理：创建/缓存/故障转移，AgentPool 集成 |
| `agent.py` | AgentScope 智能体流式调用封装，多 provider 适配（OpenAI/Anthropic/DeepSeek/Gemini 等） |
| `llm_guard.py` | LLM 调用超时守卫，fail-closed 策略 |

### 协议与基础设施

| 模块 | 职责 |
|------|------|
| `protocol.py` | 全局数据结构与协议定义（64 个类/函数），覆盖工作流/会议/投票/审批/检查点 |
| `schemas.py` | REST API Pydantic 验证模型（20 个 Request 类） |
| `session.py` | WebSocket 会话管理：消息缓冲区、provider/模型状态、审批队列 |
| `config.py` | 全局配置常量：DeepSeek API 参数、浏览器自动化系统提示词 |
| `gate_engine.py` | 确定性门禁引擎：lint/test 检查，区分工具缺失(fail-open)与真实失败(fail-closed) |
| `routing_stats_manager.py` | 路由统计管理器：消费任务路由映射，更新部门成功率 |
| `git_integration.py` | Git 操作封装：分支/commit/push/PR 创建（含 GitHub API 集成） |
| `employee_directory.py` | 员工目录：employee_id → 姓名/邮箱/职位解析 |
| `code_extractor.py` | 从 Agent 回复中提取代码块（支持文件名/语言标识） |
| `executor_server.py` | 远端工具执行服务：多存储后端（local/docker/nfs/s3）+ API Token 认证 |
| `discussion_utils.py` | 讨论投影共享辅助函数：STANCE 标签剥离/立场解析，消除重复实现 |
| `minutes_workflow.py` | 会议纪要 DAG 构建（速记文本→纪要流水线） |
| `agentscope_task_bridge.py` | 工作流节点与 AgentScope Task 系统的双向转换与同步 |
| `skill_evolution.py` | 技能进化接线：审查反馈→经验规则→CoW 增量区 |
| `skill_generator.py` | AI 技能生成服务：根据用户需求描述生成技能配置 |

### 经验规则有效性追踪 (v1.3.5)

经验规则注入后自动追踪有效性：

- **有效性评分**: 每条规则记录 effectiveness_score (成功/总使用), usage_count, success_count
- **自动降级**: 使用 ≥3 次且成功率 <40% 的规则自动退回 pending_review
- **降级日志**: 每次降级记录到 demotion_log.json，含规则详情、评分、原因
- **降级告警**: 降级时向项目经理发送会话消息，记录 RULE_DEMOTION 事件
- **统计报表**: GET /api/experience/rules/demotion-stats — 按类型/团队/时间聚合
- **报表导出**: GET /api/experience/rules/demotion-export?format=json|csv
- **XP 衰减**: 高级 agent 做简单任务 XP 收益递减（100%→50%→10%）

### 跨团队技能共享 (v1.3.6)

SharedExperiencePool 发布质量门禁：

- **质量门禁**: effectiveness_score ≥ 0.6 且 usage_count ≥ 2 才能自动批准
- **审批流**: 不满足门禁的规则进入 pending，需人工 approve/reject
- **API**: GET /api/marketplace/experience/pending, POST approve/reject

### 数字员工职业发展体系 (v1.4.0)

AgentProfile 持久化 + XP 系统 + 技能树 + 角色晋升：

- **AgentProfile**: 跨项目持久档案，存 data/agent_profiles/，含 department/skill_progress/total_xp/career_stage
- **XP 系统**: 任务成功 +XP（基础+成功奖励+审查加成+首次使用），XP 衰减防刷
- **技能树**: 42 个技能，5 类别（engineering/design/content/data/management），prerequisites 依赖链
- **角色晋升**: 10 个部门独立职业路径，满足条件自动晋升（Executor→Reviewer→Coordinator→Planner）
- **API**: GET /api/agents/{id}/profile, POST /api/agents/{id}/grant-xp, GET /api/skills/tree, GET /api/agents/{id}/promotion, GET /api/agents/{id}/career-path, GET /api/careers/departments
- **XP 授予（v1.5.0）**：执行即得基础 XP（10 + complexity×5，+100% 成功奖励），审查通过额外奖励（score≥8→+50%），XP 衰减防刷
- **晋升驱动任务分配**：简单任务优先初级 agent（需 XP），复杂任务优先高级 agent，`_estimate_task_complexity` 基于关键词估算 1-5 级

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

### 技能市场 (v1.2.0)

| 端点 | 说明 |
|------|------|
| `GET /api/marketplace/shared-pool` | 获取共享经验池 |
| `POST /api/marketplace/fork` | 从共享池 Fork 技能到项目本地 |
| `GET /api/marketplace/export/{id}` | 导出技能包 |
| `POST /api/marketplace/import` | 导入技能包 |
| `GET /api/community/search` | 社区技能搜索（Git 注册表） |

### 经验规则有效性 (v1.3.5)

| 端点 | 说明 |
|------|------|
| GET /api/experience/rules/effectiveness | 规则有效性排行 |
| GET /api/experience/rules/demotion-log | 降级日志 |
| GET /api/experience/rules/demotion-stats | 降级统计报表 |
| GET /api/experience/rules/demotion-export?format=json|csv | 导出降级报表 |

### 共享池审批 (v1.3.6)

| 端点 | 说明 |
|------|------|
| GET /api/marketplace/experience/pending | 待审核规则 |
| POST /api/marketplace/experience/approve | 批准规则 |
| POST /api/marketplace/experience/reject | 拒绝规则 |

### 职业发展 (v1.4.0)

| 端点 | 说明 |
|------|------|
| GET /api/agents/{id}/profile | Agent 档案 |
| POST /api/agents/{id}/grant-xp | 授予 XP |
| GET /api/agents/{id}/promotion | 晋升检查 |
| GET /api/agents/{id}/career-path | 部门职业路径 |
| GET /api/skills/tree | 技能树结构 |
| GET /api/careers/departments | 所有部门职业路径 |

### 文档与记忆 (v1.5.16-v1.5.19)

| 端点 | 说明 |
|------|------|
| POST /api/documents/parse | 解析文档 |
| GET /api/documents/search | 搜索文档 |
| GET /api/documents/context | 文档上下文 |
| GET /api/memory/{agent_id} | Agent 记忆 |
| POST /api/memory/{agent_id}/add | 添加记忆 |
| GET /api/memory/{agent_id}/recall | 检索记忆 |
| GET /api/memory/{agent_id}/context | 记忆上下文 |
| GET /api/workspace/analyze | 代码仓库分析 |
| POST /api/workspace/analyze-dataset | 数据集解析 |
| GET /api/workspace/artifacts | 产出物历史 |
| GET /api/workspace/conflicts | 编辑冲突 |

### 交付与监控 (v1.5.20-v1.5.23)

| 端点 | 说明 |
|------|------|
| POST /api/delivery/deliver | 自主交付 |
| GET /api/delivery/log | 交付日志 |
| GET /api/agents/{id}/optimize | Agent 自省分析 |
| GET /api/agents/optimize/all | 所有 Agent 汇总 |
| GET /api/monitor/health | 健康巡检 |
| GET /api/monitor/alerts | 监控告警 |
| GET /api/team/synergy | 团队协同分析 |
| POST /api/team/synergy/record | 记录团队任务 |
| GET /api/team/synergy/recommend | 推荐搭配 |
| POST /api/feedback/submit | 提交反馈 |
| GET /api/feedback/summary | 反馈汇总 |
| POST /api/memory/{agent_id}/add | 添加记忆 |

### MCP 配置 (v1.2.0)

| 端点 | 说明 |
|------|------|
| `GET /api/mcp/servers` | 获取 MCP 服务器列表 |
| `POST /api/mcp/servers` | 添加 MCP 服务器 |
| `DELETE /api/mcp/servers/{id}` | 删除 MCP 服务器 |
| `POST /api/mcp/servers/{id}/test` | 测试 MCP 服务器连接 |

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

系统采用 **Agent OS 架构**：Python 后端作为中心大脑，通过 A2A 协议调度分布式执行节点。

```
┌──────────────────────────────────────────────────────────────┐
│  用户浏览器                                                    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  React 前端                                           │    │
│  │  - 3D 虚拟办公室 + A2A 管理面板                       │    │
│  │  - WebSocket 客户端（只连 Python 后端）               │    │
│  └──────────────────────────┬───────────────────────────┘    │
└─────────────────────────────┼────────────────────────────────┘
                              │ WebSocket + REST
                              ▼
┌──────────────────────────────────────────────────────────────┐
│              Python 后端（Agent OS 大脑）:8765                 │
│                                                               │
│  CEO Agent │ 经验进化 │ 职业发展 │ A2A Task Router           │
│  会议协调   │ 技能管理 │ 记忆系统 │ State Sync Manager        │
│  147 REST API + 41 WebSocket 消息类型                         │
└───────────────────────────┬──────────────────────────────────┘
                            │ A2A 协议 (HTTP/SSE)
               ┌────────────┼────────────┐
               ▼            ▼            ▼
      ┌──────────────┐ ┌──────────┐ ┌──────────┐
      │TS Orchestrator│ │Claude Code│ │ 其他     │
      │  :9090       │ │ Adapter  │ │ Adapter  │
      │· 本地工具执行 │ │  :9091   │ │          │
      │· 9 LLM 提供商│ │· CLI 包装 │ │          │
      └──────┬───────┘ └──────────┘ └──────────┘
             │ HTTP POST
             ▼
      ┌──────────────┐
      │Python Executor│
      │  (端口 8767)  │
      │  远端工具执行  │
      └──────────────┘
```

| 组件 | 技术 | 端口 | 职责 |
|------|------|------|------|
| **React 前端** | React + TypeScript | 8080/5173 | UI、WebSocket 客户端、A2A 管理面板 |
| **Python 后端** | Python + FastAPI | 8765 | Agent OS 大脑：智能体协调、经验进化、职业发展、A2A 任务路由 |
| **TS Orchestrator** | Node.js + TypeScript | 9090 | A2A 执行节点：本地工具执行、多提供商 LLM 路由 |
| **Claude Code Adapter** | Node.js | 9091 | A2A 执行节点：Claude Code CLI 包装 |
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

### 2. Agent OS + A2A 执行节点架构（v1.7.0+）

MDH 采用 Agent OS 架构：Python 后端作为中心大脑，通过 A2A 协议调度分布式执行节点。

#### 架构

```
Python 后端（大脑）
  │ A2A 协议 (HTTP/SSE)
  ├── TS Orchestrator (:9090) — 本地工具执行 + 9 LLM 提供商
  ├── Claude Code Adapter (:9091) — Claude Code CLI 包装
  └── 其他 Adapter — 可扩展
```

#### 核心组件

| 组件 | 文件 | 职责 |
|------|------|------|
| **A2A Registry** | `backend/a2a_registry.py` | 执行节点注册中心，心跳检测，JSON 持久化 |
| **A2A Client** | `backend/a2a_client.py` | 向执行节点发送任务，SSE 流式接收结果 |
| **A2A Task Router** | `backend/a2a_task_router.py` | 按技能标签+成功率路由任务到最优节点 |
| **State Sync** | `backend/state_sync.py` | 任务前经验注入 + 任务后记忆回传 |
| **A2A Server (TS)** | `orchestrator/src/a2a/server.ts` | Agent Card + SSE 任务端点 |
| **Claude Code Adapter** | `adapters/claude-code/src/` | Claude Code CLI A2A 包装 |

#### 工具路由

TS Orchestrator 内部仍保留工具路由能力：

| 路由器 | 文件 | 说明 |
|--------|------|------|
| **LocalToolkitRouter** | `orchestrator/src/toolkit/local.ts` | 本地 Node.js 执行 |
| **RemoteToolkitRouter** | `orchestrator/src/toolkit/remote.ts` | 远端 Python Executor HTTP 调用 |
| **HybridToolkitRouter** | `orchestrator/src/toolkit/hybrid.ts` | 按工具类型混合路由 |

#### 执行流程（v1.7.0+）

```
1. 用户发送任务到 Python 后端（WebSocket）
2. CeoAgent 分析意图，决定执行路径
3. 如需本地执行：A2A Task Router 选择最优执行节点
4. State Sync 注入相关经验规则
5. A2A Client 发送任务到执行节点（SSE 流式）
6. 执行节点完成任务，结果回传
7. State Sync 写入记忆，更新经验有效性
```

#### 安全机制

- **SSRF 防护**: 注册端点禁止内网/回环地址
- **API Token 认证**: Executor 通过 Bearer token 验证请求
- **心跳健康检查**: 每 60 秒检查节点状态，超时标记为 unhealthy

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
- **五维加权路由 + 自适应加成**：keyword×0.35 + semantic×0.25 + success_rate×0.20 + priority×0.10 + skill_level×0.10 + skill_level_boost
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

### 11. 资产管理系统 (v1.2.0)

- **资产即知识**：产出物（artifacts）+ 模板（templates）+ 技能规则，团队级目录 + JSON 索引
- **质量门禁**：确定性检查 + LLM judge（0-1 评分），CI 门禁确保 judge 本身质量
- **模板固化流程**：评测→员工把关确认→入库/拒绝，复用 ApprovalManager
- **资产注入**：会议节点执行时自动注入相关团队资产上下文

### 12. MCP 协议集成 (v1.2.0)

- **三阶段实现**：Phase 1 低级工具（8个）→ Phase 2 高级业务工具 → Phase 3 资源暴露
- **双向集成**：mcp_adapter.py 连接外部 MCP 服务器，mcp_server.py 暴露 MDH 工具
- **注入防护**：工具描述安全清洗，防止 prompt injection
- **配置持久化**：MCP 服务器配置 JSON 存储，支持连接测试

### 13. 模型管理重构 (v1.2.0)

- **提取复用**：从 MeetingCoordinator 提取 model_factory/model_manager，消除重复代码
- **多 provider 适配**：agent.py 支持 OpenAI/Anthropic/DeepSeek/Gemini/Moonshot/Ollama/XAI
- **流式调用**：AgentScope 事件流推送，支持 DataBlock/TextBlock/ToolCall 等事件
- **故障转移**：ModelManager 管理模型生命周期，AgentPool 集成

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

- [项目进度记录](PROGRESS.md) — v1.2.0 改进项完成状态
- [改进使用指南](docs/guides/improvements-guide.md) — 14 项改进的使用指南、API 参考
- [集成测试报告](docs/guides/integration-test-report-2026-08-17.md) — 端到端测试结果
- [优化日志](docs/optimization-log.md) — 优化记录
- [Agent 角色配置](docs/agent-roles.md)
- [Agent 工具系统](docs/agent-tools.md)
- [设计文档](docs/design.md)
- [用户指南](docs/user-guide.md)
- [集成测试报告](docs/integration-test-report.md)
- [Docker 部署指南](DOCKER_README.md)
- [项目规则](project_rules.md)
