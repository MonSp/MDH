# [Pilot] 会议纪要任务 · 真实试点运行手册

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
