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
