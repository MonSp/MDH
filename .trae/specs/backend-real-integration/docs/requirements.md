# MeetingCoordinator重构：真实落地 — 需求规格

## 目标

完成MeetingCoordinator的重构闭环：将4个已提取但未接入的独立模块（SemanticAnalyzer、TaskOrchestrator、ReviewPipeline、DiscussionManager）真正接入MeetingCoordinator，使其从1130行上帝对象变为薄路由层。同时激活CriticAgent和GroundingAgent的伴随审查能力，让execute_with_iteration的迭代修正循环被生产代码使用。

## 范围

### 在范围内

1. **MeetingCoordinator内部重构**：将4个内联方法体替换为对新模块的委托调用
2. **降级机制**：每个委托调用有try-except降级，新模块异常时回退到原始逻辑
3. **伴随审查激活**：通过接入ReviewPipeline，自动激活CriticAgent和GroundingAgent
4. **集成测试**：新增测试验证CriticAgent和GroundingAgent确实被调用

### 不在范围内

1. server.py的API改动（保持向后兼容）
2. CollaborativeAgent与MeetingCoordinator的通信体系统一
3. agentscope框架本身的改动
4. 前端模块的改动

## 功能要求

### FR1: 语义分析委托

MeetingCoordinator SHALL 在__init__中实例化SemanticAnalyzer。process_user_message() SHALL 调用SemanticAnalyzer.analyze()进行意图分析。IF SemanticAnalyzer抛出异常 THEN 系统 SHALL 回退到原始内联semantic_analyze逻辑。

### FR2: 任务编排委托

MeetingCoordinator SHALL 在__init__中实例化TaskOrchestrator。当语义分析判定为任务模式时，系统 SHALL 调用TaskOrchestrator.decompose()+assign()+execute()。IF TaskOrchestrator抛出异常 THEN 系统 SHALL 回退到原始decompose_task+assign_tasks+execute_assigned_tasks逻辑。

### FR3: 审查流水线委托

MeetingCoordinator SHALL 在__init__中实例化ReviewPipeline。当任务执行完成需要审查时，系统 SHALL 调用ReviewPipeline.review()。ReviewPipeline SHALL 包含CriticAgent自动审查和GroundingAgent自动接地两个步骤。

### FR4: 讨论管理委托

MeetingCoordinator SHALL 在__init__中实例化DiscussionManager。当语义分析判定为讨论模式时，系统 SHALL 调用DiscussionManager.run()。IF DiscussionManager抛出异常 THEN 系统 SHALL 回退到原始run_discussion逻辑。

### FR5: 降级机制

每个委托调用 SHALL 有try-except包裹。IF 新模块抛出异常 THEN 系统 SHALL 记录警告日志并回退到原始内联逻辑，不中断服务。

### FR6: API向后兼容

重构后 MeetingCoordinator 的公共方法签名 SHALL 不变：process_user_message、execute_and_review_task、run_discussion、decompose_task。server.py SHALL 无需任何改动。

## 验收标准

### AC1: 语义分析委托验收

WHEN process_user_message()收到用户消息时，系统 SHALL 调用SemanticAnalyzer.analyze()。IF SemanticAnalyzer抛出异常 THEN 系统 SHALL 回退到原始semantic_analyze逻辑并正常返回结果。

### AC2: 任务编排委托验收

WHEN 语义分析判定为任务模式时，系统 SHALL 调用TaskOrchestrator执行任务。IF TaskOrchestrator抛出异常 THEN 系统 SHALL 回退到原始任务执行逻辑。

### AC3: 审查流水线验收

WHEN 任务执行完成需要审查时，ReviewPipeline.review() SHALL 被调用，且 CriticAgent.review() 和 GroundingAgent.verify() SHALL 在审查流程中被执行。

### AC4: 讨论管理验收

WHEN 语义分析判定为讨论模式时，系统 SHALL 调用DiscussionManager.run()。IF DiscussionManager抛出异常 THEN 系统 SHALL 回退到原始run_discussion逻辑。

### AC5: API兼容性验收

WHEN 重构完成后运行test_meeting_coordinator_router.py时，全部测试 SHALL 通过。server.py SHALL 无需任何改动。

### AC6: 集成测试验收

WHEN 新增集成测试运行时，测试 SHALL 验证CriticAgent.review()和GroundingAgent.verify()确实被ReviewPipeline调用。
