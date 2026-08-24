# Changelog

本项目所有值得记录的改动。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.8.8] - 2026-08-26

### Fixed

**A2A 代码审查 P2 修复（10 项 Minor）**
- 清理 5 处未使用导入（re/Dict in task_router, Optional/Dict in post_processor, resolveConfig in server.ts）
- `a2a_registry.check_health()` 状态变更后持久化到磁盘（之前重启丢失 unhealthy 状态）
- `a2a_client` 回调 awaitable 检查从 `iscoroutine` 改为 `inspect.isawaitable`（兼容更多 awaitable 类型）
- 提取 `state_sync.extract_keywords()` 模块级工具函数，消除 a2a_post_processor 中的重复代码
- Claude Code Adapter: `buildAgentCard()` 导出并复用，消除 index.ts 中的重复定义

## [1.8.7] - 2026-08-26

### Fixed

**A2A 代码审查 P1 修复（5 项）**
- **C4 readBody 大小限制**: `orchestrator/src/a2a/server.ts` 和 `adapters/claude-code/src/a2a-handler.ts` 的 `readBody()` 添加 10MB 上限，超限返回 413（防 DoS）
- **I1 _task_log 竞态**: `backend/a2a_client.py` 所有 `_task_log` 读写加 `asyncio.Lock`，消除并发 SSE 任务的日志丢失风险
- **I10 YAML→JSON 格式统一**: `backend/human_feedback.py` 反馈规则写入格式从 YAML 改为 JSON，与 ExperienceExtractor 主检索系统一致
- **I12 agent_id 可配置**: `adapters/claude-code/src/index.ts` 支持 `--agent-id` 参数和 `MDH_AGENT_ID` 环境变量，默认 `claude-code-{port}` 避免多实例 ID 碰撞
- **I13 A2A 调用重试**: `backend/a2a_client.py` `send_task()` 添加 3 次指数退避重试（1s/2s/4s），仅对 5xx 和超时重试，4xx 不重试

## [1.8.6] - 2026-08-26

### Fixed

**集成差距修复终章（最后 2 个 P2 模块）**
- **资产注入接入**: `ws_handlers.py` 创建 `build_asset_context` 闭包（绑定 AssetStore + ExperienceExtractor），作为 `asset_context_builder` 传入 MeetingCoordinator
- **能力边界感知接入**: `StateSyncManager` 新增 `capability_boundary` 参数，`prepare_task_metadata()` 调用 `detect_unknown_domain()` 检测未知领域并注入 metadata 警告

## [1.8.5] - 2026-08-26

### Fixed

**集成差距修复续（剩余 DEAD 模块接入）**
- `TeamSynergy.record_team_task()` 接入 `A2APostProcessor`：每次任务完成后自动记录协同数据
- `ProactiveMonitor.run_health_check()` 接入 FastAPI startup 后台调度：每 5 分钟自动执行健康巡检

## [1.8.4] - 2026-08-26

### Fixed

**集成差距修复（深度分析发现的 P0+P1 问题）**
- **P0-1**: SimpleExecutor 接入进化管线 — 简单任务成功后调用 `A2APostProcessor.process()`，触发经验提炼 + XP 授予 + 记忆写入 + 路由统计
- **P0-2**: A2A post-processor API 签名修正 — `extract_from_meeting()` 改为 5 个位置参数，`grant_xp()` 改为正确的 keyword 参数
- **P1-1**: Webhook 触发接入 — `WebhookManager` 初始化并注入 `A2APostProcessor`，任务完成后触发 `task.completed` webhook

## [1.8.3] - 2026-08-26

### Fixed

**A2A 经验闭环修复**
- `AgentProfileManager` 接入 `A2APostProcessor`：之前 `agent_profile_manager=None` 导致 XP 授予静默失败，现在正确初始化并传入
- XP 授予目标修正：XP 和记忆归属于发起任务的数字员工（`xp_target="executor"`），而非 A2A 执行节点
- `AgentProfileManager` 构造函数参数修正：`profiles_dir` 而非 `data_dir`

## [1.8.2] - 2026-08-26

### Fixed

**A2A 路由质量提升**
- 路由置信度阈值从 0.6 提升到 0.7
- 自动模式下只路由需要本地执行能力的任务（file/git/shell/search/browser 标签匹配），纯编码任务留在 Python 内部执行
- `execution_preference` 字段端到端传递：前端 → ws_handlers → ceo_agent → simple_executor → A2A 路由决策
- 支持 4 种模式：auto（智能路由）/ local（强制本地）/ claude-code（强制 Claude Code）/ python（禁用 A2A）

## [1.8.1] - 2026-08-26

### Added

**A2A 经验闭环（A2APostProcessor）**
- `a2a_post_processor.py` (168行): A2A 任务完成后的完整后处理流水线
  - 经验提炼: `ExperienceExtractor.extract_from_meeting()` 从 A2A 结果中提取经验规则
  - XP 授予: `AgentProfileManager.grant_xp()` 为成功任务授予经验值
  - 记忆写入: `AgentMemory.add_memory()` 将任务结果写入持久记忆
  - 路由统计: `DynamicRouter.update_stats()` 更新部门成功率
- `simple_executor.py`: `_try_a2a_routing()` 任务完成后调用 `A2APostProcessor.process()`
- 8 项新测试，34 项 A2A 测试全部通过

## [1.8.0] - 2026-08-26

### Added

**智能调度：A2A 自动路由集成**
- **T1**: `simple_executor.py` 新增 A2A 路径 — 任务执行前自动检查 A2A 节点可用性，置信度 > 0.6 时路由到外部节点，失败时降级到 Python 内部执行
- **T2**: `WorkflowNode` 新增 `execution_target` 字段（`local`/`auto`/`a2a:<id>`），`SemanticAnalyzer._suggest_execution_target()` 根据部门自动建议执行目标
- **T3**: 前端 `CeoChatPanel` 新增执行节点偏好（`auto`/`local`/`claude-code`/`python`），通过 `execution_preference` 字段传递到后端
- **T5**: E2E 智能路由测试（5 项）— A2A 路由、降级回退、经验注入、结果记录、execution_target 判断

### Fixed

- `a2a_client.py`: SSE 解析保留 artifact — 最终 status 事件不再丢失前序 artifact

## [1.7.7] - 2026-08-26

### Fixed

**A2A 代码审查收尾（6 项剩余问题）**
- **I3**: `on_event` 回调支持 async/sync 双模式（`Awaitable` 兼容）
- **I4**: `_broadcast_a2a_update` 广播后清理断开的 WebSocket 会话
- **M4**: 冒烟测试使用 `asyncio.run()` 替代废弃的 `get_event_loop()`
- **M13**: A2AAgentPanel WS handler 加载守卫，防止并发 `load()` 调用
- **I8**: 文档化 Python (bigram) vs TS (stop-word) 关键词提取的有意差异

## [1.7.6] - 2026-08-26

### Fixed

**A2A 代码审查修复（6 Critical + 1 Important）**
- **C1**: SSRF DNS 重绑定防护 — 域名解析后检查 IP（而非仅检查 hostname）
- **C3**: `_task_log` 内存泄漏 — 上限 1000 条，FIFO 淘汰
- **C5**: dispatch 端点阻塞 — 改用 `asyncio.create_task` 后台执行
- **C6**: Agent Card URL 可配置 — 不再硬编码，通过参数传入
- **I5**: `agent_id` 格式校验 — 1-64 字符，仅字母数字+连字符+下划线
- **I9**: A2AClient 错误路径测试 — 超时/连接拒绝/日志验证（+3 测试）
- **I11**: 认证调用者跳过 SSRF — 携带有效 BACKEND_TOKEN 时放行

## [1.7.5] - 2026-08-26

### Added

**A2A 任务可观测性**
- `a2a_client.py`: 任务执行日志（task_id, agent_id, 开始/结束时间, 耗时）
- `/metrics` 端点新增 `mdh_a2a_task_duration_avg_seconds` 和 `mdh_a2a_task_duration_max_seconds`

