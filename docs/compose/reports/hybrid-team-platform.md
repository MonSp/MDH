---
feature: hybrid-team-platform
status: delivered
specs:
  - docs/compose/specs/2026-08-14-hybrid-team-platform-design.md
  - docs/compose/specs/2026-08-14-hybrid-team-platform-m3-design.md
  - docs/compose/specs/2026-08-15-hybrid-team-platform-m4-design.md
plans:
  - docs/compose/plans/2026-08-14-hybrid-team-platform-m1.md
  - docs/compose/plans/2026-08-14-hybrid-team-platform-m2a.md
  - docs/compose/plans/2026-08-14-hybrid-team-platform-m2b.md
  - docs/compose/plans/2026-08-14-hybrid-team-platform-m2b2.md
  - docs/compose/plans/2026-08-14-hybrid-team-platform-cleanup.md
  - docs/compose/plans/2026-08-14-hybrid-team-platform-employee-directory.md
  - docs/compose/plans/2026-08-14-hybrid-team-platform-approval-name-closure.md
  - docs/compose/plans/2026-08-14-hybrid-team-platform-office-mode-fix.md
  - docs/compose/plans/2026-08-14-hybrid-team-platform-m3.md
  - docs/compose/plans/2026-08-14-hybrid-team-platform-judge-wiring.md
  - docs/compose/plans/2026-08-15-hybrid-team-platform-m4.md
  - docs/compose/plans/2026-08-15-hybrid-team-platform-low-severity-followups.md
  - docs/compose/plans/2026-08-14-hybrid-team-platform-pilot.md
branch: main
commits: d069ab6..4cd1773
---

# 人+agent 混合团队平台 — Final Report

## What Was Built

MDH 从"多智能体协作平台"演进为**"人+agent 混合团队协作平台"（办公垂直，首场景会议纪要+待办）**：部门员工与各自的 work agent 组成混合团队，完成文档型任务，过程中沉淀组织资产。本会话交付了该产品从设计到全链路验证的完整落地：

- **M1 引擎底座**：员工身份与把关点引擎（人成为一等实体）、混合团队组装（human/agent）、文档工具 seam（纯标准库 docx）、演示 API。
- **M2 会议纪要全链路**：文档意图识别（确定性规则短路）→ DAG 流水线（extract→draft(gate)→proofread）→ 员工把关（ApprovalManager 把关点引擎 + WS/前端面板）→ mailer 分发；后端收尾（gate 强制力/输入加固/approver 透传/display_name/SMTP）+ 前端把关 UI（ApprovalPanel gate 上下文展示）。
- **M3 沉淀闭环**：知识库/模板库（文件系统+JSON 索引，团队隔离）、资产评测把关（确定性四键 + LLM judge seam，仿 AIP Evals）、模板固化（评测→员工确认→入库）、技能进化（把关差异→CoW 增量区）、三类资产复用检索。
- **M4 沉淀增强**：资产复用注入（纪要 DAG 节点 prompt 注入团队资产，渐进披露）、LLM judge 评测基准（标注集 + 准确率/校准/区分度指标）。
- **员工目录 + 把关人显示名**：employee_id → 员工信息解析，把关人/提交者显示名贯通前后端（WS/REST 双通道 + 前端回落链）。
- **四轮真实试点**（DeepSeek API）：直驱全链路、WS 服务器链路、LLM judge seam、judge 端点闭环——全部 PASS，验证了单测覆盖不到的真实执行缺陷并修复。

## Architecture

**全链路数据流**：需求进入（速记/转写）→ 意图识别（`semantic_analyzer` 文档模式短路）→ 混合组队（`team_assembler` human/agent）→ DAG 执行（`workflow_engine` 顺序/并行/混合 + `meeting_coordinator` 节点执行 + 资产参考注入）→ 员工把关（`approval_manager` 把关点引擎 + WS 推送 + 前端 `ApprovalPanel`）→ 分发（`mailer` seam）→ 沉淀（`asset_store` 入库 / `template_confirmation` 固化 / `skill_evolution` 技能增量）→ 复用（`asset_search` 检索 + `asset_injection` 节点注入）。

