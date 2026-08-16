# Changelog

本项目所有值得记录的改动。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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

初始版本基线：P3 阶段完整交付（commits d069ab6..2f91173 区间，产品设计获批 → M1 引擎底座 → M2a 会议纪要全链路 → M2b 把关后端收尾 → M2b-2 前端把关 UI）。

### Added

**产品设计（2026-08-14）**
- 「人+agent 混合团队协作平台」设计文档（`docs/compose/specs/2026-08-14-hybrid-team-platform-design.md`，[S1]-[S6]）：双内核并列（编排派发 + 资产沉淀）、关键把关（人管决策点/agent 管执行）、文职/办公垂直、三类资产沉淀、团队级边界
- Palantir AIP 对标（[S6]）：AIP Document Intelligence / AIP Evals 印证确认闭环与评测纪律，Agents→Chatbots 收敛信号佐证"可部署能力单元 + 确定性流程 + 人确认"

**P3 快照评测与 session log（2026-08-13/14）**
- Executor 快照评测：keyless checks（确定性校验 + verifyCommands + qualityChecks）+ 场景回放（`--workspace` 本地回放）
- MeetingSession 事件化真相源（T50）：`deriveMessages` 投影 + 快照 window 恢复 + 讨论上下文角色谓词过滤 + 并行讨论补写 meeting

**M1 引擎底座（main@766fed3）**
- 把关数据模型：`ApprovalManager`（request_gate/handle_gate_response/wait_for_decision + gate/decided 成对审计 + PendingApproval 8 字段 payload）；WS `human_approval_request` 含 taskId/gateId
- DAG 工作流引擎：`WorkflowEngine`（顺序/并行/混合三策略 + gate 节点 + 生命周期暂停/恢复/取消/重试 + 跳过传播）；`WorkflowDefinition` 全套 dict 序列化（protocol.py 协议层唯一事实源）
- 会议纪要文档 seam：纯标准库 docx 生成（zipfile+OOXML 最小三入口，零新依赖）
- Spec Tree / Gate Manager / EARS 验收句式 / Evidence Chain（既有引擎底座）

**M2a 会议纪要后端全链路（main@a604487）**
- 纪要意图识别：`_detect_minutes_task` 文档模式（纪要关键词家族 + 动词触发，短路先于路由——文档模式确定性无 LLM 成本）
- 纪要工作流：`build_minutes_workflow`（3 节点 dept-docs DAG：extract→draft(gate)→proofread，sequential）
- gate 序列化补齐：`WorkflowNode.gate` 经 workflow_node_to_dict/dict_to_workflow_node 往返保真（WS/桥接回环不丢 gate）+ 定义级自动携带
- 演示集成端点 `POST /api/minutes`：速记 → 纪要 DAG 规划 + 混合团队 + mailer 分发
- 邮件 seam：`get_mailer("file")`（FileMailer 生成 .eml 到 data/mailbox）+ provider 延迟 import 模式

**M2b-1 把关后端收尾（main@92037d0）**
- gate 强制力：`_run_node_gate` 拒绝 → `_execute_node` 消费 `result["gate"]["status"]=="rejected"` → 节点 FAILED 四处同步 + 下游 SKIPPED + retry_node 可重试（拒绝真正阻断下游）
- approver 透传五表面点对齐（PendingApproval/request_approval/request_gate 审计/handle_gate_response/get_pending_requests）
- SMTP provider：`SmtpMailer`（transport 注入可测 + username 非空才 login + from_addr 回退 + msg_id）
- 演示端点输入加固：业务逻辑 `try/except → _fail`（HTTP 200 + {success:False,error}，畸形输入不 500）

**M2b-2 前端把关 UI（main@2f91173）**
- 审批面板适配 gate 字段：ApprovalPanel 卡片（riskBadge/operation/requesterId/描述/置信度/理由输入/批准拒绝）+ WS 双通道（human_approval_request 推送 + pending_approvals 拉取共享 `get_pending_requests()` 汇聚点）
- 后端 PendingApproval 补 taskId/gateId/approver 字段（additive-safe）+ `get_pending_requests()` 单点透传双通道
- vitest `.tsx` 测试支持 + @testing-library/react 预装（组件测试基础设施）

### Fixed

