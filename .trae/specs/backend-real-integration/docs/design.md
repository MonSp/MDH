# MeetingCoordinator重构：真实落地 — 设计规格

## 设计目标

1. **完成重构闭环**：将已提取但未接入的4个模块真正接入MeetingCoordinator
2. **激活伴随审查**：通过ReviewPipeline自动激活CriticAgent和GroundingAgent
3. **零侵入**：server.py无需改动，MeetingCoordinator公共API签名不变

## 模块划分

### 改造模块：backend/meeting_coordinator.py

**改造方式**：在__init__中实例化4个子模块，将内联方法体替换为委托调用。

**改造前**：
```python
class MeetingCoordinator:
    async def process_user_message(self, user_message, on_message):
        analysis = await self.semantic_analyze(user_message)  # 内联1130行
        ...
```

**改造后**：
```python
class MeetingCoordinator:
    def __init__(self, ...):
        # 新增：实例化子模块
        self._semantic_analyzer = SemanticAnalyzer(...)
        self._task_orchestrator = TaskOrchestrator(...)
        self._review_pipeline = ReviewPipeline(...)
        self._discussion_manager = DiscussionManager(...)
    
    async def process_user_message(self, user_message, on_message):
        analysis = await self._semantic_analyzer.analyze(user_message)
        ...
```

### 依赖关系

```
MeetingCoordinator
├── SemanticAnalyzer (语义分析)
│   └── DynamicRouter (路由)
├── TaskOrchestrator (任务编排)
│   ├── SpecManager (规格管理)
│   ├── EvidenceChain (证据链)
│   └── DynamicRouter (路由)
├── ReviewPipeline (审查流水线)
│   ├── CriticAgent (挑刺者)
│   └── GroundingAgent (接地者)
└── DiscussionManager (讨论管理)
    ├── AgendaStateMachine (议程)
    └── NegotiationEngine (协商)
```

## 失败处理策略

### 策略1：CriticAgent/GroundingAgent异常

IF CriticAgent或GroundingAgent在ReviewPipeline中抛出异常 THEN ReviewPipeline SHALL 捕获异常并跳过该步骤，继续执行后续审查步骤。不因伴随审查失败而阻断整个审查流程。

### 策略2：API兼容性保护

重构过程中不修改MeetingCoordinator的公共方法签名。所有改动仅在方法体内部。server.py的调用方式不变。

## 质量控制

1. **现有test_meeting_coordinator_router.py必须全部通过**
2. **新增集成测试验证CriticAgent和GroundingAgent被调用**
3. **MeetingCoordinator改造后的代码行数应显著减少**：主逻辑代码委托给子模块后，主流程代码应清晰简洁。