**核心组件**：

| 模块 | 职责 |
|------|------|
| `backend/team.py` / `team_assembler.py` | TeamMember（human/agent，display_name/approver_for）+ 混合团队组装 |
| `backend/approval_manager.py` | 把关点引擎：request_gate/handle_gate_response/成对审计/approver 透传 |
| `backend/workflow_engine.py` | DAG 工作流（三策略/条件分支/gate 强制力/retry 单节点语义） |
| `backend/meeting_coordinator.py` | 节点执行、把关钩子 `_run_node_gate`、`asset_context_builder` 注入 seam、审批推送富化 |
| `backend/minutes_workflow.py` | 纪要 DAG（extract→draft(gate)→proofread，transcript 注入） |
| `backend/semantic_analyzer.py` | 文档意图识别（纪要家族关键词 + 动词，确定性短路） |
| `backend/mailer/` | 邮件分发 seam（file/SMTP provider，timeout 加固） |
| `backend/employee_directory.py` | 员工目录（employee_id→name/email/position，未命中回退） |
| `backend/asset_store.py` | 知识库/模板库（团队级目录+JSON 索引，team_id 校验） |
| `backend/asset_evaluator.py` | 评测把关（确定性四键 + judge seam，fail-closed） |
| `backend/template_confirmation.py` | 模板固化（评测→gate 确认→入库/拒绝 + 桥接幂等护栏） |
| `backend/skill_evolution.py` | 技能进化（把关差异→规则→CoW 增量区 + 元数据回填） |
| `backend/asset_search.py` / `asset_injection.py` | 三类资产检索 / DAG 节点注入文本（渐进披露） |
| `backend/asset_judge.py` / `asset_judge_benchmark.py` | LLM judge（urllib 直调 + CJK 鲁棒解析）/ 评测基准 |
| `backend/server.py` | 演示端点 `/api/minutes` `/api/hybrid/team` `/api/gates/*` `/api/assets/*` `/api/employees` + env 开关 |
| 前端 `ApprovalPanel` / `OfficeTeamMode` / `useMeetingSocket` | 把关面板、gate 上下文展示、审批拉取 |

**关键接口**：`process_user_message`（工作流分支返回 workflow_executed）；`_get_node_input`（input_spec + 上游结果合并）；`get_pending_requests`（把关单点汇聚，WS/REST 双通道）；`_get_asset_judge`（env 开关惰性单例）；`build_asset_context`（节点注入 seam 消费）。

### Design Decisions

- **把关点引擎复用 ApprovalManager**：模板固化/员工确认 = 一个 gate 请求（决策节点挂人、审计成对、超时 fail-open 语义统一）——不重复造轮子。
- **资产存储 = 文件系统 + JSON 索引**：与 skill_packs/experience_extractor 增量区同构（资产即文件可审计、零新依赖、团队级目录隔离）。
- **LLM judge = seam + fail-closed**：judge 可注入（默认 None 快路径，`ASSET_JUDGE_ENABLED=1` 启用）；judge 异常判拒绝（仿 AIP Evals 评测纪律——LLM 出错不放行资产）。
- **资产复用注入 = DAG 节点 prompt**（非意图识别层）：下次同类任务自动用团队资产指导生成；渐进披露（摘要+按需加载）控 prompt 体积。
- **测试纪律**：每任务 TDD + 双评审闭环（规格 phase1 + 代码质量 + 修复轮复审）；真实试点验证执行层缺陷。

## Usage

**演示端点**（TestClient / 真实 server：`python backend/server.py`，REST 需 `Authorization: Bearer $BACKEND_TOKEN`）：

| 端点 | 用途 |
|------|------|
| `POST /api/minutes` | 速记 → 纪要 DAG 规划 + 混合团队组装（submitter 解析） |
| `POST /api/hybrid/team` | 混合团队组装演示 |
| `POST /api/gates` / `GET /api/gates/pending` / `POST /api/gates/{id}/decide` | 把关请求/列表/决定（approved 严格 True） |
| `POST /api/assets/artifacts` / `templates` | 产出物入库 / 模板固化（评测→gate 确认） |
| `GET /api/assets/search` / `GET /api/assets` | 三类资产检索 / 资产列表 |
| `POST /api/assets/experience` | 把关差异 → 技能增量 |
| `GET /api/employees` | 员工目录列表 |

