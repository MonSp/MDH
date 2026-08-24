"""A2A 协议端到端集成测试

验证 A2A 协议全链路：注册 → 路由 → 派发 → 状态同步 → 安全防护。
"""

import asyncio
import json
import time
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import List, Optional
from unittest.mock import MagicMock, patch

import pytest

from a2a_registry import A2ARegistry, AgentCard, AgentSkill, RegisteredAgent
from a2a_task_router import A2ATaskRouter
from a2a_client import A2AClient
from state_sync import StateSyncManager


# ── Fixtures ────────────────────────────────────────────────────────


@pytest.fixture
def registry(tmp_path):
    """创建临时注册表"""
    return A2ARegistry(persist_path=str(tmp_path / "agents.json"))


@pytest.fixture
def sample_card():
    """示例 Agent Card — 本地工具执行节点"""
    return AgentCard(
        name="ts-orchestrator",
        description="本地工具执行 + LLM 路由",
        url="http://localhost:9090",
        skills=[
            AgentSkill(
                id="local_tool_execution",
                name="本地工具执行",
                description="文件操作、Git、Shell",
                tags=["file", "git", "shell", "search"],
            ),
            AgentSkill(
                id="llm_routing",
                name="LLM 路由",
                description="多提供商 LLM 调用",
                tags=["llm", "deepseek", "openai"],
            ),
        ],
        capabilities={"streaming": True},
    )


@pytest.fixture
def browser_card():
    """浏览器自动化 Agent Card"""
    return AgentCard(
        name="browser-agent",
        description="浏览器自动化",
        url="http://example.com:8080",
        skills=[
            AgentSkill(
                id="browser_automation",
                name="浏览器自动化",
                description="Playwright 浏览器操作",
                tags=["browser", "playwright", "screenshot"],
            ),
        ],
        capabilities={"streaming": True},
    )


@pytest.fixture
def mock_experience():
    """模拟 ExperienceExtractor"""
    exp = MagicMock()
    exp.retrieve_relevant_rules.return_value = [
        {
            "rule_id": "rule-e2e-001",
            "action": "配置文件修改后需要运行 TypeScript 检查",
            "note": "来自之前的任务",
            "effectiveness_score": 0.85,
            "keywords": ["config", "typescript"],
        },
        {
            "rule_id": "rule-e2e-002",
            "action": "端口修改后需要更新 docker-compose.yml",
            "note": "来自之前的任务",
            "effectiveness_score": 0.72,
            "keywords": ["port", "docker"],
        },
    ]
    exp.update_rule_effectiveness.return_value = None
    return exp


# ── Mock A2A Server (for test_dispatch_with_mock_server) ────────────


class _MockA2AHandler(BaseHTTPRequestHandler):
    """最小化 A2A Server 实现，用于 E2E 测试"""

    # 类变量，由测试设置
    agent_card: dict = {}

    def log_message(self, fmt, *args):
        """静默日志，避免测试输出噪音"""
        pass

    def do_GET(self):
        if self.path == "/.well-known/agent.json":
            body = json.dumps(self.agent_card).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path == "/a2a/tasks/send":
            content_len = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_len)
            request = json.loads(body)
            task_id = request.get("task_id", "mock-task-001")

            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()

            # SSE: working 状态
            working_event = json.dumps({
                "status": {"state": "working", "message": "正在处理..."},
            })
            self.wfile.write(f"data: {working_event}\n\n".encode())
            self.wfile.flush()

            # SSE: completed + artifact
            completed_event = json.dumps({
                "status": {"state": "completed", "message": "完成"},
                "artifact": {
                    "name": "result",
                    "parts": [{"type": "text", "text": "任务执行成功: config.yaml 已更新"}],
                },
            })
            self.wfile.write(f"data: {completed_event}\n\n".encode())
            self.wfile.flush()
        else:
            self.send_error(404)


def _start_mock_server(port: int, agent_card: dict) -> HTTPServer:
    """启动 Mock A2A Server"""
    handler_class = type(
        "Handler",
        (_MockA2AHandler,),
        {"agent_card": agent_card},
    )
    server = HTTPServer(("127.0.0.1", port), handler_class)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


