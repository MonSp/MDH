# 后端多智能体编排系统 WhyBuddy 化 — 需求规格

## 目标

将 WhyBuddy 的闭环工作流哲学（Spec-Validate-Handoff、伴随式审查、确定性门禁、证据追踪、EARS 验收）应用到后端 Python 多智能体协作编排系统中，使其从"LLM 主观判断驱动"升级为"确定性验证 + LLM 智能驱动"的混合模式。

当前系统是一个基于会议模型的多智能体协作平台（FastAPI + agentscope），包含 PlannerAgent、ExecutorAgent、MeetingCoordinator、WorkflowEngine 等 24 个 Python 模块。系统优势在于多角色协作框架完整（6 种角色、消息通信、工作流引擎、协商共识、经验循环），但验证完全依赖 LLM 主观判断，缺乏结构化规格管理、确定性验证门禁和完整证据链。

## 范围

### 在范围内

1. **Spec Tree 结构化规格管理**：新建 spec_tree.py，定义树形规格数据结构和确定性校验器
2. **伴随式审查角色**：新建 CriticAgent 和 GroundingAgent，自动审查漏洞和验证证据
3. **确定性门禁系统**：新建 gate_manager.py，每个阶段转换经确定性校验脚本验证
4. **EARS 验收标准引擎**：新建 ears_validator.py，强制验收标准采用 EARS 句式
5. **证据链追踪系统**：新建 evidence_chain.py，扩展 TraceContextManager 记录决策证据
6. **显式回退链机制**：扩展 DynamicRouter 和 WorkflowEngine 支持备选路径自动切换
7. **MeetingCoordinator 职责拆分**：将 5 个职责拆分为独立可测试模块

### 不在范围内

1. 前端 TypeScript 模块（src/modules/）的改造
2. agentscope 框架本身的替换或修改
3. LLM 提供商的切换
4. 现有 6 角色模型（CEO/Planner/Executor/Monitor/Reviewer/Coordinator）的变更
5. WebSocket API 接口的变更（保持向后兼容）

## 功能要求

### FR1: Spec Tree 结构化规格管理

系统 SHALL 提供 SpecTreeNode 数据结构，支持 requirement、design、task、evidence 四种节点类型。系统 SHALL 提供 SpecTreeValidator 确定性校验器，校验规则包括：节点数在 3-60 之间、id 唯一非空、唯一根节点、父可达、无环、深度不超过 4、来源诚实、成功标准覆盖且不塌缩、EARS 验收句式、证据贯穿。校验规则直接移植 WhyBuddy 的 validate_spec_tree.py 逻辑。

### FR2: Critic Agent

系统 SHALL 提供 CriticAgent，接收任务上下文后自动发现被忽略的需求域、矛盾约束和证据不足处。CriticAgent 的审查结果 SHALL 输出为 findings 列表，每次审查 SHALL 写入 companion_log.json（格式：stage, role="critic", ts, findings）。CriticAgent SHALL 通过 CommunicationManager 注册为特殊 Agent，继承 ExecutorAgent 的消息通信能力。

### FR3: Grounding Agent

系统 SHALL 提供 GroundingAgent，接收任务产出后检查每条结论是否有真实代码/文件/接口出处。GroundingAgent 的审查结果 SHALL 输出为 sources 列表，每次审查 SHALL 写入 companion_log.json（格式：stage, role="grounding", ts, sources）。当 project_context 中 grounding.repoAvailable=true 时，GroundingAgent SHALL 至少引用一条真实仓库出处。

### FR4: 确定性门禁系统

系统 SHALL 提供 GateManager，支持注册门禁（register_gate）和执行门禁（run_gate）。每个门禁执行 SHALL 记录到 checks_ledger.json 台账，包含 gate_name、exit_code、stdout、stderr、timestamp。系统 SHALL 内置 3 个门禁：spec_tree_gate（Spec Tree 结构校验）、ears_gate（EARS 句式校验）、coverage_gate（成功标准覆盖校验）。每个门禁 SHALL 同时定义通过支路和拦下支路。

### FR5: EARS 验收标准引擎

