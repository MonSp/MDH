"""E2E 智能路由测试 — 验证 SimpleExecutor A2A 路由路径

测试链路:
1. 注册 mock A2A 节点
2. SimpleExecutor 检测到可用节点
3. 任务自动路由到 A2A 节点执行
4. 执行结果回传 + 状态同步
"""

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest


class MockA2AHandler(BaseHTTPRequestHandler):
    """模拟 A2A 执行节点"""

    def do_GET(self):
        if self.path == '/.well-known/agent.json':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                "name": "mock-ts-orchestrator",
                "url": "http://localhost:19877",
                "skills": [{"id": "local_tool_execution", "name": "Local Tools", "description": "test", "tags": ["file", "git", "shell"]}],
            }).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == '/a2a/tasks/send':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.end_headers()
            self.wfile.write(b'data: {"status": {"state": "working"}}\n\n')
            self.wfile.flush()
            self.wfile.write(b'data: {"artifact": {"name": "final_result", "parts": [{"type": "text", "text": "File config.ts modified: port changed to 9090"}]}}\n\n')
            self.wfile.flush()
            self.wfile.write(b'data: {"status": {"state": "completed"}}\n\n')
            self.wfile.flush()
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *args):
        pass


@pytest.fixture
def mock_a2a_server():
    """启动 mock A2A 服务器"""
    server = HTTPServer(('127.0.0.1', 19877), MockA2AHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield server
    server.shutdown()


@pytest.fixture
def a2a_infrastructure(tmp_path):
    """创建 A2A 基础设施"""
    from a2a_client import A2AClient
    from a2a_registry import A2ARegistry
    from a2a_task_router import A2ATaskRouter
    from experience_extractor import ExperienceExtractor
    from state_sync import StateSyncManager

    registry = A2ARegistry(persist_path=str(tmp_path / "agents.json"))
    client = A2AClient(timeout=10)
    router = A2ATaskRouter(registry)
    exp = ExperienceExtractor(incremental_dir=str(tmp_path / "exp"))
    sync = StateSyncManager(experience_extractor=exp, memory_manager=None)

    return registry, client, router, sync


class TestA2AIntelligentRouting:

    @pytest.mark.asyncio
    async def test_simple_executor_routes_to_a2a(self, mock_a2a_server, a2a_infrastructure, tmp_path):
        """SimpleExecutor 检测到 A2A 节点后自动路由"""
        from unittest.mock import MagicMock

        from a2a_registry import AgentCard, AgentSkill
        from simple_executor import SimpleExecutor

        registry, client, router, sync = a2a_infrastructure

        # 注册 mock 节点
        card = AgentCard(
            name="mock-ts-orchestrator",
            description="test",
            url="http://localhost:19877",
            skills=[AgentSkill(id="local_tool_execution", name="Local Tools", description="test", tags=["file", "git"])],
        )
        registry.register("ts-001", card)

        # 创建 SimpleExecutor（不需要真实的 project_manager）
        pm = MagicMock()
        executor = SimpleExecutor(
            project_manager=pm,
            a2a_task_router=router,
            a2a_client=client,
            state_sync=sync,
        )

        # 执行任务
        progress_calls = []
        async def on_progress(agent_id, text, delta):
            progress_calls.append((agent_id, text, delta))

        result = await executor.execute(
            session=MagicMock(),
            content="读取 config.ts 并修改端口为 9090",
            on_progress=on_progress,
        )

        # 验证：应该通过 A2A 路由成功
        assert result.success is True
        assert "9090" in result.result
        assert result.project_id.startswith("a2a-")
        assert result.review_passed is True
        assert result.retry_with_complex is False

        # 验证：进度回调包含 A2A 路由信息
        assert any("A2A" in text or "mock" in text.lower() for _, text, _ in progress_calls)

    @pytest.mark.asyncio
    async def test_simple_executor_fallback_no_nodes(self, a2a_infrastructure):
        """无 A2A 节点时降级到 Python 内部执行"""
        from unittest.mock import MagicMock

        from simple_executor import SimpleExecutor

        registry, client, router, sync = a2a_infrastructure

        pm = MagicMock()
        executor = SimpleExecutor(
            project_manager=pm,
            a2a_task_router=router,
            a2a_client=client,
            state_sync=sync,
        )

        # 无注册节点，A2A 路由应该返回 None，降级到内部执行
        # 由于内部执行需要真实的 agent，这里只验证不抛异常
        result = await executor.execute(
            session=MagicMock(),
            content="读取文件",
            on_progress=lambda *a: None,
        )

        # 内部执行会失败（没有真实 agent），但不应因 A2A 路由失败
        assert result is not None

    @pytest.mark.asyncio
    async def test_experience_injected_to_a2a_task(self, mock_a2a_server, a2a_infrastructure):
        """A2A 任务应包含经验注入"""
        from a2a_registry import AgentCard, AgentSkill

        registry, client, router, sync = a2a_infrastructure

        card = AgentCard(
            name="test-node",
            description="test",
            url="http://localhost:19877",
            skills=[AgentSkill(id="code", name="Code", description="test", tags=["file"])],
        )
        agent = registry.register("test-001", card)

        # 准备 metadata（模拟经验注入）
        metadata = sync.prepare_task_metadata("修改配置文件", "test-001")

        # 发送任务
        event = await client.send_task(agent, "修改配置文件", metadata)

        assert event.status is not None
        assert event.status.state == "completed"

    @pytest.mark.asyncio
    async def test_task_result_recorded_in_registry(self, mock_a2a_server, a2a_infrastructure):
        """任务结果应记录到注册表"""
        from a2a_registry import AgentCard, AgentSkill

        registry, client, router, sync = a2a_infrastructure

        card = AgentCard(
            name="test-node",
            description="test",
            url="http://localhost:19877",
            skills=[AgentSkill(id="code", name="Code", description="test", tags=["file"])],
        )
        agent = registry.register("test-001", card)

        # 执行任务
        event = await client.send_task(agent, "test task")

        # 记录结果
        registry.record_task("test-001", True)

        # 验证
        updated = registry.get("test-001")
        assert updated.task_count == 1
        assert updated.success_count == 1

    @pytest.mark.asyncio
    async def test_execution_target_auto_routing(self, a2a_infrastructure):
        """WorkflowNode execution_target='auto' 应触发 A2A 路由"""
        from semantic_analyzer import SemanticAnalyzer

        # 验证不同部门的 execution_target 建议
        assert SemanticAnalyzer._suggest_execution_target("dept-frontend", "前端开发") == "auto"
        assert SemanticAnalyzer._suggest_execution_target("dept-backend", "后端开发") == "auto"
        assert SemanticAnalyzer._suggest_execution_target("dept-qa", "测试任务") == "auto"
        assert SemanticAnalyzer._suggest_execution_target("dept-devops", "部署任务") == "auto"
        assert SemanticAnalyzer._suggest_execution_target("dept-software", "协调任务") == "local"
