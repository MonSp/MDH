# T12 同会话二命交付证据（program-pivot T12.4）

- **日期**: 2026-10-18
- **分支**: `feature/program-t12-supply`（基于 main `8e2a9c7` + T12.1/T12.2）
- **口径**: 单元/集成层硬证据（非实网五任务）——证明「已有 workspace 的同会话二次任务」可走 `path_used=program` 且文件落盘

## 结论

| 场景 | 结果 | 证据 |
|---|---|---|
| 同 agent 已有 `self._workspace`，再发落盘型相似任务 | **path_used=program + 文件写入 workspace** | `tests/test_program_t12_session.py::test_second_hit_same_session_writes_file` |
| 首任务无 workspace | WORKSPACE_REQUIRED → 回退 LLM simple；不写文件 | `test_first_hit_without_workspace_falls_back` |
| WORKSPACE_REQUIRED 可感知 | CEO `agent_message` 含 `WORKSPACE_REQUIRED` | `test_workspace_required_emits_notice` |
| LLM 路径成功后沉淀 | best-effort compile，candidate 入库 | `tests/test_program_sediment.py` |

## 运行

```bash
cd backend
/home/test/miniconda3/envs/agentscope/bin/python -m pytest \
  tests/test_program_t12_session.py tests/test_program_sediment.py \
  tests/test_program_io_schema_quality.py -q --ignore=tests/legacy
```

## 复现实网 E2E（后续可选）

1. 起后端；seed 落盘型 promoted 程序（io_schema 要求 workspace）。
2. 会话内任务 A：走 complex，HITL 建 workspace。
3. 同会话任务 B：关键词命中 → 应 `path_used=program`，out.txt 在 workspace 下。

本 harness 的 DoD 以集成测试为准（可 CI 复跑）；实网脚本在有稳定 8766 环境时再补 `run_ab` 变体。
