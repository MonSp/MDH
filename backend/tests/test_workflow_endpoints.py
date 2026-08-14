"""workflow REST 端点级测试：/api/workflow/executions + /api/workflow/resume/{id} 四分支

覆盖：
- GET /api/workflow/executions（空列表 / 含已持久化 id）
- POST /api/workflow/resume/{id}：
  - 不存在的 id → success False
  - durable 分支（内存中无该执行，磁盘有持久化文件）→ success True 且 data 含 status
  - 内存 PAUSED 分支 → success True（走 resume_workflow）
  - RUNNING 守卫 → success False
  - 内存终态守卫（COMPLETED/FAILED/CANCELLED/CREATED）→ success False，不覆盖内存状态

使用 FastAPI TestClient + 既有 server 构造方式（conftest 注入 agentscope mock）。
"""

import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# 复用 conftest 的 agentscope sys.modules 注入，随后再导入 server
import conftest  # noqa: F401

import server
from protocol import (
    WorkflowDefinition,
    WorkflowEdge,
    WorkflowExecutionStatus,
    WorkflowNode,
    WorkflowNodeStatus,
)
from workflow_engine import WorkflowEngine

# 关闭 REST 认证中间件（与既有 executor_server 测试关闭方式一致），
# 便于直接用 TestClient 调用受保护端点
server.BACKEND_TOKEN = ""

client = TestClient(server.app)


def _definition(workflow_id="wf-endpoint"):
    return WorkflowDefinition(
        workflow_id=workflow_id,
        name="端点测试",
        description="",
        nodes=[
            WorkflowNode(node_id="n1", task_description="t1", dept_id="dept-frontend"),
        ],
        edges=[],
        execution_strategy="sequential",
    )


def _definition_chain(workflow_id="wf-endpoint-chain"):
    return WorkflowDefinition(
        workflow_id=workflow_id,
        name="端点链测试",
        description="",
        nodes=[
            WorkflowNode(node_id="n1", task_description="t1", dept_id="dept-frontend"),
            WorkflowNode(node_id="n2", task_description="t2", dept_id="dept-backend"),
        ],
        edges=[WorkflowEdge(source_node_id="n1", target_node_id="n2")],
        execution_strategy="sequential",
    )


def _create_body(definition):
    """把 WorkflowDefinition 转成 POST /api/workflow/create 的请求体"""
    return {
        "workflow_id": definition.workflow_id,
        "name": definition.name,
        "description": definition.description,
        "nodes": [
            {"node_id": n.node_id, "task_description": n.task_description, "dept_id": n.dept_id}
            for n in definition.nodes
        ],
        "edges": [
            {"source_node_id": e.source_node_id, "target_node_id": e.target_node_id}
            for e in definition.edges
        ],
        "execution_strategy": definition.execution_strategy,
    }


async def _fast_executor(node, input_data):
    return {"result": f"done-{node.node_id}"}


@pytest.fixture
def api(tmp_path):
    """每次测试替换 server 全局 workflow_engine 为指向独立 tmp 持久化目录的新引擎。

    resume 端点引用 server 模块级全局 workflow_engine，替换后可完全隔离测试数据，
    避免写入 backend/data/workflows 与跨测试相互污染。
    """
    engine = WorkflowEngine(persistence_dir=str(tmp_path))
    engine.register_node_executor("dept-frontend", _fast_executor)
    engine.register_node_executor("dept-backend", _fast_executor)
    old = server.workflow_engine
    server.workflow_engine = engine
    yield engine
    server.workflow_engine = old


# ──────────────────── GET /api/workflow/executions ────────────────────


def test_list_executions_empty(api):
    """持久化目录为空时返回空列表"""
    resp = client.get("/api/workflow/executions")
    assert resp.status_code == 200
    assert resp.json() == {"success": True, "data": []}


def test_list_executions_contains_id(api):
    """create 落盘后 executions 列表包含该 execution_id"""
    resp = client.post("/api/workflow/create", json=_create_body(_definition("wf-list")))
    assert resp.status_code == 200
    exec_id = resp.json()["data"]["execution_id"]

    resp = client.get("/api/workflow/executions")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert exec_id in body["data"]


# ──────────────────── POST /api/workflow/resume/{id} ────────────────────


def test_resume_nonexistent_fails(api):
    """不存在的 execution_id → success False"""
    resp = client.post("/api/workflow/resume/00000000")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is False
    assert "不存在" in body["error"]


