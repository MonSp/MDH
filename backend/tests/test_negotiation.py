"""Tests for negotiation.py — NegotiationEngine vote + argument logic"""
import pytest
from negotiation import (
    NegotiationEngine, ConsensusStrategy, Stance,
    Proposal, Vote, VoteResult, DecisionNode,
)


@pytest.fixture
def engine():
    return NegotiationEngine(ConsensusStrategy.SIMPLE_MAJORITY)


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


# ── 加权投票 ──

def test_weighted_vote(engine):
    engine._default_strategy = ConsensusStrategy.WEIGHTED_VOTE
    p = engine.create_proposal("agent-coordinator", "方案D")
    engine.cast_vote(p.id, "agent-executor", True, weight=3.0)
    engine.cast_vote(p.id, "agent-planner", False, weight=1.0)

    result = engine.evaluate_consensus(p.id)
    assert result.weighted_approve == 3.0
    assert result.weighted_oppose == 1.0
    assert result.accepted is True


def test_set_agent_weight(engine):
    engine.set_agent_weight("agent-executor", 2.5)
    assert engine.get_agent_weight("agent-executor") == 2.5
    assert engine.get_agent_weight("unknown") == 1.0


# ── 论据驱动投票 (argument_based) ──

def test_argument_based_vote(engine):
    engine._default_strategy = ConsensusStrategy.ARGUMENT_BASED
    p = engine.create_proposal("agent-coordinator", "方案E")

    # 添加论据
    engine.add_argument(p.id, "agent-executor", Stance.SUPPORT, 0.9, "技术可行")
    engine.add_argument(p.id, "agent-reviewer", Stance.OPPOSE, 0.8, "测试不足")

    # 投票
    engine.cast_vote(p.id, "agent-executor", True)
    engine.cast_vote(p.id, "agent-reviewer", False)

    result = engine.evaluate_consensus(p.id)
    # weighted_approve = 1.0 * 0.9 = 0.9, weighted_oppose = 1.0 * 0.8 = 0.8
    assert result.weighted_approve > result.weighted_oppose
    assert result.accepted is True


def test_argument_based_no_arguments_defaults_to_05(engine):
    engine._default_strategy = ConsensusStrategy.ARGUMENT_BASED
    p = engine.create_proposal("agent-coordinator", "方案F")
    engine.cast_vote(p.id, "agent-executor", True)

    result = engine.evaluate_consensus(p.id)
    # 无论据时 confidence 默认 0.5
    assert result.weighted_approve == 1.0 * 0.5


# ── stance → vote 映射 (模拟 meeting_coordinator 的逻辑) ──

def test_stance_oppose_maps_to_reject():
    """验证 oppose stance 产生 reject 投票的逻辑"""
    engine = NegotiationEngine(ConsensusStrategy.SIMPLE_MAJORITY)
    p = engine.create_proposal("coordinator", "方案")

    # 模拟 meeting_coordinator 中 stance→vote 的映射逻辑
    stances = [
        ("agent-executor", "support", 0.9),
        ("agent-planner", "oppose", 0.7),
        ("agent-reviewer", "modify", 0.6),
        ("agent-monitor", "neutral", 0.3),
    ]

    for agent_id, stance, confidence in stances:
        if stance == "oppose":
            approve = False
        elif stance == "modify":
            approve = True
        elif stance == "support":
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
    engine = NegotiationEngine(ConsensusStrategy.SIMPLE_MAJORITY)
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
    engine.set_agent_weight("agent-a", 2.0)

    engine.reset()
    assert engine._proposals == {}
    assert engine._votes == {}
    assert engine._decision_graph == []
    assert engine._agent_weights == {}


# ── 边界情况 ──

def test_vote_on_nonexistent_proposal(engine):
    assert engine.cast_vote("nonexistent", "agent-a", True) is None


def test_argument_on_nonexistent_proposal(engine):
    assert engine.add_argument("nonexistent", "agent-a", Stance.SUPPORT, 0.5, "x") is None


def test_confidence_clamped(engine):
    p = engine.create_proposal("coordinator", "方案")
    arg = engine.add_argument(p.id, "agent-a", Stance.SUPPORT, 1.5, "x")
    assert arg.confidence == 1.0
    arg2 = engine.add_argument(p.id, "agent-b", Stance.SUPPORT, -0.5, "y")
    assert arg2.confidence == 0.0
