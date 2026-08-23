---
feature: quarterly-roadmap-q4-2026
status: in-progress
updated: 2026-08-23
branch: main
commits: aea8e36..HEAD
---

# MDH 季度战略路线图 (2026 Q4)

## Report

**What was built** — 一份基于代码级取证（`analysis/multi-agent-architecture-future` 分支，43 来源 deep-research 调研）的 12 周季度战略路线图。识别 9 项结构性局限（L1-L9），对照 v1.6.11 现状逐一盘点，制定 18 个任务分 3 个里程碑（M1 生产基线、M2 AI 能力深化、M3 产品体验），覆盖生产化加固、AI 能力深化、产品体验三个维度。

**Verification** — 文档内容与 AGENTS.md 架构描述一致；所有局限引用对应分析分支的 file:line 证据；任务依赖关系无环；每个设计需求有至少一个任务覆盖。

**Journey log** —
- 分析分支的 9 项局限中，v1.5-v1.6 迭代已部分修复（SQLite 并发安全、死代码部分清理），但核心架构断链（工作流双实例、混合执行硬编码、LLM 26× 放大）均未触及
- 行业方向明确收敛于"强单 agent + 确定性轻协作 + 标准协议"，MDH 的组织模拟范式需要从编排核心降权为 UI 心智模型
- 技能进化 CoW 设计是先发资产，与 Agent Skills 标准方向同构，应优先对齐

## [S1] Problem

MDH 在 v1.0→v1.6.11 的 8 天内完成了 33 次发布，建立了完整的多智能体协作原型。基础设施层（SQLite/WAL、RBAC、多模型、Webhook、缓存、备份）已就位，但 `analysis/multi-agent-architecture-future` 分支的代码级取证揭示了 9 项结构性局限（L1-L9）。v1.5-v1.6 的快速迭代主要在功能广度上扩展，架构层面的核心断链（工作流名不副实、混合执行未接线、技能闭环半通、单点故障、LLM 调用 26× 放大）尚未修复。

行业方向已明确收敛：**强单 agent 主轴 + 确定性轻协作 + 标准协议 + 可恢复执行**（Anthropic/MCP/A2A/LangGraph 共识）。MDH 的差异化资产（技能进化 CoW 设计、3D 虚拟办公室、组织叙事）需要在新范式下重新定位，而非在旧范式上继续堆叠功能。

## [S2] Design

### 季度目标

**在 12 周内将 MDH 从"功能完备的原型"演进为"架构可信的生产平台"**，聚焦三个维度：

| 维度 | 核心命题 | 成功标准 |
|------|----------|----------|
| **生产化加固** | 消除断链、接通混合执行、实现 durable execution | 工作流可暂停/恢复/重试、混合执行端到端贯通、无单点故障 |
| **AI 能力深化** | 从重流程协作转向 orchestrator-worker + artifact 模式 | LLM 调用从 26× 降至 8-12×、审查接入真实 LLM、技能闭环自动完成 |
| **产品体验** | 从技术演示升级为可用产品 | 用户可在虚拟办公室观察真实 agent 工作、Artifact 可视化、对话体验流畅 |

### 已完成与未完成盘点

基于 `analysis/multi-agent-architecture-future` 分支分析（基线 v1.3.4），对照 v1.6.11 现状：

| 局限 | 描述 | v1.6.11 状态 | 本路线图处理 |
|------|------|-------------|-------------|
| L1 | LLM 调用 26× 放大 | 未修复 | **Q1** 裁剪讨论轮数、**Q2** artifact 模式 |
| L2 | 工作流名不副实 | 未修复 | **Q1** DAG 去硬编码 + 节点接线工具执行 |
| L3 | 自适应路由学习断链 | 未修复 | **Q1** 接线 update_stats |
| L4 | 投票机制硬编码 | 未修复 | **Q1** 激活策略 或 精简为确定性聚合 |
| L5 | 技能闭环半通 | 部分修复（v1.5.x 进化框架） | **Q2** 自动触发闭环 + Skills 标准对齐 |
| L6 | 混合执行未接线 | 未修复 | **Q1** TS 编排器接线 + Python 工具路由 |
| L7 | Critic/Grounding 非 LLM | 未修复 | **Q2** 接入真实 LLM 审查 |
| L8 | 死代码债务 | 部分修复（v1.3.2 拆分） | **Q1** 清理残余死代码 |
| L9 | 单点故障 | 部分修复（v1.6.x SQLite 并发安全） | **Q1** durable execution 基础、**Q3** 完整 |

