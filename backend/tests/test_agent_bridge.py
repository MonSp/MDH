"""
端到端测试：TS-Python 智能体桥接完整消息流

测试场景：
1. TS 智能体注册到 Python 端 AgentBridge
2. TS 智能体发送消息给 Python agent-executor
3. Python 端处理消息并返回响应
4. TS 智能体收到 Python 的回复
"""
import asyncio
import os
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 模拟 agentscope 模块
sys.modules['agentscope'] = MagicMock()
sys.modules['agentscope.agent'] = MagicMock()
sys.modules['agentscope.message'] = MagicMock()
sys.modules['agentscope.model'] = MagicMock()
sys.modules['agentscope.formatter'] = MagicMock()
sys.modules['agentscope.credential'] = MagicMock()
sys.modules['agentscope.event'] = MagicMock()
sys.modules['agentscope.skill'] = MagicMock()
sys.modules['agentscope.tool'] = MagicMock()

from agent_bridge import AgentBridge
from protocol import AgentRole, MeetingAgentInfo, MeetingAgentStatus


class MockMeetingSession:
    """模拟 MeetingSession"""
    def __init__(self):
        self.agents = []
        self.messages = []

    def get_agent(self, agent_id):
        for a in self.agents:
            if a.id == agent_id:
                return a
        return None

    def add_message(self, role, content, agent_id=None):
        msg = {"role": role, "content": content, "agent_id": agent_id}
        self.messages.append(msg)
        return msg


class MockCoordinator:
    """模拟 MeetingCoordinator"""
    def __init__(self):
        self._models = {}

    def _get_model(self, role):
        if role not in self._models:
            mock_agent = MagicMock()
            def make_reply(content):
                resp = MagicMock()
                resp.content = f"[{role}] 已处理: {content}"
                return resp
            mock_agent.reply.side_effect = make_reply
            self._models[role] = mock_agent
        return self._models[role]