def test_resume_durable_reloads_from_disk(api, tmp_path):
    """durable 分支：内存中无该执行（模拟进程重启），磁盘有持久化文件 → 重载并重跑

    构造：engine1 创建并持久化 n1 已完成 / n2 待执行的快照；换上新引擎（内存为空），
    resume 从磁盘重载——n1 不重复执行，仅执行 n2，最终 COMPLETED 且 data 含 status。
    """
    executed = []

    async def recorder(node, input_data):
        executed.append(node.node_id)
        return {"result": f"done-{node.node_id}"}

    # 第一个引擎：创建执行 + 手动推进 n1 完成并落盘（模拟进程中断在 n1 之后）
    engine1 = WorkflowEngine(persistence_dir=str(tmp_path))
    engine1.register_node_executor("dept-frontend", recorder)
    engine1.register_node_executor("dept-backend", recorder)
    execution = engine1.create_workflow(_definition_chain("wf-durable"))
    execution.node_states["n1"] = WorkflowNodeStatus.COMPLETED
    execution.results["n1"] = {"result": "done-n1"}
    # 同步测试内无法 await：直接调同步原子写核心（等价于 async persist_execution 锁内路径）
    engine1._persist_execution_sync(execution.execution_id)

    # 第二个引擎（等价于进程重启后内存为空），替换 server 全局引擎
    engine2 = WorkflowEngine(persistence_dir=str(tmp_path))
    engine2.register_node_executor("dept-frontend", recorder)
    engine2.register_node_executor("dept-backend", recorder)
    old = server.workflow_engine
    server.workflow_engine = engine2
    try:
        resp = client.post(f"/api/workflow/resume/{execution.execution_id}")
    finally:
        server.workflow_engine = old

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert "status" in body["data"]
    assert body["data"]["status"] == "completed"
    # n1 已完成被跳过，仅重跑 n2
    assert executed == ["n2"]
    status = engine2.get_workflow_status(execution.execution_id)
    assert status.node_states["n1"] == WorkflowNodeStatus.COMPLETED
    assert status.node_states["n2"] == WorkflowNodeStatus.COMPLETED


def test_resume_in_memory_paused(api):
    """内存 PAUSED 分支：create + pause（经由 pause 端点）→ resume 走 resume_workflow"""
    resp = client.post("/api/workflow/create", json=_create_body(_definition("wf-paused")))
    assert resp.status_code == 200
    exec_id = resp.json()["data"]["execution_id"]

    # 将内存执行实例置为 RUNNING 后通过 pause 端点暂停（pause 需要 RUNNING 态）
    execution = server.workflow_engine._executions[exec_id]
    execution.status = WorkflowExecutionStatus.RUNNING
    pause_resp = client.post(f"/api/workflow/pause/{exec_id}")
    assert pause_resp.status_code == 200
    assert pause_resp.json()["success"] is True

    resume_resp = client.post(f"/api/workflow/resume/{exec_id}")
    assert resume_resp.status_code == 200
    body = resume_resp.json()
    assert body["success"] is True
    # PAUSED 分支走 resume_workflow，data 为 None
    assert body["data"] is None


def test_resume_in_memory_running_guard(api):
    """RUNNING 守卫：内存中 RUNNING 的执行 → success False"""
    resp = client.post("/api/workflow/create", json=_create_body(_definition("wf-running")))
    assert resp.status_code == 200
    exec_id = resp.json()["data"]["execution_id"]

    # 时序不可控（start_workflow 后台任务），直接置内存态为 RUNNING 触发守卫分支
    execution = server.workflow_engine._executions[exec_id]
    execution.status = WorkflowExecutionStatus.RUNNING

    resume_resp = client.post(f"/api/workflow/resume/{exec_id}")
    assert resume_resp.status_code == 200
    body = resume_resp.json()
    assert body["success"] is False
    assert "运行中" in body["error"]


@pytest.mark.parametrize(
    "terminal_status",
    [
        WorkflowExecutionStatus.COMPLETED,
        WorkflowExecutionStatus.FAILED,
        WorkflowExecutionStatus.CANCELLED,
        WorkflowExecutionStatus.CREATED,
    ],
)
def test_resume_in_memory_terminal_state_guarded(api, terminal_status):
    """内存终态守卫：COMPLETED/FAILED/CANCELLED/CREATED → success False 且不覆盖内存状态

    守卫必须阻止终态执行落入 durable 分支（否则 load_execution 会用磁盘副本覆盖
    内存 _executions/_definitions，可能重跑已完成节点或与静默 persist 失败交互）。
    """
    resp = client.post("/api/workflow/create", json=_create_body(_definition("wf-terminal")))
    assert resp.status_code == 200
    exec_id = resp.json()["data"]["execution_id"]

    execution = server.workflow_engine._executions[exec_id]
    execution.status = terminal_status

    resume_resp = client.post(f"/api/workflow/resume/{exec_id}")
    assert resume_resp.status_code == 200
    body = resume_resp.json()
    assert body["success"] is False
    assert "终态" in body["error"]
    assert terminal_status.value in body["error"]
    # 内存状态未被磁盘副本覆盖，仍是测试设置的终态
    assert server.workflow_engine.get_workflow_status(exec_id).status == terminal_status
