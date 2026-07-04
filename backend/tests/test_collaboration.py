import asyncio
import pytest
from collaboration.communication import (
    CommunicationInterface,
    InMemoryCommunication,
    CommunicationManager,
    Message,
    MessageType,
)
from collaboration.planner_agent import PlannerAgent, TaskStatus, TaskPlan
from collaboration.executor_agent import ExecutorAgent, AgentStatus
from collaboration.collaborative_agent import CollaborativeAgent


@pytest.fixture
def communication():
    return InMemoryCommunication()


@pytest.fixture
def communication_manager(communication):
    return CommunicationManager(communication)


@pytest.fixture
def planner(communication, communication_manager):
    return PlannerAgent(
        name="test_planner",
        communication=communication,
        communication_manager=communication_manager,
    )


@pytest.fixture
def executor(communication, communication_manager):
    return ExecutorAgent(
        name="test_executor",
        capabilities=["coding", "testing"],
        communication=communication,
        communication_manager=communication_manager,
    )


@pytest.fixture
def collaborative_agent(communication):
    return CollaborativeAgent(
        name="test_coordinator",
        communication=communication,
    )


class TestCommunication:
    @pytest.mark.asyncio
    async def test_send_and_receive(self, communication):
        message = Message(
            type=MessageType.DIRECT,
            sender="agent1",
            receiver="agent2",
            content="Hello",
        )
        await communication.send(message)
        received = await communication.receive("agent2", timeout=1.0)
        assert received is not None
        assert received.content == "Hello"
        assert received.sender == "agent1"

    @pytest.mark.asyncio
    async def test_has_messages(self, communication):
        assert not communication.has_messages("agent1")
        message = Message(sender="agent2", receiver="agent1", content="Test")
        await communication.send(message)
        assert communication.has_messages("agent1")

    @pytest.mark.asyncio
    async def test_message_count(self, communication):
        assert communication.message_count("agent1") == 0
        for i in range(3):
            message = Message(sender="agent2", receiver="agent1", content=f"Msg {i}")
            await communication.send(message)
        assert communication.message_count("agent1") == 3

    @pytest.mark.asyncio
    async def test_clear_messages(self, communication):
        message = Message(sender="agent2", receiver="agent1", content="Test")
        await communication.send(message)
        assert communication.has_messages("agent1")
        communication.clear_messages("agent1")
        assert not communication.has_messages("agent1")

    @pytest.mark.asyncio
    async def test_broadcast(self, communication):
        for agent_id in ["agent1", "agent2", "agent3"]:
            communication._get_queue(agent_id)

        message = Message(
            type=MessageType.BROADCAST,
            sender="agent1",
            content="Broadcast message",
        )
        await communication.broadcast(message, exclude_sender=True)

        assert not communication.has_messages("agent1")
        assert communication.has_messages("agent2")
        assert communication.has_messages("agent3")


class TestCommunicationManager:
    @pytest.mark.asyncio
    async def test_register_agent(self, communication_manager):
        communication_manager.register_agent("agent1")
        assert "agent1" in communication_manager.get_registered_agents()

    @pytest.mark.asyncio
    async def test_unregister_agent(self, communication_manager):
        communication_manager.register_agent("agent1")
        communication_manager.unregister_agent("agent1")
        assert "agent1" not in communication_manager.get_registered_agents()

    @pytest.mark.asyncio
    async def test_send_message(self, communication_manager):
        communication_manager.register_agent("sender")
        communication_manager.register_agent("receiver")

        message = Message(
            type=MessageType.DIRECT,
            sender="sender",
            receiver="receiver",
            content="Test",
        )
        await communication_manager.send_message(message)

        received = await communication_manager.receive_message("receiver", timeout=1.0)
        assert received is not None
        assert received.content == "Test"

    @pytest.mark.asyncio
    async def test_send_message_unregistered_sender(self, communication_manager):
        communication_manager.register_agent("receiver")

        message = Message(
            type=MessageType.DIRECT,
            sender="unregistered",
            receiver="receiver",
            content="Test",
        )
        with pytest.raises(ValueError, match="Sender 'unregistered' is not registered"):
            await communication_manager.send_message(message)


class TestPlannerAgent:
    @pytest.mark.asyncio
    async def test_plan_task(self, planner):
        plan = await planner.plan_task("Build a website with frontend and backend")
        assert plan is not None
        assert len(plan.subtasks) > 0
        assert plan.status == TaskStatus.PLANNING

    @pytest.mark.asyncio
    async def test_plan_task_web(self, planner):
        plan = await planner.plan_task("Create a web application")
        subtask_names = [s.name for s in plan.subtasks]
        assert "前端开发" in subtask_names
        assert "后端开发" in subtask_names

    @pytest.mark.asyncio
    async def test_plan_task_data(self, planner):
        plan = await planner.plan_task("Perform data analysis")
        subtask_names = [s.name for s in plan.subtasks]
        assert "数据收集" in subtask_names
        assert "数据处理" in subtask_names

    @pytest.mark.asyncio
    async def test_register_child_agent(self, planner):
        planner.register_child_agent("agent1", None)
        assert "agent1" in planner.get_available_agents()

    @pytest.mark.asyncio
    async def test_update_subtask_status(self, planner):
        plan = await planner.plan_task("Test task")
        subtask = plan.subtasks[0]

        await planner.update_subtask_status(subtask.id, TaskStatus.RUNNING)
        assert subtask.status == TaskStatus.RUNNING

        await planner.update_subtask_status(subtask.id, TaskStatus.COMPLETED, result="Done")
        assert subtask.status == TaskStatus.COMPLETED
        assert subtask.result == "Done"

    @pytest.mark.asyncio
    async def test_get_plan_status(self, planner):
        plan = await planner.plan_task("Test task")
        status = planner.get_plan_status()

        assert status is not None
        assert status["plan_id"] == plan.id
        assert status["total_subtasks"] == len(plan.subtasks)
        assert status["completed"] == 0

    @pytest.mark.asyncio
    async def test_assign_tasks(self, planner, communication_manager):
        communication_manager.register_agent("planner")
        communication_manager.register_agent("executor")

        planner.register_child_agent("executor", None)
        await planner.plan_task("Test task")

        assignments = await planner.assign_tasks()
        assert len(assignments) > 0
        assert "executor" in assignments