**E2E 验证增强**
- `e2e_verify.py`: 新增 9 项 A2A 协议检查（注册、路由、客户端、状态同步），总检查项 31→40

## [1.7.4] - 2026-08-26

### Added

**A2A WebSocket 实时推送**
- 后端: 注册/注销时广播 `a2a_agent_update` 消息到所有 WebSocket 会话
- 前端: A2AAgentPanel 监听 `a2a_agent_update` 消息即时刷新（保留 30 秒轮询兜底）

**冒烟测试**
- `a2a_smoke_test.py`: 6 项端到端验证（模块导入、注册、路由、SSE 分发、状态同步、SSRF 防护）

### Changed

**Orchestrator 遗留清理**
- `team/assembler.ts`: 添加 `@deprecated` 标记
- `team/templates.ts`: 添加 `@deprecated` 标记
- `cli.ts`: 移除未使用的 `routerFactory` 变量和 `RouterFactory` 导入

## [1.7.3] - 2026-08-26

### Added

**前端 A2A 面板接入导航**
- `MeetingPanel.tsx`: 新增「🔗 执行节点」标签页，展示 A2AAgentPanel

### Changed

**AGENTS.md 架构全面更新**
- 「运行时进程架构」段落：从旧双路径模型更新为 Agent OS 模型（Python 大脑 + A2A 执行节点）
- 「关键设计决策 #2」：从 TeamCoordinator 混合执行架构更新为 A2A + A2A Task Router 架构
- Docker 服务组成表更新为 5 个服务

**TS Orchestrator 清理**
- `team/coordinator.ts`: 添加 `@deprecated` 标记
- `server.ts`: 移除 `startServer()` 中未使用的参数（routerFactory, executorUrl, executorToken, hybridProfile）
- `cli.ts`: 更新调用签名匹配简化后的 `startServer()`

## [1.7.2] - 2026-08-26

### Added

**E2E A2A 集成测试（31 项）**
- `test_a2a_e2e.py`: 7 个测试类覆盖完整 A2A 协议链路
- 注册/列表、路由决策、SSE 分发（含 Mock A2A Server）、SSRF 防护（9 种攻击向量）、心跳激活、超时标记不健康

**前端 A2A 管理面板**
- `A2AAgentPanel.tsx` (347行): 卡片网格展示已注册节点（状态指示灯、技能标签、成功率条、注销按钮、30秒自动刷新）
- `a2aClient.ts` (75行): `/api/a2a/*` REST API 客户端

**Docker 部署**
- `docker-compose.yml`: 新增 `claude-code-adapter` 服务
- `adapters/claude-code/Dockerfile`: Node.js 20 + tsx + Claude CLI

### Changed

- AGENTS.md 架构链更新：L6 Toolkit 层新增 A2A 执行节点调度说明

## [1.7.1] - 2026-08-26

### Added

**Claude Code A2A Adapter (`adapters/claude-code/`, 935 行)**
- 独立 Node.js 项目，将 Claude Code CLI 包装为 A2A Server
- Agent Card（`/.well-known/agent.json`）声明 `code_implementation` + `code_review` 两个技能
- SSE 流式任务端点（`/a2a/tasks/send`），解析 Claude 的 `stream-json` 输出
- `claude -p` 子进程管理：5 分钟超时、AbortController 取消支持
- `.mdh/` 本地状态缓存：`agent-state.json`、`experience-cache/`、`memory-inbox/`
- 自动注册到 Python 后端 + 每 30 秒心跳
- 优雅关闭：SIGINT/SIGTERM 时自动注销
- 零运行时依赖（仅用 Node.js 内置 `http` + `child_process`）

**A2A Prometheus 指标**
- `mdh_a2a_agents_active`：活跃 A2A 执行节点数
- `mdh_a2a_tasks_total`：累计派发任务数
- `mdh_a2a_tasks_success`：累计成功任务数
- `mdh_a2a_success_rate`：任务成功率

### Changed

**A2A 生产加固**
- SSRF 防护：注册端点校验 URL，禁止内网/回环地址
- HTTP 客户端复用：`A2AClient` 共享 `httpx.AsyncClient` 连接池，避免每次请求新建连接
- 死代码清理：移除未使用的 `session.teamId`、未使用的 `readFileSync` 导入

## [1.7.0] - 2026-08-26

### Added

**Agent OS 架构：A2A 协议基础设施**
- `a2a_registry.py`: 执行节点注册中心，支持注册/注销/心跳/按技能和标签查找，JSON 持久化
- `a2a_client.py`: A2A 协议客户端，通过 HTTP SSE 流式发送任务和接收结果
- `a2a_task_router.py`: 任务路由器，按技能标签匹配 + 成功率加权选择最优执行节点
- `state_sync.py`: 双层状态同步管理器，任务前注入相关经验规则，任务后将执行结果写入 Agent 记忆
- `server.py`: 6 个 A2A REST 端点（`/api/a2a/register`, `/unregister`, `/heartbeat`, `/agents`, `/route`, `/dispatch`）
- `orchestrator/src/a2a/server.ts`: TS Orchestrator A2A Server，Agent Card（`/.well-known/agent.json`）+ SSE 流式任务端点（`/a2a/tasks/send`）
- 20 个新测试（test_a2a.py 13 个 + test_state_sync.py 7 个），全部通过

**设计文档**
- `docs/compose/spec/agent-os-architecture.md`: Agent OS 架构设计规格
- `docs/compose/spec/claude-code-a2a-adapter.md`: Claude Code A2A Adapter 设计文档

### Changed

**TS Orchestrator 瘦身**
- WebSocket handler 从 TeamCoordinator（多角色团队编排）重构为单 RoleAgent（A2A 执行模型）
- 移除 TeamCoordinator 相关的 workspace_confirm、role_locations、selected_roles 处理逻辑
- 新增 RoleAgent + chatWithTools 作为主要执行路径

**文档修正**
- README.md/README.en.md/AGENTS.md: 修正架构图 TS Orchestrator 端口（8080→9090）
- README.md/README.en.md/AGENTS.md: 修正 DynamicRouter 维度（四维→五维+自适应加成）和权重
- README.md/README.en.md/AGENTS.md: 修正测试计数（后端 1732→1731，Orchestrator 216→214）
- README.md/README.en.md: 补充多模型支持为 9 个提供商

## [1.6.12] - 2026-08-24

### Fixed

**v1.6.x 代码审查修复（14 项）**
- CRITICAL: RBAC `check_permission()` 接线到 AuthMiddleware（之前从未调用，权限形同虚设）
- CRITICAL: `agent_profile_manager` 缓存失效移入写锁内（防并发脏读）
- CRITICAL: 租户 API key 认证通过 RBAC 覆盖
- HIGH: DB 恢复前调用 `close_all()` 关闭现有连接（防读到脏数据）
- HIGH: `cached` 装饰器 key 包含 `args+kwargs`（之前不同参数共享缓存）
- HIGH: Webhook 失败投递重试 3 次 + 指数退避
- HIGH: Webhook HMAC 签名含时间戳（防重放攻击）
- MEDIUM: 模型降级链无跨提供商候选时降级到同提供商
- MEDIUM: API key 轮换旧 key 保留 5 分钟宽限期
- MEDIUM: `_safe_add_column` 迁移异常记录 warning
- MEDIUM: 无 DB 时健康检查返回 `status=not_initialized`

### Added

