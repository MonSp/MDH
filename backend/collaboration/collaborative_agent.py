from typing import Any

from .communication import (
    CommunicationInterface,
    CommunicationManager,
    InMemoryCommunication,
    Message,
    MessageType,
)
from .executor_agent import ExecutorAgent
from .planner_agent import PlannerAgent, TaskPlan, TaskStatus


class CollaborativeAgent:
    def __init__(
        self,
        name: str = "coordinator",
        communication: CommunicationInterface = None,
    ):
        self.name = name
        self.communication = communication or InMemoryCommunication()
        self.communication_manager = CommunicationManager(self.communication)
        self.planner = PlannerAgent(
            name=f"{name}_planner",
            communication=self.communication,
            communication_manager=self.communication_manager,
        )
        self.executors: dict[str, ExecutorAgent] = {}
        self.current_plan: TaskPlan | None = None
        self._running = False

    @property
    def agent_id(self) -> str:
        return self.name

    def add_executor(self, name: str, capabilities: list[str] = None) -> ExecutorAgent:
        executor = ExecutorAgent(
            name=name,
            capabilities=capabilities or [],
            communication=self.communication,
            communication_manager=self.communication_manager,
            auto_report=True,
        )
        executor.set_parent_agent(self.planner.name)
        self.executors[name] = executor
        self.planner.register_child_agent(name, executor)
        return executor

    def remove_executor(self, name: str) -> None:
        if name in self.executors:
            del self.executors[name]

    async def start(self) -> None:
        self._running = True
        self.communication_manager.register_agent(self.name, self)
        self.communication_manager.register_agent(self.planner.name, self.planner)

        for executor in self.executors.values():
            await executor.start()

        self.communication_manager.register_handler(self.planner.name, self._handle_planner_message)

    async def stop(self) -> None:
        self._running = False
        for executor in self.executors.values():
            await executor.stop()

    async def _handle_planner_message(self, message: Message) -> None:
        if message.type == MessageType.TASK_RESULT:
            task_data = message.content
            task_id = task_data.get("task_id")
            success = task_data.get("success", False)
            result = task_data.get("result")
            error = task_data.get("error")

            if success:
                await self.planner.update_subtask_status(
                    task_id,
                    TaskStatus.COMPLETED,
                    result=result,
                )
            else:
                await self.planner.update_subtask_status(
                    task_id,
                    TaskStatus.FAILED,
                    error=error,
                )

    async def execute_task(self, task_description: str, context: dict[str, Any] = None) -> dict[str, Any]:
        self.current_plan = await self.planner.plan_task(task_description, context)

        results = await self.planner.execute_plan()

        return {
            "plan_id": self.current_plan.id,
            "title": self.current_plan.title,
            "status": self.current_plan.status.value,
            "results": results,
            "plan_status": self.planner.get_plan_status(),
        }

    def get_status(self) -> dict[str, Any]:
        executor_statuses = {}
        for name, executor in self.executors.items():
            executor_statuses[name] = executor.get_status()

        return {
            "coordinator": self.name,
            "planner": self.planner.get_plan_status(),
            "executors": executor_statuses,
            "is_running": self._running,
        }

    def get_executor(self, name: str) -> ExecutorAgent | None:
        return self.executors.get(name)

    def list_executors(self) -> list[str]:
        return list(self.executors.keys())

    async def add_executor_and_start(self, name: str, capabilities: list[str] = None) -> ExecutorAgent:
        executor = self.add_executor(name, capabilities)
        if self._running:
            await executor.start()
        return executor

    async def remove_executor_and_stop(self, name: str) -> None:
        if name in self.executors:
            executor = self.executors[name]
            await executor.stop()
            self.remove_executor(name)

    async def broadcast_to_executors(self, message_content: Any) -> None:
        message = Message(
            type=MessageType.BROADCAST,
            sender=self.name,
            content=message_content,
        )
        await self.communication_manager.broadcast_message(message)

    async def send_to_executor(self, executor_name: str, message_content: Any) -> None:
        if executor_name not in self.executors:
            raise ValueError(f"Executor '{executor_name}' not found")

        message = Message(
            type=MessageType.DIRECT,
            sender=self.name,
            receiver=executor_name,
            content=message_content,
        )
        await self.communication_manager.send_message(message)

    def get_plan_progress(self) -> dict[str, Any] | None:
        return self.planner.get_plan_status()

    def get_executor_stats(self) -> dict[str, Any]:
        stats = {}
        for name, executor in self.executors.items():
            stats[name] = {
                "tasks_completed": executor.stats.tasks_completed,
                "tasks_failed": executor.stats.tasks_failed,
                "total_duration": executor.stats.total_duration,
                "status": executor.status.value,
            }
        return stats
