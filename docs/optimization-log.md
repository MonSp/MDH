# MDH 优化日志

自主迭代优化记录。每轮发现一个问题、分析根因、实施修复、验证结果。

---

### [2026-07-13 00:00] 优化 #1：修复讨论管理器共识评估的投票缺失 bug

**问题**: `discussion_manager.py` 和 `mixed_location_discussion.py` 的共识评估始终返回 `total_votes=0, accepted=False`，导致讨论共识机制形同虚设。

**根因**: 两个模块在调用 `evaluate_consensus()` 前只调用了 `add_argument()`（添加论点/立场），但从未调用 `cast_vote()`（投票）。`NegotiationEngine` 中 arguments 和 votes 是独立的数据结构，`evaluate_consensus` 只统计 votes，所以始终 0 票。而 `meeting_coordinator.py` 的流程是正确的（先 `cast_vote` 再 `evaluate_consensus`）。

**改动**:
- `backend/discussion_manager.py:178-188` — 在 `_coordinator_summarize()` 中，遍历讨论结果时根据立场自动投票：`support`/`modify` → 赞成，`oppose` → 反对，权重取 parsed_confidence
- `backend/mixed_location_discussion.py:422-430` — 同样修复混合位置讨论的共识评估流程
- `backend/test_loop_modules.py` — 新增 3 个测试用例验证立场投票逻辑

**验证**: 71 passed, 4 failed (均为预先存在的 agentscope 依赖缺失)。新增 3 个测试全部通过：`test_stance_based_voting_accepted`、`test_stance_based_voting_rejected`、`test_modify_stance_counts_as_approve`。

**影响**: 修复后讨论管理器的共识评估将正确反映各智能体的立场，`vote_result` 可被下游用于判断是否需要追加讨论轮次或终止流程。

---

### [2026-07-13 08:30] 优化 #2：激活 meeting_coordinator 投票阶段的真实 stance 驱动投票

**问题**: `meeting_coordinator.py` 串行流程的投票阶段（第862-869行），所有 Agent 硬编码 `vote_approve = True`，完全忽略讨论阶段产生的 `parsed_stance`（support/oppose/modify/neutral）和 `confidence`（0.0-1.0）。投票系统（`NegotiationEngine`）架构完整但从未真正被使用，协作决策形同虚设。

**根因**: 讨论结果 `discussion_results` 中每个 Agent 都有 `parsed_stance` 和 `confidence` 字段，但投票阶段的循环没有消费这些数据，而是让所有 Agent 无条件赞成。`NegotiationEngine` 的 `add_argument()` 方法也从未被调用，`ARGUMENT_BASED` 策略无法生效。

**改动**:
- `backend/meeting_coordinator.py:862-893` — 构建 `stance_by_agent` 查找表，根据 stance 映射投票：oppose → 反对，modify → 有条件赞成，support → 赞成，neutral → 按 confidence 阈值（≥0.4）决定。同时向 `NegotiationEngine` 提交 arguments（论据），激活 `ARGUMENT_BASED` 策略。
- `backend/meeting_coordinator.py:19` — 新增 `Stance` 到 import
- `backend/tests/test_negotiation.py` — 新增 15 个测试用例，覆盖：基础投票、加权投票、论据驱动投票、stance→vote 映射、决策图、reset、边界情况

**验证**: 634 passed (619 old + 15 new), 2 warnings。新增测试全部通过。

**影响**: 修复后投票阶段将真实反映各智能体的立场。如果讨论中有 Agent 反对方案，投票结果可能为"未通过"，触发 `vote_rejected` 终止流程并要求用户重新描述需求。这使协作决策从"橡皮图章"变为有意义的集体判断。向后兼容：讨论结果为空时行为不变（所有 Agent 默认 neutral + confidence=0.5 → approve）。

---

### [2026-07-13 09:00] 优化 #3：在会议流程中注入历史经验到任务描述

**问题**: `meeting_coordinator.py` 的串行流程在项目结束时提取经验规则（第1063行），但在项目开始时从不检索和注入过往经验。`ExperienceExtractor` 的 `retrieve_relevant_rules()` 和 `build_experience_context()` 方法只被 `task_orchestrator.py` 调用，而主会议流程（串行路径）完全不使用。经验系统有写入路径但缺少读取路径。

**根因**: 会议流程的任务描述增强（`_enhance_task_description`）只整合了当前讨论结果，没有检索历史经验。`task_orchestrator.py` 有自己的 `_inject_experience_context()` 方法，但串行流程走的是 `meeting_coordinator.process_user_message()` → `auto_assign_task()` → `execute_assigned_tasks()` 路径，不经过 task_orchestrator。

**改动**:
- `backend/meeting_coordinator.py:840-860` — 在讨论结果整合之后、任务分派之前，新增经验注入逻辑：从 `ExperienceExtractor` 检索与当前任务类型和关键词匹配的已批准规则，构建经验上下文并追加到增强后的任务描述中。同时从讨论结果中提取补充关键词以提高检索精度。异常时静默跳过，不影响主流程。
- `backend/tests/test_experience_extractor.py` — 新增 `TestExperienceInjection` 测试类，4 个测试用例：检索并注入到任务描述、无规则时跳过注入、只有 approved 状态可被检索、讨论关键词改善检索

**验证**: 638 passed (634 old + 4 new), 2 warnings。新增测试全部通过。

**影响**: 修复后每个新项目启动时都会自动检索过往经验并注入任务描述，执行 Agent 在生成代码/方案时能参考历史成功模式和失败教训。向后兼容：首次运行（无历史规则）时行为不变，异常时静默跳过。