**季度路线图实施（18 项任务 + 优化）**
- 工作流引擎统一（async LLM 节点生成 + 三阶段执行）
- 混合执行贯通（RemoteAgentToolset + per-agent location 路由）
- 投票机制精简（删除未接线的 weighted/argument_based，-293 行）
- 死代码清理（-1175 行）
- Durable Execution 基础（SessionPersistence + 幂等执行）
- Orchestrator-Worker 编排（LLM 调用 ~19× 降至 ~12×）
- Artifact 模式（ArtifactStore 结构化产物存储）
- 技能闭环自动完成（进化事件记录到 SQLite）
- Agent Skills 标准对齐（SKILL.md 自动生成）
- MCP Client 集成（AgentToolset MCP 工具路由）
- HITL 分级重设计（开发操作自动通过率 >90%）
- 虚拟办公室交互重塑（AgentStatusOverlay 3D 状态叠加）
- 对话体验优化（discussion_summary + review_summary 结构化消息）
- 可观测性仪表盘增强（evolution/system/sessions 统计）
- 多租户完善（tenant_id 列迁移 + tenant_stats）
- 并行执行增强（串行/并行共享 `_execute_one_task`，-160 行）
- LLM 缓存集成 + 优化（SQLite 持久化 + 语义规范化 + 分层 TTL）
- 评测基准系统（16 条任务 + 运行器 + 分析 + CI 集成 + 基线）
- 性能基准测试（真实数据测量 + E2E 验证脚本）
- 系统集成测试（31 项 E2E 验证）

## [1.6.11] - 2026-08-22

### Fixed

**错误处理标准化**
- 标准错误码（`_ok`/`_fail` 新增 `code` 字段）
- 静默异常修复（关键路径 try/except 不再吞掉异常）

## [1.6.10] - 2026-08-22

### Added

**E2E 测试强化**
- 5 条关键路径 14 个端到端测试
- 覆盖任务执行、技能进化、路由、协作、监控

## [1.6.9] - 2026-08-22

### Added

**集成验证 + 文档同步**
- v1.6 全链路端到端测试
- README/AGENTS.md 同步 v1.6.x 能力

## [1.6.8] - 2026-08-22

### Added

**Webhook 集成**
- `WebhookManager`：事件通知外部系统（SQLite 存储）
- 支持 5 种事件：task.completed / agent.promoted / rule.demoted / rule.evolved / health.alert
- HMAC-SHA256 签名验证（X-MDH-Signature 头）
- 投递日志记录 + 投递统计
- API：POST/GET/DELETE `/api/webhooks`, GET `/api/webhooks/stats`

## [1.6.7] - 2026-08-22

### Added

**多模型支持**
- `ModelRegistry`：9 个模型配置（DeepSeek/OpenAI/Anthropic/Google/Ollama）
- 模型路由：根据任务复杂度选 big/medium/small tier
- 自动降级链：big → medium → small
- Ollama 本地模型支持（零成本）
- API：GET `/api/models`, GET `/api/models/{id}`, GET `/api/models/{id}/fallback`

## [1.6.6] - 2026-08-22

### Added

**多租户基础**
- `TenantManager`：租户 CRUD（SQLite 存储）
- 每个租户独立 API key（mdh_tenant_ 前缀）
- 租户可停用（API key 立即失效）
- API：POST/GET/DELETE `/api/tenants`

## [1.6.5] - 2026-08-22

### Added

**开发者体验**
- `Makefile`：一键启动（make dev）、全量测试（make test）、备份（make db-backup）
- `docs/ARCHITECTURE.md`：架构总览图、14 个核心模块、数据流图、数据库表、API 端点分组

## [1.6.4] - 2026-08-22

### Added

**性能优化与缓存**
- `TTLCache`：带 TTL 的内存缓存（线程安全，自动过期）
- AgentProfile 读取缓存 120 秒，写入自动失效
- 缓存管理 API：GET `/api/ops/cache`, POST `/api/ops/cache/clear`
- conftest.py 每个测试自动清空缓存

## [1.6.3] - 2026-08-22

### Added

**API 文档与一致性**
- CHANGELOG 补全 v1.6.0-v1.6.2 条目
- OpenAPI 标签分组：100+ 端点分为 13 个功能组
- API 描述：Matrix DaHuang — 数字员工操作系统 API

## [1.6.2] - 2026-08-22

### Added

**生产加固**
- SQLite 写锁改为 RLock（可重入，防死锁）
- 14 个生产加固测试：并发安全 + 错误恢复 + 性能基准 + 安全防护
- 并发写入安全：10 线程并发写入不同 agent 无死锁无损坏
- 错误恢复：损坏数据库不崩溃、缺失目录自动创建
- 性能基准：100 次写入 <5s、100 条查询 <1s、备份 <1s
- 安全防护：SQL 注入/超大输入不崩溃

## [1.6.1] - 2026-08-22

### Added

**生产运维**
- `OpsManager`：数据库备份 + 健康检查 + 运维 API
- SQLite 在线备份 API（不锁库）
- `/health` 端点增强：数据库连接 + 磁盘空间 + 模块状态 + 备份状态
- 备份管理：自动备份 + 列出 + 恢复 + 清理旧备份
- API：POST `/api/ops/backup`, GET `/api/ops/backups`, POST `/api/ops/restore`

## [1.6.0] - 2026-08-22

### Added

**SQLite 存储迁移 + API 版本化 + RBAC**

**P0: AgentProfile 迁移至 SQLite**
- `db.py`：SQLite 数据库层（WAL 模式，7 张表，11 个索引）
- `agent_profile_manager.py`：存储层从 JSON 切换到 SQLite，公共 API 不变

**P1: 经验规则迁移至 SQLite**
- `experience_extractor.py`：存储层从 YAML 切换到 SQLite
- 降级日志/进化日志迁移到 SQLite 表

**P2: AgentMemory 迁移至 SQLite**
- `agent_memory.py`：存储层从 JSON 切换到 SQLite

**P3: API 版本化 + RBAC**
- `/api/v1/*` 路由自动重写到 `/api/*`，响应头 `X-API-Version: v1`
- `rbac.py`：API key 角色分级（admin/agent/viewer）
- `_ok`/`_fail` 新增 `code` 字段
- API：POST `/api/admin/create-key`, GET `/api/admin/keys`, DELETE `/api/admin/keys/{hash}`

## [1.5.24] - 2026-08-22

### Added

**端到端集成验证**
- 4 条链路 8 个集成测试，证明模块真正连通
- 进化链路：规则创建→注入→有效性→自进化→链追踪
- 协作链路：mentor 匹配→XP→技能增长→路由加成
- 交付链路：记忆写入→检索→Git 交付→通知→报告
- 监控链路：健康巡检→告警→反思优先级→自省分析

## [1.5.23] - 2026-08-22

### Added

**团队协同优化**
- `TeamSynergy`：协同分析+瓶颈识别+最优搭配+任务匹配
- 协同得分：成功率×0.7 + 评分×0.3
- 瓶颈识别：成功率低于团队平均 60% 标记为瓶颈
- 任务匹配：基于历史数据推荐最优 agent 组合
- API：GET `/api/team/synergy`, POST `/api/team/synergy/record`, GET `/api/team/synergy/recommend`

## [1.5.22] - 2026-08-22

### Added

**主动式监控**
- `ProactiveMonitor`：健康巡检+风险预警+流程建议
- Agent 表现检查：技能成功率 <30% 告警
- 技能覆盖检查：部门中级技能不足告警
- 规则健康检查：领域规则平均有效性 <30% 告警
- 告警分级：critical/warning/info
- API：GET `/api/monitor/health`, GET `/api/monitor/alerts`

## [1.5.21] - 2026-08-22

### Added

**Agent 自省优化**
- `AgentOptimizer`：表现分析+弱项识别+策略调整
- 弱项识别：成功率 <40% 标记为 weak
- 强项识别：成功率 ≥70% 且使用 ≥3 次标记为 strong
- 优化建议：弱项练习/技能拓展/晋升提示/强项挑战
- API：GET `/api/agents/{id}/optimize`, GET `/api/agents/optimize/all`

## [1.5.20] - 2026-08-22

### Added

**自主交付**
- `DeliveryEngine`：Git 交付+通知交付+文档交付+部署触发
- Git 交付：自动收集变更文件→commit
- 通知交付：结构化通知（agent/task/review_status/files）
- 文档交付：自动生成任务报告 JSON
- API：POST `/api/delivery/deliver`, GET `/api/delivery/log`

## [1.5.19] - 2026-08-22

### Added

**跨会话学习闭环**
- 任务前检索：`_recall_agent_memory` 检索相关记忆注入上下文
- 任务后写入：`_write_task_memory` 自动提取关键信息写入记忆
- `recall_for_task`：合并检索+格式化，用于任务前注入
- 标准路径和简单路径都已接入