- `WorkflowNode.gate` 序列化丢失（WS/桥接回环静默丢 gate）→ dict 往返补齐 + 回环测试
- gate 拒绝结果无消费者（拒绝仅标记不阻断下游）→ `_execute_node` 消费 rejected → FAILED
- 演示端点未捕获异常 500 → `_fail` 统一兜底
- `useMeetingSocket` 返回对象解构缺名（meetingPhase/meetingStartTime/deleteTask）→ 解构清单补齐
- 纪要检测死逻辑（`has_verb and (has_minutes or has_co_trigger)` ≡ `has_verb and has_minutes`）→ 吸收律化简
- 前端审批三字段空值判定（后端发射 `""` 非 undefined）→ truthy 判定约定
- `_detect_minutes_task` 关键词双源漂移（MINUTES_KEYWORDS/MINUTES_FAMILY 手工维护）→ 派生对齐

### Changed

- 意图识别增加文档模式分支（纪要任务走确定性短路，不消耗 LLM）
- 审批 WS payload 追加 taskId/gateId/approver（additive-safe，既有契约测试不受影响）
- `TeamMember.display_name` 尾置默认字段（全仓关键字构造向后兼容）；human 成员 name 缺省回落
- 仓库 vitest.config.ts include 扩展 `.tsx`（组件测试可被发现）

## 开发史（产品定型前，2026-05-22 ~ 2026-08-13）

产品定位（2026-08-14「人+agent 混合团队协作平台」设计）确立前的开发期交付。

### 项目早期（2026-05-22 ~ 2026-07）

**初创与前端演进（5 月）**
- 远程插件 Shell 架构（移除旧 sidepanel-host）+ Chat-Agent 界面重构 + 配置面板 + Tool Calling 意图识别（05-22）
- 执行状态/计划进度跟踪、Vite 构建迁移（src 目录）、主题切换（05-25/26）
- agentscope 子模块引入、浏览器自动化核心、技能模板系统（保存/加载/运行自定义技能）（05-26）
- 多 LLM 提供商支持、用户确认请求/结果处理、SSO 认证（05-27/28）
- **Vue → React 迁移**（05-29）+ 多模态开关（05-29）
- agentscope 子模块迁移 third_party（05-31）

**多智能体协作系统（5 月末 ~ 6 月）**
- 多 Agent 协作模块、Agent 角色卡片 UI、多智能体团队协作办公室场景、完整会议模式（05-31）
- production-multi-agent-evolution V2/V3 全量迭代 + V4.9 协议文档（06-01）
- CEO 智能会议组织者 + 自动任务指派（06-02）
- 多智能体技能进化系统 + 技能进化工作台 + 动态路由系统（06-03）
- 3D 科技大厦视图（Three.js）+ 办公室模式流程重构（06-03/04）

**赛博朋克视觉升级（06-05 ~ 06-09）**
- 电影级赛博朋克城市场景升级（06-09）、赛博朋克建筑群全栈逼真升级（06-08）、空中交通与天气效果 Phase2（06-09）、城市地面系统重构（06-09）、科技塔 day/night 模式切换（06-09）

**工具/工作区基建（06-12）**
- `ToolRegistry`（工具管理与安全检查）+ `ToolExecutor`（bash/file/git 工具）+ `WorkspaceManager`（git worktree 隔离）+ `GitIntegration`（git 操作与 PR 创建）+ 工作区/工具调用消息处理 + `WorkspacePanel` 组件 + CeoAgent 工作区创建集成 + MeetingCoordinator 工具执行支持

**中期功能（06-13 ~ 06-29）**
- 角色配置系统与工作区管理优化、角色选择/多部门配置、AI 技能生成、任务管理、executor 认证等

**loop-engineering 循环工程（06-30）**
- 独立产品脚手架 + CLI（`loop-engineering/`）：metrics 套件（checkpoint 收集器 + 质量分数计算 + SQLite 存储 + CLI 报告 latest/trend）、prompt 进化（tracker 记录 prompt→outcome 映射 + weakness analyzer + prompt evolver + A/B 实验 runner）、CI 门禁与基线管理、场景注册表（registry + 5 新场景）、coverage 命令与 loop:ci 脚本接线 CLI

