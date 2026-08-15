# [Pilot] 会议纪要任务 · 真实试点运行手册

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/hybrid-team-platform.md)


> 2026-08-14 建立。M2 里程碑（意图识别 → DAG 执行 → 员工把关 → 邮件分发）代码侧交付完成后的真实运行验证手册。试点于 2026-08-14 实际跑通：**全部验收项通过**。

## 1. 试点目标

在真实 DeepSeek API 上验证会议纪要任务的端到端链路（设计文档 M2 里程碑验收的"试点部门真实纪要任务跑通，员工把关闭环"的自动化直驱形态）：

```
速记文本 → SemanticAnalyzer 文档模式短路（is_workflow=True，零 LLM 路由）
→ WorkflowEngine 顺序执行 extract→draft→proofread（dept-docs，真实 LLM）
→ draft 节点把关钩子（_run_node_gate → ApprovalManager.request_gate）
→ 员工把关（--auto-approve 自动批准 / 超时默认通过）
→ mailer seam 分发（FileMailer 写 .eml）
```

## 2. 环境要求

- Python 3.11 + `backend/requirements.txt`（试点用 `agentscope` conda 环境：`/home/test/miniconda3/envs/agentscope/bin/python`）
- `.env` 配置 `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL`（真实 key，36 字符）
- 试点脚本 `backend/pilot_minutes.py`（直驱 MeetingCoordinator，不经 WS 服务）

## 3. 运行方式

```bash
cd backend
# 自动批准把关（模拟员工决定，验证审计成对）
DEEPSEEK_BASE_URL=... DEEPSEEK_MODEL=... \
  /home/test/miniconda3/envs/agentscope/bin/python pilot_minutes.py \
  --api-key $DEEPSEEK_API_KEY --auto-approve

# 不自动批准：把关等待 approval_timeout（默认 60s）后超时默认通过
python pilot_minutes.py --api-key $KEY
```

参数：`--api-key`（必填）、`--base-url`（默认 env 或 https://api.deepseek.com）、`--provider`（deepseek）、`--model`（默认 env 或空）、`--auto-approve`（自动批准）、`--approval-timeout`（默认 60s）。

## 4. 验收清单（脚本自动打印 PASS/FAIL，退出码 0=全部通过）

