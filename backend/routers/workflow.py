"""
Workflow REST API Router
"""

import asyncio
import uuid
from fastapi import APIRouter

router = APIRouter(prefix="/api/workflow", tags=["workflow"])

# 注入点
_workflow_engine = None
_workflow_execution_to_dict = None
_WorkflowDefinition = None
_WorkflowNode = None
_WorkflowEdge = None


def init(workflow_engine, workflow_execution_to_dict, WorkflowDefinition, WorkflowNode, WorkflowEdge):
    global _workflow_engine, _workflow_execution_to_dict, _WorkflowDefinition, _WorkflowNode, _WorkflowEdge
    _workflow_engine = workflow_engine
    _workflow_execution_to_dict = workflow_execution_to_dict
    _WorkflowDefinition = WorkflowDefinition
    _WorkflowNode = WorkflowNode
    _WorkflowEdge = WorkflowEdge


@router.post("/create")
async def create_workflow(definition: dict):
    """创建工作流执行实例"""
    try:
        nodes = [_WorkflowNode(
            node_id=n["node_id"],
            task_description=n.get("task_description", ""),
            dept_id=n.get("dept_id", ""),
            input_spec=n.get("input_spec", {}),
            output_spec=n.get("output_spec", {}),
        ) for n in definition.get("nodes", [])]

        edges = [_WorkflowEdge(
            source_node_id=e["source_node_id"],
            target_node_id=e["target_node_id"],
            condition=e.get("condition"),
        ) for e in definition.get("edges", [])]

        wf_def = _WorkflowDefinition(
            workflow_id=definition.get("workflow_id", str(uuid.uuid4())[:8]),
            name=definition.get("name", "Unnamed"),
            description=definition.get("description", ""),
            nodes=nodes,
            edges=edges,
            execution_strategy=definition.get("execution_strategy", "sequential"),
        )

        execution = _workflow_engine.create_workflow(wf_def)
        return {"success": True, "data": _workflow_execution_to_dict(execution)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/executions")
async def list_workflow_executions():
    """列出已持久化的工作流执行实例"""
    try:
        ids = _workflow_engine.load_all_executions()
        return {"success": True, "data": ids}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/execute/{execution_id}")
async def execute_workflow(execution_id: str):
    """执行工作流"""
    try:
        task = _workflow_engine.start_workflow(execution_id)
        await task
        execution = _workflow_engine.get_workflow_status(execution_id)
        return {"success": True, "data": _workflow_execution_to_dict(execution)}
    except asyncio.CancelledError:
        return {"success": False, "error": "cancelled"}
    except KeyError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/pause/{execution_id}")
async def pause_workflow(execution_id: str):
    """暂停工作流"""
    try:
        await _workflow_engine.pause_workflow(execution_id)
        return {"success": True, "data": None}
    except (KeyError, ValueError) as e:
        return {"success": False, "error": str(e)}


@router.post("/resume/{execution_id}")
async def resume_workflow(execution_id: str):
    """恢复工作流"""
    try:
        await _workflow_engine.resume_workflow(execution_id)
        return {"success": True, "data": None}
    except (KeyError, ValueError) as e:
        return {"success": False, "error": str(e)}


@router.post("/cancel/{execution_id}")
async def cancel_workflow(execution_id: str):
    """取消工作流"""
    try:
        await _workflow_engine.cancel_workflow(execution_id)
        return {"success": True, "data": None}
    except (KeyError, ValueError) as e:
        return {"success": False, "error": str(e)}


@router.post("/retry/{execution_id}/{node_id}")
async def retry_workflow_node(execution_id: str, node_id: str):
    """重试失败节点"""
    try:
        await _workflow_engine.retry_node(execution_id, node_id)
        return {"success": True, "data": None}
    except (KeyError, ValueError) as e:
        return {"success": False, "error": str(e)}


@router.get("/status/{execution_id}")
async def get_workflow_status(execution_id: str):
    """获取工作流状态"""
    try:
        execution = _workflow_engine.get_workflow_status(execution_id)
        return {"success": True, "data": _workflow_execution_to_dict(execution)}
    except KeyError as e:
        return {"success": False, "error": str(e)}


@router.get("/visualization/{execution_id}")
async def get_workflow_visualization(execution_id: str):
    """获取工作流可视化"""
    try:
        execution = _workflow_engine.get_workflow_status(execution_id)
        nodes = []
        for n in execution.definition.nodes:
            nodes.append({
                "id": n.node_id,
                "label": n.task_description[:30],
                "status": execution.node_states.get(n.node_id, "pending"),
            })
        edges = [{"from": e.source_node_id, "to": e.target_node_id} for e in execution.definition.edges]
        return {"success": True, "data": {"nodes": nodes, "edges": edges}}
    except KeyError as e:
        return {"success": False, "error": str(e)}