# ── Test 1: 注册并列出 Agent ────────────────────────────────────────


class TestRegisterAndListAgents:
    """test_register_and_list_agents:
    注册一个 Agent 通过 A2ARegistry，验证 list_active() 能看到它"""

    def test_register_and_list_agents(self, registry, sample_card):
        # 初始状态无活跃节点
        assert len(registry.list_active()) == 0

        # 注册
        agent = registry.register("e2e-agent-001", sample_card)
        assert agent.agent_id == "e2e-agent-001"
        assert agent.status == "active"

        # 验证 list_active
        active = registry.list_active()
        assert len(active) == 1
        assert active[0].agent_id == "e2e-agent-001"
        assert active[0].card.name == "ts-orchestrator"

    def test_register_multiple_and_list(self, registry, sample_card, browser_card):
        registry.register("agent-a", sample_card)
        registry.register("agent-b", browser_card)

        active = registry.list_active()
        assert len(active) == 2
        ids = {a.agent_id for a in active}
        assert ids == {"agent-a", "agent-b"}

    def test_unregister_removes_from_list(self, registry, sample_card):
        registry.register("agent-x", sample_card)
        assert len(registry.list_active()) == 1

        registry.unregister("agent-x")
        assert len(registry.list_active()) == 0


# ── Test 2: 路由到正确的已注册 Agent ────────────────────────────────


class TestRouteToRegisteredAgent:
    """test_route_to_registered_agent:
    注册带有技能的 Agent，用 A2ATaskRouter.route() 匹配任务，
    验证选中正确的 Agent"""

    def test_route_selects_correct_agent(self, registry, sample_card, browser_card):
        registry.register("ts-node", sample_card)
        registry.register("browser-node", browser_card)

        router = A2ATaskRouter(registry)

        # 文件操作任务应路由到 ts-node
        decision = router.route("请读取 config.yaml 文件")
        assert decision is not None
        assert decision.agent.agent_id == "ts-node"
        assert "file" in decision.matched_tags

    def test_route_browser_task_goes_to_browser_agent(self, registry, sample_card, browser_card):
        registry.register("ts-node", sample_card)
        registry.register("browser-node", browser_card)

        router = A2ATaskRouter(registry)

        # 浏览器任务应路由到 browser-node
        decision = router.route("打开网页并截图")
        assert decision is not None
        assert decision.agent.agent_id == "browser-node"
        assert "browser" in decision.matched_tags

    def test_route_prefers_high_success_rate(self, registry, sample_card):
        # 注册两个相同能力的节点
        registry.register("node-good", sample_card)
        registry.register("node-bad", sample_card)

        # node-good 全部成功
        for _ in range(10):
            registry.record_task("node-good", True)
        # node-bad 全部失败
        for _ in range(10):
            registry.record_task("node-bad", False)

        router = A2ATaskRouter(registry)
        decision = router.route("读取文件")
        assert decision is not None
        assert decision.agent.agent_id == "node-good"

    def test_route_returns_none_when_no_agents(self, registry):
        router = A2ATaskRouter(registry)
        decision = router.route("读取文件")
        assert decision is None


# ── Test 3: 通过 Mock Server 派发任务 ────────────────────────────────