**前端功能群（07-01 ~ 07-05）**
- session 状态持久化：断开自动保存 + 恢复 API + useWebSocket 恢复支持（07-01/02）
- 投票决策系统：proposal/vote/vote_result 消息实现（07-03）
- 人工审批系统：human_approval_request/response 实现 + 前端触发审批请求（07-03）
- 检查点系统：checkpoint_save/restore WebSocket 集成（07-04）
- 审计日志系统：audit_log WebSocket 集成（07-04）
- 并发任务执行 + Prometheus 指标端点（07-05）
- 前端核心模块测试冲刺：dependencyAnalyzer/agentRegistry/officeWorkflow/taskAssigner/approvalQueue/negotiationEngine/deadlockDetector/checkpointManager 等 81 测试（07-02）

**TS 统一编排层与 Per-Agent 路由（2026-07-06）**
- **TS 统一编排层**：TypeScript=编排层（CEO+Team+Skills），Python=纯执行层；新增 team/assembler/skill loader/toolkit router（local/remote）
- **Per-Agent Routing**：每个 TeamMember 独立 location(local/remote)，RouterFactory 按成员位置返回 router（用户拒绝 CLI profile 切换，要求 Web 前端逐实例选择）
- **Per-Agent Location UI**：CeoChatPanel 💻/☁️ 切换 → role_locations 全链路传递到 TeamAssembler
- RemoteToolkitRouter 指数退避重试（4xx 不重试/5xx+network 重试，maxRetries=3）

**Per-Role Agent（2026-07-13）**
- TS Per-Role Agent 设计 + 实施（7 commits）：`orchestrator/src/agent/` RoleAgent 封装独立 messages[]/systemPrompt/tools/router；buildSystemPrompt 三段式（角色模板 + skill pack + 工具指南）；getToolsForRole 按角色白名单过滤；TeamCoordinator 从上帝对象改为编排 RoleAgent[]；讨论阶段 Promise.all 并发；ElectronRoleAgent 内联（CJS/ESM 限制）——orchestrator 60/60 + Electron 49/49

**Electron 离线能力（2026-07-22 ~ 08-06）**
- **Electron 桌面主体（07-22 ~ 07-30）**：桌面应用脚手架（IPC 协议 P1+P2）、secure API Key 存储与设置 UI（P3）、自动更新与打包分发（P4）、Windows 构建 ESM/CJS 兼容与路由/资源加载修复（P5）；主进程集成（07-30，~21 commits：TeamCoordinator per-role 重构、RoleAgent/工具过滤/system prompt 组装、ElectronRoleAgent 并行讨论、隐藏返回按钮）
- Electron 项目持久化（主进程 userData/projects.json + 4 IPC 通道，修复 File System Access API 在 file:// 下不可靠）
- 离线 PPT 生成（pptxgenjs 纯 JS 打包进 asar，零下载零平台依赖；`pptxBuilder.ts` + create_slide 工具分支 + 路径守卫）——真实 LLM E2E 验证 PASS
- 离线 Word 文档生成（Node.js `docx` 库；`docxBuilder.ts` + create_document 工具分支 + docRoles 11 角色宣传）——真实 LLM E2E PASS
- Electron bash 工具拦截 python 家族（`bashGuard.ts` 正则覆盖版本号/env/sudo/绝对路径绕过向量）
- 工具宣传缺口修复：executeTool 支持某工具 ≠ LLM 会调用它（roleNames 补 PPT/文档角色 + 工具说明注入）

**优化与对齐（2026-07-31 ~ 08-11）**
- run_tests 工具 pytest 回退（`python` 无 pytest 模块时回退 PATH 上 pytest 命令）
- 智能体上下文传递优化：ExecutionSummary 结构化摘要替代 substring(0,2000) 截断；讨论反对意见转"避免：xxx"约束注入
- TS-Python AgentScope 差距修复：LocalToolkitRouter 5→18 工具（与 Python ToolExecutor 完全对齐）+ 知识/规则注入 system prompt
- 弹性层与跨网络协作（07-07 ~ 07-10）：CircuitBreaker（5 commits）、跨网络智能体桥接/发现

### 多智能体架构分析（2026-08-13）

- 交付 `docs/compose/specs/multi-agent-architecture-future-analysis.md`（commits 7982912..1748522 + finalize 3536174）：现状取证（43 来源 + 代码审计）+ 行业趋势（F1-F6）+ 演进方向——核心结论"强单 agent 主轴 + 确定性轻协作 + 标准协议 + 可恢复执行"，三阶段路线图（收敛治理 → 范式转向 → 差异化能力）
- 产品叙事对齐意图驱动派发与技能进化（7102df8）；路线图按五大支柱 + P0/P1/P2 优先级重写（a833866）

