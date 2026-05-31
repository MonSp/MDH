import asyncio
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional
import uuid
from datetime import datetime


class MessageType(str, Enum):
    TASK_DELEGATION = "task_delegation"
    TASK_RESULT = "task_result"
    STATUS_REPORT = "status_report"
    ERROR_REPORT = "error_report"
    HELP_REQUEST = "help_request"
    COLLABORATION_REQUEST = "collaboration_request"
    HEARTBEAT = "heartbeat"
    ACKNOWLEDGEMENT = "acknowledgement"
    BROADCAST = "broadcast"
    DIRECT = "direct"


@dataclass
class Message:
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    type: MessageType = MessageType.DIRECT
    sender: str = ""
    receiver: str = ""
    content: Any = None
    timestamp: datetime = field(default_factory=datetime.now)
    priority: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)
    requires_response: bool = False
    task_id: Optional[str] = None
    correlation_id: Optional[str] = None


class CommunicationInterface:
    async def send(self, message: Message) -> None:
        raise NotImplementedError

    async def receive(self, agent_id: str, timeout: float = None) -> Optional[Message]:
        raise NotImplementedError

    def has_messages(self, agent_id: str) -> bool:
        raise NotImplementedError

    def message_count(self, agent_id: str) -> int:
        raise NotImplementedError

    def clear_messages(self, agent_id: str) -> None:
        raise NotImplementedError

    async def broadcast(self, message: Message, exclude_sender: bool = True) -> None:
        raise NotImplementedError


class InMemoryCommunication(CommunicationInterface):
    def __init__(self):
        self._queues: Dict[str, asyncio.Queue] = {}
        self._lock = asyncio.Lock()

    def _get_queue(self, agent_id: str) -> asyncio.Queue:
        if agent_id not in self._queues:
            self._queues[agent_id] = asyncio.Queue()
        return self._queues[agent_id]

    async def send(self, message: Message) -> None:
        async with self._lock:
            queue = self._get_queue(message.receiver)
            await queue.put(message)

    async def receive(self, agent_id: str, timeout: float = None) -> Optional[Message]:
        queue = self._get_queue(agent_id)
        try:
            if timeout:
                return await asyncio.wait_for(queue.get(), timeout=timeout)
            return await queue.get()
        except asyncio.TimeoutError:
            return None

    def has_messages(self, agent_id: str) -> bool:
        if agent_id not in self._queues:
            return False
        return not self._queues[agent_id].empty()

    def message_count(self, agent_id: str) -> int:
        if agent_id not in self._queues:
            return 0
        return self._queues[agent_id].qsize()

    def clear_messages(self, agent_id: str) -> None:
        if agent_id in self._queues:
            while not self._queues[agent_id].empty():
                try:
                    self._queues[agent_id].get_nowait()
                except asyncio.QueueEmpty:
                    break

    async def broadcast(self, message: Message, exclude_sender: bool = True) -> None:
        async with self._lock:
            for agent_id, queue in self._queues.items():
                if exclude_sender and agent_id == message.sender:
                    continue
                broadcast_msg = Message(
                    type=MessageType.BROADCAST,
                    sender=message.sender,
                    receiver=agent_id,
                    content=message.content,
                    priority=message.priority,
                    metadata=message.metadata,
                    task_id=message.task_id,
                )
                await queue.put(broadcast_msg)


class CommunicationManager:
    def __init__(self, communication: CommunicationInterface = None):
        self.communication = communication or InMemoryCommunication()
        self._agents: Dict[str, Any] = {}
        self._handlers: Dict[str, List[Callable]] = {}

    def register_agent(self, agent_id: str, agent: Any = None) -> None:
        self._agents[agent_id] = agent

    def unregister_agent(self, agent_id: str) -> None:
        self._agents.pop(agent_id, None)
        self._handlers.pop(agent_id, None)

    def get_registered_agents(self) -> List[str]:
        return list(self._agents.keys())

    def get_agent(self, agent_id: str) -> Optional[Any]:
        return self._agents.get(agent_id)

    async def send_message(self, message: Message) -> None:
        if message.sender and message.sender not in self._agents:
            raise ValueError(f"Sender '{message.sender}' is not registered")
        if message.receiver and message.receiver not in self._agents:
            raise ValueError(f"Receiver '{message.receiver}' is not registered")
        await self.communication.send(message)

    async def broadcast_message(self, message: Message, exclude_sender: bool = True) -> None:
        await self.communication.broadcast(message, exclude_sender)

    async def receive_message(self, agent_id: str, timeout: float = None) -> Optional[Message]:
        return await self.communication.receive(agent_id, timeout)

    def has_messages(self, agent_id: str) -> bool:
        return self.communication.has_messages(agent_id)

    def register_handler(self, agent_id: str, handler: Callable) -> None:
        if agent_id not in self._handlers:
            self._handlers[agent_id] = []
        self._handlers[agent_id].append(handler)

    async def process_messages(self, agent_id: str) -> None:
        while self.has_messages(agent_id):
            message = await self.receive_message(agent_id)
            if message and agent_id in self._handlers:
                for handler in self._handlers[agent_id]:
                    await handler(message)