class TestDispatchWithMockServer:
    """test_dispatch_with_mock_server:
    启动一个 HTTP 服务器模拟 A2A Server（返回 SSE working→completed），
    注册它，通过 A2AClient 派发任务，验证结果"""

    MOCK_PORT = 18765  # 固定端口避免冲突

    def test_dispatch_and_receive_sse(self, registry):
        # 构造 Agent Card
        card_data = {
            "name": "mock-a2a-server",
            "description": "E2E 测试模拟服务",
            "url": f"http://127.0.0.1:{self.MOCK_PORT}",
            "version": "1.0.0",
            "capabilities": {"streaming": True},
            "skills": [],
        }

        # 启动 Mock Server
        server = _start_mock_server(self.MOCK_PORT, card_data)

        try:
            # 注册 Agent
            card = AgentCard(
                name=card_data["name"],
                description=card_data["description"],
                url=card_data["url"],
            )
            agent = registry.register("mock-agent", card)

            # 派发任务
            client = A2AClient(timeout=10)
            events_received = []

            async def run():
                event = await client.send_task(
                    agent=agent,
                    message="读取 config.yaml 并修改端口为 9090",
                    on_event=lambda e: events_received.append(e),
                )
                await client.close()
                return event

            result = asyncio.run(run())

            # 验证事件流
            assert len(events_received) >= 2, f"应收到至少 2 个事件，实际 {len(events_received)}"
            assert events_received[0].status.state == "working"
            assert events_received[1].status.state == "completed"

            # 验证最终结果
            assert result.status is not None
            assert result.status.state == "completed"
            assert result.artifact is not None
            assert len(result.artifact.parts) > 0
            assert "任务执行成功" in result.artifact.parts[0].text

            # 验证 record_task
            registry.record_task(agent.agent_id, True)
            updated = registry.get("mock-agent")
            assert updated.task_count == 1
            assert updated.success_count == 1

        finally:
            server.shutdown()

    def test_dispatch_full_chain_with_state_sync(self, registry, mock_experience):
        """完整链路: 注册 → 路由 → 派发 → 记录"""
        card_data = {
            "name": "mock-full-chain",
            "description": "完整链路测试",
            "url": f"http://127.0.0.1:{self.MOCK_PORT + 1}",
            "version": "1.0.0",
            "capabilities": {"streaming": True},
            "skills": [
                {
                    "id": "file_ops",
                    "name": "文件操作",
                    "description": "读写文件",
                    "tags": ["file"],
                }
            ],
        }

        server = _start_mock_server(self.MOCK_PORT + 1, card_data)

        try:
            card = AgentCard(
                name=card_data["name"],
                description=card_data["description"],
                url=card_data["url"],
                skills=[AgentSkill(**s) for s in card_data["skills"]],
            )
            registry.register("full-chain-agent", card)

            # 路由
            router = A2ATaskRouter(registry)
            decision = router.route("读取 config.yaml")
            assert decision is not None
            assert decision.agent.agent_id == "full-chain-agent"

            # 派发
            client = A2AClient(timeout=10)

            async def run():
                event = await client.send_task(
                    agent=decision.agent,
                    message="读取 config.yaml",
                )
                await client.close()
                return event

            result = asyncio.run(run())
            assert result.status.state == "completed"

            # 记录结果
            registry.record_task(decision.agent.agent_id, True)
            agent = registry.get("full-chain-agent")
            assert agent.task_count == 1
            assert agent.success_rate == 1.0

        finally:
            server.shutdown()


# ── Test 4: StateSync 注入经验规则 ──────────────────────────────────


class TestStateSyncInjectsExperience:
    """test_state_sync_injects_experience:
    调用 StateSyncManager.prepare_task_metadata() 匹配已有经验规则，
    验证 metadata 包含 experience_rules"""

    def test_prepare_metadata_with_experience_rules(self, mock_experience):
        sync = StateSyncManager(experience_extractor=mock_experience)

        metadata = sync.prepare_task_metadata(
            "读取 config.ts 并修改端口为 9090",
            "ts-orchestrator",
        )

        assert "experience_rules" in metadata
        assert len(metadata["experience_rules"]) == 2
        assert metadata["experience_rules"][0]["rule_id"] == "rule-e2e-001"
        assert metadata["experience_rules"][0]["effectiveness_score"] == 0.85
        mock_experience.retrieve_relevant_rules.assert_called_once()

    def test_prepare_metadata_no_matching_rules(self, mock_experience):
        mock_experience.retrieve_relevant_rules.return_value = []
        sync = StateSyncManager(experience_extractor=mock_experience)

        metadata = sync.prepare_task_metadata("翻译这段文字", "claude-code")

        assert "experience_rules" not in metadata

    def test_prepare_metadata_with_memory_context(self, mock_experience):
        mock_memory = MagicMock()
        mock_memory.recall_for_task.return_value = "之前处理过类似的配置修改任务"

        sync = StateSyncManager(
            experience_extractor=mock_experience,
            memory_manager=mock_memory,
        )

        metadata = sync.prepare_task_metadata(
            "读取 config.ts 并修改端口为 9090",
            "ts-orchestrator",
        )

        assert "experience_rules" in metadata
        assert "skill_context" in metadata
        assert metadata["skill_context"] == "之前处理过类似的配置修改任务"

    def test_metadata_can_be_merged_into_dispatch(self, mock_experience):
        """验证 metadata 格式与 A2A 派发兼容（可合并）"""
        sync = StateSyncManager(experience_extractor=mock_experience)

        user_metadata = {"custom_key": "custom_value"}
        sync_metadata = sync.prepare_task_metadata(
            "修改端口配置",
            "ts-orchestrator",
        )
        merged = {**user_metadata, **sync_metadata}

        assert merged["custom_key"] == "custom_value"
        assert "experience_rules" in merged
        assert isinstance(merged["experience_rules"], list)