| # | 验收项 | 判定 |
|---|--------|------|
| 1 | 意图识别：is_workflow=True 且纪要 DAG（extract/draft/proofread sequential） | analysis.is_workflow + 节点序 |
| 2 | DAG 执行：工作流结束且节点有结果 | workflow status + results |
| 3 | 员工把关：gate 请求发起 | gate_mgr.get_gate_audit() 含 requested |
| 4 | 员工把关：决定记录（批准/超时） | decided 审计（自动批准）或超时默认通过 |
| 5 | 邮件分发：mailer seam 生成 .eml | data/mailbox/*.eml |
| 6 | 工作区：试点工作区存在 | workspace root |

## 5. 2026-08-14 试点结果（真实运行记录）

**全部 6 项 PASS，耗时 ~17s，模型 deepseek-chat。**

- 意图识别：`is_workflow=True`，3 节点 sequential ✓
- extract：产出纪要要点（主题/关键日期/核心决议/行动项）✓
- draft：产出纪要初稿 + 待办清单（尝试写文件 `纪要_新产品发布计划_0815.md`）✓
- **把关**：`[把关] 批准 gate=draft:review task=draft approver=submitter`，审计 `['gate/requested', 'gate/decided']` 成对 ✓
- proofread：产出校对结果（遗漏项/严重度表格）✓
- mailer：`data/mailbox/*.eml` 生成 ✓

## 6. 试点发现与修复（重要）

真实试点暴露 2 个代码级缺口，已修复（commit 1422631 / 0c360aa）：

1. **纪要节点未携带速记文本（M2a-T2 缺口）**：`build_minutes_workflow` 生成的节点无 `input_spec`，`_get_node_input` 返回空 → extract 节点 LLM 输出"输入数据为空"。**修复**：节点注入 `input_spec={"transcript": transcript}`（`backend/minutes_workflow.py` + 测试 `test_nodes_carry_transcript_input`）。
2. **直驱 on_message 收到 dict payload 崩溃（M2b 把关钩子与直驱模式的契约边界）**：`_run_node_gate` 的 `request_gate` 经 `_build_approval_send_fn` 把**把关请求 payload（dict，kind="approval"）**透传给 on_message；直驱模式的 MessageCollector 假设 text 为 str，`re.sub` 收到 dict 崩溃。**修复**：试点脚本 collector 对 dict 做 JSON 化（WS 路径 `send_and_buffer` 本就处理 dict，非产品缺陷）。

**次要观察（未修复，记录）**：模型输出代码块写文件偶发失败（`工作流节点写文件失败: 纪要_*.md`）——`extract_code_blocks`/`write_file` 对 Markdown 代码块的处理边界，属可选改进。

## 7. 已知限制

- 直驱模式不经 WS/前端，把关由脚本自动批准（`--auto-approve`）或超时默认通过；真实"员工在 ApprovalPanel 点击"的闭环需 WS 模式 + 前端（M2b-2 已交付前端面板，接线验证属后续试点）。
- mailer 为 `file` provider（写 .eml），SMTP 实发需 T15 跟踪项（生产加固）。
- 试点消耗真实 API token（3 节点 × 1-2 次 LLM 调用）。

---

## 8. WS 模式试点（真实服务器链路，2026-08-14 跑通）

直驱试点验证了核心链路，WS 模式试点验证**真实服务器接线**：后端 server.py → WS 客户端 → 把关请求经 `session.send_and_buffer` WS 推送 → 客户端审批响应闭环（与前端 ApprovalPanel 相同的消息通道）。

### 运行方式

```bash
# 终端1：启动后端（显式 BACKEND_TOKEN，WS 握手需 query token）
cd backend
BACKEND_TOKEN=pilot-token DEEPSEEK_API_KEY=... DEEPSEEK_BASE_URL=... DEEPSEEK_MODEL=... \
  /home/test/miniconda3/envs/agentscope/bin/python server.py

# 终端2：运行 WS 试点客户端（--auto-approve 模拟员工在 ApprovalPanel 点击）
/home/test/miniconda3/envs/agentscope/bin/python pilot_minutes_ws.py \
  --api-key $DEEPSEEK_API_KEY --token pilot-token --auto-approve
```

### 2026-08-14 结果（全部 PASS，~20s）

- **WS 连接**：connected session=xxx ✓
- **任务提交**：meeting_message_ack ✓
- **意图识别**：`意图：minutes / 理由：文档任务规则命中`（文档模式短路在服务器链路生效）✓
- **DAG 执行**：3 节点 sequential（extract 产出纪要要点）✓
- **员工把关（WS 闭环）**：`[把关推送] node_gate task=draft gate=draft:review approver=submitter` → 客户端回 `human_approval_response`（approved）→ 节点继续 ✓
- **链路完成**：workflow_executed ✓

### 与直驱试点的差异

| 维度 | 直驱（pilot_minutes.py） | WS 模式（pilot_minutes_ws.py） |
|------|--------------------------|-------------------------------|
| 通道 | MeetingCoordinator 直调 | server.py → WS 全链路 |
| 把关推送 | on_message 回调（需 dict 容忍） | `human_approval_request` WS 消息（与前端同通道） |
| 审批 | auto_approver 轮询 | `human_approval_response` WS 响应（与前端 ApprovalPanel 相同） |
| 验收 | 审计成对 + mailer | WS 推送收到 + 响应发出 + workflow_executed |

### 注意点

- **BACKEND_TOKEN 必须显式设置**：server.py `BACKEND_TOKEN = os.environ.get(...)` 为空会自动生成随机值 → `_verify_ws_token` 校验 query token 失败 → 握手 403（accept 前 close 表现为 HTTP 403）。显式设非空值 + 客户端 `--token` 传同值。
- AuthMiddleware（BaseHTTPMiddleware）不拦截 WebSocket 握手，WS 鉴权由 `_verify_ws_token`（query token）承担。

---

## 9. LLM judge 真实 key 试点（M3 资产评测，2026-08-15 跑通）

验证 AssetEvaluator 的 judge seam（设计 [S4]）在真实 DeepSeek LLM 下的全链路：judge 可注入（默认 None 跳过），试点注入真实 LLM judge 评测合成资产，检验分数质量与阈值语义。

### 运行方式

```bash
cd backend
KEY=$(grep -E '^DEEPSEEK_API_KEY=' /home/test/MDH/.env | cut -d= -f2- | tr -d '"' | tr -d "'")
BASE=$(grep -E '^DEEPSEEK_BASE_URL=' /home/test/MDH/.env | cut -d= -f2- | tr -d '"')
MODEL=$(grep -E '^DEEPSEEK_MODEL=' /home/test/MDH/.env | cut -d= -f2- | tr -d '"')
/home/test/miniconda3/envs/agentscope/bin/python pilot_judge.py --api-key "$KEY" --base-url "$BASE" --model "$MODEL"
```

- 脚本用标准库 urllib 直调 OpenAI 兼容 `/chat/completions`（零新依赖，judge 是轻量单次调用），prompt 要求只输出 0-1 分数（temperature 0.2），正则解析容错。
- 验收不写死绝对分数（LLM 有随机性），断言：judge 调用成功（0-1 可解析）/ **好资产分数高于差资产（排序关系）** / 组合 evaluate 正确 / 无 judge 回退 / passed 与阈值语义一致。

### 2026-08-15 结果（全部 PASS，模型 deepseek-chat）

| 资产 | judge_score | passed | reason |
|------|-------------|--------|--------|
| 好模板 | 0.95 | ✓ | — |
| 差模板 | 0.20 | ✗ | `judge_score 低于阈值` |
| 好产出物 | 0.95 | ✓ | — |
| 差产出物 | 0.20 | ✗ | `structure; quality`（确定性检查也拦截） |

**结论**：真实 LLM judge 清晰区分好/差资产（0.95 vs 0.20），0.5 阈值语义正确；与确定性检查组合良好（差产出物被确定性检查 + judge 双重拦截）。judge seam 全链路验证通过。

### 已知边界

- **fail-closed 语义（T30 已落地）**：judge 抛异常（网络/解析失败）时判拒绝（`passed=False` + `reason="judge 异常: ..."`）——原 fail-open 语义经接入真实 judge 前评估已改为 fail-closed。
- **演示端点已接 judge（T30 已接线）**：`/api/assets/templates` 的 `_get_template_confirmation` 经 `_get_asset_judge()` 注入——`ASSET_JUDGE_ENABLED=1` 且 env 有 key 时构造真实 LLM judge，否则 judge=None（演示快路径）。
- 试点消耗真实 API token（pilot_judge.py seam 级验收 4 次 judge 调用，~10s；端点试点实际 1 次 judge 调用——模板评测）。

---

## 10. LLM judge 端点真实 key 试点（T30 接线闭环，2026-08-15 跑通）

验证 `/api/assets/templates` 在 `ASSET_JUDGE_ENABLED=1` 下的端到端演示闭环：真实 LLM 评测 → 员工 gate 确认 → 入库 + 评测结果持久化。

### 运行方式

```bash
cd backend
KEY=$(grep -E '^DEEPSEEK_API_KEY=' /home/test/MDH/.env | cut -d= -f2- | tr -d '"' | tr -d "'")
BASE=$(grep -E '^DEEPSEEK_BASE_URL=' /home/test/MDH/.env | cut -d= -f2- | tr -d '"')
MODEL=$(grep -E '^DEEPSEEK_MODEL=' /home/test/MDH/.env | cut -d= -f2- | tr -d '"')
/home/test/miniconda3/envs/agentscope/bin/python pilot_judge_endpoint.py \
  --api-key "$KEY" --base-url "$BASE" --model "$MODEL" --backend-dir .
```

- 脚本自动启动后端 server（env：`BACKEND_TOKEN`/`ASSET_JUDGE_ENABLED=1`/`DEEPSEEK_*`）→ urllib 调 REST：templates 提交 → pending gate 确认 → decide 批准 → assets 列表验证。
- team_id 带时间戳（每次运行独立——避免 duplicate 去重拦截重复标题，去重把关正确工作的实证）。

### 2026-08-15 结果（全部 PASS，模型 deepseek-chat）

| 验收项 | 结果 |
|--------|------|
| 模板提交（真实 LLM 评测通过 → gate 发起） | ✓ success + asset_id/request_id |
| gate 发起（`template:<asset_id>` 在 pending） | ✓ approverName=张伟（员工目录解析生效） |
| 员工批准（decide approved=true） | ✓ resolved=True |
| 资产入库（status=approved） | ✓ |
| 评测结果持久化（checks + judge_score 非空） | ✓ **judge_score=0.95**（结构化好模板高分）、checks 四键全 True |

**结论**：T30 接线（`ASSET_JUDGE_ENABLED` env 开关 → `_get_asset_judge` → `AssetEvaluator(store, judge)` → fail-closed）在真实 server + 真实 DeepSeek 下端到端闭环成立——真实 LLM 评测（0.95）→ 双重把关（确定性 + judge）→ 员工确认 → 入库 + 评测结果审计可见。副带实证：duplicate 去重把关正确拦截重复标题提交（`评测不过: duplicate`）。

---

## 11. 注入 wiring 真实纪要试点（资产复用注入接线，2026-08-16 跑通）

验证 M4 资产复用注入 seam 的**接线生效**：预置团队资产（模板/知识/技能规则）→ coordinator 绑定 `build_asset_context` 为 `asset_context_builder` → 真实纪要 DAG 运行 → 节点 prompt 含"资产参考"段。对应实施计划 `2026-08-15-hybrid-team-platform-asset-injection-pilot.md` Task 2（T1 已交付 `build_minutes_workflow` team_id 透传）。

### 接线链路（wiring 说明）

```
build_minutes_workflow(transcript, approver, team_id)   # T1：team_id 透传各节点 input_spec
  → WorkflowEngine._get_node_input 合并 input_spec → input_data["team_id"]
  → coordinator._asset_context_builder(team_id, "minutes", ["纪要", "待办"])   # M4-T2 seam
  → build_asset_context(store, extractor, ...) → "\n资产参考：\n..." 追加进节点 prompt
```

- **T1 接线点**：`minutes_workflow.py` `build_minutes_workflow(transcript, approver, team_id)`——team_id 非空时写入每个节点 `input_spec["team_id"]`（空则不加键，既有形状/调用零变化）。
- **M4-T2 接线点**：`meeting_coordinator.py` `_execute_workflow_node`（:317）对 `dept-docs` 节点读取 `input_data["team_id"]`，非空时调用 `self._asset_context_builder(team_id, "minutes", ["纪要", "待办"])`，返回值拼进节点 prompt；builder 为空/异常/无 team_id 均不注入（注入是增强非必需）。
- **执行路径选择**：试点绕过 `process_user_message`——analyzer 内部 `build_minutes_workflow(user_message)` 单参调用无 team_id 通道（`semantic_analyzer.py`），故试点直接 `build_minutes_workflow(team_id=...)` + `coordinator._execute_workflow`（真实 LLM 节点执行）。
- **注入验证（wrapper 捕获）**：`_execute_workflow_node` 的 prompt 在内部构造不直接暴露——实例级 wrapper：①重注册 `workflow_engine` 的 dept-docs executor（构造时引擎已捕获原 bound 执行器，须重注册才生效）记录每节点 `input_data.team_id`；②替换 `coord._run_agent_execution_loop` 实例属性（不绑定 self，运行时查找命中）记录每节点真实下发的 prompt。

### 运行方式

```bash
cd backend
KEY=$(grep -E '^DEEPSEEK_API_KEY=' /home/test/MDH/.env | cut -d= -f2- | tr -d '"' | tr -d "'")
BASE=$(grep -E '^DEEPSEEK_BASE_URL=' /home/test/MDH/.env | cut -d= -f2- | tr -d '"')
MODEL=$(grep -E '^DEEPSEEK_MODEL=' /home/test/MDH/.env | cut -d= -f2- | tr -d '"')
/home/test/miniconda3/envs/agentscope/bin/python pilot_asset_injection.py \
  --api-key "$KEY" --base-url "$BASE" --model "$MODEL"
```

- 预置资产：`store_artifact` 好产出物（纪要-0815）+ `propose_template` 好模板（会议纪要模板）+ `SkillEvolution.evolve_from_feedback` 提炼技能规则（审核后写增量区）。
- **零成本对照顺序**：空团队运行必须先于预置资产——技能规则检索（`ExperienceExtractor.retrieve_relevant_rules`）是全局共享、不按 team 隔离（`AssetStore` 的 artifacts/templates 才按 team 隔离），预置后再跑空团队会检索到同 extractor 的规则导致误判；先验证空态再预置，才能干净地证明"builder 返回空不注入"。
- 把关非本试点范围：不注入 approval_manager（node gate 自动跳过）。

### 2026-08-16 结果（全部 PASS，模型 deepseek-chat，共 6 节点真实 LLM 调用）

| 验收项 | 结果 |
|--------|------|
| 运行 A：空团队（预置前）零成本 | ✓ status=completed（15.0s），3 节点 prompt 含资产段 **0/3**；`build_asset_context` 返回空串（len=0） |
| 运行 B：预置团队注入生效 | ✓ status=completed（12.7s），3 节点 prompt 含资产段 **3/3** |
| ① 注入接线生效 | ✓ team_id 透传 `[('extract','pilot-asset-team'), ('draft',…), ('proofread',…)]` + 3 节点 prompt 均含"资产参考"段 |
| ①-3 注入内容来自预置资产 | ✓ 资产段含「会议纪要模板」+「纪要-0815」+ 规则（task_type is minutes → 责任人/行动项） |
| ② 生成结果产出 | ✓ 纪要 DAG extract/draft/proofread 3 节点真实 LLM 结果非空 |
| ③ 零成本不破坏流程 | ✓ 空团队 wf 正常 completed（注入为空 → prompt 无资产段 → 执行不受影响） |

注入段实证（wrapper 捕获的真实 prompt 节选）：
```
资产参考：
- 模板「会议纪要模板」：标题：会议纪要 时间：2026-08-15 参加人：市场部、研发部、销售部…
- 知识「纪要-0815」：会议确定新产品 8 月 15 日上线。市场部负责宣传物料…
- 规则：task_type is minutes and role is assistant → …请把速记整理成会议纪要并生成待办清单。
- 规则：task_type is minutes and review stage → 审核修改：纪要待办需逐项指定责任人与截止日期。
```

**结论**：T1 + M4-T2 两个接线点（`build_minutes_workflow` team_id 透传 → 节点 input_spec → coordinator seam → 节点 prompt 注入）在真实 DeepSeek 下全链路成立——有资产团队节点 prompt 注入"资产参考"段、无资产团队零成本不注入且执行不受影响。M4 登记的"注入 wiring 接线"落地。

### 已知边界

- **process_user_message 无 team_id 通道**：analyzer 内部 `build_minutes_workflow(user_message)` 单参调用——生产路径要带 team_id 需扩展 analyzer（当前试点走直接 workflow 路径验证 seam 本身）。
- **技能规则全局共享**：`retrieve_relevant_rules` 不按 team 隔离（区别于 AssetStore 的 artifacts/templates）——若需团队级规则隔离属后续产品决策，非本试点范围。
- 试点消耗真实 API token（6 次节点 LLM 调用，~28s）；工作区保留于 `backend/data/demo_workspaces/pilot-asset-injection-*`。