class TestExecutorAgent:
    @pytest.mark.asyncio
    async def test_execute_task(self, executor):
        result = await executor.execute_task("task1", "Test Task", "Test description")
        assert result is not None
        assert result["task_id"] == "task1"
        assert result["status"] == "completed"
        assert executor.stats.tasks_completed == 1

    @pytest.mark.asyncio
    async def test_get_status(self, executor):
        status = executor.get_status()
        assert status["agent_id"] == "test_executor"
        assert status["status"] == AgentStatus.IDLE.value
        assert "coding" in status["capabilities"]

    @pytest.mark.asyncio
    async def test_get_task_history(self, executor):
        await executor.execute_task("task1", "Task 1", "Description 1")
        await executor.execute_task("task2", "Task 2", "Description 2")

        history = executor.get_task_history()
        assert len(history) == 2
        assert history[0]["task_id"] == "task1"
        assert history[1]["task_id"] == "task2"

    @pytest.mark.asyncio
    async def test_clear_history(self, executor):
        await executor.execute_task("task1", "Task 1", "Description 1")
        assert len(executor.get_task_history()) == 1

        executor.clear_history()
        assert len(executor.get_task_history()) == 0
        assert executor.stats.tasks_completed == 0

    @pytest.mark.asyncio
    async def test_set_parent_agent(self, executor):
        executor.set_parent_agent("parent_agent")
        assert executor._parent_agent == "parent_agent"

    @pytest.mark.asyncio
    async def test_set_task_executor(self, executor):
        async def custom_executor(task_id, task_name, description):
            return {"custom": True, "task_id": task_id}

        executor.set_task_executor(custom_executor)
        result = await executor.execute_task("task1", "Test", "Test")
        assert result["custom"] is True


class TestCollaborativeAgent:
    @pytest.mark.asyncio
    async def test_add_executor(self, collaborative_agent):
        executor = collaborative_agent.add_executor("frontend", ["coding"])
        assert "frontend" in collaborative_agent.list_executors()
        assert executor.name == "frontend"

    @pytest.mark.asyncio
    async def test_remove_executor(self, collaborative_agent):
        collaborative_agent.add_executor("frontend", ["coding"])
        collaborative_agent.remove_executor("frontend")
        assert "frontend" not in collaborative_agent.list_executors()

    @pytest.mark.asyncio
    async def test_start_and_stop(self, collaborative_agent):
        collaborative_agent.add_executor("executor1", ["coding"])
        await collaborative_agent.start()
        assert collaborative_agent._running is True

        await collaborative_agent.stop()
        assert collaborative_agent._running is False

    @pytest.mark.asyncio
    async def test_execute_task(self, collaborative_agent):
        collaborative_agent.add_executor("frontend", ["frontend", "coding"])
        collaborative_agent.add_executor("backend", ["backend", "coding"])
        await collaborative_agent.start()

        result = await collaborative_agent.execute_task("Build a web application")
        assert result is not None
        assert "plan_id" in result
        assert "results" in result
        assert result["status"] == TaskStatus.COMPLETED.value

        await collaborative_agent.stop()

    @pytest.mark.asyncio
    async def test_get_status(self, collaborative_agent):
        collaborative_agent.add_executor("executor1", ["coding"])
        status = collaborative_agent.get_status()

        assert "coordinator" in status
        assert "executors" in status
        assert "executor1" in status["executors"]

    @pytest.mark.asyncio
    async def test_get_plan_progress(self, collaborative_agent):
        collaborative_agent.add_executor("executor1", ["coding"])
        await collaborative_agent.start()

        await collaborative_agent.execute_task("Test task")
        progress = collaborative_agent.get_plan_progress()

        assert progress is not None
        assert "plan_id" in progress
        assert "progress" in progress

        await collaborative_agent.stop()

    @pytest.mark.asyncio
    async def test_get_executor_stats(self, collaborative_agent):
        collaborative_agent.add_executor("executor1", ["coding"])
        await collaborative_agent.start()

        await collaborative_agent.execute_task("Test task")
        stats = collaborative_agent.get_executor_stats()

        assert "executor1" in stats
        assert "tasks_completed" in stats["executor1"]

        await collaborative_agent.stop()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])