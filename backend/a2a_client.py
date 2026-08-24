"""
A2A Client — 向执行节点发送任务

实现 A2A 协议的客户端侧，负责：
- 发送任务到执行节点
- 接收流式结果（SSE）
- 管理任务生命周期
"""

import asyncio
import inspect
import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Dict, List, Optional, Union

import httpx

from a2a_registry import RegisteredAgent

logger = logging.getLogger("a2a_client")

MAX_LOG_SIZE = 1000
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 1.0  # seconds, exponential: 1s, 2s, 4s


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
    复用 httpx.AsyncClient 连接池，避免每次请求新建连接。
    """

    def __init__(self, timeout: float = 300):
        self._timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None
        self._task_log: Dict[str, Dict] = {}
        self._log_lock = asyncio.Lock()

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=self._timeout)
        return self._client

    async def close(self):
        """关闭共享 HTTP 客户端"""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def send_task(
        self,
        agent: RegisteredAgent,
        message: str,
        metadata: Dict = None,
        on_event: Callable[[A2ATaskEvent], Optional[Awaitable[None]]] = None,
        task_id: str = None,
    ) -> A2ATaskEvent:
        """发送任务到执行节点，返回最终结果

        Args:
            agent: 目标执行节点
            message: 任务描述文本
            metadata: 附加元数据（经验规则、技能上下文等）
            on_event: 流式事件回调
            task_id: 可选的任务 ID（如未提供则自动生成）

        Returns:
            最终的 A2ATaskEvent
        """
        if task_id is None:
            task_id = str(uuid.uuid4())
        url = f"{agent.card.url.rstrip('/')}/a2a/tasks/send"
        start_time = time.time()

        async with self._log_lock:
            self._task_log[task_id] = {
                "task_id": task_id,
                "agent_id": agent.agent_id,
                "message": message[:200],
                "started_at": start_time,
                "status": "running",
            }

        request_body = {
            "task_id": task_id,
            "message": {
                "role": "user",
                "parts": [{"type": "text", "text": message}],
                "metadata": metadata or {},
            },
        }

        last_event = A2ATaskEvent(task_id=task_id)

        for attempt in range(MAX_RETRIES):
            try:
                client = await self._get_client()
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

                            # 保留前一个事件的 artifact（最终 status 事件通常不带 artifact）
                            if not event.artifact and last_event.artifact:
                                event.artifact = last_event.artifact
                            last_event = event

                            if on_event:
                                result = on_event(event)
                                if inspect.isawaitable(result):
                                    await result

                            if event.status and event.status.state in ("completed", "failed"):
                                break

                        except json.JSONDecodeError:
                            logger.warning("A2A SSE 解析失败: %s", data_str[:100])

                break  # success — exit retry loop

            except httpx.TimeoutException:
                logger.warning("A2A 任务超时 (attempt %d/%d): %s -> %s", attempt + 1, MAX_RETRIES, task_id, agent.agent_id)
                last_event = A2ATaskEvent(
                    task_id=task_id,
                    status=A2ATaskStatus(state="failed", message="Task timed out"),
                )
            except httpx.HTTPStatusError as e:
                if e.response.status_code >= 500 and attempt < MAX_RETRIES - 1:
                    logger.warning("A2A 服务端错误 (attempt %d/%d): HTTP %s", attempt + 1, MAX_RETRIES, e.response.status_code)
                else:
                    logger.error("A2A 任务 HTTP 错误: %s %s", e.response.status_code, url)
                    last_event = A2ATaskEvent(
                        task_id=task_id,
                        status=A2ATaskStatus(state="failed", message=f"HTTP {e.response.status_code}"),
                    )
                    if e.response.status_code < 500:
                        break  # 4xx — don't retry
            except Exception as e:
                logger.error("A2A 任务异常: %s", e)
                last_event = A2ATaskEvent(
                    task_id=task_id,
                    status=A2ATaskStatus(state="failed", message=str(e)),
                )
                break  # non-transient — don't retry

            # exponential backoff before retry
            if attempt < MAX_RETRIES - 1:
                delay = RETRY_BACKOFF_BASE * (2 ** attempt)
                await asyncio.sleep(delay)

        # 记录任务完成
        duration = time.time() - start_time
        async with self._log_lock:
            self._task_log[task_id].update({
                "finished_at": time.time(),
                "status": last_event.status.state if last_event.status else "unknown",
                "duration_s": round(duration, 3),
            })

            # 淘汰最旧的条目，保持 _task_log 大小不超过 MAX_LOG_SIZE
            if len(self._task_log) > MAX_LOG_SIZE:
                sorted_entries = sorted(
                    self._task_log.values(),
                    key=lambda e: e.get("started_at", 0),
                    reverse=True,
                )
                self._task_log = {e["task_id"]: e for e in sorted_entries[:MAX_LOG_SIZE]}

        return last_event

    def get_task_log(self, task_id: str = None) -> Union[Dict, List[Dict]]:
        """查询任务执行日志"""
        if task_id:
            return self._task_log.get(task_id, {})
        return list(self._task_log.values())

    async def get_task(self, agent: RegisteredAgent, task_id: str) -> Optional[Dict]:
        """查询任务状态"""
        url = f"{agent.card.url.rstrip('/')}/a2a/tasks/{task_id}"
        try:
            client = await self._get_client()
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
            client = await self._get_client()
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