## [1.5.18] - 2026-08-22

### Added

**Agent 持久记忆**
- `AgentMemory`：持久化 JSON + MD 双格式记忆
- 四种记忆类型：task_summary/learning/interaction/observation
- `recall`：关键词+内容匹配，重要性加权排序
- `inject_context`：格式化记忆文本，注入 system prompt
- `age_memories`：超过 30 天未引用的记忆重要性减半
- API：GET/POST `/api/memory/{agent_id}`, GET `/api/memory/{agent_id}/recall`, GET `/api/memory/{agent_id}/context`

## [1.5.17] - 2026-08-22

### Added

**活文档协作**
- `LiveDocumentManager`：代码感知+数据感知+产出物追踪+冲突检测
- 代码感知：`analyze_codebase` 解析仓库结构
- 数据感知：`analyze_dataset` 解析 CSV/JSON/YAML，提取摘要统计
- 产出物追踪：`track_artifact` 记录文件变更历史
- 冲突检测：`detect_conflict` 检测 5 分钟内并发编辑
- API：GET `/api/workspace/analyze`, POST `/api/workspace/analyze-dataset`, GET `/api/workspace/artifacts`, GET `/api/workspace/conflicts`

## [1.5.16] - 2026-08-22

### Added

**文档感知协作**
- `DocumentParser`：支持 txt/md/json/yaml/py/js/ts 等 20+ 种格式
- 文件解析：提取内容/摘要/关键词
- 文档搜索：按文件名/摘要/关键词匹配
- 上下文构建：为任务自动检索相关文档注入 agent 上下文
- API：POST `/api/documents/parse`, GET `/api/documents/search`, GET `/api/documents/context`, GET `/api/documents/stats`

## [1.5.15] - 2026-08-22

### Added

**前端协作改进**
- 内联反馈：会议消息上 👍/👎 按钮，一键触发结构化反馈→规则转化
- 技能徽章：消息旁显示 agent 最高技能等级（缓存+tooltip）
- `EvolutionToast`：规则降级/晋升事件实时 toast 通知（移至 OfficeScene 顶层）
- `CapabilityBoundaryWarning`：任务落在低置信领域时 ⚠️ 警告
- `FeedbackPanel`：人类反馈统计面板（评分分布/高频优势/高频改进点）
- `SkillEvolutionDashboard` 新增「💬 反馈」tab

## [1.5.14] - 2026-08-22

### Added

**人机协作反馈回路**
- `HumanFeedbackManager`：结构化人类反馈（rating/strengths/improvements/specific_suggestions/skill_directions）
- 反馈→规则转化：`specific_suggestions` 自动转化为经验规则（直接 approved，起始 effectiveness=0.5）
- 技能方向指导：人指定 agent 重点发展的技能，持久化到 `skill_guidance.json`
- 反馈汇总：高频改进点/高频优势统计
- API：POST `/api/feedback/submit`, GET `/api/feedback/summary`, GET `/api/feedback/guidance/{agent_id}`

### Changed

- README 产品叙事新增「进化是自驱动的」章节（中英文同步）

## [1.5.13] - 2026-08-22

### Added

**系统自省**
- `SystemIntrospection`：功能利用率追踪（v1.5.x 14 个新功能的调用统计）
- 模块健康度分析：按 rule_type 分组计算平均有效性（healthy/degraded/critical）
- 回归检测：记录失败事件，识别高频回归模块
- 改进提案生成：基于利用率/健康度/回归数据自动生成改进建议
- API：GET `/api/introspection/features`, `/health`, `/proposals`

## [1.5.12] - 2026-08-22

### Added

**能力边界感知**
- `CapabilityBoundary`：置信度地图（每个技能领域一个置信度分数）
- 置信度公式：规则数量×0.3 + 有效性×0.35 + 使用频率×0.2 + 活跃率×0.15
- 未知领域检测：任务关键词匹配置信度地图，低置信标记需额外审查
- 求助机制：低置信领域自动向共享进化池请求高置信规则
- 能力边界报告：置信度排序 + 边界转折点 + 改进建议
- API：GET `/api/capability/boundary`, GET `/api/capability/detect`

## [1.5.11] - 2026-08-22

### Added

**CI/CD 进化自动化**
- `scripts/evolution_guard.py`：进化健康度门禁脚本（4 道检查：反思优先级/多样性/成功率/联邦健康）
- GitHub Actions 工作流 `evolution-guard.yml`：每天自动运行 + PR 修改进化文件时触发 + 手动触发
- 退出码：0=通过，1=关注项，2=紧急问题（阻塞合并）

## [1.5.10] - 2026-08-22

### Added

**多团队进化联邦**
- `TeamFederation`：进化发布 + 跨团队有效性追踪 + 智能订阅 + 信任评分
- 进化发布：高分进化规则（score≥0.7, usage≥5）自动发布到共享池
- 跨团队有效性：共享规则在不同团队使用后独立追踪 effectiveness
- 智能订阅：团队按关键词匹配自动订阅相关共享规则
- 信任评分：默认 0.5，成功 +0.01，失败 -0.05，<0.3 不可订阅
- API：GET `/api/federation/stats`, GET `/api/federation/feed`

## [1.5.9] - 2026-08-22

### Added

**抗过拟合机制**
- 多样性检查：同一 rule_type 近期进化 >50% 且 ≥3 次 → 拒绝进化
- 老化机制：`last_used_at` 字段，超过 30 天未使用的规则注入时得分减半
- 探索/利用平衡：`retrieve_with_aging` 方法，80% 高分规则 + 20% 随机规则
- `ExperienceRule` 新增 `last_used_at` 字段

## [1.5.8] - 2026-08-22

### Added

**反思优先级队列**
- `ReflectionPriorityQueue`：从规则数据中计算反思优先级
- 领域健康度：按 rule_type/keywords 分组计算平均 effectiveness
- 优先级队列：critical 领域(100) → 进化失败领域(80) → 低分规则(60) → 进化未改善(40)
- API：GET `/api/reflection/priority-queue`

## [1.5.7] - 2026-08-22

### Added

**联动进化**
- `KnowledgeNetwork`：规则→技能包→资产的联动关系管理
- 规则进化后自动：找到关联技能包 → 更新规则引用；找到关联资产 → 标记需重新评估
- 联动进化日志：记录每次级联更新的传播路径
- API：GET `/api/knowledge/network-stats`

## [1.5.6] - 2026-08-22

### Added

**规则自进化**
- 低分规则（score<0.3, usage≥5）自动生成改进版规则
- 原规则标记为 `evolved`，改进版自动批准
- 进化链追踪：`parent_rule_id` 链接原始→进化规则
- `ExperienceRule` 新增 `parent_rule_id`, `evolution_count` 字段
- 单条规则最多进化 3 次（防无限循环）

## [1.5.5] - 2026-08-21

### Added

**全局性能仪表盘**
- `PerformanceDashboard`：聚合 5 大数据源（Agent/规则/路由/LLM成本/知识流动）
- `PerformanceDashboard` 前端组件：6 个子视图（总览/Agent/规则/路由/成本/知识流）
- `SkillEvolutionDashboard` 新增「📊 性能仪表盘」tab
- API：GET `/api/dashboard/performance`

## [1.5.4] - 2026-08-21

### Added

**自适应会议流程 + 证据驱动交付 + Agent 协调协议**
- 标准任务（confidence 0.5-0.8）跳过投票环节，直接分派执行
- `_verify_delivery`：执行后验证实际产出（文件存在、结果非空、非全部失败）
- `_build_peer_context`：多 agent 并行时共享已完成工作上下文，避免重复
- 证据不通过 → 标记 revision_required

## [1.5.3] - 2026-08-21

### Added

