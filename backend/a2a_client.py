"""
A2A Client — 向执行节点发送任务

实现 A2A 协议的客户端侧，负责：
- 发送任务到执行节点
- 接收流式结果（SSE）
- 管理任务生命周期
"""

import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import AsyncIterator, Callable, Dict, List, Optional

import httpx

from a2a_registry import RegisteredAgent

logger = logging.getLogger("a2a_client")


@dataclass
class A2ATextPart:
    """A2A 消息文本部分"""
    type: str = "text"
    text: str = ""


@dataclass
class A2AMessage:
    """A2A 消息"""
    role: str = "user"
    parts: List[A2ATextPart] = field(default_factory=list)
    metadata: Dict = field(default_factory=dict)


@dataclass
class A2AArtifact:
    """A2A 产出物"""
    name: str = ""
    parts: List[A2ATextPart] = field(default_factory=list)
    metadata: Dict = field(default_factory=dict)


@dataclass
class A2ATaskStatus:
    """A2A 任务状态"""
    state: str = "submitted"  # submitted | working | completed | failed | canceled
    message: Optional[str] = None
    timestamp: float = field(default_factory=time.time)


@dataclass
class A2ATaskEvent:
    """A2A 任务事件（SSE 流中的单条事件）"""
    task_id: str
    status: Optional[A2ATaskStatus] = None
    artifact: Optional[A2AArtifact] = None
    metadata: Dict = field(default_factory=dict)


class A2AClient:
    """A2A 协议客户端

    向执行节点（A2A Server）发送任务并接收结果。
    """

    def __init__(self, timeout: float = 300):
        self._timeout = timeout

    async def send_task(
        self,
        agent: RegisteredAgent,
        message: str,
        metadata: Dict = None,
        on_event: Callable[[A2ATaskEvent], None] = None,
    ) -> A2ATaskEvent:
        """发送任务到执行节点，返回最终结果

        Args:
            agent: 目标执行节点
            message: 任务描述文本
            metadata: 附加元数据（经验规则、技能上下文等）
            on_event: 流式事件回调

        Returns:
            最终的 A2ATaskEvent
        """
        task_id = str(uuid.uuid4())
        url = f"{agent.card.url.rstrip('/')}/a2a/tasks/send"

        request_body = {
            "task_id": task_id,
            "message": {
                "role": "user",
                "parts": [{"type": "text", "text": message}],
                "metadata": metadata or {},
            },
        }

        last_event = A2ATaskEvent(task_id=task_id)

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                async with client.stream(
                    "POST",
                    url,
                    json=request_body,
                    headers={"Accept": "text/event-stream"},
                ) as response:
                    response.raise_for_status()

                    async for line in response.aiter_lines():
                        if not line.startswith("data: "):
                            continue

                        data_str = line[6:]
                        try:
                            data = json.loads(data_str)
                            event = self._parse_event(task_id, data)
                            last_event = event

                            if on_event:
                                on_event(event)

                            if event.status and event.status.state in ("completed", "failed"):
                                break

                        except json.JSONDecodeError:
                            logger.warning("A2A SSE 解析失败: %s", data_str[:100])

        except httpx.TimeoutException:
            logger.error("A2A 任务超时: %s -> %s", task_id, agent.agent_id)
            last_event = A2ATaskEvent(
                task_id=task_id,
                status=A2ATaskStatus(state="failed", message="Task timed out"),
            )
        except httpx.HTTPStatusError as e:
            logger.error("A2A 任务 HTTP 错误: %s %s", e.response.status_code, url)
            last_event = A2ATaskEvent(
                task_id=task_id,
                status=A2ATaskStatus(state="failed", message=f"HTTP {e.response.status_code}"),
            )
        except Exception as e:
            logger.error("A2A 任务异常: %s", e)
            last_event = A2ATaskEvent(
                task_id=task_id,
                status=A2ATaskStatus(state="failed", message=str(e)),
            )

        return last_event

    async def get_task(self, agent: RegisteredAgent, task_id: str) -> Optional[Dict]:
        """查询任务状态"""
        url = f"{agent.card.url.rstrip('/')}/a2a/tasks/{task_id}"
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(url)
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error("A2A 任务查询失败: %s %s", task_id, e)
            return None

    async def cancel_task(self, agent: RegisteredAgent, task_id: str) -> bool:
        """取消任务"""
        url = f"{agent.card.url.rstrip('/')}/a2a/tasks/{task_id}/cancel"
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(url)
                response.raise_for_status()
                return True
        except Exception as e:
            logger.error("A2A 任务取消失败: %s %s", task_id, e)
            return False

    def _parse_event(self, task_id: str, data: Dict) -> A2ATaskEvent:
        """解析 A2A SSE 事件"""
        event = A2ATaskEvent(task_id=task_id)

        if "status" in data:
            status_data = data["status"]
            event.status = A2ATaskStatus(
                state=status_data.get("state", "working"),
                message=status_data.get("message"),
            )

        if "artifact" in data:
            art_data = data["artifact"]
            parts = []
            for p in art_data.get("parts", []):
                parts.append(A2ATextPart(type=p.get("type", "text"), text=p.get("text", "")))
            event.artifact = A2AArtifact(
                name=art_data.get("name", ""),
                parts=parts,
                metadata=art_data.get("metadata", {}),
            )

        event.metadata = data.get("metadata", {})
        return event
