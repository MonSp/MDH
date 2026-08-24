"""A2A 协议模块测试"""

import json
import os
import tempfile
import pytest

from a2a_registry import A2ARegistry, AgentCard, AgentSkill, RegisteredAgent
from a2a_task_router import A2ATaskRouter


@pytest.fixture
def registry(tmp_path):
    """创建临时注册表"""
    return A2ARegistry(persist_path=str(tmp_path / "agents.json"))


@pytest.fixture
def sample_card():
    """示例 Agent Card"""
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


class TestA2ARegistry:

    def test_register_and_get(self, registry, sample_card):
        agent = registry.register("ts-001", sample_card)
        assert agent.agent_id == "ts-001"
        assert agent.status == "active"
        assert agent.card.name == "ts-orchestrator"

        retrieved = registry.get("ts-001")
        assert retrieved is not None
        assert retrieved.agent_id == "ts-001"

    def test_unregister(self, registry, sample_card):
        registry.register("ts-001", sample_card)
        assert registry.unregister("ts-001") is True
        assert registry.get("ts-001") is None
        assert registry.unregister("ts-001") is False

    def test_list_active(self, registry, sample_card):
        registry.register("ts-001", sample_card)
        registry.register("ts-002", sample_card)
        assert len(registry.list_active()) == 2

        registry.unregister("ts-001")
        assert len(registry.list_active()) == 1

    def test_find_by_skill(self, registry, sample_card):
        registry.register("ts-001", sample_card)

        agents = registry.find_by_skill("local_tool_execution")
        assert len(agents) == 1
        assert agents[0].agent_id == "ts-001"

        agents = registry.find_by_skill("nonexistent")
        assert len(agents) == 0

    def test_find_by_tag(self, registry, sample_card):
        registry.register("ts-001", sample_card)

        agents = registry.find_by_tag("git")
        assert len(agents) == 1

        agents = registry.find_by_tag("llm")
        assert len(agents) == 1

        agents = registry.find_by_tag("nonexistent")
        assert len(agents) == 0

    def test_heartbeat(self, registry, sample_card):
        registry.register("ts-001", sample_card)
        assert registry.heartbeat("ts-001") is True
        assert registry.heartbeat("nonexistent") is False

    def test_record_task(self, registry, sample_card):
        registry.register("ts-001", sample_card)
        registry.record_task("ts-001", True)
        registry.record_task("ts-001", True)
        registry.record_task("ts-001", False)

        agent = registry.get("ts-001")
        assert agent.task_count == 3
        assert agent.success_count == 2
        assert abs(agent.success_rate - 2 / 3) < 0.01

    def test_persistence(self, tmp_path, sample_card):
        path = str(tmp_path / "agents.json")
        reg1 = A2ARegistry(persist_path=path)
        reg1.register("ts-001", sample_card)
        reg1.record_task("ts-001", True)

        reg2 = A2ARegistry(persist_path=path)
        agent = reg2.get("ts-001")
        assert agent is not None
        assert agent.task_count == 1
        assert agent.status == "offline"  # 重启后标记为 offline


class TestA2ATaskRouter:

    def test_route_finds_matching_agent(self, registry, sample_card):
        registry.register("ts-001", sample_card)
        router = A2ATaskRouter(registry)

        decision = router.route("请读取 config.yaml 文件")
        assert decision is not None
        assert decision.agent.agent_id == "ts-001"
        assert "file" in decision.matched_tags

    def test_route_git_task(self, registry, sample_card):
        registry.register("ts-001", sample_card)
        router = A2ATaskRouter(registry)

        decision = router.route("执行 git commit 提交代码")
        assert decision is not None
        assert "git" in decision.matched_tags

    def test_route_no_agents(self, registry):
        router = A2ATaskRouter(registry)
        decision = router.route("读取文件")
        assert decision is None

    def test_detect_needs_local_execution(self, registry, sample_card):
        router = A2ATaskRouter(registry)

        assert router.detect_needs_local_execution("读取本地文件 config.yaml") is True
        assert router.detect_needs_local_execution("执行 git commit") is True
        assert router.detect_needs_local_execution("翻译这段文字") is False

    def test_route_prefers_high_success_rate(self, registry, sample_card):
        # 注册两个相同能力的节点
        registry.register("ts-001", sample_card)
        registry.register("ts-002", sample_card)

        # 给 ts-001 更高的成功率
        for _ in range(10):
            registry.record_task("ts-001", True)
        for _ in range(5):
            registry.record_task("ts-002", False)

        router = A2ATaskRouter(registry)
        decision = router.route("读取文件")
        assert decision is not None
        assert decision.agent.agent_id == "ts-001"
