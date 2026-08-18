"""投票相关协议类型"""

from dataclasses import dataclass, field
from enum import Enum
from typing import List


class Stance(str, Enum):
    SUPPORT = "support"
    OPPOSE = "oppose"
    MODIFY = "modify"
    NEUTRAL = "neutral"


class ConsensusStrategy(str, Enum):
    SIMPLE_MAJORITY = "simple_majority"
    WEIGHTED_VOTE = "weighted_vote"
    ARGUMENT_BASED = "argument_based"


@dataclass
class ArgumentRef:
    message_id: str
    summary: str = ""


@dataclass
class Proposal:
    id: str
    proposer_id: str
    content: str
    stance: Stance = Stance.NEUTRAL
    confidence: float = 1.0
    argument_refs: List[ArgumentRef] = field(default_factory=list)
    created_at: float = 0.0


@dataclass
class Vote:
    proposal_id: str
    voter_id: str
    approve: bool
    weight: float = 1.0
    reason: str = ""


@dataclass
class VoteResult:
    proposal_id: str
    strategy: ConsensusStrategy
    total_votes: int = 0
    approve_count: int = 0
    oppose_count: int = 0
    weighted_approve: float = 0.0
    weighted_oppose: float = 0.0
    accepted: bool = False


# ── 序列化函数 ──

def argument_ref_to_dict(ref: ArgumentRef) -> dict:
    return {
        "message_id": ref.message_id,
        "summary": ref.summary,
    }


def proposal_to_dict(proposal: Proposal) -> dict:
    return {
        "id": proposal.id,
        "proposer_id": proposal.proposer_id,
        "content": proposal.content,
        "stance": proposal.stance.value,
        "confidence": proposal.confidence,
        "argument_refs": [argument_ref_to_dict(r) for r in proposal.argument_refs],
        "created_at": proposal.created_at,
    }


def vote_to_dict(vote: Vote) -> dict:
    return {
        "proposal_id": vote.proposal_id,
        "voter_id": vote.voter_id,
        "approve": vote.approve,
        "weight": vote.weight,
        "reason": vote.reason,
    }


def vote_result_to_dict(result: VoteResult) -> dict:
    return {
        "proposal_id": result.proposal_id,
        "strategy": result.strategy.value,
        "total_votes": result.total_votes,
        "approve_count": result.approve_count,
        "oppose_count": result.oppose_count,
        "weighted_approve": result.weighted_approve,
        "weighted_oppose": result.weighted_oppose,
        "accepted": result.accepted,
    }


def dict_to_argument_ref(data: dict) -> ArgumentRef:
    return ArgumentRef(
        message_id=data["message_id"],
        summary=data.get("summary", ""),
    )


def dict_to_proposal(data: dict) -> Proposal:
    return Proposal(
        id=data["id"],
        proposer_id=data["proposer_id"],
        content=data["content"],
        stance=Stance(data["stance"]) if "stance" in data else Stance.NEUTRAL,
        confidence=data.get("confidence", 1.0),
        argument_refs=[dict_to_argument_ref(r) for r in data.get("argument_refs", [])],
        created_at=data.get("created_at", 0.0),
    )


def dict_to_vote(data: dict) -> Vote:
    return Vote(
        proposal_id=data["proposal_id"],
        voter_id=data["voter_id"],
        approve=data["approve"],
        weight=data.get("weight", 1.0),
        reason=data.get("reason", ""),
    )


def dict_to_vote_result(data: dict) -> VoteResult:
    return VoteResult(
        proposal_id=data["proposal_id"],
        strategy=ConsensusStrategy(data["strategy"]),
        total_votes=data.get("total_votes", 0),
        approve_count=data.get("approve_count", 0),
        oppose_count=data.get("oppose_count", 0),
        weighted_approve=data.get("weighted_approve", 0.0),
        weighted_oppose=data.get("weighted_oppose", 0.0),
        accepted=data.get("accepted", False),
    )
