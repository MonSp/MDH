# Changelog

本项目所有值得记录的改动。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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
