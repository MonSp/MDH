"""
Task triage and decomposition for MeetingCoordinator.

Extracted from meeting_coordinator.py to isolate task classification logic.
"""

import json
import logging
import re
import uuid
from typing import Any

from agentscope.message import Msg

from agent import _extract_text
from protocol import AgentRole

logger = logging.getLogger("coordinator_triage")


def triage_task(user_message: str) -> dict[str, Any]:
    """规则引擎分流门（0 token）

    Returns:
        {"level": "simple"|"standard"|"complex", "confidence": 0.0-1.0, "reason": str}
    """
    lower = user_message.lower()
    confidence = 0.5
    signals = []

    simple_keywords = [
        '写一个', '帮我写', '实现一个', '创建一个', '写个', '打印',
        'hello world', '写一段', '实现一个简单的', '创建文件',
        '读取', '查看', '列出', '搜索', 'find', 'list', 'read', 'print',
    ]
    simple_count = sum(1 for kw in simple_keywords if kw in lower)
    if simple_count > 0:
        confidence += 0.15
        signals.append(f"simple_kw={simple_count}")

    if len(user_message) <= 30:
        confidence += 0.15
        signals.append("short_desc")

    single_file_patterns = [
        r'(写|创建|读取|编辑|删除)\s*(一个|一段|一个简单的)?\s*(文件|函数|脚本|组件|类)',
        r'(write|create|read|edit|delete)\s*(a|an|one)?\s*(file|function|script|component|class)',
    ]
    for pat in single_file_patterns:
        if re.search(pat, lower):
            confidence += 0.1
            signals.append("single_file_op")
            break

    complex_keywords = [
        '前端', '后端', '数据库', '部署', '架构', '设计', '重构',
        '微服务', '分布式', '首先', '然后', '最后', '多个',
        'frontend', 'backend', 'database', 'deploy', 'architecture',
        'first', 'then', 'finally', 'multiple',
    ]
    complex_count = sum(1 for kw in complex_keywords if kw in lower)
    if complex_count >= 3:
        confidence -= 0.3
        signals.append(f"complex_kw={complex_count}")
    elif complex_count >= 2:
        confidence -= 0.15
        signals.append(f"complex_kw={complex_count}")

    step_verbs = ['设计', '开发', '实现', '测试', '部署', '重构', '优化', '分析',
                  'design', 'develop', 'implement', 'test', 'deploy', 'refactor']
    step_count = sum(1 for v in step_verbs if v in lower)
    if step_count >= 3:
        confidence -= 0.2
        signals.append(f"steps={step_count}")

    confidence = max(0.0, min(1.0, round(confidence, 2)))

    if confidence >= 0.8:
        level = "simple"
    elif confidence >= 0.5:
        level = "standard"
    else:
        level = "complex"

    return {"level": level, "confidence": confidence, "reason": ", ".join(signals) or "default"}


async def decompose_task(coordinator, task_description: str) -> list[dict[str, Any]]:
    """LLM-based task decomposition into subtasks."""
    planner = coordinator._get_model(AgentRole.PLANNER)
    prompt = (
        f"请将以下任务分解为多个子任务，以JSON数组格式返回。"
        f"每个子任务包含 name(名称)、description(描述)、priority(优先级：high/medium/low)、"
        f"dependencies(依赖的子任务名称列表)。\n\n"
        f"任务：{task_description}\n\n"
        f"请只返回JSON数组，不要其他内容。"
    )
    msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
    try:
        response = await planner.reply(msg)
        text = _extract_text(response)
    except Exception as e:
        logger.warning("任务分解 LLM 调用失败: %s", e)
        coordinator._safe_mark_model_failed(AgentRole.PLANNER)
        text = "[]"

    try:
        subtasks = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        subtasks = [
            {
                "name": task_description[:50],
                "description": task_description,
                "priority": "high",
                "dependencies": [],
            }
        ]

    for i, subtask in enumerate(subtasks):
        subtask["id"] = str(uuid.uuid4())[:8]

    coordinator._tasks = subtasks
    return subtasks
