# 复杂路径串行流程 - 需求规格

## 目标

将 `process_user_message` 从三选一互斥模式（workflow/task/discussion）重构为串行流程：讨论→分派→审查，使复杂任务能够经过完整的协作链路。

## 范围

### 包含
- 重构 `process_user_message` 为串行流程
- 讨论结果整合到任务描述
- 审查结果合并到返回值
- 更新 `server.py` 适配新返回值

### 不包含
- 工作流模式的修改（保持不变）
- 简单路径的修改
- 新增功能模块

## 功能要求

### FR-1: 串行流程重构
当语义分析判定为非工作流的复杂任务时，`process_user_message` SHALL 按以下顺序执行：
1. `run_discussion()` - 多角色讨论，形成方案
2. `auto_assign_task()` - 基于讨论结果分派任务
3. `execute_and_review_task()` - 执行任务并审查

### FR-2: 讨论结果传递
讨论阶段的结果 SHALL 作为分派阶段的输入：
- 从讨论结果中提取关键信息（方案、建议、风险点）
- 整合到任务描述中
- 如果讨论结果包含明确的执行方案，使用该方案作为任务描述

### FR-3: 审查结果内置
审查阶段 SHALL 在 `process_user_message` 内部执行，而不是在 `server.py` 中单独调用：
- 调用 `execute_and_review_task()` 执行任务并审查
- 将审查结果（structured_feedback, critic_result, grounding_result）合并到返回值

### FR-4: 返回值格式
`process_user_message` 的返回值 SHALL 包含所有阶段的结果：
```python
{
    "type": "serial_completed",
    "analysis": {...},
    "discussion_results": [...],
    "assignment": {...},
    "review_result": {...}
}
```

### FR-5: 工作流模式保持不变
当语义分析判定为工作流模式时，继续使用现有的 `_execute_workflow()` 逻辑，不改变其执行流程。

## 验收标准

### AC-1: 串行执行
当用户消息被判定为复杂任务时，系统 SHALL 按顺序执行讨论→分派→审查，日志中应体现三个阶段的执行顺序。

### AC-2: 讨论结果传递
当讨论阶段完成后，讨论结果 SHALL 被传递给 `auto_assign_task()`，任务描述中应包含讨论结果的关键信息。

### AC-3: 审查结果内置
当任务执行完成时，`process_user_message` 的返回值 SHALL 包含 `review_result` 字段，包含 structured_feedback、critic_result、grounding_result。

### AC-4: 工作流模式不变
当用户消息触发工作流模式时，执行流程 SHALL 与重构前完全一致，不受串行流程改造的影响。