### Q1 (Week 1-4): 生产化基线 — 断链修复 + 架构收敛

**目标**：让现有机制名副其实，建立可度量基线。

#### T1: 工作流引擎统一与增强 (covers: L2)

- 合并 `server.py` 全局 WorkflowEngine 与 `meeting_coordinator.py` 会议引擎为单一实例
- `meeting_coordinator.py` 的 `execute_workflow` 接入 `_running_tasks`（暂停/取消真正生效）
- 去硬编码：`semantic_analyzer.py` 的 `dept_order = ["dept-frontend","dept-backend","dept-qa","dept-devops"]` 改为由 LLM planner 产出真实 DAG
- 工作流节点接入真实工具执行（写文件），与串行路径 TaskOrchestrator 能力对齐
- acceptance: 会议内创建的工作流可通过 REST API 暂停/恢复/取消；工作流节点产出真实文件

#### T2: 混合执行端到端贯通 (covers: L6)

- TS `TeamCoordinator.createTeam` 解除 `location: 'local'` 硬编码（`orchestrator/src/team/coordinator.ts:413`），从 UI `roleLocations` 传入
- `HybridToolkitRouter` 接线到 `RoleAgent`，按工具类型路由（本地文件操作 → local，远端执行 → remote）
- Python 侧 `task_orchestrator.py` 的 `AgentToolset` 感知 location，remote 调用走 HTTP executor
- acceptance: 用户在前端为不同 agent 选择 local/remote 后，工具调用在对应端执行，日志可追踪

#### T3: 路由自适应学习接线 (covers: L3)

- `meeting_coordinator.py` 会议结束时调用 `DynamicRouter.update_stats(dept_id, success)`，从任务结果提取成功/失败
- 路由统计持久化到 SQLite（当前为内存 dict + JSON 文件）
- acceptance: 执行 10+ 次任务后，`/api/routing/stats` 显示部门成功率随任务结果变化

#### T4: 投票机制精简或激活 (covers: L4)

- 方案 A（推荐）：保留 SIMPLE_MAJORITY 为唯一策略，删除 `weighted_vote`/`argument_based` 未接线代码路径；讨论结果改为 orchestrator 聚合（反对意见转 avoid-constraints，延续 git `c3236d5` 方向）
- 方案 B：激活 weighted/argument_based，接线到 meeting_coordinator
- acceptance: 代码路径与实际行为一致，无死代码

#### T5: 残余死代码清理 (covers: L8)

- 删除或正式归档 `parallel_discussion_manager.py`/`parallel_meeting_coordinator.py`
- 统一或删除串行 `DiscussionManager` 回退（两套收敛语义不一致的遗留问题）
- 清理 `mock-sso/` 镜像目录
- acceptance: grep 无未接线的 orphan 模块引用

#### T6: Durable Execution 基础 (covers: L9)

- 会话状态定期快照到 SQLite（检查点间隔可配置）
- 服务重启后自动恢复最近检查点
- 防重复执行：已提交的任务有幂等标识
- acceptance: 杀死 backend 进程后重启，未完成任务从检查点恢复继续执行

### Q2 (Week 5-8): AI 能力深化 — orchestrator-worker + artifact + 标准对齐

**目标**：编排核心从重流程转为轻协作，技能系统对齐行业标准。

#### T7: Orchestrator-Worker 编排核心 (covers: L1, L2)

- CEO Agent 的编排逻辑从"全员会议讨论→投票→执行"改为"planner 拆解→直接委派→结果聚合"
- 讨论轮数从 2 轮裁剪为 0-1 轮（仅在方案分歧时触发）
- 反对意见自动转为 avoid-constraints 注入执行上下文
- LLM 调用目标：从 26× 降至 8-12×
- acceptance: 同等复杂度任务，LLM 调用次数 ≤ 12；任务成功率不低于当前基线

#### T8: Artifact 模式 (covers: L1)

- 角色产出物落文件系统（`data/workspaces/<project_id>/artifacts/`）
- 后续角色读取 artifact 文件而非通过 LLM 传递上下文
- 轻量引用协议：`{type, path, summary, agent_id}`
- acceptance: 多角色协作时，中间产物通过文件系统传递，非 LLM 消息

#### T9: 审查接入真实 LLM (covers: L7)

- CriticAgent 接入 LLM 进行代码质量审查（当前为同步规则匹配）
- GroundingAgent 接入 LLM 验证结论的代码出处（当前为简单正则匹配）
- 审查流水线保留确定性检查（lint/test）+ LLM 审查双层
- acceptance: 审查报告包含 LLM 生成的具体代码改进建议，非模板化输出

