# T12 同会话二命交付证据（program-pivot T12.4）

- **日期**: 2026-10-19（实网跑通）
- **分支**: `feature/program-t12-e2e`（基于 main `39844a9`）
- **服务**: worktree backend `MDH_PORT=8766`（rule writes disabled=True 已确认）
- **口径**: 实网 WebSocket 双任务——单会话内任务 A 建 workspace，任务 B 命中 promoted 程序免 LLM 落盘

## 实网结果（passed=true，EXIT=0）

| DoD | 结果 |
|---|---|
| task_a_created_workspace | true（`/home/test/.agent-workspaces/71515157`） |
| task_b_path_program | true（`path_used=program`） |
| task_b_out_file_exists | true（`out.txt` 内容 = 完整任务文本） |
| task_b_success | true |

关键观测：

| 指标 | Task A（LLM complex） | Task B（program） |
|---|---|---|
| path_used | complex | **program** |
| success | false* | **true** |
| elapsed | 36.1s | **0.8s** |
| messages | 41 | 4 |

\* Task A 复杂任务 LLM 交付未标 success（workspace 已建，不阻塞二命 DoD）。

CEO wire 消息（B）：`命中成熟程序 t12_file_writer，本地执行并经审阅通过，免 LLM 交付。`

种子程序：`t12_file_writer`（promoted + record_validation deepseek-chat），io_schema 要求 `workspace_path.required=true`。

产物：

- `same_session_e2e_result.json` — DoD 汇总
- `task_a_messages.json` / `task_b_messages.json` — 全量 wire 消息
- harness：`run_same_session_e2e.py`

## 复现

```bash
# worktree 起后端
cd backend && set -a && source /home/test/MDH/.env && set +a \
  && MDH_PORT=8766 setsid nohup python server.py > /tmp/mdh-8766.log 2>&1 < /dev/null & disown

# 跑 E2E
cd research/program-t12-e2e
EVAL_WS_URL=ws://localhost:8766/ws \
  /home/test/miniconda3/envs/agentscope/bin/python run_same_session_e2e.py
# 期望 exit 0 且 dod.passed=true
```

## 集成层补充（CI 可复跑，先前已入库）

- `tests/test_program_t12_session.py::test_second_hit_same_session_writes_file`
- `tests/test_program_sediment.py`
- `tests/test_program_io_schema_quality.py`