**任务分流门 + LLM 成本追踪 + Agent 隔离**
- `_triage_task`：规则引擎分流门（0 token），simple/standard/complex 三级
- `LLMCostTracker`：每次 LLM 调用记账（model/role/agent/tokens/cost），JSON 持久化
- `scripts/guard_llm_cost.py`：CI 守卫脚本，扫描代码中的 LLM 调用点
- `_setup_agent_isolation`：每个 agent 独立 workspace/memory/notes 目录
- API：GET `/api/llm/costs`, GET `/api/llm/costs/records`

## [1.5.2] - 2026-08-21

### Added

**师徒制知识传递**
- `AgentProfileManager.find_mentor`：同部门最高级别 agent 自动成为 mentor
- `_inject_experience`：优先注入 mentor 的规则，标记 mentor 规则数
- `_grant_task_xp`：mentee 任务成功时 mentor 获得 20% XP 加成
- `_log_knowledge_flow`：知识流动日志（data/knowledge_flow.json）
- `ExperienceRule` 新增 `source_agent_id` 字段
- API：GET `/api/agents/knowledge-flow`

## [1.5.1] - 2026-08-21

### Added

**跨团队技能共享深化**
- `get_share_recommendations`：高分规则（score≥0.7, usage≥5）自动推荐发布
- `update_fork_effectiveness`：fork 规则后追踪实际任务效果
- `get_leaderboard`：综合得分排序（fork_effectiveness × log2(usage+1)）
- `SharedRule` 新增 `fork_effectiveness`, `fork_success_count`, `fork_total_count`
- 前端 SkillMarketplace 新增「排行榜」tab
- API：GET `/api/marketplace/experience/recommendations`, `/leaderboard`, POST `/update-fork-effectiveness`

## [1.5.0] - 2026-08-21

### Added

**路由感知技能等级 + 晋升驱动任务分配 + 真实 AI 验证**
- DynamicRouter 五维加权路由：keyword×0.35 + semantic×0.25 + success_rate×0.20 + priority×0.10 + skill_level×0.10
- `_compute_skill_level_score`：按部门职业路径查询 AgentProfile 中相关技能的最高等级
- `_find_best_agent_for_task` 复杂度感知分配：简单任务倾向初级 agent（+5），复杂任务倾向高级 agent（每级+4）
- `skill_level_boost`：agent 技能升级时部门路由加成 +0.05（上限 0.3），持久化到路由表 JSON
- `_estimate_task_complexity`：基于多步骤/跨领域关键词估算任务复杂度（1-5 级）

### Fixed

- `_grant_task_xp` 定义但未接入 `process_user_message`，真实场景下 XP 全部为 0
- XP 授予逻辑修正：执行即得基础 XP，审查通过额外奖励（旧逻辑仅审查通过才给 XP，审查系统默认 revision_required 导致所有任务 XP=0）
- agentscope v2.0.6 DeepSeek 模型兼容：`OPENAI_API_KEY` 从运行时参数同步

### Verified

- 真实 AI 闭环验证：2 个 DeepSeek 任务后 agent-executor 获得 120 XP，backend_dev 升至 Lv.1
- 随机模拟验证：100 轮 × 4 agent，6 次晋升（含 Beta→Lead），研发部 boost 满额 0.30

## [1.4.1] - 2026-08-20

### Added

**数字员工职业发展前端面板**
- `AgentProfilePanel`：Agent 职业档案面板（职业阶段徽章、总 XP、技能网格含进度条和成功率）
- `CareerPathPanel`：部门职业路径面板（部门卡片网格 → 点击进入晋升时间线，含条件达成状态）
- `SkillTreeView`：技能树可视化（按类别分组、依赖箭头、点击展开详情、部门/类别双筛选）
- `SkillEvolutionDashboard` 新增「🚀 职业发展」tab
- `careerDevelopment` API 模块 + 类型定义

## [1.4.0] - 2026-08-20

### Added

**数字员工职业发展体系核心数据层**
- `AgentProfile`：跨项目持久档案（data/agent_profiles/），含 department/skill_progress/total_xp/career_stage
- XP 系统：任务成功 +XP（基础 + 成功奖励 + 审查加成 + 首次使用），XP 衰减防刷（高级 agent 做简单任务 100%→50%→10%）
- 42 个技能定义扩展：每个技能新增 category/prerequisites/xp_thresholds
- 5 类别技能树（engineering/design/content/data/management），prerequisites 依赖链
- `PromotionEngine`：10 个部门独立职业路径，满足条件自动晋升（Executor→Reviewer→Coordinator→Planner）
- API 端点：GET/POST agent profile, grant-xp, promotion, career-path, skills-tree, departments
- 集成到 `process_user_message`：任务完成后自动 grant-xp + 晋升检查

## [1.3.6] - 2026-08-20

### Added

**跨团队技能共享质量门禁**
- `SharedExperiencePool` 发布质量门禁：effectiveness_score ≥ 0.6 且 usage_count ≥ 2 才自动批准
- 审批流：不满足门禁的规则进入 pending，需人工 approve/reject
- 新增 API：GET /api/marketplace/experience/pending, POST approve, POST reject
- 前端：共享经验卡片显示状态徽章（已批准/待审核）和有效性评分

### Fixed

**自适应路由闭环修复**
- 移除 `TaskOrchestrator._execute_sequential` 中两处无效的 `router.update_stats` 调用（Dict B 在串行流中永远为空）
- 路由统计统一由 `_update_routing_stats_safe` 消费 Dict A，消除双字典断链

## [1.3.5] - 2026-08-20

### Added

**规则有效性追踪与自动降级**
- `ExperienceRule` 新增 effectiveness_score/usage_count/success_count 字段
- `update_rule_effectiveness`：任务完成后回写注入规则的有效性评分
- 自动降级：使用 ≥3 次且成功率 <40% 的规则自动退回 pending_review
- 降级日志：`demotion_log.json` 持久化记录，含规则详情/评分/原因/时间戳
- 降级告警：后端 `RULE_DEMOTION` 会话事件 + 前端红色告警横幅
- 统计报表：`/api/experience/rules/demotion-stats`（按类型/团队/时间聚合、复审率、高频降级排行）
- 报表导出：`/api/experience/rules/demotion-export?format=json|csv`
- 前端：ExperienceRulePanel 有效性评分徽章 + 可折叠统计面板 + JSON/CSV 下载

### Fixed

- 经验规则注入目录断链：`write_to_incremental_area` 写入 `approved/` 但双端注入读取 `rules/`
- `agent_pool.py` 和 `loader.ts` 注入时过滤 `status=approved`（旧规则默认 approved 兼容）

## [1.3.4] - 2026-08-20

### Added

**资产-技能协作闭环增强**
- P0: 经验提炼人工审核 — `evolve_from_feedback` 不再自动审批，规则保持 `pending_review`
- P1: 资产编辑能力 — `AssetStore.update_asset` + PUT `/api/assets/{id}` + 前端编辑 UI
- P2: 复用率仪表盘 — AssetBrowserPanel 展示注入统计（总注入/模板/产出物/规则命中）
- P3: 技能包版本修复 — `package_zip` 使用实际版本号

### Fixed

- TS 端增量区 + 资产注入到智能体 system prompt（`buildSystemPrompt` 调用 `loadIncrementalArea` + `buildAssetContext`）
- Python 端增量区 + 资产注入到智能体 system prompt（`AgentPool._inject_incremental_context` + `coordinator_workflow`）
- 审批后写入增量区 + 类型提取修复

## [1.3.3] - 2026-08-20

### Fixed

**循环导入修复 + 类型安全**
- SidePanel 循环导入修复：提取 `SidePanel.styles.ts` 共享样式文件
- Handler 模块类型安全：5 个 handler 模块（meeting/voting/approval/checkpoint/bridge）any 清零
- `meetingStore` 类型安全：所有 `any` → 正确类型
- `useMeetingSocket` 类型安全：`BridgeMessage` 类型化
- `useRolesConfig` / `RolePanel` / `SkillPanel` / `ToolPanel` any 清零

## [1.3.2] - 2026-08-20

### Added