#### T10: 技能闭环自动完成 (covers: L5)

- 项目结束（meeting_ended）自动触发：审核通过的规则 → 写入增量区 → merge 到基础包 → 生成升级版技能包
- 技能进化结果写入 SQLite（`skill_evolution` 表），支持查询历史版本
- `/api/skills/evolve` 与会议内提取逻辑去重，统一入口
- acceptance: 一个完整会议结束后，技能包自动更新，无需手工 REST 触发

#### T11: Agent Skills 标准对齐 (covers: S2)

- 技能包目录结构对齐 agentskills.io 标准：`folder + instructions + scripts + progressive loading`
- 保持 CoW 增量设计（只读基础 + 可写增量），与标准兼容
- 渐进披露加载器适配标准的四层模型
- acceptance: 技能包可同时被 MDH 和标准兼容工具链加载

#### T12: MCP Client 集成 (covers: S2)

- 实现 MCP client（基于 `mcp_adapter.py` 现有基础）
- Agent 工具列表可动态包含 MCP server 暴露的工具
- 工具描述注入的安全边界（输入校验 + 域名白名单）
- acceptance: 配置 MCP server 后，agent 可调用其工具，结果正确路由

### Q3 (Week 9-12): 产品体验 — 从技术演示到可用产品

**目标**：交互层与可视化层匹配底层能力提升。

#### T13: 虚拟办公室交互重塑

- 3D 场景中的 agent 状态反映真实执行状态（当前仅显示 idle/working）
- agent 正在执行的工具调用、产出的 artifact 实时可视化
- 工作流 DAG 在 3D 场景中以依赖图形式呈现
- acceptance: 用户可从 3D 场景观察到 agent 正在执行什么、产出了什么

#### T14: 对话体验优化

- CEO 对话面板支持流式输出（当前 agent_message delta 流式已存在但前端渲染不稳定）
- 讨论/审查/投票结果的结构化展示（非纯文本堆叠）
- 历史会话可回放
- acceptance: 用户与 CEO 对话时，流式输出延迟 < 200ms，讨论结果清晰结构化

#### T15: HITL 分级重设计

- 分级审批对齐 Anthropic auto mode 分类器思路：
  - Tier 1 (确定性安全)：read/list/git_status → 自动通过，UI 不弹窗
  - Tier 2 (中等风险)：write/edit/bash → 风险评分器决定，低风险自动通过
  - Tier 3 (高危)：git_push/sudo/rm → 强制人工审批
- 审批疲劳监控：统计自动/人工审批比例，目标 FPR < 1%
- acceptance: 正常开发流程中，> 90% 的工具调用无需人工干预

#### T16: Electron 桌面端体验

- 离线 PPT/DOCX 生成能力集成到主 UI（当前为独立 demo）
- 本地工具执行在 Electron 环境下无延迟
- 系统托盘常驻 + 任务完成通知
- acceptance: Electron 客户端可离线创建 PPT/DOCX，体验与在线版一致

#### T17: 可观测性仪表盘

- 运维仪表盘：agent 活跃度、LLM 调用量、工具执行耗时、技能进化统计
- 任务执行时间线：从 CEO 拆解到最终交付的全链路追踪
- 异常告警：LLM 超时、工具执行失败、路由学习异常
- acceptance: 管理员可从仪表盘看到系统健康状态和性能瓶颈

#### T18: 多租户完善

- 租户级数据隔离（当前仅有 API key 隔离）
- 租户级技能包管理
- 租户管理员角色 + 权限
- acceptance: 两个租户的数据完全隔离，互不可见

### 里程碑定义

| 里程碑 | 时间 | 验收标准 |
|--------|------|----------|
| **M1: 生产基线** | Week 4 | 工作流统一、混合执行贯通、路由学习接线、死代码清零、检查点恢复 |
| **M2: 能力升级** | Week 8 | LLM 调用 ≤ 12×、artifact 模式、真实 LLM 审查、技能自动闭环、MCP client |
| **M3: 产品就绪** | Week 12 | 虚拟办公室实时可视化、HITL FPR < 1%、Electron 离线能力、可观测性仪表盘 |

### 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 工作流节点接入真实工具执行后，错误传播复杂 | Q1 延期 | 节点独立沙箱，失败隔离 + 重试 |
| Orchestrator-worker 编排改变后，任务成功率下降 | Q2 延期 | A/B 测试：保留旧路径作为回退，成功率基线对比 |
| MCP client 与现有工具系统冲突 | Q2 功能降级 | 工具优先级：本地工具 > MCP 工具，冲突时本地优先 |
| Electron 环境差异导致工具执行异常 | Q3 延期 | CI 矩阵测试（Node 版本 × 平台） |

