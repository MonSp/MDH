import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from protocol import (
    AgentRole,
    MeetingAgentInfo,
    MeetingAgentStatus,
    MeetingMessageType,
    MeetingSummary,
    MeetingTaskInfo,
    meeting_agent_to_dict,
    meeting_summary_to_dict,
    meeting_task_to_dict,
)
from meeting import MeetingSession, DEFAULT_MEETING_AGENTS


@pytest.fixture
def meeting():
    session = MeetingSession("test-meeting-001")
    return session


@pytest.fixture
def started_meeting():
    session = MeetingSession("test-meeting-002")
    session.start()
    return session


class TestProtocol:
    def test_meeting_message_type_values(self):
        assert MeetingMessageType.START_MEETING.value == "start_meeting"
        assert MeetingMessageType.END_MEETING.value == "end_meeting"
        assert MeetingMessageType.AGENT_MESSAGE.value == "agent_message"
        assert MeetingMessageType.TASK_ASSIGNED.value == "task_assigned"
        assert MeetingMessageType.MEETING_ERROR.value == "meeting_error"

    def test_agent_role_values(self):
        assert AgentRole.PLANNER.value == "planner"
        assert AgentRole.EXECUTOR.value == "executor"
        assert AgentRole.MONITOR.value == "monitor"
        assert AgentRole.REVIEWER.value == "reviewer"
        assert AgentRole.COORDINATOR.value == "coordinator"

    def test_meeting_agent_status_values(self):
        assert MeetingAgentStatus.IDLE.value == "idle"
        assert MeetingAgentStatus.MEETING.value == "meeting"
        assert MeetingAgentStatus.WORKING.value == "working"
        assert MeetingAgentStatus.SPEAKING.value == "speaking"

    def test_meeting_agent_info_creation(self):
        agent = MeetingAgentInfo(
            id="agent-1",
            name="Test Agent",
            role=AgentRole.PLANNER,
            status=MeetingAgentStatus.IDLE,
            capabilities=["planning"],
        )
        assert agent.id == "agent-1"
        assert agent.name == "Test Agent"
        assert agent.role == AgentRole.PLANNER
        assert agent.status == MeetingAgentStatus.IDLE
        assert agent.capabilities == ["planning"]

    def test_meeting_agent_info_default_capabilities(self):
        agent = MeetingAgentInfo(
            id="agent-1",
            name="Test",
            role=AgentRole.EXECUTOR,
            status=MeetingAgentStatus.IDLE,
        )
        assert agent.capabilities == []

    def test_meeting_task_info_creation(self):
        task = MeetingTaskInfo(
            id="task-1",
            agent_id="agent-1",
            description="Test task",
            status="pending",
            created_at=1000.0,
        )
        assert task.id == "task-1"
        assert task.agent_id == "agent-1"
        assert task.description == "Test task"
        assert task.status == "pending"

    def test_meeting_summary_creation(self):
        summary = MeetingSummary(
            total_agents=6,
            total_tasks=3,
            completed_tasks=1,
            failed_tasks=0,
            pending_tasks=2,
            messages_count=10,
        )
        assert summary.total_agents == 6
        assert summary.total_tasks == 3
        assert summary.messages_count == 10

    def test_meeting_agent_to_dict(self):
        agent = MeetingAgentInfo(
            id="agent-planner",
            name="Planner",
            role=AgentRole.PLANNER,
            status=MeetingAgentStatus.MEETING,
            capabilities=["task_decomposition"],
        )
        result = meeting_agent_to_dict(agent)
        assert result["id"] == "agent-planner"
        assert result["name"] == "Planner"
        assert result["role"] == "planner"
        assert result["status"] == "meeting"
        assert result["capabilities"] == ["task_decomposition"]

    def test_meeting_task_to_dict(self):
        task = MeetingTaskInfo(
            id="task-1",
            agent_id="agent-1",
            description="Build frontend",
            status="assigned",
            created_at=1234567890.0,
        )
        result = meeting_task_to_dict(task)
        assert result["id"] == "task-1"
        assert result["agent_id"] == "agent-1"
        assert result["description"] == "Build frontend"
        assert result["status"] == "assigned"
        assert result["created_at"] == 1234567890.0

    def test_meeting_summary_to_dict(self):
        summary = MeetingSummary(
            total_agents=6,
            total_tasks=3,
            completed_tasks=2,
            failed_tasks=1,
            pending_tasks=0,
            messages_count=15,
        )
        result = meeting_summary_to_dict(summary)
        assert result["total_agents"] == 6
        assert result["total_tasks"] == 3
        assert result["completed_tasks"] == 2
        assert result["failed_tasks"] == 1
        assert result["pending_tasks"] == 0
        assert result["messages_count"] == 15


