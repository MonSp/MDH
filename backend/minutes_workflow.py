"""会议纪要任务：速记文本 → 纪要 DAG（纯函数，不依赖 LLM/router）。

被 SemanticAnalyzer 文档模式分支与演示端点共用；gate 把关人占位 submitter。
"""
import hashlib
from protocol import WorkflowDefinition, WorkflowEdge, WorkflowNode

MINUTES_KEYWORDS = ("会议纪要", "会议记录", "速记", "待办", "行动项", "纪要")

_NODES = [
    ("extract", "提取会议要点、决策与行动项"),
    ("draft", "撰写纪要初稿并生成待办清单"),
    ("proofread", "校对：遗漏与冲突检查"),
]


def build_minutes_workflow(transcript: str, approver: str = "submitter") -> WorkflowDefinition:
    nodes = [
        WorkflowNode(
            node_id=nid,
            task_description=desc,
            dept_id="dept-docs",
            gate={"approver": approver, "stage": "review"} if nid == "draft" else None,
        )
        for nid, desc in _NODES
    ]
    edges = [
        WorkflowEdge(source_node_id="extract", target_node_id="draft"),
        WorkflowEdge(source_node_id="draft", target_node_id="proofread"),
    ]
    return WorkflowDefinition(
        workflow_id="minutes-" + hashlib.sha1(transcript.encode()).hexdigest()[:8],
        name="会议纪要",
        description="会议纪要 + 待办生成流水线",
        nodes=nodes,
        edges=edges,
        execution_strategy="sequential",
    )
