"""Agent Bridge — 桥接 TS 智能体和 Python 智能体

让前端 TS 创建的智能体实例和后端 Python 创建的 agentscope 智能体实例
可以互相发送消息、协作完成任务。
"""

import logging
import uuid
from typing import Callable, Awaitable, Optional

from protocol import (
    AgentRole,
    MeetingAgentInfo,
    MeetingAgentStatus,
    meeting_agent_to_dict,
)

logger = logging.getLogger(__name__)

# TS AgentRole -> Python AgentRole 映射
ROLE_MAP = {
    "ceo": AgentRole.CEO,
    "planner": AgentRole.PLANNER,
    "executor": AgentRole.EXECUTOR,
    "monitor": AgentRole.MONITOR,
    "reviewer": AgentRole.REVIEWER,
    "coordinator": AgentRole.COORDINATOR,
}


class AgentBridge:
    """桥接 TS 智能体和 Python 智能体

    职责:
    1. 接收 TS 端的智能体注册请求，在 MeetingSession 中创建对应的 MeetingAgentInfo
    2. 维护 TS_ID <-> PY_ID 的双向映射
    3. 路由 bridge_message：Python 智能体直接调用，TS 智能体通过 WebSocket 发回
    """

    def __init__(self, meeting_session, agent_pool=None):
        self._meeting_session = meeting_session
        self._agent_pool = agent_pool
        self._id_map: dict[str, str] = {}       # tsId -> pyId
        self._reverse_map: dict[str, str] = {}  # pyId -> tsId
        self._ts_agents: dict[str, MeetingAgentInfo] = {}  # pyId -> MeetingAgentInfo

    async def register_ts_agent(
        self,
        ts_agent_id: str,
        name: str,
        role: str,
        capabilities: list[str],
        send_fn: Callable[[dict], Awaitable[None]],
    ) -> str:
        """注册 TS 智能体到 Python 端

        Args:
            ts_agent_id: TS 端的智能体 UUID
            name: 智能体名称
            role: AgentRole 枚举值 (ceo, planner, executor, etc.)
            capabilities: 能力列表
            send_fn: 发送 WebSocket 消息的回调

        Returns:
            pyAgentId: Python 端分配的智能体 ID
        """
        # 生成 Python 端 ID（使用完整 TS ID 的 hash 避免冲突）
        py_agent_id = f"ts-{ts_agent_id.replace('-', '')[:12]}"

        # 映射角色
        agent_role = ROLE_MAP.get(role, AgentRole.EXECUTOR)

        # 创建 MeetingAgentInfo
        agent_info = MeetingAgentInfo(
            id=py_agent_id,
            name=name,
            role=agent_role,
            status=MeetingAgentStatus.MEETING,
            capabilities=capabilities,
        )

        # 添加到 MeetingSession
        if self._meeting_session:
            self._meeting_session.agents.append(agent_info)

        # 存储映射
        self._id_map[ts_agent_id] = py_agent_id
        self._reverse_map[py_agent_id] = ts_agent_id
        self._ts_agents[py_agent_id] = agent_info

        # 发送注册确认
        await send_fn({
            "type": "bridge_agent_registered",
            "tsAgentId": ts_agent_id,
            "pyAgentId": py_agent_id,
            "success": True,
        })

        logger.info("TS 智能体已注册: ts=%s -> py=%s (%s/%s)", ts_agent_id, py_agent_id, name, role)
        return py_agent_id

    async def unregister_ts_agent(
        self,
        ts_agent_id: str,
        send_fn: Callable[[dict], Awaitable[None]],
    ) -> bool:
        """注销 TS 智能体

        Args:
            ts_agent_id: TS 端的智能体 UUID
            send_fn: 发送 WebSocket 消息的回调

        Returns:
            是否成功注销
        """
        py_agent_id = self._id_map.get(ts_agent_id)
        if not py_agent_id:
            logger.warning("注销失败: TS 智能体 %s 未注册", ts_agent_id)
            return False

        # 从 MeetingSession 移除
        if self._meeting_session:
            self._meeting_session.agents = [
                a for a in self._meeting_session.agents if a.id != py_agent_id
            ]

        # 清理映射
        del self._id_map[ts_agent_id]
        del self._reverse_map[py_agent_id]
        if py_agent_id in self._ts_agents:
            del self._ts_agents[py_agent_id]

        # 通知 TS 端
        await send_fn({
            "type": "bridge_agent_unregistered",
            "tsAgentId": ts_agent_id,
            "pyAgentId": py_agent_id,
        })

        logger.info("TS 智能体已注销: ts=%s -> py=%s", ts_agent_id, py_agent_id)
        return True

    async def route_message(
        self,
        from_id: str,
        to_id: str,
        payload: dict,
        send_fn: Callable[[dict], Awaitable[None]],
        coordinator=None,
    ) -> None:
        """路由 bridge 消息

        如果目标是 Python 智能体，直接调用 LLM 处理。
        如果目标是 TS 智能体，通过 WebSocket 发回。

        Args:
            from_id: 发送方 ID (可以是 TS 或 Python ID)
            to_id: 接收方 ID (可以是 TS 或 Python ID)
            payload: 消息内容
            send_fn: 发送 WebSocket 消息的回调
            coordinator: MeetingCoordinator 实例（用于调用 Python 智能体）
        """
        # 判断目标是 Python 原生智能体还是 TS 注册的智能体
        is_native = to_id.startswith("agent-") and not to_id.startswith("ts-")
        is_ts_registered = to_id.startswith("ts-") or self._reverse_map.get(to_id) is not None

        if is_native and not is_ts_registered:
            # 目标是 Python 原生智能体 — 调用 LLM
            await self._call_python_agent(from_id, to_id, payload, send_fn, coordinator)
        elif is_ts_registered:
            # 目标是 TS 注册的智能体 — 通过 WebSocket 发回
            await self._forward_to_ts(from_id, to_id, payload, send_fn)
        else:
            # 目标可能是 TS 端的智能体（ID 不是 agent- 开头）
            await self._forward_to_ts(from_id, to_id, payload, send_fn)

    async def _call_python_agent(
        self,
        from_id: str,
        to_id: str,
        payload: dict,
        send_fn: Callable[[dict], Awaitable[None]],
        coordinator=None,
    ) -> None:
        """调用 Python 端的 agentscope 智能体"""
        if not coordinator:
            logger.warning("无 MeetingCoordinator，无法调用 Python 智能体 %s", to_id)
            await send_fn({
                "type": "bridge_message",
                "fromAgentId": to_id,
                "toAgentId": from_id,
                "payload": {
                    "error": f"Agent {to_id} not available (no coordinator)",
                },
            })
            return

        # 构造消息内容
        content = payload.get("content", "")
        message_type = payload.get("type", "DataShare")

        if not content:
            content = str(payload)

        try:
            # 使用 coordinator 的 _get_model 获取 agentscope Agent
            # 映射 agent ID 到 role
            role_map = {
                "agent-ceo": "ceo",
                "agent-planner": "planner",
                "agent-executor": "executor",
                "agent-monitor": "monitor",
                "agent-reviewer": "reviewer",
                "agent-coordinator": "coordinator",
            }
            role = role_map.get(to_id, "executor")

            model = coordinator._get_model(role)
            if not model:
                logger.error("无法获取 Python 智能体模型: %s (role=%s)", to_id, role)
                await send_fn({
                    "type": "bridge_message",
                    "fromAgentId": to_id,
                    "toAgentId": from_id,
                    "payload": {"error": f"Agent {to_id} model not available"},
                })
                return

            # 调用 LLM（直接传递内容字符串）
            response = model.reply(content)

            # 提取响应文本
            response_text = ""
            if hasattr(response, "content"):
                response_text = response.content
            elif isinstance(response, str):
                response_text = response
            else:
                response_text = str(response)

            # 发送响应
            await send_fn({
                "type": "bridge_message",
                "fromAgentId": to_id,
                "toAgentId": from_id,
                "payload": {
                    "content": response_text,
                    "messageType": "TaskResult",
                },
            })

            # 记录到 meeting
            if self._meeting_session:
                self._meeting_session.add_message(to_id, response_text, to_id)

        except Exception as e:
            logger.error("调用 Python 智能体 %s 失败: %s", to_id, e)
            await send_fn({
                "type": "bridge_message",
                "fromAgentId": to_id,
                "toAgentId": from_id,
                "payload": {"error": str(e)},
            })

    async def _forward_to_ts(
        self,
        from_id: str,
        to_id: str,
        payload: dict,
        send_fn: Callable[[dict], Awaitable[None]],
    ) -> None:
        """通过 WebSocket 将消息转发给 TS 端智能体"""
        await send_fn({
            "type": "bridge_message",
            "fromAgentId": from_id,
            "toAgentId": to_id,
            "payload": payload,
        })
        logger.debug("消息已转发给 TS 智能体: %s -> %s", from_id, to_id)

    def get_py_agent(self, agent_id: str) -> Optional[MeetingAgentInfo]:
        """获取 Python 端智能体（可能是原生的或 TS 注册的）"""
        # 先查 TS 注册的
        if agent_id in self._ts_agents:
            return self._ts_agents[agent_id]
        # 再查 MeetingSession 中的原生智能体
        if self._meeting_session:
            return self._meeting_session.get_agent(agent_id)
        return None

    def get_ts_id(self, py_agent_id: str) -> Optional[str]:
        """获取 TS 端智能体 ID"""
        return self._reverse_map.get(py_agent_id)

    def get_py_id(self, ts_agent_id: str) -> Optional[str]:
        """获取 Python 端智能体 ID"""
        return self._id_map.get(ts_agent_id)

    def is_ts_agent(self, agent_id: str) -> bool:
        """判断是否为 TS 注册的智能体"""
        return agent_id.startswith("ts-") or agent_id in self._reverse_map

    def get_all_ts_agents(self) -> list[dict]:
        """获取所有 TS 注册的智能体信息"""
        return [
            meeting_agent_to_dict(info)
            for info in self._ts_agents.values()
        ]

    def get_bridge_status(self) -> dict:
        """获取桥接状态"""
        return {
            "registered_ts_agents": len(self._ts_agents),
            "id_mappings": dict(self._id_map),
            "agents": self.get_all_ts_agents(),
        }