class TestAgentBridgeE2E(unittest.TestCase):
    """AgentBridge 端到端测试"""

    def setUp(self):
        self.meeting = MockMeetingSession()
        # 添加 Python 原生智能体
        self.meeting.agents = [
            MeetingAgentInfo("agent-ceo", "CTO", AgentRole.CEO, MeetingAgentStatus.MEETING, ["semantic_analysis"]),
            MeetingAgentInfo("agent-executor", "开发", AgentRole.EXECUTOR, MeetingAgentStatus.MEETING, ["code_generation"]),
            MeetingAgentInfo("agent-planner", "架构", AgentRole.PLANNER, MeetingAgentStatus.MEETING, ["task_decomposition"]),
            MeetingAgentInfo("agent-reviewer", "QA", AgentRole.REVIEWER, MeetingAgentStatus.MEETING, ["code_review"]),
        ]
        self.bridge = AgentBridge(self.meeting)
        self.coordinator = MockCoordinator()
        self.sent_messages = []

    async def _send_fn(self, msg):
        """模拟 WebSocket 发送"""
        self.sent_messages.append(msg)

    def _run(self, coro):
        """运行异步函数"""
        return asyncio.run(coro)

    def test_full_flow_register_send_receive(self):
        """完整流程：注册 → 发消息 → 收回复"""
        # Step 1: 注册 TS 智能体
        py_id = self._run(self.bridge.register_ts_agent(
            ts_agent_id="a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            name="TS-Coder",
            role="executor",
            capabilities=["code_generation", "testing"],
            send_fn=self._send_fn,
        ))

        # 验证注册
        self.assertTrue(py_id.startswith("ts-"))
        self.assertEqual(len(self.bridge.get_all_ts_agents()), 1)
        self.assertEqual(len(self.sent_messages), 1)
        self.assertEqual(self.sent_messages[0]["type"], "bridge_agent_registered")
        self.assertTrue(self.sent_messages[0]["success"])

        # 验证 MeetingSession 中添加了新智能体
        ts_agent = self.meeting.get_agent(py_id)
        self.assertIsNotNone(ts_agent)
        self.assertEqual(ts_agent.name, "TS-Coder")
        self.assertEqual(ts_agent.role, AgentRole.EXECUTOR)

        # Step 2: TS 智能体发消息给 Python agent-executor
        self.sent_messages.clear()
        self._run(self.bridge.route_message(
            from_id="a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            to_id="agent-executor",
            payload={"content": "请帮我写一个快速排序算法"},
            send_fn=self._send_fn,
            coordinator=self.coordinator,
        ))

        # 验证 Python 智能体被调用
        executor_model = self.coordinator._models.get("executor")
        self.assertIsNotNone(executor_model)
        executor_model.reply.assert_called_once()

        # 验证响应通过 WebSocket 发回
        self.assertEqual(len(self.sent_messages), 1)
        response = self.sent_messages[0]
        self.assertEqual(response["type"], "bridge_message")
        self.assertEqual(response["fromAgentId"], "agent-executor")
        self.assertEqual(response["toAgentId"], "a1b2c3d4-e5f6-7890-abcd-ef1234567890")
        self.assertIn("已处理", response["payload"]["content"])
        self.assertIn("快速排序算法", response["payload"]["content"])

        # Step 3: 注销
        self.sent_messages.clear()
        result = self._run(self.bridge.unregister_ts_agent(
            "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            self._send_fn,
        ))
        self.assertTrue(result)
        self.assertEqual(len(self.bridge.get_all_ts_agents()), 0)

    def test_bidirectional_multi_round(self):
        """双向消息流：TS ↔ Python 多轮对话"""
        # 注册
        ts_id = "ts-agent-001"
        py_id = self._run(self.bridge.register_ts_agent(
            ts_id, "TS-Agent", "executor", ["code_generation"], self._send_fn,
        ))
        self.sent_messages.clear()

        # 第一轮：TS → Python executor
        self._run(self.bridge.route_message(
            ts_id, "agent-executor", {"content": "分析需求"}, self._send_fn, self.coordinator,
        ))
        self.assertEqual(len(self.sent_messages), 1)
        self.assertIn("分析需求", self.sent_messages[0]["payload"]["content"])

        # 第二轮：TS → Python planner
        self.sent_messages.clear()
        self._run(self.bridge.route_message(
            ts_id, "agent-planner", {"content": "制定计划"}, self._send_fn, self.coordinator,
        ))
        self.assertEqual(len(self.sent_messages), 1)
        self.assertIn("制定计划", self.sent_messages[0]["payload"]["content"])

        # 第三轮：TS → Python reviewer
        self.sent_messages.clear()
        self._run(self.bridge.route_message(
            ts_id, "agent-reviewer", {"content": "审查代码"}, self._send_fn, self.coordinator,
        ))
        self.assertEqual(len(self.sent_messages), 1)
        self.assertIn("审查代码", self.sent_messages[0]["payload"]["content"])

    def test_python_to_ts_forwarding(self):
        """Python → TS 消息转发"""
        ts_id = "ts-agent-002"
        py_id = self._run(self.bridge.register_ts_agent(
            ts_id, "TS-Agent", "executor", [], self._send_fn,
        ))
        self.sent_messages.clear()

        # Python 智能体发消息给 TS 智能体
        self._run(self.bridge.route_message(
            "agent-ceo", py_id, {"content": "紧急任务"}, self._send_fn, self.coordinator,
        ))

        # 应该通过 WebSocket 转发
        self.assertEqual(len(self.sent_messages), 1)
        msg = self.sent_messages[0]
        self.assertEqual(msg["type"], "bridge_message")
        self.assertEqual(msg["fromAgentId"], "agent-ceo")
        self.assertEqual(msg["toAgentId"], py_id)

    def test_multiple_ts_agents(self):
        """多个 TS 智能体同时注册"""
        ids = []
        for i in range(3):
            py_id = self._run(self.bridge.register_ts_agent(
                f"ts-agent-{i:03d}", f"Agent-{i}", "executor", [], self._send_fn,
            ))
            ids.append(py_id)

        self.assertEqual(len(self.bridge.get_all_ts_agents()), 3)

        # 每个智能体都能独立通信
        self.sent_messages.clear()
        self._run(self.bridge.route_message(
            "ts-agent-001", "agent-executor", {"content": "任务A"}, self._send_fn, self.coordinator,
        ))
        self._run(self.bridge.route_message(
            "ts-agent-002", "agent-executor", {"content": "任务B"}, self._send_fn, self.coordinator,
        ))

        # 两条消息都应该是不同的响应
        self.assertEqual(len(self.sent_messages), 2)

    def test_bridge_status(self):
        """获取桥接状态"""
        self._run(self.bridge.register_ts_agent(
            "ts-001", "Agent-1", "executor", ["code_gen"], self._send_fn,
        ))
        self._run(self.bridge.register_ts_agent(
            "ts-002", "Agent-2", "planner", ["planning"], self._send_fn,
        ))

        status = self.bridge.get_bridge_status()
        self.assertEqual(status["registered_ts_agents"], 2)
        self.assertIn("ts-001", status["id_mappings"])
        self.assertIn("ts-002", status["id_mappings"])

    def test_error_no_coordinator(self):
        """无 coordinator 时的错误处理"""
        ts_id = "ts-agent-err"
        self._run(self.bridge.register_ts_agent(
            ts_id, "Agent", "executor", [], self._send_fn,
        ))
        self.sent_messages.clear()

        # 不传 coordinator
        self._run(self.bridge.route_message(
            ts_id, "agent-executor", {"content": "test"}, self._send_fn, coordinator=None,
        ))

        # 应该返回错误消息
        self.assertEqual(len(self.sent_messages), 1)
        self.assertIn("error", self.sent_messages[0]["payload"])

    def test_unregister_nonexistent(self):
        """注销不存在的智能体"""
        result = self._run(self.bridge.unregister_ts_agent("nonexistent", self._send_fn))
        self.assertFalse(result)


if __name__ == "__main__":
    unittest.main()