# ── Test 5: SSRF 防护 ──────────────────────────────────────────────


class TestSSRFProtection:
    """test_ssrf_protection:
    尝试注册 localhost / 内网 IP URL，验证被拒绝

    SSRF 校验在 server.py 的 _validate_a2a_url() 中实现，
    这里直接测试该函数。"""

    def _import_validate_url(self):
        """导入 _validate_a2a_url（延迟导入避免循环）"""
        import sys
        import os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
        # 需要在 import server 前 mock 掉 heavy 依赖
        from server import _validate_a2a_url
        return _validate_a2a_url

    def test_rejects_localhost(self):
        validate = self._import_validate_url()
        from fastapi.exceptions import HTTPException as FastAPIHTTPException

        with pytest.raises(FastAPIHTTPException):
            validate("http://localhost:8080/api")

    def test_rejects_127_loopback(self):
        validate = self._import_validate_url()
        from fastapi.exceptions import HTTPException as FastAPIHTTPException

        with pytest.raises(FastAPIHTTPException):
            validate("http://127.0.0.1:9090/api")

    def test_rejects_private_10_network(self):
        validate = self._import_validate_url()
        from fastapi.exceptions import HTTPException as FastAPIHTTPException

        with pytest.raises(FastAPIHTTPException):
            validate("http://10.0.0.1:8080/api")

    def test_rejects_private_172_network(self):
        validate = self._import_validate_url()
        from fastapi.exceptions import HTTPException as FastAPIHTTPException

        with pytest.raises(FastAPIHTTPException):
            validate("http://172.16.0.1:8080/api")

    def test_rejects_private_192_network(self):
        validate = self._import_validate_url()
        from fastapi.exceptions import HTTPException as FastAPIHTTPException

        with pytest.raises(FastAPIHTTPException):
            validate("http://192.168.1.1:8080/api")

    def test_rejects_ipv6_loopback(self):
        validate = self._import_validate_url()
        from fastapi.exceptions import HTTPException as FastAPIHTTPException

        with pytest.raises(FastAPIHTTPException):
            validate("http://[::1]:8080/api")

    def test_allows_public_url(self):
        validate = self._import_validate_url()
        result = validate("http://example.com:8080/api")
        assert result == "http://example.com:8080/api"

    def test_allows_https_url(self):
        validate = self._import_validate_url()
        result = validate("https://my-agent.example.com/a2a")
        assert result == "https://my-agent.example.com/a2a"

    def test_rejects_non_http_scheme(self):
        validate = self._import_validate_url()
        from fastapi.exceptions import HTTPException as FastAPIHTTPException

        with pytest.raises(FastAPIHTTPException):
            validate("ftp://example.com/file")


# ── Test 6: 心跳标记 Agent 为 active ────────────────────────────────


