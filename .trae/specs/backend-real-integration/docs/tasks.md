# MeetingCoordinator重构：真实落地 — 任务清单

## 里程碑

### M1: MeetingCoordinator改造
**目标**：将4个子模块接入MeetingCoordinator
**包含任务**：T1, T2, T3, T4
**依赖**：无

### M2: 测试验证
**目标**：确保API兼容性和伴随审查生效
**包含任务**：T5
**依赖**：M1

## 任务清单

### T1: 重构MeetingCoordinator：接入SemanticAnalyzer
- **里程碑**：M1
- **描述**：在__init__中实例化SemanticAnalyzer，将semantic_analyze()方法体替换为委托调用，保留_semantic_analyze_legacy()供降级
- **输出**：修改 backend/meeting_coordinator.py
- **验证**：运行test_meeting_coordinator_router.py全部通过

### T2: 重构MeetingCoordinator：接入TaskOrchestrator
- **里程碑**：M1
- **描述**：在__init__中实例化TaskOrchestrator，将process_user_message的任务模式分支改为调用TaskOrchestrator，保留原始逻辑为降级
- **输出**：修改 backend/meeting_coordinator.py
- **验证**：运行test_meeting_coordinator_router.py全部通过

### T3: 重构MeetingCoordinator：接入ReviewPipeline
- **里程碑**：M1
- **描述**：在__init__中实例化ReviewPipeline，将execute_and_review_task中的审查逻辑委托给ReviewPipeline.review()，自动激活CriticAgent和GroundingAgent
- **输出**：修改 backend/meeting_coordinator.py
- **验证**：运行集成测试验证CriticAgent和GroundingAgent被调用

### T4: 重构MeetingCoordinator：接入DiscussionManager
- **里程碑**：M1
- **描述**：在__init__中实例化DiscussionManager，将process_user_message的讨论模式分支改为调用DiscussionManager.run()
- **输出**：修改 backend/meeting_coordinator.py
- **验证**：运行test_meeting_coordinator_router.py全部通过

### T5: 新增集成测试：验证伴随审查被调用
- **里程碑**：M2
- **描述**：编写集成测试，mock LLM调用，验证ReviewPipeline.review()被调用时CriticAgent.review()和GroundingAgent.verify()确实被执行
- **输出**：backend/tests/test_review_integration.py
- **验证**：pytest backend/tests/test_review_integration.py -v 全部通过

## 完成定义

1. MeetingCoordinator的4个内联方法体被替换为委托调用
2. 每个委托有try-except降级
3. test_meeting_coordinator_router.py全部通过
4. 新增集成测试验证CriticAgent和GroundingAgent被调用
5. MeetingCoordinator代码行数从1130行降至约300行