**前端架构治理收尾 + 大文件拆分**
- CeoChatPanel 1044→547 行：提取 `useCeoCommunication` + `RoleSelector` + `WorkspaceConfig` + `ceo-types.ts` + `ceo-constants.ts`
- Handler 测试 52 个：6 个测试文件覆盖 meeting/voting/approval/checkpoint/bridge/dispatcher
- useMeetingSocket handler 按领域拆分 5 子模块 + Zustand store

### Changed

**大文件拆分（16 个文件，总计 -3500 行）**
- OfficeScene 939→264 行（styles + 4 个 Tab 组件）
- TechTowerView 884→417 行（FloorProjectPanel/StorageSetupPrompt/SceneControlsPanel/ResourceButtons）
- CyberpunkGround 650→133 行（materials + 8 个子组件）
- CyberpunkBuildings 523→212 行（BuildingTextures）
- MeetingTable 521→267 行（styles）
- SidePanel 1155→621 行（useRolesConfig + RolePanel/SkillPanel/ToolPanel）
- SkillMarketplace 531→406 行（types + styles）
- RoleConfigPanel 506→412 行（types + NewRoleModal）
- taskPlanner 509→341 行（types + utils）
- plannerAgent 608→516 行（types）
- agentReferenceSystem 603→557 行（types）
- taskScheduler 551→524 行（types）
- agentCoordinator 537→519 行（types）
- dependencyAnalyzer 627→475 行（defaults）
- taskDecomposer 590→437 行（templates）

### Fixed

- Code review 修复：SidePanel 重复导入、导出缺失、类型不匹配
- `setMeetingPhase` 类型 `string` → `MeetingPhase`

## [1.3.1] - 2026-08-19

### Added

**前端架构治理**
- useMeetingSocket handler 按领域拆分：meeting/voting/approval/checkpoint/bridge 5 个子模块
- Zustand store 替代 40+ useState，按领域拆分 5 个 slice
- CeoChatPanel 重构：提取 `useCeoCommunication` + `RoleSelector` + `WorkspaceConfig`
- OfficeTeamMode 重构：提取 `MeetingPanel` + `TaskList`
- Handler 单元测试 52 个

## [1.3.0] - 2026-08-19

### Added

**Playwright 浏览器自动化（25 个工具，TS + Python 双端）**
- TS 端：25 个 Playwright 浏览器自动化工具（导航/点击/输入/截图/录制等）
- Python 端：25 个 Playwright 工具集成到后端
- Playwright 能力深化：有头模式、任务队列、HITL 确认、实例池、录制回放、批量 API
- `BrowserPool`：多实例管理
- `BrowserRecordingPanel`：录制/回放 UI
- 批量浏览器任务 API 端点

## [1.2.2] - 2026-08-19

### Added

**TS 端能力补齐 + server.py 迁移**
- TS HITL 确认流程：危险操作人工审批
- TS LLM 超时守卫：重试 + 退避
- TS 渐进式技能加载器（L0-L3）
- TS Shell 安全 + 工具参数校验
- 新增 4 个 LLM 提供商（DashScope/Gemini/Moonshot/xAI）
- thinking/reasoning 块流式支持

### Changed

**server.py 端点迁移（消除重复内联端点）**
- Skills 内联端点迁移到 `routers/skills.py`
- Workflow 内联端点迁移到 `routers/workflow.py`
- Marketplace 内联端点迁移到 `routers/marketplace.py`
- MCP/Community 内联端点迁移到对应路由模块

### Refactored

- 提取 `coordinator_discussion.py`（讨论流程）
- 提取 `coordinator_summary.py`（项目总结）

### Fixed

- 移除对专有浏览器的依赖（禁用 browser automation tools）

## [1.2.1] - 2026-08-18

### Fixed
- `clone_skill` 端点重复 `except ValueError`（不可达代码）
- 全局异常处理器返回 HTTP 200 而非 500（编程错误伪装成正常响应）
- Docker `DEEPSEEK_BASE_URL` 默认值缺少 `/v1` 后缀
- 移除 docker-compose 中引用已删除目录的 `mock-sso` 服务
- `routers/skills.py` 的 `_ok()`/`_fail()` 签名与 `server.py` 不一致
- `SkillExporter` 初始化使用了错误的构造参数

### Added
- Docker 服务添加 healthcheck 和 restart 策略
- `.env.example` 补充 `EXECUTOR_WORKSPACE`、`EXECUTOR_STORAGE`、`CORS_ORIGINS`
- 路由模块 `init()` 调用已就绪（路由器暂未启用，待行为验证后逐个激活）

## [1.2.0] - 2026-08-17

### Added

**调研驱动的全栈改进（14 项，基于多智能体架构调研 + DSH 代码级取证）**

**代码级修复**
- 投票策略激活：`NegotiationEngine.set_default_strategy()` + `evaluate_consensus()` 传参 + `MeetingCoordinator` 构造参数 + `server.py` WS 消息字段
- TS 重复模块清理：删除 `workflowEngine.ts`（REST shim，零生产引用）

**架构演进**
- Subagent 委托 PoC：`RoleAgent.spawnSubagent()` 独立上下文 + artifact 引用注入父上下文 + `subagent_spawn/complete` 事件
- HITL 分级自动化：`classify_approval_tier()` 三级决策（白名单→分类器→人工）+ `risk_classify()` 风险评分，集成到会议审批流程
- Review 报告闭环：`ReviewIteration` + `ReviewReport` 数据结构，跨迭代累积，返回 `review_report` 字段
- Context Engineering 深化：`MeetingSession.append_event()` 结构化事件（EXPERIENCE_INJECTION/REVIEW/EXECUTION 等）+ `build_experience_summary()` 渐进披露

**可靠性**
- LLM 守卫系统：`safe_llm_reply()` 统一超时保护（120s 默认）+ 自动重试（2 次）+ `on_timeout` 回调，覆盖 meeting_coordinator/review_pipeline/semantic_analyzer/task_orchestrator 全部 LLM 调用点

**标准化评估**
- MCP 协议评估：402 行评估文档，推荐 `MCPAdapterRouter` 实现 `IToolkitRouter` 接口，Phase 1+2 约 26 人天
- Agent Skills 标准对齐评估：评估文档，MDH 实际有 42 个 skill packs，推荐混合模式方案（5-8 人天）

**配置层插件化（5 Phase）**
- SkillBridge：统一加载接口，自动检测 SKILL.md（Agent Skills 标准）/ manifest.yaml（legacy）格式
- ProgressiveSkillLoader：四层渐进披露（L0 索引/L1 指令/L2 参考/L3 脚本）
- SkillRouter：技能路由桥接，L0 索引注入 DynamicRouter
- 批量迁移：42 个技能全部迁移到 SKILL.md 格式（`.legacy_backup/` 保留原文件）
- 迁移工具：`migrate_skills.py`（预览/执行/备份模式）

**技能市场（三阶段）**
- Stage 1：`SharedExperiencePool`（共享经验池：发布/搜索/fork）+ `SkillForkManager`（技能包 Fork：fork/list/pull）+ 7 个 REST API 端点
- Stage 2：`SkillExporter`（导入导出：zip 序列化 + 脱敏）+ 增强 `SkillMarketplace.tsx`（4 Tab 面板：技能/经验/Fork/导入导出）
- Stage 3：`RegistryClient`（Git 注册表客户端：clone/pull/search/install/publish）+ `RegistryServer`（HTTP 注册表服务：6 个 FastAPI 端点）

**模型自产工作流**
- LLM 节点生成：`_llm_generate_nodes_sync()` 分析任务描述生成工作流节点列表
- 验证规则：节点数 1-8、部门映射校验、任务描述非空
- 静默回退：LLM 失败时回退到确定性关键词匹配
- 依赖推断：实现类节点可并行、qa 依赖实现类、devops 依赖 qa+实现类

### Changed

- `semantic_analyzer.py`：`_generate_workflow_definition()` 重构为 LLM 优先 + 确定性回退
- `meeting_coordinator.py`：审批流程集成 HITL 分级，经验注入记录 SessionEvent
- `experience_extractor.py`：新增 `retrieve_with_shared()` 联合搜索本地+共享池
- `review_pipeline.py`：新增 `ReviewIteration`/`ReviewReport` 数据结构

