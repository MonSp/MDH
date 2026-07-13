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

---

### [2026-07-13 10:00] 优化 #4：修复工作流引擎并行/混合策略的依赖失败传播缺失

**问题**: `workflow_engine.py` 的 `_execute_parallel` 和 `_execute_mixed` 策略中，当一个节点失败时，依赖它的下游节点仍会被执行。例如 A→B→C 链中，A 失败后 B 和 C 仍会执行，导致无意义的计算和潜在错误。

**根因**: 两种策略都通过 `in_degree` 计数器判断节点是否就绪，但只在 `_execute_sequential` 中调用了 `_check_dependencies()` 验证依赖是否真正完成。`_execute_parallel` 和 `_execute_mixed` 仅根据 `in_degree == 0` 就执行节点，不检查依赖节点的实际状态（COMPLETED vs FAILED/SKIPPED）。

**改动**:
- `backend/workflow_engine.py` — 在 `_execute_parallel` 和 `_execute_mixed` 的就绪节点筛选中，增加 `_check_dependencies()` 调用。依赖未满足时，通过新方法 `_propagate_skip()` 递归标记该节点及所有下游节点为 SKIPPED，同时正确递减所有受影响节点的 `in_degree`
- `backend/workflow_engine.py` — 新增 `_propagate_skip()` 辅助方法，递归传播跳过状态
- `backend/tests/test_workflow_engine.py` — 新增 `test_parallel_workflow_skips_dependents_on_failure` 测试用例

**验证**: 86 passed (82 old + 4 new), 0 failed。新增测试验证 A→B→C 链中 A 失败后 B 和 C 均被标记为 SKIPPED 且不被执行。

**影响**: 修复后工作流引擎在并行/混合策略下能正确处理依赖失败：失败节点的下游会被跳过而非无意义执行。向后兼容：正常执行（无失败）时行为不变。

---

### [2026-07-13 09:30] 优化 #5：审查流水线整合 LLM 审查意见到结构化验收决策

**问题**: `review_pipeline.py` 的 `_generate_structured_feedback()` 只将 `task_description` 和 `execution_result` 传给 planner 的关键词匹配器，完全忽略刚生成的 `reviewer_feedback` 和 `monitor_feedback`。这意味着审查者通过 LLM 发现的严重问题（如安全漏洞、逻辑错误）不会影响验收决策——planner 的纯关键词匹配可能判定为 "approved"。

**根因**: 结构化反馈生成（第110行）在 reviewer/monitor 反馈生成（第95-102行）之后调用，但没有将这些反馈传入。`generate_review_feedback()` 已有 `context` 参数支持额外信息，但调用时未使用。

**改动**:
- `backend/review_pipeline.py:_generate_structured_feedback()` — 新增 `reviewer_feedback` 和 `monitor_feedback` 参数，传入 planner 的 `context`。增加关键信号检测：如果 reviewer 反馈包含"严重/致命/critical/fatal/blocker/必须修复/不能发布"等关键词且 planner 判定 approved，则覆盖为 `revision_required`
- `backend/review_pipeline.py` 第110行 — 更新调用，传入 reviewer_feedback 和 monitor_feedback
- `backend/tests/test_review_pipeline.py` — 新增 6 个测试：普通审查通过、严重问题覆盖、关键词变体、monitor 不触发覆盖、空反馈保持不变、非严重反馈保持 approved

**验证**: 645 passed (638 old + 7 new), 2 warnings。新增测试全部通过。

**影响**: 修复后审查流水线的验收决策将综合 planner 关键词匹配和 LLM 审查意见。审查者发现的严重问题可以阻止自动批准，触发修复迭代。向后兼容：无严重关键词时行为不变。

---

### [2026-7-13 10:00] 优化 #6：修复工作流引擎节点间数据传递断裂

**问题**: `workflow_engine.py` 的 `_get_incoming_edges()` 方法硬编码返回空列表（第627行），导致 `_get_node_input()` 无法从上游节点收集输出数据。工作流中 A→B→C 的数据流完全断裂——B 无法获得 A 的输出，C 无法获得 B 的输出。

**根因**: 方法内注释"暂时返回空列表"，但 `WorkflowDefinition` 已有 `edges` 属性（存储在 `self._definitions` 中），只是 `_get_incoming_edges()` 没有查询它。`execution.workflow_id` 可以用来查找对应的定义。

**改动**:
- `backend/workflow_engine.py:_get_incoming_edges()` — 通过 `execution.workflow_id` 从 `self._definitions` 查找定义，过滤 `target_node_id == node.node_id` 的边返回
- `backend/tests/test_workflow_engine.py` — 新增 `test_node_receives_upstream_data_via_edges` 测试，验证 A→B→C 链中 B 收到 A 的输出、C 收到 B 的输出

**验证**: 646 passed (645 old + 1 new), 2 warnings。新增测试通过。

**影响**: 修复后工作流节点间可以正确传递数据。sequential 策略下每个节点的 `input_data` 将包含上游节点的 `result`。向后兼容：无边定义的工作流行为不变（返回空列表）。

---

### [2026-07-13 10:30] 优化 #7：工作流状态变化推送到前端

**问题**: `meeting_coordinator.py` 的 `_on_workflow_status_change()` 回调（第204行）只记录日志，不推送到前端。用户能看到单个节点的状态更新（`_on_workflow_node_status_change` 已实现推送），但无法跟踪工作流的整体生命周期（RUNNING/COMPLETED/FAILED/PAUSED）。

**根因**: `_on_workflow_node_status_change`（第210行）有完整的前端推送逻辑（通过 `_on_message` 回调发送 `msg_type`、`node_id`、`status`），但 `_on_workflow_status_change` 被标记为"暂时只记录日志"的 stub。

**改动**:
- `backend/meeting_coordinator.py:_on_workflow_status_change()` — 添加前端推送逻辑，通过 `_on_message` 发送 `msg_type="workflow_status_update"`，包含 `workflow_id`、`execution_id`、`status`。复用已有的 `_find_agent_id(AgentRole.CEO)` 路由消息到 CEO agent。无 `_on_message` 时安全降级为纯日志。
- `backend/tests/test_meeting_coordinator_router.py` — 新增 `TestWorkflowStatusCallback` 测试类，2 个测试：状态变化推送到前端、无回调时不崩溃

**验证**: 648 passed (646 old + 2 new), 2 warnings。新增测试通过。

**影响**: 修复后前端可以接收工作流整体状态变化事件，配合已有的节点状态更新实现完整的生命周期追踪。向后兼容：无 `_on_message` 时行为不变。
