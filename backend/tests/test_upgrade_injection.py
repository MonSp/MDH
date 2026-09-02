"""P0 评审第二轮：升级路径构造点统一（simple_executor.upgrade_to_complex 注入）。

修复闭环核验点（Important，与 ceo_agent 复杂路径/server start_meeting 构造点同意图）：
- 升级路径 MeetingCoordinator 必须注入会话级 approval_manager（否则审批静默自动通过）
- 必须注入共享 workflow_engine 并通过 on_coordinator_created 注册活动协调器
  （否则共享引擎委托执行器无法路由，工作流节点执行失败）
"""

import pytest


class _FakeProjectManager:
    def create_project(self, name, brief):
        class P:
            project_id = "upgrade-p1"
        return P()


class _FakeSession:
    provider = "openai"
    model_name = "gpt-4"
    api_key = "test-key"
    base_url = ""
    meeting_session = None
    meeting_mode = False
    _approval_manager = None
    _meeting_coordinator = None


@pytest.mark.asyncio
async def test_upgrade_to_complex_injects_approval_manager_and_engine(monkeypatch, tmp_path):
    """升级路径协调器注入会话级 approval_manager 与共享 workflow_engine，并注册活动协调器。"""
    from approval_manager import ApprovalManager
    from meeting_coordinator import MeetingCoordinator
    from simple_executor import SimpleExecutor
    from workflow_engine import WorkflowEngine

    shared = WorkflowEngine()
    registered = {}
    created = {}

    async def fake_process_user_message(self, user_message, on_message):
        created["coordinator"] = self
        return {"type": "task_result", "path_used": "complex"}

    monkeypatch.setattr(
        MeetingCoordinator, "process_user_message", fake_process_user_message
    )

    def on_coordinator_created(coord):
        registered["coordinator"] = coord

    se = SimpleExecutor(
        project_manager=_FakeProjectManager(),
        workflow_engine=shared,
        on_coordinator_created=on_coordinator_created,
    )
    session = _FakeSession()

    async def on_progress(agent_id, text, delta):
        return None

    result = await se.upgrade_to_complex(session, "做一个前端+后端项目", on_progress)

    assert result["type"] == "path_upgrade"
    coordinator = session._meeting_coordinator
    assert coordinator is created["coordinator"]
    # 审批注入：会话级实例（server human_approval_response 解析同一实例）
    assert session._approval_manager is not None
    assert coordinator._approval_manager is session._approval_manager
    assert isinstance(session._approval_manager, ApprovalManager)
    # 工作流共享引擎注入 + 活动协调器注册（共享引擎委托可路由）
    assert coordinator.workflow_engine is shared
    assert registered.get("coordinator") is coordinator


@pytest.mark.asyncio
async def test_upgrade_to_complex_reuses_existing_session_approval_manager(monkeypatch):
    """会话已存在 approval_manager 时（unified_message 分支已创建），升级路径复用同一实例。"""
    from approval_manager import ApprovalManager
    from meeting_coordinator import MeetingCoordinator
    from simple_executor import SimpleExecutor

    async def fake_process_user_message(self, user_message, on_message):
        return {"type": "task_result"}

    monkeypatch.setattr(
        MeetingCoordinator, "process_user_message", fake_process_user_message
    )

    se = SimpleExecutor(project_manager=_FakeProjectManager())
    session = _FakeSession()
    session._approval_manager = ApprovalManager()  # 已有会话级实例

    async def on_progress(agent_id, text, delta):
        return None

    await se.upgrade_to_complex(session, "做一个前端+后端项目", on_progress)

    assert session._meeting_coordinator._approval_manager is session._approval_manager


def test_simple_executor_accepts_engine_and_callback():
    """SimpleExecutor 构造接受共享引擎与协调器创建回调。"""
    from simple_executor import SimpleExecutor
    from workflow_engine import WorkflowEngine

    shared = WorkflowEngine()

    def cb(coord):
        pass

    se = SimpleExecutor(
        project_manager=_FakeProjectManager(),
        workflow_engine=shared,
        on_coordinator_created=cb,
    )
    assert se._workflow_engine is shared
    assert se._on_coordinator_created is cb


def test_ceo_agent_accepts_on_coordinator_created():
    """CeoAgent 构造接受 on_coordinator_created 回调（server 注入更新活动协调器）。"""
    from ceo_agent import CeoAgent

    class _FakeSession:
        def next_sequence(self):
            return 0

    def cb(coord):
        pass

    agent = CeoAgent(
        session=_FakeSession(),
        project_manager=None,
        complexity_classifier=None,
        simple_executor=None,
        on_coordinator_created=cb,
    )
    assert agent._on_coordinator_created is cb
