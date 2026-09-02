"""Tests for negotiation.py — NegotiationEngine vote logic"""
import pytest

from negotiation import (
    ConsensusStrategy,
    NegotiationEngine,
)


@pytest.fixture
def engine():
    return NegotiationEngine()


# ── 基础投票 ──

def test_create_proposal(engine):
    p = engine.create_proposal("agent-coordinator", "方案A")
    assert p.proposer_id == "agent-coordinator"
    assert p.id in engine._proposals


def test_cast_vote_and_evaluate(engine):
    p = engine.create_proposal("agent-coordinator", "方案A")
    engine.cast_vote(p.id, "agent-executor", True, reason="赞成")
    engine.cast_vote(p.id, "agent-planner", True, reason="赞成")
    engine.cast_vote(p.id, "agent-reviewer", False, reason="反对")

    result = engine.evaluate_consensus(p.id)
    assert result.total_votes == 3
    assert result.approve_count == 2
    assert result.oppose_count == 1
    assert result.accepted is True  # 2 > 1


def test_rejected_when_oppose_majority(engine):
    p = engine.create_proposal("agent-coordinator", "方案B")
    engine.cast_vote(p.id, "agent-executor", False)
    engine.cast_vote(p.id, "agent-planner", False)
    engine.cast_vote(p.id, "agent-reviewer", True)

    result = engine.evaluate_consensus(p.id)
    assert result.accepted is False


def test_no_votes_returns_pending(engine):
    p = engine.create_proposal("agent-coordinator", "方案C")
    result = engine.evaluate_consensus(p.id)
    assert result.total_votes == 0
    assert result.accepted is False
    graph = engine.get_decision_graph()
    assert graph[-1].decision == "pending"


# ── stance → vote 映射 (模拟 meeting_coordinator 的逻辑) ──

def test_stance_oppose_maps_to_reject():
    """验证 oppose stance 产生 reject 投票的逻辑"""
    engine = NegotiationEngine()
    p = engine.create_proposal("coordinator", "方案")

    stances = [
        ("agent-executor", "support", 0.9),
        ("agent-planner", "oppose", 0.7),
        ("agent-reviewer", "modify", 0.6),
        ("agent-monitor", "neutral", 0.3),
    ]

    for agent_id, stance, confidence in stances:
        if stance == "oppose":
            approve = False
        elif stance == "modify" or stance == "support":
            approve = True
        else:  # neutral
            approve = confidence >= 0.4

        engine.cast_vote(p.id, agent_id, approve, reason=f"stance={stance}")

    result = engine.evaluate_consensus(p.id)
    assert result.approve_count == 2   # support + modify
    assert result.oppose_count == 2    # oppose + neutral(confidence<0.4)
    assert result.accepted is False    # 2 vs 2, not >


def test_stance_neutral_high_confidence_approves():
    """neutral + high confidence → approve"""
    engine = NegotiationEngine()
    p = engine.create_proposal("coordinator", "方案")

    engine.cast_vote(p.id, "agent-a", True, reason="support")
    engine.cast_vote(p.id, "agent-b", True, reason="neutral conf=0.7")

    result = engine.evaluate_consensus(p.id)
    assert result.accepted is True


# ── 决策图 ──

def test_decision_graph_records_supporters_and_opposers(engine):
    p = engine.create_proposal("coordinator", "方案")
    engine.cast_vote(p.id, "agent-a", True)
    engine.cast_vote(p.id, "agent-b", True)
    engine.cast_vote(p.id, "agent-c", False)
    engine.evaluate_consensus(p.id)

    graph = engine.get_decision_graph()
    node = graph[-1]
    assert "agent-a" in node.supporters
    assert "agent-b" in node.supporters
    assert "agent-c" in node.opposers
    assert node.decision == "accepted"


# ── reset ──

def test_reset_clears_all(engine):
    p = engine.create_proposal("coordinator", "方案")
    engine.cast_vote(p.id, "agent-a", True)
    engine.evaluate_consensus(p.id)

    engine.reset()
    assert engine._proposals == {}
    assert engine._votes == {}
    assert engine._decision_graph == []


# ── 边界情况 ──

def test_vote_on_nonexistent_proposal(engine):
    assert engine.cast_vote("nonexistent", "agent-a", True) is None


def test_simple_majority_strategy_enum():
    """ConsensusStrategy 仅保留 SIMPLE_MAJORITY"""
    assert ConsensusStrategy.SIMPLE_MAJORITY.value == "simple_majority"
    assert len(ConsensusStrategy) == 1
