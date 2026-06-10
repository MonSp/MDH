# 复杂路径串行流程 - 设计规格

## 设计目标

1. **串行执行**：将三选一逻辑改为讨论→分派→审查的串行流程
2. **数据传递**：讨论结果作为分派阶段的输入
3. **结果整合**：审查结果合并到返回值，避免外部单独调用
4. **最小改动**：工作流模式保持不变，简单路径不受影响

## 模块划分

### 修改模块

#### 1. MeetingCoordinator.process_user_message()
**文件**：`backend/meeting_coordinator.py`

**当前实现**（三选一逻辑）：
```python
if is_workflow:
    return workflow_executed
elif is_task:
    return task_auto_assigned
else:
    return discussion
```

**重构后**（串行流程）：
```python
async def process_user_message(self, user_message, on_message):
    # 1. 语义分析
    analysis = await self.semantic_analyze(user_message)
    
    # 2. 工作流模式保持不变
    if analysis.is_workflow and analysis.workflow_definition:
        return await self._execute_workflow(...)
    
    # 3. 串行流程：讨论→分派→审查
    # 3a. 讨论阶段
    topic = analysis.discussion_topic or user_message
    discussion_results = await self.run_discussion(topic, on_message)
    
    # 3b. 整合讨论结果到任务描述
    enhanced_description = self._enhance_task_description(
        analysis.task_description or user_message,
        discussion_results
    )
    
    # 3c. 分派阶段
    assignment = await self.auto_assign_task(
        enhanced_description,
        analysis.target_agent_id,
        analysis.reason,
    )
    
    # 3d. 审查阶段
    review_result = await self.execute_and_review_task(
        enhanced_description,
        on_message
    )
    
    # 4. 返回所有阶段结果
    return {
        "type": "serial_completed",
        "analysis": semantic_analysis_to_dict(analysis),
        "discussion_results": discussion_results,
        "assignment": assignment,
        "review_result": review_result,
    }
```

#### 2. 新增 _enhance_task_description() 方法
**文件**：`backend/meeting_coordinator.py`

```python
def _enhance_task_description(self, original_description: str, discussion_results: list) -> str:
    """整合讨论结果到任务描述"""
    if not discussion_results:
        return original_description
    
    # 提取讨论中的关键信息
    key_points = []
    for result in discussion_results:
        if result.get("stance") in ["support", "modify"]:
            key_points.append(result.get("content", "")[:100])
    
    if not key_points:
        return original_description
    
    # 整合到任务描述
    enhanced = f"{original_description}\n\n讨论要点：\n"
    for i, point in enumerate(key_points, 1):
        enhanced += f"{i}. {point}\n"
    
    return enhanced
```

#### 3. 更新 server.py 的 unified_message 处理
**文件**：`backend/server.py`

**当前实现**（需要外部调用 execute_and_review_task）：
```python
result = await coordinator.process_user_message(...)
if result.get("type") == "task_auto_assigned":
    review_result = await coordinator.execute_and_review_task(...)
```

**重构后**（审查已在 process_user_message 内部完成）：
```python
result = await coordinator.process_user_message(...)
# result 已包含所有阶段结果，直接返回
await ws.send_json({
    "type": "task_result",
    "path_used": "complex",
    **result,
})
```

## 数据流

```
用户消息
    │
    ▼
semantic_analyze()
    │
    ├── is_workflow → _execute_workflow() （保持不变）
    │
    └── 非工作流 → 串行流程
            │
            ▼
        ③ run_discussion()
            │
            ▼
        _enhance_task_description()
            │
            ▼
        ④ auto_assign_task()
            │
            ▼
        ⑤ execute_and_review_task()
            │
            ▼
        返回 {discussion_results, assignment, review_result}
```

## 失败处理策略

| 失败场景 | 处理方式 |
|---------|---------|
| 讨论阶段失败 | 跳过讨论，使用原始任务描述继续分派 |
| 分派阶段失败 | 返回错误，包含讨论结果供参考 |
| 审查阶段失败 | 返回分派结果，标记审查失败 |

## 质量控制

1. **单元测试**：测试串行流程的正确执行顺序
2. **集成测试**：测试讨论结果正确传递给分派阶段
3. **回归测试**：确保工作流模式不受影响