### P0 阶段（2026-08-13，main@7cb63c9）

- **工作流节点真执行**（ef9d9ea/66cb5f8）：`_run_agent_execution_loop`（代码块 → write_file 主路径 + 花括号扫描 tool_call 备用）复用 AgentToolset 真执行 + 写工作区文件
- **双 WorkflowEngine 合并**（057106e/6b886dc）：共享引擎注入 MeetingCoordinator + 委托执行器/状态回调路由到活动协调器
- **start_workflow 真可取消**（1fa1253）：asyncio.create_task + 身份安全 done_callback + pause/cancel 真中断
- **CriticAgent LLM 审查通道**（bbc0b57/6198bb1）：规则兜底 + LLM 补充（失败降级），findings 解析与严重度归一化
- **审批真阻塞等待**（a831dce/7695e9f/b46b234）：request_approval + wait_for_decision（超时默认通过）+ 会议处理转后台任务（防审批阻塞接收循环）+ 结构化审批推送透传
- **死代码清理**（afad14e）：删除 parallel_discussion_manager / parallel_meeting_coordinator
- 全构造点共享引擎/审批注入（7cb63c9：start_meeting / ceo_agent / simple_executor 三处统一）——12 commits，852 passed

### P1 阶段（2026-08-13，main@b0132e8）

- **路由断链修复**（d8280e6/a882fce）：`_update_routing_stats` 消费即删，关闭自适应路由学习闭环
- **技能闭环自动触发**（a48538b/132d3f4）：get_pending_rules → 按项目过滤 → approve → 增量区写入 → 按关键词打包升级版技能包
- **DAG 去硬编码**（3261d85/c8efdef）：确定性依赖推断替代 dept_order 线性链（IMPL_DEPTS 并行、qa/devops 依赖、根节点数>1 → parallel）
- **混合执行真接线**（b41044e/c20a48b）：roleLocations 透传 createTeam + executorUrl 全链贯通（修复 remote 执行空 URL 死链）
- **杂项收尾**（5721a34/37ea42a/b0132e8）：run_project/demo 引擎注入（评审回归回退修正）+ companion_log gitignore + 前端审批面板 6 用例验证——11 commits

### P2 阶段（2026-08-13，main@274a725）

- **durable execution**（557cefa/06854e7）：WorkflowEngine 持久化（JSON per execution + definition 内嵌 + 冷启动恢复）+ CheckpointManager 磁盘持久化 + 三策略跳过 COMPLETED
- **审查确定性门禁**（b0c98ac/678728a/81b1fc1）：review 并入 structured_feedback + `_run_deterministic_gate`（fail-closed + 工具缺失 fail-open）
- **artifact 模式**（6a39cea）：执行产物文本（文件清单 + 摘要）接入任务结果
- **模型故障转移**（3e21e1f）：模型池健康检查 + 失败驱逐 + 自动切换
- **杂项**（3f929b5）：路由统计 finally 清理 + AGENTS.md 计数刷新 + per-member hybrid 接线——11 commits

### P2 遗留闭环（2026-08-13，main@7a36493）

- 9 项评审遗留全部闭环（门禁通道感知 / hybrid 生产接线 / durable 读侧 GET+resume / persist 容错 / failover 归因收窄 / planner issues 守卫 / FAILED 重跑测试等），P2 零遗留

### P3 阶段一（2026-08-13/14）

- **session log 真相源**（ba4ab6f/a3214c0/bc73f79）：SessionEvent 事件流（JSONL append + deriveMessages 投影 + 快照审计 audit.jsonl）+ LLM 上下文投影（讨论/审查决策三处）+ 并行讨论补写 meeting
- **快照评测门禁**（9628623）：orchestrator snapshot.ts（sha256/exitCode/qualityChecks）+ runScenario keyless 回放 + CI 门禁
- 分析文档路线图重写（五支柱 + 优先级）

### dsh 深度代码调研（2026-08-14，main@7e80624）

- deepseek-harness 全库原理挖掘：10 主线调研（fs/shell/subprocess/terminal/sandbox/e2b/code-runtime 等）+ 综合分析文档 `deepseek-harness-code-principles.md`（285 行）入库
