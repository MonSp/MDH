"""
Workflow REST API Router
"""

import asyncio
import uuid

from fastapi import APIRouter

router = APIRouter(prefix="/api/workflow", tags=["workflow"])

# 注入点 — getter 函数动态获取引擎（支持测试 fixture 替换）
_get_workflow_engine = None
_workflow_execution_to_dict = None
_WorkflowDefinition = None
_WorkflowNode = None
_WorkflowEdge = None


def init(get_workflow_engine, workflow_execution_to_dict, WorkflowDefinition, WorkflowNode, WorkflowEdge):
    global _get_workflow_engine, _workflow_execution_to_dict, _WorkflowDefinition, _WorkflowNode, _WorkflowEdge
    _get_workflow_engine = get_workflow_engine
    _workflow_execution_to_dict = workflow_execution_to_dict
    _WorkflowDefinition = WorkflowDefinition
    _WorkflowNode = WorkflowNode
    _WorkflowEdge = WorkflowEdge


@router.post("/create")
async def create_workflow(definition: dict):
    """创建工作流执行实例"""
    try:
        engine = _get_workflow_engine()
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

        execution = engine.create_workflow(wf_def)
        return {"success": True, "data": _workflow_execution_to_dict(execution)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/executions")
async def list_workflow_executions():
    """列出已持久化的工作流执行实例"""
    try:
        engine = _get_workflow_engine()
        ids = engine.load_all_executions()
        return {"success": True, "data": ids}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/execute/{execution_id}")
async def execute_workflow(execution_id: str):
    """执行工作流"""
    try:
        engine = _get_workflow_engine()
        task = engine.start_workflow(execution_id)
        await task
        execution = engine.get_workflow_status(execution_id)
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
        engine = _get_workflow_engine()
        await engine.pause_workflow(execution_id)
        return {"success": True, "data": None}
    except (KeyError, ValueError) as e:
        return {"success": False, "error": str(e)}


@router.post("/resume/{execution_id}")
async def resume_workflow(execution_id: str):
    """恢复工作流

    内存分支：PAUSED → resume_workflow；RUNNING → 报错；
    内存终态（COMPLETED/FAILED/CANCELLED/CREATED）→ 报错，不覆盖内存状态。
    否则走 durable 分支：从持久化目录加载后重新启动。
    """
    try:
        engine = _get_workflow_engine()
        try:
            in_memory = engine.get_workflow_status(execution_id)
        except KeyError:
            in_memory = None

        if in_memory is not None:
            from protocol import WorkflowExecutionStatus
            if in_memory.status == WorkflowExecutionStatus.PAUSED:
                await engine.resume_workflow(execution_id)
                return {"success": True, "data": None}
            if in_memory.status == WorkflowExecutionStatus.RUNNING:
                return {"success": False, "error": f"工作流正在运行中: {execution_id}"}
            return {"success": False, "error": f"工作流已处于终态 {in_memory.status.value}，无法恢复"}

        # durable resume
        restored = engine.load_execution(execution_id)
        if restored is None:
            return {"success": False, "error": f"执行实例不存在或无法恢复: {execution_id}"}
        task = engine.start_workflow(execution_id)
        await task
        execution = engine.get_workflow_status(execution_id)
        return {"success": True, "data": _workflow_execution_to_dict(execution)}
    except asyncio.CancelledError:
        return {"success": False, "error": "cancelled"}
    except (KeyError, ValueError) as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/cancel/{execution_id}")
async def cancel_workflow(execution_id: str):
    """取消工作流"""
    try:
        engine = _get_workflow_engine()
        await engine.cancel_workflow(execution_id)
        return {"success": True, "data": None}
    except (KeyError, ValueError) as e:
        return {"success": False, "error": str(e)}


@router.post("/retry/{execution_id}/{node_id}")
async def retry_workflow_node(execution_id: str, node_id: str):
    """重试失败节点"""
    try:
        engine = _get_workflow_engine()
        await engine.retry_node(execution_id, node_id)
        return {"success": True, "data": None}
    except (KeyError, ValueError) as e:
        return {"success": False, "error": str(e)}


@router.get("/status/{execution_id}")
async def get_workflow_status(execution_id: str):
    """获取工作流状态"""
    try:
        engine = _get_workflow_engine()
        execution = engine.get_workflow_status(execution_id)
        return {"success": True, "data": _workflow_execution_to_dict(execution)}
    except KeyError as e:
        return {"success": False, "error": str(e)}


@router.get("/visualization/{execution_id}")
async def get_workflow_visualization(execution_id: str):
    """获取工作流可视化数据"""
    try:
        engine = _get_workflow_engine()
        vis = engine.get_workflow_visualization(execution_id)
        return {"success": True, "data": vis}
    except KeyError as e:
        return {"success": False, "error": str(e)}
