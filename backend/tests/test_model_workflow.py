"""Tests for model-authored workflow generation"""
import pytest
from unittest.mock import AsyncMock, MagicMock

from semantic_analyzer import SemanticAnalyzer
from dynamic_router import DynamicRouter, RoutingDecision


@pytest.fixture
def analyzer(tmp_path):
    """创建测试分析器"""
    routing_file = tmp_path / "routing.json"
    routing_file.write_text('{"departments": []}', encoding="utf-8")
    router = DynamicRouter(str(routing_file))

    def get_model_fn(role):
        model = MagicMock()
        model.reply = AsyncMock()
        return model

    return SemanticAnalyzer(router, get_model_fn)


class TestValidateWorkflowNodes:
    def test_valid_nodes(self, analyzer):
        nodes = [
            {"task": "前端开发", "dept": "dept-frontend", "description": "React"},
            {"task": "后端开发", "dept": "dept-backend", "description": "API"},
        ]
        assert analyzer._validate_workflow_nodes(nodes) is True

    def test_empty_list(self, analyzer):
        assert analyzer._validate_workflow_nodes([]) is False

    def test_too_many_nodes(self, analyzer):
        nodes = [{"task": f"task{i}", "dept": "dept-backend"} for i in range(9)]
        assert analyzer._validate_workflow_nodes(nodes) is False

    def test_missing_task(self, analyzer):
        nodes = [{"dept": "dept-backend", "description": "x"}]
        assert analyzer._validate_workflow_nodes(nodes) is False

    def test_empty_task(self, analyzer):
        nodes = [{"task": "  ", "dept": "dept-backend"}]
        assert analyzer._validate_workflow_nodes(nodes) is False

    def test_invalid_dept(self, analyzer):
        nodes = [{"task": "x", "dept": "dept-invalid"}]
        assert analyzer._validate_workflow_nodes(nodes) is False

    def test_missing_dept(self, analyzer):
        nodes = [{"task": "x", "description": "y"}]
        assert analyzer._validate_workflow_nodes(nodes) is False

    def test_not_dict(self, analyzer):
        assert analyzer._validate_workflow_nodes(["not a dict"]) is False


class TestDeterministicGenerate:
    def test_frontend_backend(self, analyzer):
        routing = RoutingDecision("dept-frontend", 0.8, "test", [], [])
        nodes = analyzer._deterministic_generate_nodes("前端和后端开发", routing)
        depts = {n.dept_id for n in nodes}
        assert "dept-frontend" in depts
        assert "dept-backend" in depts

    def test_fallback_to_routing(self, analyzer):
        routing = RoutingDecision("dept-data", 0.8, "test", [], [])
        nodes = analyzer._deterministic_generate_nodes("数据分析任务", routing)
        assert len(nodes) == 1
        assert nodes[0].dept_id == "dept-data"

    def test_fallback_to_fullstack(self, analyzer):
        routing = RoutingDecision("", 0.0, "test", [], [])
        nodes = analyzer._deterministic_generate_nodes("未知任务", routing)
        assert len(nodes) == 1
        assert nodes[0].dept_id == "dept-fullstack"


class TestInferDependencies:
    def test_qa_depends_on_impl(self, analyzer):
        from protocol import WorkflowNode, WorkflowNodeStatus
        nodes = [
            WorkflowNode(node_id="n1", task_description="前端", dept_id="dept-frontend", status=WorkflowNodeStatus.PENDING),
            WorkflowNode(node_id="n2", task_description="测试", dept_id="dept-qa", status=WorkflowNodeStatus.PENDING),
        ]
        edges = analyzer._infer_dependencies(nodes)
        assert len(edges) == 1
        assert edges[0].source_node_id == "n1"
        assert edges[0].target_node_id == "n2"

    def test_impl_no_deps(self, analyzer):
        from protocol import WorkflowNode, WorkflowNodeStatus
        nodes = [
            WorkflowNode(node_id="n1", task_description="前端", dept_id="dept-frontend", status=WorkflowNodeStatus.PENDING),
            WorkflowNode(node_id="n2", task_description="后端", dept_id="dept-backend", status=WorkflowNodeStatus.PENDING),
        ]
        edges = analyzer._infer_dependencies(nodes)
        assert len(edges) == 0

    def test_devops_depends_on_all(self, analyzer):
        from protocol import WorkflowNode, WorkflowNodeStatus
        nodes = [
            WorkflowNode(node_id="n1", task_description="前端", dept_id="dept-frontend", status=WorkflowNodeStatus.PENDING),
            WorkflowNode(node_id="n2", task_description="测试", dept_id="dept-qa", status=WorkflowNodeStatus.PENDING),
            WorkflowNode(node_id="n3", task_description="部署", dept_id="dept-devops", status=WorkflowNodeStatus.PENDING),
        ]
        edges = analyzer._infer_dependencies(nodes)
        devops_edges = [e for e in edges if e.target_node_id == "n3"]
        assert len(devops_edges) == 2