class TestMeetingSession:
    def test_init(self, meeting):
        assert meeting.meeting_id == "test-meeting-001"
        assert meeting.agents == []
        assert meeting.tasks == []
        assert meeting.messages == []
        assert meeting.is_running() is False

    def test_start(self, meeting):
        meeting.start()
        assert meeting.is_running() is True
        assert len(meeting.agents) == 6

        agent_ids = [a.id for a in meeting.agents]
        assert "agent-ceo" in agent_ids
        assert "agent-planner" in agent_ids
        assert "agent-executor" in agent_ids
        assert "agent-monitor" in agent_ids
        assert "agent-reviewer" in agent_ids
        assert "agent-coordinator" in agent_ids

        for agent in meeting.agents:
            assert agent.status == MeetingAgentStatus.MEETING

    def test_start_agents_have_correct_roles(self, started_meeting):
        role_map = {a.id: a.role for a in started_meeting.agents}
        assert role_map["agent-ceo"] == AgentRole.CEO
        assert role_map["agent-planner"] == AgentRole.PLANNER
        assert role_map["agent-executor"] == AgentRole.EXECUTOR
        assert role_map["agent-monitor"] == AgentRole.MONITOR
        assert role_map["agent-reviewer"] == AgentRole.REVIEWER
        assert role_map["agent-coordinator"] == AgentRole.COORDINATOR

    def test_start_agents_have_capabilities(self, started_meeting):
        planner = started_meeting.get_agent("agent-planner")
        assert "task_decomposition" in planner.capabilities
        assert "data_analysis" in planner.capabilities

        executor = started_meeting.get_agent("agent-executor")
        assert "browser_automation" in executor.capabilities
        assert "code_generation" in executor.capabilities

    def test_stop(self, started_meeting):
        assert started_meeting.is_running() is True
        started_meeting.stop()
        assert started_meeting.is_running() is False
        for agent in started_meeting.agents:
            assert agent.status == MeetingAgentStatus.IDLE

    def test_get_agent(self, started_meeting):
        agent = started_meeting.get_agent("agent-planner")
        assert agent is not None
        assert agent.id == "agent-planner"
        assert agent.name == "架构师-Alpha"

    def test_get_agent_not_found(self, started_meeting):
        agent = started_meeting.get_agent("nonexistent")
        assert agent is None

    def test_update_agent_status(self, started_meeting):
        started_meeting.update_agent_status("agent-executor", MeetingAgentStatus.WORKING)
        agent = started_meeting.get_agent("agent-executor")
        assert agent.status == MeetingAgentStatus.WORKING

    def test_update_agent_status_not_found(self, started_meeting):
        with pytest.raises(ValueError, match="Agent not found"):
            started_meeting.update_agent_status("nonexistent", MeetingAgentStatus.WORKING)

    def test_add_task(self, started_meeting):
        task = started_meeting.add_task("agent-executor", "Build the frontend")
        assert task.agent_id == "agent-executor"
        assert task.description == "Build the frontend"
        assert task.status == "pending"
        assert len(started_meeting.tasks) == 1

    def test_add_multiple_tasks(self, started_meeting):
        started_meeting.add_task("agent-executor", "Task 1")
        started_meeting.add_task("agent-monitor", "Task 2")
        started_meeting.add_task("agent-reviewer", "Task 3")
        assert len(started_meeting.tasks) == 3

    def test_update_task_status(self, started_meeting):
        task = started_meeting.add_task("agent-executor", "Build frontend")
        assert task.status == "pending"

        started_meeting.update_task_status(task.id, "assigned")
        assert task.status == "assigned"

        started_meeting.update_task_status(task.id, "completed")
        assert task.status == "completed"

    def test_update_task_status_not_found(self, started_meeting):
        with pytest.raises(ValueError, match="Task not found"):
            started_meeting.update_task_status("nonexistent", "completed")

    def test_add_message(self, started_meeting):
        msg = started_meeting.add_message("boss", "Let's start the meeting")
        assert msg["role"] == "boss"
        assert msg["content"] == "Let's start the meeting"
        assert msg["agent_id"] is None
        assert "id" in msg
        assert "timestamp" in msg
        assert len(started_meeting.messages) == 1

    def test_add_message_with_agent(self, started_meeting):
        msg = started_meeting.add_message("agent", "I agree", "agent-planner")
        assert msg["role"] == "agent"
        assert msg["agent_id"] == "agent-planner"

    def test_get_agents_dict(self, started_meeting):
        agents_dict = started_meeting.get_agents_dict()
        assert len(agents_dict) == 6
        for d in agents_dict:
            assert "id" in d
            assert "name" in d
            assert "role" in d
            assert "status" in d
            assert "capabilities" in d

    def test_get_tasks_dict(self, started_meeting):
        started_meeting.add_task("agent-executor", "Task 1")
        started_meeting.add_task("agent-monitor", "Task 2")
        tasks_dict = started_meeting.get_tasks_dict()
        assert len(tasks_dict) == 2
        for d in tasks_dict:
            assert "id" in d
            assert "agent_id" in d
            assert "description" in d
            assert "status" in d
            assert "created_at" in d

    def test_get_summary_empty(self, started_meeting):
        summary = started_meeting.get_summary()
        assert summary["total_agents"] == 6
        assert summary["total_tasks"] == 0
        assert summary["completed_tasks"] == 0
        assert summary["failed_tasks"] == 0
        assert summary["pending_tasks"] == 0
        assert summary["messages_count"] == 0

    def test_get_summary_with_data(self, started_meeting):
        task1 = started_meeting.add_task("agent-executor", "Task 1")
        task2 = started_meeting.add_task("agent-monitor", "Task 2")
        started_meeting.update_task_status(task1.id, "completed")
        started_meeting.add_message("boss", "Hello")
        started_meeting.add_message("agent", "Hi", "agent-planner")

        summary = started_meeting.get_summary()
        assert summary["total_agents"] == 6
        assert summary["total_tasks"] == 2
        assert summary["completed_tasks"] == 1
        assert summary["pending_tasks"] == 1
        assert summary["messages_count"] == 2

    def test_cleanup(self, started_meeting):
        started_meeting.add_task("agent-executor", "Task")
        started_meeting.add_message("boss", "msg")
        assert len(started_meeting.agents) > 0
        assert len(started_meeting.tasks) > 0
        assert len(started_meeting.messages) > 0

        started_meeting.cleanup()
        assert len(started_meeting.agents) == 0
        assert len(started_meeting.tasks) == 0
        assert len(started_meeting.messages) == 0

    def test_default_meeting_agents_count(self):
        assert len(DEFAULT_MEETING_AGENTS) == 6

    def test_default_meeting_agents_unique_ids(self):
        ids = [a["id"] for a in DEFAULT_MEETING_AGENTS]
        assert len(ids) == len(set(ids))

    def test_full_lifecycle(self):
        meeting = MeetingSession("lifecycle-test")
        assert meeting.is_running() is False

        meeting.start()
        assert meeting.is_running() is True
        assert len(meeting.agents) == 6

        meeting.add_message("boss", "Start discussion")
        task = meeting.add_task("agent-executor", "Do something")
        meeting.update_task_status(task.id, "assigned")
        meeting.update_agent_status("agent-executor", MeetingAgentStatus.WORKING)

        agent = meeting.get_agent("agent-executor")
        assert agent.status == MeetingAgentStatus.WORKING

        meeting.update_task_status(task.id, "completed")
        meeting.update_agent_status("agent-executor", MeetingAgentStatus.MEETING)

        summary = meeting.get_summary()
        assert summary["completed_tasks"] == 1
        assert summary["messages_count"] == 1

        meeting.stop()
        assert meeting.is_running() is False
        for a in meeting.agents:
            assert a.status == MeetingAgentStatus.IDLE

        meeting.cleanup()
        assert len(meeting.agents) == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