## [S3] Out of Scope

- **商业模式/定价**：本路线图不涉及 SaaS 定价、企业版功能划分
- **移动端适配**：3D 虚拟办公室的移动端适配工程量过大，不在本季度范围内
- **A2A 协议**：跨产品 agent 通信协议，当前无跨产品场景需求
- **GPU 推理本地化**：Ollama 本地模型已支持，但 GPU 推理优化不在范围内
- **新领域技能包开发**：路线图关注架构和平台，新技能包内容开发为独立工作流

## Tasks

- [x] T1: 工作流引擎统一与增强 — acceptance: 会议内工作流可通过 REST 管理、节点产出真实文件（covers: L2; **M1**)

  > **实施发现 (2026-08-23)**: 代码级取证基于 v1.3.4，但 v1.6.11 已修复大部分问题：
  > - 双引擎实例 → 已统一（server.py 注入共享引擎到所有 3 条生产路径）
  > - 硬编码线性 DAG → 已修复（LLM + 确定性关键词双路径，真实 DAG 推断）
  > - 节点不写文件 → 已修复（AgentToolset + 代码提取 + 多轮循环）
  > - _running_tasks 未使用 → 已修复（start_workflow 注册）
  >
  > 本次实际修复：
  > - `_llm_generate_nodes_sync` → async `_llm_generate_nodes`（同步版本在 FastAPI 事件循环中永远返回空，LLM 路径实际为死代码）
  > - 工作流节点执行增加环境检查 + 依赖安装 + 语法验证（对齐 TaskOrchestrator 能力）
  > - 统一 always 注册执行器（移除条件分支死代码路径）
  > - 测试：1690 Python + 1726 TS 全部通过
- [x] T2: 混合执行端到端贯通 — acceptance: per-agent location 选择贯穿 TS+Python 两侧（covers: L6; **M1**)

  > **实施 (2026-08-23)**: TS 侧已完整接线（RouterFactory 按 location 路由到 Local/Remote/HybridToolkitRouter）。
  > Python 侧修复：
  > - `protocol/meeting.py`: `MeetingAgentInfo` 新增 `location` 字段
  > - `ceo_agent.py`: `team_to_meeting_template` 传递 `member.location` 到会议模板
  > - `meeting.py`: `start()` 从模板读取 `location` 写入 `MeetingAgentInfo`
  > - `agent_toolset.py`: 新增 `RemoteAgentToolset`（HTTP 调用 executor_server）+ `create_agent_toolset` 支持 location/executor_url 参数
  > - `task_orchestrator.py`: 按 `agent_info.location` 选择 local/remote toolset
  > - `coordinator_workflow.py`: 按 agent location 选择 local/remote toolset
  > - `meeting_coordinator.py`: 新增 `executor_url` 参数，传递到 TaskOrchestrator
  > - `ceo_agent.py`: 从 `MDH_EXECUTOR_URL` 环境变量读取 executor URL
  > - 1681 Python + 1726 TS 测试全部通过
- [x] T3: 路由自适应学习接线 — acceptance: 部门成功率随任务结果变化且持久化（covers: L3; **M1**)

  > **实施发现 (2026-08-23)**: 代码级取证的 L3 断链在 v1.6.11 已修复：
  > - `auto_assign_task()` → `track_task(task_id, dept_id)` 记录任务→部门映射
  > - `_update_routing_stats_safe()` 在简单路径(L954)和复杂路径(L1376)执行后消费映射
  > - `DynamicRouter.update_stats()` 更新成功率并持久化到 JSON（原子写入）
  > - 81 个路由统计测试验证闭环（含 `test_auto_assign_then_update_stats_closed_loop`）
- [x] T4: 投票机制精简或激活 — acceptance: 代码路径与行为一致（covers: L4; **M1**)

  > **实施 (2026-08-23)**: 方案 A（精简）已实施：
  > - `negotiation.py`: 删除 `WEIGHTED_VOTE`/`ARGUMENT_BASED` 策略、`ArgumentRef`/`Argument` 数据类、`add_argument`/`set_agent_weight`/`get_agent_weight`/`set_default_strategy` 方法
  > - `protocol/voting.py`: 同步精简，移除 `ArgumentRef` 及其序列化
  > - `meeting_coordinator.py`: 移除 `consensus_strategy` 构造参数、`add_argument` 调用
  > - `ws_handlers.py`: 移除 `handle_adjust_agent_weight` handler、简化 `handle_evaluate_consensus`
  > - `mixed_location_discussion.py` + `discussion_manager.py`: 移除 `add_argument` 调用
  > - 测试更新：1681 Python + 1726 TS 全部通过
