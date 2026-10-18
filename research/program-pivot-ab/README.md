# 程序路径 vs LLM 直调 A/B 基线（program-pivot T8）

- **日期**: 2026-10-17
- **后端**: 本分支（program-pivot 全栈）`MDH_PORT=8766`，WS `ws://localhost:8766/ws`
- **任务集**: 五任务 E1–E5（同 research/eval-real-tasks-2026-09-24.md）
- **产物**: `arm_llm.json` / `arm_program.json` / `compare.json`（+ 逐任务 `*_summary.json`/`*_messages.json`）
- **口径**: token 代理 = 消息数（无 token 计量）；得分 = task_result.success 计数

## 结果摘要（compare.json）

| 指标 | Arm A (LLM 直调) | Arm B (程序臂) |
|---|---|---|
| 成功得分 | 2/5 | 3/5（E3 翻转受运行方差影响） |
| p50 / p95 耗时 | 37.7s / 45.5s | 24.3s / 50.9s |
| token 代理（消息数） | 266 | 263 |
| path_used=program | 0 | 0 |
| 程序命中（注入证据） | 0 | 2（E1/E5） |
| 审阅 fail→回退 | — | 2（E1/E5，程序未落盘文件，审阅如实拒绝） |

## 关键结论

1. **五任务均为落盘型任务**：策略型程序（flatten_strategy）输出无法满足"写函数+测试"验收，LLM 审阅正确 fail → 回退 LLM。`path_used=program` 交付为 0 是**契约正确行为**，也印证 T6 reviewer 指出的 io_schema 缺口：`run()` 拿不到 workspace 路径，产出文件的程序暂无法闭环（后续任务：payload 携带 workspace 或 io_schema 路由）。
2. **程序臂开销可忽略**：命中+执行+审阅+回退的总耗时代理与基线同量级（p50 反而更低，方差主导）；无审阅 LLM 崩溃时不会拖慢任务。
3. **评测挖出并修复生产级 bug**：`program_reviewer.llm_review_fn` / `program_compiler.llm_generate_fn` 照抄旧 agentscope 写法访问 `agent.model`（自建 ChatAgent 无此属性）→ 实网审阅/编译必炸（REVIEW_FAILED）。已改为直接使用 `create_agent` 返回的 ChatAgent.reply（本分支修复，见提交）。
4. **单轮方差大**（E3 两臂成功翻转）：结论以机制验证为主，量化收益需多轮重复（后续 R 系列）。

## 复现

```bash
# 1. 起本分支后端（8766）
cd backend && set -a && source ../../.env && set +a && MDH_PORT=8766 python server.py
# 2. 双臂
cd research/program-pivot-ab
EVAL_WS_URL=ws://localhost:8766/ws python run_ab.py --skip-program   # Arm A
EVAL_WS_URL=ws://localhost:8766/ws python run_ab.py --skip-llm       # Arm B（自动 seed）
```