### Documentation

- `docs/guides/improvements-guide.md`：全栈改进使用指南（14 项改进 + API 参考 + 使用示例）
- `docs/compose/spec/mcp-integration-evaluation.md`：MCP 协议集成评估
- `docs/compose/spec/agent-skills-alignment-evaluation.md`：Agent Skills 标准对齐评估
- `docs/compose/spec/skill-marketplace.md`：技能市场设计文档

## [1.1.0] - 2026-08-16

### Added

**会议纪要任务全链路（真实试点，7/7 验收 PASS）**
- 纪要意图识别文档模式 → 会议纪要 DAG 工作流（提取/起草/校对节点）→ 节点执行 → 产出物落盘（`minutes_workflow.py` / `pilot_minutes.py`）
- 纪要转录注入节点输入、gate 序列化补齐（workflow_node_to_dict / dict_to_workflow_node 回环）

**资产沉淀闭环（M3/M4）**
- `AssetStore`：三类资产（产出物 artifacts / 模板 templates / 技能规则 rules）团队级文件系统存储 + 原子写 + 判重
- `AssetEvaluator`：确定性四检查 + 可注入 LLM judge seam（fail-closed）
- 模板固化流程：`TemplateConfirmation` 消费侧桥接 ApprovalManager gate 决定 → 入库（员工审批把关）
- 技能进化：`SkillEvolution.evolve_from_feedback` 把关差异提炼 → 增量区（`write_to_incremental_area`）；`modify_rule` 公开元数据更新 API（allowed_fields 含 source_task_type/team_id）
- 资产检索 `AssetSearch`：三类资产合并检索 + 团队隔离

**LLM judge 评测与基准**
- `make_llm_judge` / `make_judge_from_env`（DeepSeek OpenAI 兼容端点，CJK 数字解析修复）
- 演示端点接线：`ASSET_JUDGE_ENABLED` env 开关 → 真实 judge 惰性单例（真实 key 端点试点 5/5 PASS）
- 评测基准：内置标注集 + `evaluate_judge` 五指标 + `load_benchmark_items` 外部 JSON 加载（`benchmark_items.example.json` + parity 测试）
- CI 质量门禁：`asset_benchmark_gate.py`（三阈值 vs 五指标 + 基线记录 + 无 key 确定性自检）+ GitHub Actions 接入示例文档

**资产复用注入（M4）**
- `AssetContextBuilder`：DAG 节点 prompt"资产参考"段（模板/知识/技能规则节选，渐进披露 caps）
- 生产 team_id 通道：`process_user_message` → `semantic_analyze` → `analyze` 三层尾置透传 → 纪要工作流节点 input_spec（空 team_id 形状零变化）
- llm_cache 团队隔离：`semantic_analyze` team_id 非空时绕过缓存（跨团队 TTL 不丢 team_id）
- 真实纪要注入试点：`pilot_asset_injection.py` 预置资产 + 重注册 executor → 注入 3/3 vs 空团队 0/3 对照 PASS

**规则级团队隔离**
- `ExperienceRule.team_id` 字段 + YAML 序列化（旧规则缺键容错）+ `retrieve_relevant_rules` 团队过滤（空=全局向后兼容）
- `migrate_rules_team_id`：存量规则批量回填（115 条真实规则迁移至 team-x，幂等 + 空目标守卫）

**M5 资产可视化与复用可感知**
- 前端资产浏览面板 `AssetBrowserPanel`：团队选择/检索（参数化 task_type+keywords）/产出物·模板·技能规则三块列表（状态徽章 + judge_score + 审批人/创建时间）/空态；挂载于 OfficeTeamMode `🧠 资产` 标签
- 复用率指标：`build_asset_context` 注入计数（total/by_team/by_type/last_at）+ `GET /api/assets/reuse-metrics` 端点 + 线程安全（`_REUSE_LOCK`）+ JSON 落盘持久化（重启恢复，build 前加载）
- 共享前端 API 工具 `apiFetch`（`_ok` 解包 + success 守卫 + init 守卫）

**其他**
- 员工目录 `EmployeeDirectory`（emp-id → 显示名解析，gate/审批显示 approverName）
- SMTP 邮件发送（标准库 smtplib + 显式 timeout + STARTTLS 支持评估）
- 审批面板增强（gate approver/task/gate 上下文显示）
- 低严重度收尾：试点脚本健壮性（`--verbose` / 端口预检）、`.env.example` 文档化 `ASSET_JUDGE_ENABLED`

### Fixed

- llm_cache 跨团队泄漏：同消息不同团队 300s TTL 命中返回旧 team_id 结果（`semantic_analyze` team_id 非空绕过缓存）
- 技能规则注入跨团队泄漏：`retrieve_relevant_rules` 全局检索 → 团队过滤（fail-closed：`team_id=""` 旧规则对团队检索不可见，存量迁移解决）
- 面板崩溃：后端 `_fail`（HTTP 200 + success:false）被 `res.ok` 守卫漏过 → `apiFetch` success 守卫
- 资产浏览 search 合并双渲染（同源列表）→ merged 按 id 去重
- 团队切换残留（旧 search/旧列表）→ effect 顶部清空
- 复用统计重启覆盖：`build_asset_context` 计数前未加载落盘值 → `_ensure_loaded()` 前置
- 复用统计并发丢失自增：模块级 dict 无锁 → `_REUSE_LOCK`（含保存全程 tmp 竞态）
- 评测基准外部标注集 StopIteration：perfect judge 基于传入 items
- `"gold_score": true` 被静默接受为 1.0（bool 是 int 子类）→ 数值校验显式排除 bool
- 演示端点非字符串 JSON 值未捕获 500 → `_fail` 统一兜底
- CJK 相邻数字解析：`\b` 边界误判（`0.85分` → 0.0）→ digit lookaround 正则

### Changed

- `SemanticAnalyzer.analyze` / `MeetingCoordinator.semantic_analyze` / `process_user_message` 增加尾置 `team_id` 参数（默认空，形状零变化——8 个生产调用方零影响）
- `build_minutes_workflow` 增加尾置 `team_id` 透传（节点 input_spec）
- `modify_rule` allowed_fields 扩展（source_task_type / team_id）——`_save_rule` 不再被跨模块直调
- `ExperienceExtractor.retrieve_relevant_rules` / `evolve_from_feedback` 增加 team_id 参数（空=全局向后兼容）
- 最终交付报告 `docs/compose/reports/hybrid-team-platform.md` 更新至 commits d069ab6..70c7dd3（含 18 项计划/规格 NOTE 标记）

### Removed

- （无破坏性移除）

## [1.0.0] - 2026-08-14

初始版本基线：项目启动（2026-05-22）至产品定型与 P3 阶段交付（2026-08-14）的全部开发历史（commits 至 2f91173）。按功能模块整理。

### 前端与 3D 视觉

- **项目早期（05-22 ~ 05-31）**：远程插件 Shell 架构（移除旧 sidepanel-host）、Chat-Agent 界面/配置面板重构、Tool Calling 意图识别、执行状态/计划进度跟踪、Vite 构建迁移（src 目录）、主题切换、agentscope 子模块引入、浏览器自动化核心、技能模板系统（保存/加载/运行）、多 LLM 提供商支持、用户确认请求/结果处理、SSO 认证、技能类型选择/AI 摘要/导入导出、**Vue → React 迁移**（05-29）+ 多模态开关、agentscope 子模块迁移 third_party（05-31）
- **多智能体协作 UI**（05-31 ~ 06-04）：Agent 角色卡片、团队协作办公室场景、3D 科技大厦视图（Three.js）+ 办公室模式流程重构、城市地面系统重构、V4.9 协议文档
- **赛博朋克视觉升级**（06-05 ~ 06-09）：电影级城市场景、建筑群全栈逼真升级、空中交通与天气效果 Phase2、科技塔 day/night 模式切换
- **前端协作功能群**（07-01 ~ 07-05）：session 状态持久化（断开自动保存 + 恢复 API）、投票决策系统（proposal/vote/vote_result）、人工审批系统（human_approval_request/response）、检查点系统（checkpoint_save/restore）、审计日志（audit_log WS）、关键阻塞系统 critical_blocker、工作流引擎 REST API 8 端点、历史回放 + 技能市场 UI、自定义角色模板 UI、智能体权重调整 UI、多轮迭代可配置、LLM 缓存与错误恢复、并发任务执行 + Prometheus 指标端点；核心模块测试冲刺（81 测试）
- **TS-Python 智能体桥接**（07-03）：前端 TS 智能体 ↔ 后端 Python AgentScope 智能体消息路由（bridge_register_agent / bridge_message + 双向 ID 映射）