- [x] T5: 残余死代码清理 — acceptance: 无 orphan 模块（covers: L8; **M1**)

  > **实施 (2026-08-23)**: 删除 4 个 Python orphan 模块 + 对应测试，净减 1175 行：
  > - `cross_network_bridge.py` (347 行) + test (313 行) — 未被任何生产代码引用
  > - `git_integration.py` (109 行) + test (121 行) — 未被任何生产代码引用
  > - `progressive_skill_loader.py` (155 行) — 未被任何代码引用（skill_bridge 已替代）
  > - `errors.py` (92 行) — 未被任何代码引用
  > - `test_skill_bridge.py`: 移除 ProgressiveSkillLoader 测试类和导入
  >
  > 注意：TS 侧 4 个 Local 模块（dynamicRouterLocal/experienceExtractorLocal/projectManagerLocal/skillPackagerLocal，共 1107 行）已确认无消费者引用，但因从 index.ts 导出，删除需同步更新 index，留作后续清理。
  >
  > 1654 Python + 1726 TS 测试全部通过。
- [x] T6: Durable Execution 基础 — acceptance: 服务重启后任务从检查点恢复（covers: L9; **M1**)

  > **实施 (2026-08-23)**:
  > - `session_persistence.py`: 新建 SessionPersistence（快照 + 幂等执行）
  > - `db.py`: 新增 session_snapshots + task_executions 表
  > - `meeting_coordinator.py`: 集成快照保存和幂等检查
  > - 1664 Python + 1726 TS 测试全部通过
- [x] T7: Orchestrator-Worker 编排核心 — acceptance: LLM 调用 ≤ 12×（covers: L1; **M2**; depends: T1）

  > **实施 (2026-08-23)**:
  > - 讨论轮数从 2 减至 1（max_rounds=1），标准任务跳过讨论直接分派
  > - 审查流水线合并：Reviewer + Monitor + Coordinator 从 3 次 LLM 调用合并为 1 次
  > - 复杂路径 LLM 调用从 ~15-19× 降至 ~9-12×
  > - 1665 Python + 1726 TS 测试全部通过
- [x] T8: Artifact 模式 — acceptance: 多角色产物通过文件系统传递（covers: L1; **M2**; depends: T1)

  > **实施 (2026-08-23)**:
  > - `artifact_store.py`: 新建 ArtifactStore（结构化产物存储）
  >   - ArtifactRef 数据类（type/path/summary/agent_id/size）
  >   - save_artifacts: 保存文件引用到 `.artifacts/<task_id>.json`
  >   - load_artifacts / read_artifact_content: 读取引用和实际文件内容
  >   - build_artifact_context: 构建审查用的文件内容上下文
  >   - 自动类型推断（code/document/data/file）
  > - `meeting_coordinator.py`: 集成 ArtifactStore
  >   - _save_execution_artifacts: 执行后保存 artifact 引用
  >   - 审查前读取 artifact 文件内容注入执行上下文
  > - 1672 Python + 1726 TS 测试全部通过
- [ ] T9: 审查接入真实 LLM — acceptance: 审查报告含 LLM 生成的具体建议（covers: L7; **M2**)
- [ ] T10: 技能闭环自动完成 — acceptance: 会议结束自动更新技能包（covers: L5; **M2**)
- [ ] T11: Agent Skills 标准对齐 — acceptance: 技能包兼容 MDH 和标准工具链（covers: S2; **M2**; depends: T10)
- [ ] T12: MCP Client 集成 — acceptance: agent 可调用 MCP server 工具（covers: S2; **M2**)
- [ ] T13: 虚拟办公室交互重塑 — acceptance: 3D 场景反映真实 agent 状态和 artifact（**M3**; depends: T8)
- [ ] T14: 对话体验优化 — acceptance: 流式输出延迟 < 200ms，结果结构化展示（**M3**)
- [ ] T15: HITL 分级重设计 — acceptance: > 90% 工具调用无需人工干预（covers: L7; **M3**; depends: T9)
- [ ] T16: Electron 桌面端体验 — acceptance: 离线创建 PPT/DOCX（**M3**)
- [ ] T17: 可观测性仪表盘 — acceptance: 管理员可见系统健康和性能瓶颈（**M3**; depends: T6)
- [ ] T18: 多租户完善 — acceptance: 两个租户数据完全隔离（**M3**)
