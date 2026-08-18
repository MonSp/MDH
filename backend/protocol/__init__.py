"""协议类型包 — 向后兼容的 __init__.py

所有类型和函数从子模块导入，保持 `from protocol import X` 不变。
"""

from dataclasses import dataclass

# LLM 调用失败时的 fallback 消息模板
LLM_FALLBACK_TEMPLATE = "[{role}] 由于网络问题，无法获取详细{content_type}。建议按照标准流程执行。"

# 从子模块导入所有类型和函数
from protocol.workflow import *  # noqa: F401,F403
from protocol.meeting import *  # noqa: F401,F403
from protocol.voting import *  # noqa: F401,F403
from protocol.approval import *  # noqa: F401,F403

# SemanticAnalysisResult 依赖 WorkflowDefinition，定义在此处
from protocol.workflow import WorkflowDefinition


@dataclass
class SemanticAnalysisResult:
    is_task: bool
    intent: str = "discussion"
    task_description: str = ""
    target_agent_id: str = ""
    reason: str = ""
    discussion_topic: str = ""
    is_workflow: bool = False
    workflow_definition: WorkflowDefinition | None = None


def semantic_analysis_to_dict(result: SemanticAnalysisResult) -> dict:
    from protocol.workflow import workflow_definition_to_dict
    return {
        "is_task": result.is_task,
        "intent": result.intent,
        "task_description": result.task_description,
        "target_agent_id": result.target_agent_id,
        "reason": result.reason,
        "discussion_topic": result.discussion_topic,
        "is_workflow": result.is_workflow,
        "workflow_definition": workflow_definition_to_dict(result.workflow_definition) if result.workflow_definition else None,
    }
