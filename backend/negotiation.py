import time
import uuid
from dataclasses import dataclass, field
from enum import Enum


class Stance(str, Enum):
    SUPPORT = "support"
    OPPOSE = "oppose"
    MODIFY = "modify"
    NEUTRAL = "neutral"


class ConsensusStrategy(str, Enum):
    SIMPLE_MAJORITY = "simple_majority"


@dataclass
class Proposal:
    id: str
    proposer_id: str
    content: str
    created_at: float = 0.0


@dataclass
class Vote:
    proposal_id: str
    voter_id: str
    approve: bool
    reason: str = ""
    timestamp: float = 0.0


@dataclass
class VoteResult:
    proposal_id: str
    total_votes: int = 0
    approve_count: int = 0
    oppose_count: int = 0
    accepted: bool = False
    timestamp: float = 0.0


@dataclass
class DecisionNode:
    id: str
    proposal_id: str
    decision: str
    supporters: list[str] = field(default_factory=list)
    opposers: list[str] = field(default_factory=list)
    vote_result: VoteResult | None = None
    timestamp: float = 0.0


class NegotiationEngine:
    def __init__(self):
        self._proposals: dict[str, Proposal] = {}
        self._votes: dict[str, list[Vote]] = {}
        self._decision_graph: list[DecisionNode] = []

    def create_proposal(self, proposer_id: str, content: str) -> Proposal:
        proposal = Proposal(
            id=str(uuid.uuid4()),
            proposer_id=proposer_id,
            content=content,
            created_at=time.time(),
        )
        self._proposals[proposal.id] = proposal
        self._votes[proposal.id] = []
        return proposal

    def cast_vote(
        self,
        proposal_id: str,
        voter_id: str,
        approve: bool,
        reason: str = "",
    ) -> Vote | None:
        proposal = self._proposals.get(proposal_id)
        if proposal is None:
            return None

        vote = Vote(
            proposal_id=proposal_id,
            voter_id=voter_id,
            approve=approve,
            reason=reason,
            timestamp=time.time(),
        )
        self._votes.setdefault(proposal_id, []).append(vote)
        return vote

    def evaluate_consensus(self, proposal_id: str) -> VoteResult:
        proposal_votes = self._votes.get(proposal_id, [])
        proposal = self._proposals.get(proposal_id)

        approve_count = sum(1 for v in proposal_votes if v.approve)
        oppose_count = sum(1 for v in proposal_votes if not v.approve)
        total_votes = len(proposal_votes)

        if total_votes == 0:
            result = VoteResult(
                proposal_id=proposal_id,
                total_votes=0,
                accepted=False,
                timestamp=time.time(),
            )
            node = DecisionNode(
                id=str(uuid.uuid4()),
                proposal_id=proposal_id,
                decision="pending",
                vote_result=result,
                timestamp=time.time(),
            )
            self._decision_graph.append(node)
            return result

        accepted = approve_count > oppose_count

        result = VoteResult(
            proposal_id=proposal_id,
            total_votes=total_votes,
            approve_count=approve_count,
            oppose_count=oppose_count,
            accepted=accepted,
            timestamp=time.time(),
        )

        supporters = [v.voter_id for v in proposal_votes if v.approve]
        opposers = [v.voter_id for v in proposal_votes if not v.approve]

        node = DecisionNode(
            id=str(uuid.uuid4()),
            proposal_id=proposal_id,
            decision="accepted" if accepted else "rejected",
            supporters=supporters,
            opposers=opposers,
            vote_result=result,
            timestamp=time.time(),
        )
        self._decision_graph.append(node)

        return result

    def get_decision_graph(self) -> list[DecisionNode]:
        return list(self._decision_graph)

    def reset(self) -> None:
        self._proposals.clear()
        self._votes.clear()
        self._decision_graph.clear()
