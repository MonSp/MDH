# 后端多智能体编排系统 WhyBuddy 化 — 设计规格

## 设计目标

1. **渐进式增强**：在现有 24 个 Python 模块基础上新增 7 个模块 + 拆分 1 个模块，不重写现有代码
2. **WhyBuddy 哲学落地**：将 Spec-Validate-Handoff 闭环、伴随式审查、确定性门禁、EARS 验收、证据链追踪从 Skill 层面下沉到后端运行时
3. **保持 API 兼容**：MeetingCoordinator 的 WebSocket API 向后兼容，前端无感知
4. **可独立测试**：每个新模块可独立运行 pytest，不依赖其他模块的运行时状态

## 模块划分

### 新增模块（7 个）

#### M1: backend/spec_tree.py — Spec Tree 数据结构与校验器

**职责**：定义 Spec Tree 的数据结构（SpecTreeNode、SpecTree）和确定性校验器（SpecTreeValidator）。

**核心类**：
- `SpecTreeNodeType` 枚举：requirement / design / task / evidence
- `SpecTreeNode` 数据类：id, parentId, type, title, acceptance, coversCriteria, evidenceRefs, notes, source, verify
- `SpecTree` 数据类：rootNodeId, version, successCriteria, nodes, provenance
- `SpecTreeValidator` 类：
  - `validate(tree: SpecTree) -> ValidationResult`
  - 内部校验链：结构校验（节点数/唯一根/父可达/无环/深度）-> 来源诚实 -> 成功标准覆盖且不塌缩 -> EARS 验收 -> 证据贯穿
  - `ValidationResult`：passed: bool, violations: List[str], stats: dict

**依赖**：ears_validator（EARS 校验步骤）

#### M2: backend/ears_validator.py — EARS 验收句式校验器

**职责**：校验验收标准文本是否符合 EARS（Event-Driven Acceptance Requirements Specification）句式。

**核心类**：
- `EarsValidator` 类：
  - `validate(text: str) -> Tuple[bool, List[str]]`
  - 规则 1：必须包含触发条件词（WHEN/IF/当/若）
  - 规则 2：必须包含响应词（SHALL/应/必须）
  - 规则 3：触发条件在响应之前
  - 规则 4：不允许模糊词（应该/可能/尽量/也许/大概）

**依赖**：无（纯确定性逻辑）

#### M3: backend/gate_manager.py — 确定性门禁管理器

**职责**：管理阶段转换的确定性校验门禁，记录台账。

**核心类**：
- `GateResult` 数据类：gate_name, passed, exit_code, stdout, stderr, timestamp
- `ChecksLedger` 类：
  - `record(result: GateResult)` — 追加到台账
  - `export() -> List[GateResult]` — 导出全部记录
  - `to_json(path: str)` — 持久化到 JSON 文件
- `GateManager` 类：
  - `register_gate(name: str, validator: Callable[[Any], GateResult])` — 注册门禁
  - `run_gate(name: str, context: Any) -> GateResult` — 执行门禁并自动记台账
  - 内置门禁：spec_tree_gate, ears_gate, coverage_gate

**依赖**：spec_tree（SpecTreeValidator）、ears_validator（EarsValidator）、trace（TraceContextManager 集成）

#### M4: backend/evidence_chain.py — 证据链追踪系统

**职责**：扩展 TraceContextManager，在每个 span 上附加 evidence 元数据，形成完整决策证据链。

**核心类**：
- `Evidence` 数据类：stage, decision, inputs, outputs, source_refs, timestamp
- `EvidenceChain` 类：
  - `add_evidence(trace_id: str, evidence: Evidence)` — 记录证据
  - `get_chain(trace_id: str) -> List[Evidence]` — 获取完整证据链
  - `get_decisions(trace_id: str, stage: str) -> List[Evidence]` — 获取特定阶段的决策证据
  - `link_to_spec_tree(trace_id: str, spec_tree: SpecTree)` — 与 SpecTree evidenceRefs 双向关联

**依赖**：trace（TraceContextManager）

#### M5: backend/collaboration/critic_agent.py — Critic Agent

**职责**：伴随式审查角色，自动发现任务上下文中的漏洞、被忽略的需求域、矛盾约束。

**核心类**：
- `CriticAgent` 类（继承 ExecutorAgent 的通信能力）：
  - `review(task_context: dict) -> CriticResult`
  - `CriticResult`：findings: List[str], severity: str, timestamp
  - 内部调用 LLM（使用 CEO Agent 的模型配置）分析任务上下文
  - 审查结果自动写入 companion_log.json

**依赖**：communication（CommunicationManager）、agent（LLM 调用）

#### M6: backend/collaboration/grounding_agent.py — Grounding Agent

**职责**：伴随式接地角色，强制每条结论挂上真实代码/文件/接口出处。

**核心类**：
- `GroundingAgent` 类（继承 ExecutorAgent 的通信能力）：
  - `verify(task_output: dict, repo_context: Optional[dict]) -> GroundingResult`
  - `GroundingResult`：sources: List[str], grounded: bool, timestamp
  - 有仓库时读真代码验证；无仓库时标记降级
  - 审查结果自动写入 companion_log.json

**依赖**：communication（CommunicationManager）

#### M7: backend/spec_manager.py — 规格管理器

**职责**：封装 Spec Tree 的生成、校验、文档派生全流程。