系统 SHALL 提供 EarsValidator，校验验收标准是否符合 EARS 句式。校验规则：必须包含触发条件词（WHEN/IF/当/若）、必须包含响应词（SHALL/应/必须）、触发条件在响应之前、不允许模糊词（应该/可能/尽量）。EarsValidator SHALL 集成到 SpecTreeValidator 中作为 requirement 节点的校验步骤。

### FR6: 证据链追踪系统

系统 SHALL 提供 EvidenceChain，扩展 TraceContextManager，在每个 span 上附加 evidence 元数据（stage, decision, inputs, outputs, source_refs）。EvidenceChain SHALL 提供 add_evidence、get_chain、get_decisions 三个核心方法。证据链 SHALL 与 SpecTree 的 evidenceRefs 双向关联，可通过 trace_id 从任一点追溯到全部关联产物。

### FR7: 显式回退链机制

DynamicRouter 的 RoutingDecision SHALL 增加 fallback_chain 字段，route() 方法 SHALL 返回首选路径和备选路径列表。WorkflowEngine 的 WorkflowNode SHALL 增加 fallback_executor 字段，节点失败时 SHALL 自动切换到备选执行器。回退策略 SHALL 在任务规划阶段提前声明。回退全部失败后 SHALL 自动触发 CompensationEngine 补偿。

### FR8: MeetingCoordinator 职责拆分

MeetingCoordinator SHALL 将 5 个职责拆分为独立模块：SemanticAnalyzer（语义分析）、TaskOrchestrator（任务编排）、DiscussionManager（讨论管理）、ReviewPipeline（审查流水线）、SpecManager（规格管理）。MeetingCoordinator SHALL 退化为薄路由层，只负责分发到这 5 个模块。拆分后 MeetingCoordinator 的 API SHALL 向后兼容。每个新模块 SHALL 可独立运行测试。

## 验收标准

### AC1: Spec Tree 验收

WHEN PlannerAgent 分解任务时，系统 SHALL 生成树形 Spec Tree 且通过 SpecTreeValidator 全部校验（节点数 3-60、id 唯一、唯一根、父可达、无环、深度 ≤ 4、来源诚实、成功标准全覆盖且不塌缩、EARS 验收句式、证据贯穿）。

### AC2: 伴随式审查验收

WHEN 任务产出中间结果时，系统 SHALL 自动触发 CriticAgent 和 GroundingAgent 审查，且 companion_log.json 中 SHALL 包含非空的 findings 和 sources。IF project_context.grounding.repoAvailable=true，THEN grounding sources 中 SHALL 至少有一条真实仓库出处。

### AC3: 确定性门禁验收

WHEN 任务在任意阶段转换时，GateManager SHALL 运行对应的确定性校验脚本，且 checks_ledger.json 台账 SHALL 记录每次门禁的完整执行信息。IF 门禁失败，THEN 系统 SHALL 拦下流程并返回具体违规项。

### AC4: EARS 验收标准验收

WHEN Spec Tree 中的 requirement 节点被创建时，EarsValidator SHALL 验证其 acceptance 字段。IF acceptance 不含 WHEN/IF 触发条件或不含 SHALL 响应词，THEN 系统 SHALL 拒绝入库并返回具体违规项。

### AC5: 证据链验收

WHEN 任务经过路由选择、分解、分配、执行、验证任一阶段时，EvidenceChain SHALL 记录该阶段的决策证据。IF 通过 get_chain(trace_id) 查询，THEN 返回的证据链 SHALL 包含所有阶段的完整决策记录。

### AC6: 回退链验收

WHEN 路由首选路径失败时，DynamicRouter SHALL 自动尝试 fallback_chain 中的备选路径。WHEN 工作流节点执行失败时，WorkflowEngine SHALL 自动切换到 fallback_executor。IF 所有回退路径均失败，THEN 系统 SHALL 自动触发 CompensationEngine 补偿。

### AC7: MeetingCoordinator 拆分验收

WHEN MeetingCoordinator 处理用户消息时，系统 SHALL 将请求分发到对应的独立模块。IF 运行 `pytest backend/tests/test_semantic_analyzer.py backend/tests/test_task_orchestrator.py backend/tests/test_discussion_manager.py backend/tests/test_review_pipeline.py backend/tests/test_spec_manager.py`，THEN 所有测试 SHALL 通过且每个模块可独立运行。
