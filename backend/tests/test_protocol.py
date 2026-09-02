"""Tests for protocol.py — data structures and serialization functions"""
from protocol import (
    # LLM fallback
    LLM_FALLBACK_TEMPLATE,
    AgendaPhase,
    AgendaState,
    AgentRole,
    ApprovalRequest,
    ApprovalStatus,
    Checkpoint,
    ConsensusStrategy,
    MeetingAgentInfo,
    MeetingAgentStatus,
    MeetingSummary,
    MeetingTaskInfo,
    Proposal,
    RiskLevel,
    Stance,
    TraceContext,
    Vote,
    VoteResult,
    WorkflowEdge,
    WorkflowExecutionStatus,
    # Dataclasses
    WorkflowNode,
    # Enums
    WorkflowNodeStatus,
    agenda_state_to_dict,
    approval_request_to_dict,
    checkpoint_to_dict,
    dict_to_agenda_state,
    dict_to_approval_request,
    dict_to_checkpoint,
    dict_to_proposal,
    # Deserialization
    dict_to_trace_context,
    dict_to_vote,
    dict_to_vote_result,
    # Serialization
    meeting_agent_to_dict,
    meeting_summary_to_dict,
    meeting_task_to_dict,
    proposal_to_dict,
    trace_context_to_dict,
    vote_result_to_dict,
    vote_to_dict,
)

# ── Enums ──

class TestEnums:
    def test_workflow_node_status(self):
        assert WorkflowNodeStatus.PENDING == "pending"
        assert WorkflowNodeStatus.COMPLETED == "completed"

    def test_workflow_execution_status(self):
        assert WorkflowExecutionStatus.CREATED == "created"
        assert WorkflowExecutionStatus.FAILED == "failed"

    def test_agent_role(self):
        assert AgentRole.CEO == "ceo"
        assert AgentRole.EXECUTOR == "executor"
        assert AgentRole.REVIEWER == "reviewer"

    def test_stance(self):
        assert Stance.SUPPORT == "support"
        assert Stance.OPPOSE == "oppose"
        assert Stance.MODIFY == "modify"
        assert Stance.NEUTRAL == "neutral"

    def test_consensus_strategy(self):
        assert ConsensusStrategy.SIMPLE_MAJORITY == "simple_majority"


# ── Dataclasses ──

class TestDataclasses:
    def test_workflow_node(self):
        node = WorkflowNode(node_id="n1", task_description="test", dept_id="dept-frontend")
        assert node.node_id == "n1"
        assert node.status == WorkflowNodeStatus.PENDING

    def test_workflow_edge(self):
        edge = WorkflowEdge(source_node_id="n1", target_node_id="n2")
        assert edge.condition is None

    def test_meeting_agent_info(self):
        agent = MeetingAgentInfo(
            id="a1", name="Agent-1", role=AgentRole.EXECUTOR,
            status=MeetingAgentStatus.MEETING, capabilities=["code_gen"],
        )
        assert agent.id == "a1"
        assert agent.role == AgentRole.EXECUTOR

    def test_trace_context(self):
        ctx = TraceContext(trace_id="t1", span_id="s1")
        assert ctx.parent_span_id is None

    def test_vote(self):
        v = Vote(proposal_id="p1", voter_id="a1", approve=True)
        assert v.weight == 1.0


# ── Serialization roundtrips ──

class TestSerialization:
    def test_meeting_agent_roundtrip(self):
        agent = MeetingAgentInfo(
            id="a1", name="Test", role=AgentRole.PLANNER,
            status=MeetingAgentStatus.IDLE, capabilities=["planning"],
        )
        d = meeting_agent_to_dict(agent)
        assert d["id"] == "a1"
        assert d["role"] == "planner"
        assert d["status"] == "idle"

    def test_meeting_task_roundtrip(self):
        task = MeetingTaskInfo(id="t1", agent_id="a1", description="do stuff", status="assigned", created_at=1000.0)
        d = meeting_task_to_dict(task)
        assert d["id"] == "t1"
        assert d["agent_id"] == "a1"

    def test_meeting_summary_roundtrip(self):
        summary = MeetingSummary(total_agents=3, total_tasks=5, completed_tasks=2, failed_tasks=1, pending_tasks=2, messages_count=10)
        d = meeting_summary_to_dict(summary)
        assert d["total_agents"] == 3
        assert d["completed_tasks"] == 2

    def test_trace_context_roundtrip(self):
        ctx = TraceContext(trace_id="t1", span_id="s1", parent_span_id="p1")
        d = trace_context_to_dict(ctx)
        assert d["trace_id"] == "t1"
        restored = dict_to_trace_context(d)
        assert restored.trace_id == ctx.trace_id

    def test_agenda_state_roundtrip(self):
        state = AgendaState(phase=AgendaPhase.DISCUSSION, topic="test", current_speaker="a1")
        d = agenda_state_to_dict(state)
        assert d["phase"] == "discussion"
        restored = dict_to_agenda_state(d)
        assert restored.phase == AgendaPhase.DISCUSSION

    def test_proposal_roundtrip(self):
        p = Proposal(id="p1", proposer_id="a1", content="proposal text", stance=Stance.SUPPORT, confidence=0.9)
        d = proposal_to_dict(p)
        assert d["stance"] == "support"
        restored = dict_to_proposal(d)
        assert restored.stance == Stance.SUPPORT

    def test_vote_roundtrip(self):
        v = Vote(proposal_id="p1", voter_id="a1", approve=True, weight=2.0, reason="good idea")
        d = vote_to_dict(v)
        assert d["approve"] is True
        assert d["weight"] == 2.0
        restored = dict_to_vote(d)
        assert restored.approve is True

    def test_vote_result_roundtrip(self):
        vr = VoteResult(proposal_id="p1", total_votes=3, approve_count=2, oppose_count=1, accepted=True)
        d = vote_result_to_dict(vr)
        assert d["accepted"] is True
        restored = dict_to_vote_result(d)
        assert restored.accepted is True

    def test_approval_request_roundtrip(self):
        req = ApprovalRequest(id="ar1", requester_id="a1", operation="bash", description="run tests", risk_level=RiskLevel.HIGH, confidence=0.8, status=ApprovalStatus.PENDING)
        d = approval_request_to_dict(req)
        assert d["risk_level"] == "high"
        restored = dict_to_approval_request(d)
        assert restored.risk_level == RiskLevel.HIGH

    def test_checkpoint_roundtrip(self):
        cp = Checkpoint(id="c1", task_id="t1", step_index=2, state_snapshot={"key": "value"})
        d = checkpoint_to_dict(cp)
        assert d["step_index"] == 2
        restored = dict_to_checkpoint(d)
        assert restored.state_snapshot == {"key": "value"}


# ── Fallback template ──

class TestFallback:
    def test_llm_fallback_template(self):
        result = LLM_FALLBACK_TEMPLATE.format(role="executor", content_type="审查意见")
        assert "executor" in result
        assert "审查意见" in result