**核心类**：
- `SpecManager` 类：
  - `generate_spec_tree(clarified_brief: dict) -> SpecTree` — 从澄清简报生成 Spec Tree
  - `validate_and_gate(tree: SpecTree) -> Tuple[bool, SpecTree]` — 校验并通过门禁
  - `generate_documents(tree: SpecTree) -> dict` — 从树派生 requirements/design/tasks 文档
  - `export_handoff(tree: SpecTree, docs: dict) -> dict` — 导出交付包

**依赖**：spec_tree、gate_manager、ears_validator

### 拆分模块（5 个从 MeetingCoordinator 拆出）

#### M8: backend/semantic_analyzer.py — 语义分析器

**职责**：封装语义分析逻辑，从 MeetingCoordinator 的 `semantic_analyze()` 方法提取。

**核心类**：
- `SemanticAnalyzer` 类：
  - `analyze(user_input: str) -> SemanticAnalysisResult`
  - 内部调用 DynamicRouter 做初步路由 + LLM CEO Agent 做最终意图判断
  - 支持工作流模式检测

**依赖**：dynamic_router、agent

#### M9: backend/task_orchestrator.py — 任务编排器

**职责**：封装任务分解、分配和执行逻辑，从 MeetingCoordinator 的 `decompose_task()`、`assign_tasks()`、`execute_assigned_tasks()` 提取。

**核心类**：
- `TaskOrchestrator` 类：
  - `decompose(task_description: str) -> TaskPlan`
  - `assign(task_plan: TaskPlan) -> List[TaskAssignment]`
  - `execute(assignments: List[TaskAssignment]) -> List[TaskResult]`
  - 集成 SpecManager 生成 Spec Tree，集成 GateManager 做门禁校验

**依赖**：spec_manager、gate_manager、evidence_chain、collaboration/planner_agent

#### M10: backend/discussion_manager.py — 讨论管理器

**职责**：封装多角色讨论逻辑，从 MeetingCoordinator 的 `run_discussion()` 提取。

**核心类**：
- `DiscussionManager` 类：
  - `run(topic: str, agents: List[dict]) -> DiscussionResult`
  - 内部管理多轮发言、立场解析、共识评估
  - 集成 NegotiationEngine

**依赖**：negotiation、agenda

#### M11: backend/review_pipeline.py — 审查流水线

**职责**：封装审查逻辑，从 MeetingCoordinator 的 `review_task_execution()` 提取，并集成 CriticAgent 和 GroundingAgent。

**核心类**：
- `ReviewPipeline` 类：
  - `review(task_output: dict, task_context: dict) -> ReviewResult`
  - 流程：CriticAgent 自动审查 -> GroundingAgent 自动接地 -> 多角色 LLM 审查（Reviewer + Monitor + Coordinator）
  - 审查结果写入 companion_log.json

**依赖**：collaboration/critic_agent、collaboration/grounding_agent、evidence_chain

#### M12: backend/spec_manager.py（同 M7）

已在新增模块中定义，同时服务于拆分后的 MeetingCoordinator。

### MeetingCoordinator 改造

改造后的 MeetingCoordinator 退化为薄路由层：

```python
class MeetingCoordinator:
    def __init__(self, ...):
        self.semantic_analyzer = SemanticAnalyzer(...)
        self.task_orchestrator = TaskOrchestrator(...)
        self.discussion_manager = DiscussionManager(...)
        self.review_pipeline = ReviewPipeline(...)
        self.spec_manager = SpecManager(...)

    async def process_user_message(self, message: str, ...):
        analysis = self.semantic_analyzer.analyze(message)
        if analysis.is_task:
            return await self.task_orchestrator.execute(message, ...)
        elif analysis.is_workflow:
            return await self.task_orchestrator.execute_workflow(message, ...)
        else:
            return await self.discussion_manager.run(message, ...)
```

## 失败处理策略

### 策略 1：确定性门禁失败

当 GateManager 的门禁校验失败时：
1. 记录失败详情到 checks_ledger.json
2. 拦下流程，不进入下一阶段
3. 返回具体违规项给调用方
4. 调用方可选择修正后重试或降级处理

### 策略 2：Spec Tree 校验失败

当 SpecTreeValidator 校验失败时：
1. 返回具体违规项
2. 允许重生成一次（仅一次）
3. 重试仍失败则使用 fallback_tree 生成确定性兜底树（generationSource="template"）

### 策略 3：伴随式审查拦截

当 CriticAgent 发现严重问题或 GroundingAgent 发现证据缺失时：
1. 记录到 companion_log.json
2. 标记任务为 "needs_revision"
3. 将 findings/sources 反馈给 TaskOrchestrator 触发修正

### 策略 4：回退链耗尽

当 DynamicRouter 的 fallback_chain 和 WorkflowEngine 的 fallback_executor 均失败时：
1. 触发 CompensationEngine 自动补偿
2. 记录补偿结果到审计日志
3. 标记任务为 "compensated" 或 "failed"
4. 超预算转人工处理

### 策略 5：MeetingCoordinator 拆分兼容性

如果拆分后 API 出现不兼容：
1. 保留旧的 MeetingCoordinator 代码作为 legacy 路径
2. 通过 feature flag 控制新旧路径切换
3. 逐步迁移，不一次性切换

## 质量控制

1. **每个新模块必须有对应的 pytest 测试文件**，可独立运行
2. **所有确定性校验逻辑（SpecTreeValidator、EarsValidator、GateManager）必须有 100% 的规则覆盖测试**
3. **MeetingCoordinator 拆分后必须通过现有的 test_meeting_coordinator_router.py 测试**
4. **EvidenceChain 必须与现有 TraceContextManager 集成测试**
5. **CriticAgent 和 GroundingAgent 的 companion_log 格式必须与 WhyBuddy 的 check_companion.py 兼容**