class TestHeartbeatMarksActive:
    """test_heartbeat_marks_active:
    注册 Agent，调用 heartbeat，验证状态为 active"""

    def test_heartbeat_sets_active_status(self, registry, sample_card):
        agent = registry.register("hb-agent", sample_card)
        assert agent.status == "active"

        # 心跳成功
        ok = registry.heartbeat("hb-agent")
        assert ok is True

        # 状态仍为 active
        updated = registry.get("hb-agent")
        assert updated.status == "active"

    def test_heartbeat_updates_timestamp(self, registry, sample_card):
        registry.register("hb-agent-ts", sample_card)

        before = time.time()
        registry.heartbeat("hb-agent-ts")
        after = time.time()

        agent = registry.get("hb-agent-ts")
        assert before <= agent.last_heartbeat <= after

    def test_heartbeat_nonexistent_agent_fails(self, registry):
        ok = registry.heartbeat("nonexistent")
        assert ok is False

    def test_heartbeat_restores_active_after_persistence(self, tmp_path, sample_card):
        """验证心跳可恢复持久化后 offline 状态的 Agent"""
        path = str(tmp_path / "agents.json")
        reg1 = A2ARegistry(persist_path=path)
        reg1.register("persist-agent", sample_card)

        # 模拟重启
        reg2 = A2ARegistry(persist_path=path)
        agent = reg2.get("persist-agent")
        assert agent.status == "offline"  # 重启后 offline

        # 心跳恢复
        ok = reg2.heartbeat("persist-agent")
        assert ok is True
        assert reg2.get("persist-agent").status == "active"


# ── Test 7: 超时 Agent 被标记为 unhealthy ────────────────────────────


class TestStaleAgentMarkedUnhealthy:
    """test_stale_agent_marked_unhealthy:
    注册 Agent，用短超时调用 check_health()，验证状态变为 unhealthy"""

    def test_stale_agent_becomes_unhealthy(self, registry, sample_card):
        registry.register("stale-agent", sample_card)

        # 初始为 active
        assert registry.get("stale-agent").status == "active"

        # 模拟心跳过期：将 last_heartbeat 设为很久以前
        agent = registry.get("stale-agent")
        agent.last_heartbeat = time.time() - 300  # 5 分钟前

        # 用 60 秒超时检查
        registry.check_health(timeout_seconds=60)

        assert registry.get("stale-agent").status == "unhealthy"

    def test_fresh_agent_stays_active(self, registry, sample_card):
        registry.register("fresh-agent", sample_card)

        # 刚注册，心跳是新鲜的
        registry.check_health(timeout_seconds=60)

        assert registry.get("fresh-agent").status == "active"

    def test_heartbeat_resets_health_status(self, registry, sample_card):
        """心跳可将 unhealthy 恢复为 active"""
        registry.register("recover-agent", sample_card)

        # 先标记为超时
        agent = registry.get("recover-agent")
        agent.last_heartbeat = time.time() - 300
        registry.check_health(timeout_seconds=60)
        assert registry.get("recover-agent").status == "unhealthy"

        # 心跳恢复
        registry.heartbeat("recover-agent")
        assert registry.get("recover-agent").status == "active"

    def test_unhealthy_agent_excluded_from_routing(self, registry, sample_card):
        """unhealthy 节点不应被路由选中"""
        registry.register("healthy-node", sample_card)
        registry.register("stale-node", sample_card)

        # 标记 stale-node 为超时
        stale = registry.get("stale-node")
        stale.last_heartbeat = time.time() - 300
        registry.check_health(timeout_seconds=60)

        router = A2ATaskRouter(registry)
        decision = router.route("读取文件")
        assert decision is not None
        assert decision.agent.agent_id == "healthy-node"

    def test_unhealthy_agent_not_in_list_active(self, registry, sample_card):
        """unhealthy 节点不在 list_active() 结果中"""
        registry.register("gone-stale", sample_card)
        assert len(registry.list_active()) == 1

        agent = registry.get("gone-stale")
        agent.last_heartbeat = time.time() - 300
        registry.check_health(timeout_seconds=60)

        assert len(registry.list_active()) == 0