### 多智能体协作系统

- 完整会议模式 + production-multi-agent-evolution V2/V3 迭代（05-31 ~ 06-01）
- CEO 智能会议组织者 + 自动任务指派（06-02）
- 技能进化系统 + 技能进化工作台 + 动态路由系统（06-03）
- 意图识别与动态路由：ComplexityClassifier（两层判定）+ DynamicRouter（四维加权）+ SemanticAnalyzer
- WhyBuddy 技能包与工具链（06-08）
- 自适应协作链路、串行流程重构（06-10）

### 工具与执行系统

- **工具/工作区基建**（06-12）：ToolRegistry（安全检查）+ ToolExecutor（bash/file/git）+ WorkspaceManager（git worktree 隔离）+ GitIntegration（PR 创建）+ WorkspacePanel + 工作区/工具调用消息处理 + MeetingCoordinator 工具执行支持 + CeoAgent 工作区创建集成 + agenda 管理与 CEO assistant
- 中期功能（06-13 ~ 06-29）：角色配置系统、角色选择/多部门配置、AI 技能生成、任务管理、executor 认证
- **TS-Python 工具对齐**（08-11）：LocalToolkitRouter 5→18 工具与 Python ToolExecutor 完全对齐 + 知识/规则注入 system prompt
- **上下文传递优化**（08-11）：ExecutionSummary 结构化摘要替代 substring 截断；讨论反对意见转"避免：xxx"约束注入
- run_tests pytest 回退（07-31）

### TS 编排层与路由

- **TS 统一编排层**（07-06）：TypeScript=编排层（CEO+Team+Skills），Python=纯执行层；team/assembler/skill loader/toolkit router（local/remote）；08-11 后端 Python 模块本地化 TS 迁移启动
- **Per-Agent Routing**（07-06）：TeamMember 独立 location(local/remote) + RouterFactory 按成员位置路由 + CeoChatPanel 💻/☁️ 切换（role_locations 全链路透传）
- RemoteToolkitRouter 指数退避重试（4xx 不重试/5xx+network 重试）
- **Per-Role Agent**（07-13）：RoleAgent 封装独立 messages/systemPrompt/tools/router；buildSystemPrompt 三段式；TeamCoordinator 上帝对象 → 编排 RoleAgent[]；ElectronRoleAgent 内联
- 弹性层与跨网络协作（07-07 ~ 07-10）：CircuitBreaker、跨网络智能体桥接/发现

### Electron 桌面

- **桌面主体**（07-22 ~ 07-30）：脚手架 + IPC 协议、secure API Key 存储与设置 UI、自动更新与打包分发、Windows 构建 ESM/CJS 兼容；主进程集成（TeamCoordinator per-role 重构、ElectronRoleAgent 并行讨论）
- 项目持久化（主进程 userData/projects.json + 4 IPC 通道）
- **离线 PPT 生成**（08-04）：pptxgenjs 纯 JS 打包进 asar + create_slide 工具分支 + 路径守卫——真实 LLM E2E PASS
- **离线 Word 生成**（08-06）：Node.js `docx` 库 + create_document 工具分支 + docRoles 11 角色宣传——真实 LLM E2E PASS
- bash 工具拦截 python 家族（bashGuard 正则防绕过）；工具宣传缺口修复（executeTool 支持 ≠ LLM 调用）

### loop-engineering 循环工程（06-30）

- 独立产品脚手架 + CLI：metrics 套件（收集器 + 质量分数 + SQLite 存储 + 报告）、prompt 进化（tracker/analyzer/evolver/实验 runner）、CI 门禁与基线、场景注册表（5 场景）

### 协作基础设施与执行强化（08-13，P0/P1/P2）

- **工作流引擎**：DAG 三策略（顺序/并行/混合）+ 生命周期 + start_workflow 真可取消（1fa1253）；双 WorkflowEngine 合并共享引擎注入 + 委托路由（057106e/6b886dc）；节点真执行（_run_agent_execution_loop 代码块→write_file + tool_call 备用）；durable execution（JSON 持久化 + 冷启动恢复）
- **审批**：request_approval + wait_for_decision 真阻塞（超时默认通过）+ 会议处理转后台任务 + 结构化推送（a831dce/b46b234）；ApprovalManager 把关数据模型（request_gate/handle_gate_response + 成对审计）
- **审查**：CriticAgent LLM 审查通道（规则兜底 + LLM 补充）；确定性门禁（_run_deterministic_gate fail-closed）；artifact 模式（执行产物摘要）
- **路由/技能/DAG 强化**：路由断链修复（消费即删闭环）、技能闭环自动触发（审核→增量→打包）、DAG 去硬编码（确定性依赖推断）
- 模型故障转移（池健康检查 + 失败驱逐）；混合执行真接线（executorUrl 全链贯通）；P2 遗留 9 项闭环
- 死代码清理（parallel_discussion_manager/parallel_meeting_coordinator 删除）

### P3 阶段一（08-13/14）

- **session log 真相源**：SessionEvent 事件流（JSONL append + deriveMessages 投影 + 快照审计）+ LLM 上下文投影 + 并行讨论补写 meeting
- **快照评测门禁**：orchestrator snapshot.ts（sha256/exitCode/qualityChecks）+ runScenario keyless 回放

### 架构分析与产品设计（08-13/14）

- 多智能体架构分析（现状取证 43 来源 + 行业趋势 + 三阶段路线图）；路线图按五大支柱 + P0/P1/P2 重写
- **产品设计**：「人+agent 混合团队协作平台」（[S1]-[S6]）：双内核并列、关键把关（人管决策/agent 管执行）、文职/办公垂直、三类资产沉淀、团队级边界 + Palantir AIP 对标
- dsh 深度代码调研：10 主线原理文档 `deepseek-harness-code-principles.md` 入库

### M1-M2 会议纪要全链路（08-14）

- **M1 引擎底座**（main@766fed3）：ApprovalManager 把关模型 + DAG 工作流引擎 + 会议纪要 docx seam（纯标准库）+ Spec Tree/Gate Manager/EARS
- **M2a 全链路**（main@a604487）：纪要意图识别文档模式（确定性短路）+ build_minutes_workflow 3 节点 DAG + gate 序列化补齐 + 演示端点 POST /api/minutes + 邮件 seam
- **M2b-1 把关收尾**（main@92037d0）：gate 强制力（拒绝→FAILED+下游 SKIPPED）+ approver 五表面透传 + SMTP provider + 端点输入加固
- **M2b-2 前端把关 UI**（main@2f91173）：ApprovalPanel gate 字段适配（riskBadge/置信度/理由）+ WS 双通道 + vitest .tsx 基础设施

### Fixed

- `WorkflowNode.gate` 序列化丢失 → dict 往返补齐 + 回环测试
- gate 拒绝结果无消费者 → `_execute_node` 消费 rejected → FAILED
- 演示端点未捕获异常 500 → `_fail` 统一兜底
- `useMeetingSocket` 返回对象解构缺名 → 解构清单补齐
- 纪要检测死逻辑（吸收律化简）；`_detect_minutes_task` 关键词双源漂移 → 派生对齐
- 前端审批三字段空值判定（后端发射 `""`）→ truthy 判定约定

### Changed

- 意图识别增加文档模式分支（纪要任务确定性短路）
- 审批 WS payload 追加 taskId/gateId/approver（additive-safe）
- `TeamMember.display_name` 尾置默认字段；vitest include 扩展 `.tsx`
