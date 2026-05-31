import asyncio
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional
import uuid
from datetime import datetime

from .communication import CommunicationInterface, CommunicationManager, Message, MessageType


class AgentStatus(str, Enum):
    IDLE = "idle"
    BUSY = "busy"
    WAITING = "waiting"
    ERROR = "error"
    OFFLINE = "offline"


@dataclass
class TaskResult:
    task_id: str = ""
    success: bool = True
    result: Any = None
    error: Optional[str] = None
    duration: float = 0.0
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class AgentStats:
    tasks_completed: int = 0
    tasks_failed: int = 0
    total_duration: float = 0.0
    last_active: Optional[datetime] = None


class ExecutorAgent:
    def __init__(
        self,
        name: str = "executor",
        capabilities: List[str] = None,
        communication: CommunicationInterface = None,
        communication_manager: CommunicationManager = None,
        auto_report: bool = True,
        max_retries: int = 3,
    ):
        self.name = name
        self.capabilities = capabilities or []
        self.communication = communication
        self.communication_manager = communication_manager
        self.auto_report = auto_report
        self.max_retries = max_retries
        self.status = AgentStatus.IDLE
        self.current_task: Optional[Dict[str, Any]] = None
        self.task_history: List[TaskResult] = []
        self.stats = AgentStats()
        self._parent_agent: Optional[str] = None
        self._task_executor: Optional[Callable] = None
        self._running = False
        self._message_task: Optional[asyncio.Task] = None

    @property
    def agent_id(self) -> str:
        return self.name

    def set_parent_agent(self, parent_id: str) -> None:
        self._parent_agent = parent_id

    def set_task_executor(self, executor: Callable) -> None:
        self._task_executor = executor

    async def start(self) -> None:
        self._running = True
        if self.communication_manager:
            self.communication_manager.register_agent(self.name, self)
            self.communication_manager.register_handler(self.name, self._handle_message)
            self._message_task = asyncio.create_task(self._message_listener())

    async def stop(self) -> None:
        self._running = False
        if self._message_task:
            self._message_task.cancel()
            try:
                await self._message_task
            except asyncio.CancelledError:
                pass

    async def _message_listener(self) -> None:
        while self._running:
            try:
                if self.communication_manager:
                    await self.communication_manager.process_messages(self.name)
                await asyncio.sleep(0.1)
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Error in message listener: {e}")

    async def _handle_message(self, message: Message) -> None:
        if message.type == MessageType.TASK_DELEGATION:
            await self._handle_task_delegation(message)
        elif message.type == MessageType.COLLABORATION_REQUEST:
            await self._handle_collaboration_request(message)
        elif message.type == MessageType.STATUS_REPORT:
            pass

    async def _handle_task_delegation(self, message: Message) -> None:
        task_data = message.content
        task_id = task_data.get("task_id")
        task_name = task_data.get("task_name")
        description = task_data.get("description")

        self.current_task = {
            "task_id": task_id,
            "task_name": task_name,
            "description": description,
            "assigned_by": message.sender,
            "assigned_at": datetime.now(),
        }
        self.status = AgentStatus.BUSY

        try:
            result = await self.execute_task(task_id, task_name, description)
            await self._report_result(task_id, result, success=True)
        except Exception as e:
            await self._report_result(task_id, error=str(e), success=False)
        finally:
            self.current_task = None
            self.status = AgentStatus.IDLE

    async def _handle_collaboration_request(self, message: Message) -> None:
        request_type = message.content.get("type")

        if request_type == "review":
            result = {"status": "approved", "comments": "Looks good"}
        elif request_type == "assist":
            result = {"status": "assisted", "help": "Provided assistance"}
        elif request_type == "consult":
            result = {"status": "consulted", "advice": "Provided advice"}
        else:
            result = {"status": "unknown_request"}

        if self.communication_manager:
            response = Message(
                type=MessageType.COLLABORATION_REQUEST,
                sender=self.name,
                receiver=message.sender,
                content={"type": "response", "request_type": request_type, "result": result},
                correlation_id=message.id,
            )
            await self.communication_manager.send_message(response)

    async def execute_task(self, task_id: str, task_name: str, description: str) -> Any:
        start_time = datetime.now()

        if self._task_executor:
            result = await self._task_executor(task_id, task_name, description)
        else:
            result = await self._default_task_execution(task_id, task_name, description)

        duration = (datetime.now() - start_time).total_seconds()

        task_result = TaskResult(
            task_id=task_id,
            success=True,
            result=result,
            duration=duration,
        )
        self.task_history.append(task_result)
        self.stats.tasks_completed += 1
        self.stats.total_duration += duration
        self.stats.last_active = datetime.now()

        return result

    async def _default_task_execution(self, task_id: str, task_name: str, description: str) -> Any:
        await asyncio.sleep(0.1)
        return {
            "task_id": task_id,
            "task_name": task_name,
            "status": "completed",
            "output": f"Task '{task_name}' completed by {self.name}",
        }

    async def _report_result(self, task_id: str, result: Any = None, success: bool = True, error: str = None) -> None:
        if not self.auto_report or not self._parent_agent:
            return

        if not success:
            self.stats.tasks_failed += 1

        if self.communication_manager:
            message = Message(
                type=MessageType.TASK_RESULT,
                sender=self.name,
                receiver=self._parent_agent,
                content={
                    "task_id": task_id,
                    "success": success,
                    "result": result,
                    "error": error,
                    "agent_name": self.name,
                },
            )
            await self.communication_manager.send_message(message)

    async def request_collaboration(self, target_agent: str, request_type: str, data: Dict[str, Any] = None) -> Optional[Dict[str, Any]]:
        if not self.communication_manager:
            return None

        message = Message(
            type=MessageType.COLLABORATION_REQUEST,
            sender=self.name,
            receiver=target_agent,
            content={"type": request_type, "data": data or {}},
            requires_response=True,
        )
        await self.communication_manager.send_message(message)

        response = await self.communication_manager.receive_message(self.name, timeout=30.0)
        if response and response.type == MessageType.COLLABORATION_REQUEST:
            return response.content.get("result")
        return None

    def get_status(self) -> Dict[str, Any]:
        return {
            "agent_id": self.name,
            "status": self.status.value,
            "capabilities": self.capabilities,
            "current_task": self.current_task,
            "stats": {
                "tasks_completed": self.stats.tasks_completed,
                "tasks_failed": self.stats.tasks_failed,
                "total_duration": self.stats.total_duration,
                "last_active": self.stats.last_active.isoformat() if self.stats.last_active else None,
            },
        }

    def get_task_history(self) -> List[Dict[str, Any]]:
        return [
            {
                "task_id": r.task_id,
                "success": r.success,
                "result": r.result,
                "error": r.error,
                "duration": r.duration,
                "timestamp": r.timestamp.isoformat(),
            }
            for r in self.task_history
        ]

    def clear_history(self) -> None:
        self.task_history.clear()
        self.stats = AgentStats()