**env 开关**（`.env.example`）：`ASSET_JUDGE_ENABLED=1`（+ `DEEPSEEK_API_KEY`）启用模板固化的真实 LLM 评测；`DEEPSEEK_BASE_URL`/`DEEPSEEK_MODEL`。

**试点脚本**（真实 DeepSeek key，均含验收清单 + 退出码）：`pilot_minutes.py`（直驱全链路）、`pilot_minutes_ws.py`（WS 服务器链路 + 把关推送/响应闭环）、`pilot_judge.py`（judge seam 评测 + `--benchmark` 基准）、`pilot_judge_endpoint.py`（端点闭环：真实评测→gate→入库；`--verbose` 日志）。

## Verification

- **后端测试**：1103 passed / 1 skipped（main 复验；唯一 PRE-EXISTING 基线 `test_skill_packs_structure` 在 main 侧通过）；前端 1637 passed。
- **真实试点**（deepseek-chat）：直驱纪要全链路（意图识别/DAG 3 节点/把关成对审计/mailer 6/6 PASS）、WS 链路（把关 WS 推送+审批闭环 6/6）、judge seam（好 0.95 vs 差 0.20 区分 6/6）、judge 端点闭环（真实评测 0.95→gate→入库→评测持久化 5/5）。
- **评测基准**：8 条标注集 + accuracy/mae/区分度指标（perfect judge 1.0/0.0，inverted 0.0 实证）。
- **双评审闭环**：每任务规格 phase1（claims 证据强制）+ 代码质量评审 + 修复轮复审（含变异实证），全程约 60+ 子代理评审。

## Journey Log

> Brief notes on what informed the final design. Not required reading.

- [pivot] 从"多智能体协作平台"演进为"人+agent 混合团队"（办公垂直）——产品定义头脑风暴确立五支柱 + 首场景会议纪要。
- [lesson] 真实试点暴露单测覆盖不到的执行缺陷（纪要节点 input_spec 空、直驱 collector 的 dict payload 契约、CJK 相邻分数正则误解析）——试点是真实链路验证的必要手段，每缺陷均 TDD 修复并回归锁定。
- [lesson] LLM judge 分数逐次运行有波动（0.20 vs 0.35）——验收必须断言排序/阈值而非绝对分数。
- [lesson] Python `\b` 在 re.UNICODE 下无法分隔数字与 CJK——解析 LLM 数值输出用 `(?<!\d)...(?!\d)` lookaround。
- [dead end] 资产复用注入先考虑"意图识别层注入"——analyzer 是规则分流、注入价值低，改 DAG 节点 prompt 注入（产品价值最直接）。

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `docs/compose/specs/2026-08-14-hybrid-team-platform-design.md` | 总设计 | 五支柱/里程碑 M1-M3/演进定位（[S1]-[S6]） |
| `docs/compose/specs/2026-08-14-hybrid-team-platform-m3-design.md` | M3 设计 | 沉淀闭环（存储/评测/固化/技能/检索） |
| `docs/compose/specs/2026-08-15-hybrid-team-platform-m4-design.md` | M4 设计 | 注入接线 + 评测基准 |
| `docs/compose/plans/2026-08-14-hybrid-team-platform-m{1,m2a,m2b,m2b2,m3}.md` | 实施计划 | M1-M3 各里程碑任务分解 |
| `docs/compose/plans/2026-08-14-hybrid-team-platform-{cleanup,employee-directory,approval-name-closure,office-mode-fix,judge-wiring}.md` | 收尾计划 | 打磨/员工目录/T23/T26/judge 接入 |
| `docs/compose/plans/2026-08-15-hybrid-team-platform-{m4,low-severity-followups}.md` | 收尾计划 | M4 增强/低严重度收尾 |
| `docs/compose/plans/2026-08-14-hybrid-team-platform-pilot.md` | 试点运行手册 | 直驱/WS/judge/judge 端点四轮试点记录 |
