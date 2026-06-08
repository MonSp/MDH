# 后端多智能体编排系统 WhyBuddy 化 — 任务清单

## 里程碑

### M1: 基础层（Spec Tree + EARS + Gate）
**目标**：建立结构化规格管理和确定性验证的基础设施
**包含任务**：T1, T2, T3
**依赖**：无

### M2: 伴随层（Critic + Grounding + Evidence）
**目标**：建立伴随式审查和证据追踪能力
**包含任务**：T4, T5, T6
**依赖**：M1（Critic/Grounding 需要 EarsValidator 做格式校验）

### M3: 增强层（回退链 + 证据链集成）
**目标**：增强现有模块的容错和可追溯能力
**包含任务**：T7, T8
**依赖**：M1（回退链需要 GateManager 做门禁）

### M4: 重构层（MeetingCoordinator 拆分）
**目标**：将 God Object 拆分为独立可测试模块
**包含任务**：T9
**依赖**：M1 + M2 + M3（拆分需要所有新模块就绪）

### M5: 集成验证
**目标**：端到端验证 WhyBuddy 化后的完整闭环
**包含任务**：T10
**依赖**：M4

## 任务清单

### T1: 实现 backend/ears_validator.py
- **里程碑**：M1
- **描述**：实现 EARS 验收句式校验器，支持中英文混合的 WHEN/IF + SHALL 句式校验
- **输出**：backend/ears_validator.py + backend/tests/test_ears_validator.py
- **验收**：pytest 通过 — 合法 EARS 通过、缺少触发条件拒绝、缺少 SHALL 拒绝、模糊词拒绝、中英文混合支持

### T2: 实现 backend/spec_tree.py
- **里程碑**：M1
- **描述**：实现 SpecTree 数据结构和 SpecTreeValidator 确定性校验器，校验规则移植自 WhyBuddy 的 validate_spec_tree.py
- **输出**：backend/spec_tree.py + backend/tests/test_spec_tree.py
- **验收**：pytest 通过 — SpecTreeNode 创建、树结构校验、EARS 格式检查（集成 T1）、成功标准覆盖检查、证据贯穿检查
- **依赖**：T1

### T3: 实现 backend/gate_manager.py
- **里程碑**：M1
- **描述**：实现 GateManager 门禁管理器和 ChecksLedger 台账，内置 spec_tree_gate、ears_gate、coverage_gate 三个门禁
- **输出**：backend/gate_manager.py + backend/tests/test_gate_manager.py
- **验收**：pytest 通过 — 台账记录完整、gate 通过/失败两条支路、与 TraceContext 集成
- **依赖**：T2

### T4: 实现 backend/collaboration/critic_agent.py
- **里程碑**：M2
- **描述**：实现 CriticAgent 伴随式审查角色，调用 LLM 发现被忽略的需求域、矛盾约束、证据不足处
- **输出**：backend/collaboration/critic_agent.py + backend/tests/test_critic_agent.py
- **验收**：pytest 通过 — findings 非空、companion_log 格式合规（stage/role/ts/findings）

### T5: 实现 backend/collaboration/grounding_agent.py
- **里程碑**：M2
- **描述**：实现 GroundingAgent 伴随式接地角色，检查每条结论是否有真实代码/文件/接口出处
- **输出**：backend/collaboration/grounding_agent.py + backend/tests/test_grounding_agent.py
- **验收**：pytest 通过 — sources 非空、companion_log 格式合规、有仓库时至少引一条真实出处
- **依赖**：T4（共享 companion_log 格式）

### T6: 实现 backend/evidence_chain.py
- **里程碑**：M2
- **描述**：实现 EvidenceChain 证据链追踪系统，扩展 TraceContextManager 附加 evidence 元数据
- **输出**：backend/evidence_chain.py + backend/tests/test_evidence_chain.py
- **验收**：pytest 通过 — 证据记录、trace_id 链完整性、与 SpecTree evidenceRefs 双向关联
- **依赖**：T2

### T7: 实现回退链机制
- **里程碑**：M3
- **描述**：扩展 DynamicRouter 和 WorkflowEngine 支持显式回退链
- **输出**：修改 backend/dynamic_router.py + backend/workflow_engine.py + backend/tests/test_fallback_chain.py
- **验收**：pytest 通过 — 路由回退、工作流节点回退、回退失败触发补偿、回退策略提前声明
- **依赖**：T3（回退需要 GateManager 门禁）

### T8: 实现 backend/spec_manager.py
- **里程碑**：M3
- **描述**：实现 SpecManager 规格管理器，封装 Spec Tree 生成、校验、文档派生全流程
- **输出**：backend/spec_manager.py + backend/tests/test_spec_manager.py
- **验收**：pytest 通过 — Spec Tree 生成、门禁校验通过、文档派生、交付包导出
- **依赖**：T2, T3, T6

### T9: MeetingCoordinator 职责拆分
- **里程碑**：M4
- **描述**：将 MeetingCoordinator 拆分为 SemanticAnalyzer、TaskOrchestrator、DiscussionManager、ReviewPipeline、SpecManager 五个独立模块
- **输出**：
  - backend/semantic_analyzer.py + backend/tests/test_semantic_analyzer.py
  - backend/task_orchestrator.py + backend/tests/test_task_orchestrator.py
  - backend/discussion_manager.py + backend/tests/test_discussion_manager.py
  - backend/review_pipeline.py + backend/tests/test_review_pipeline.py
  - 修改 backend/meeting_coordinator.py 为薄路由层
- **验收**：每个模块独立 pytest 通过 + 现有 test_meeting_coordinator_router.py 通过（API 向后兼容）
- **依赖**：T4, T5, T8

### T10: 端到端集成验证
- **里程碑**：M5
- **描述**：编写端到端集成测试，验证完整的 WhyBuddy 化闭环：输入 -> Spec Tree -> 门禁 -> 伴随审查 -> 执行 -> 证据链 -> 交付
- **输出**：backend/tests/test_whybuddy_integration.py
- **验收**：pytest 通过 — 完整闭环跑通、checks_ledger 有完整记录、companion_log 有完整记录、证据链完整

## 完成定义

1. 所有新增模块的 pytest 测试通过
2. 现有 test_meeting_coordinator_router.py 测试通过（API 兼容）
3. checks_ledger.json 台账记录完整
4. companion_log.json 格式与 WhyBuddy check_companion.py 兼容
5. Spec Tree 通过 SpecTreeValidator 全部校验
6. 每个 requirement 的 acceptance 字段符合 EARS 句式
