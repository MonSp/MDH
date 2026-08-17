import time
import uuid
from dataclasses import dataclass, field
from typing import List, Optional, Dict
from enum import Enum


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
class Argument:
    id: str
    agent_id: str
    stance: Stance
    confidence: float
    content: str
    argument_refs: List[ArgumentRef] = field(default_factory=list)
    timestamp: float = 0.0


@dataclass
class Proposal:
    id: str
    proposer_id: str
    content: str
    arguments: List[Argument] = field(default_factory=list)
    created_at: float = 0.0


@dataclass
class Vote:
    proposal_id: str
    voter_id: str
    approve: bool
    weight: float = 1.0
    reason: str = ""
    timestamp: float = 0.0


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
    timestamp: float = 0.0


@dataclass
class DecisionNode:
    id: str
    proposal_id: str
    decision: str
    supporters: List[str] = field(default_factory=list)
    opposers: List[str] = field(default_factory=list)
    arguments: List[Argument] = field(default_factory=list)
    vote_result: Optional[VoteResult] = None
    timestamp: float = 0.0


class NegotiationEngine:
    def __init__(self, default_strategy=ConsensusStrategy.SIMPLE_MAJORITY):
        self._proposals: Dict[str, Proposal] = {}
        self._votes: Dict[str, List[Vote]] = {}
        self._decision_graph: List[DecisionNode] = []
        self._agent_weights: Dict[str, float] = {}
        self._default_strategy = default_strategy

    def create_proposal(self, proposer_id: str, content: str) -> Proposal:
        proposal = Proposal(
            id=str(uuid.uuid4()),
            proposer_id=proposer_id,
            content=content,
            arguments=[],
            created_at=time.time(),
        )
        self._proposals[proposal.id] = proposal
        self._votes[proposal.id] = []
        return proposal

    def add_argument(
        self,
        proposal_id: str,
        agent_id: str,
        stance: Stance,
        confidence: float,
        content: str,
        argument_refs: Optional[List[ArgumentRef]] = None,
    ) -> Optional[Argument]:
        proposal = self._proposals.get(proposal_id)
        if proposal is None:
            return None

        arg = Argument(
            id=str(uuid.uuid4()),
            agent_id=agent_id,
            stance=stance,
            confidence=max(0.0, min(1.0, confidence)),
            content=content,
            argument_refs=argument_refs or [],
            timestamp=time.time(),
        )
        proposal.arguments.append(arg)
        return arg

    def cast_vote(
        self,
        proposal_id: str,
        voter_id: str,
        approve: bool,
        weight: Optional[float] = None,
        reason: str = "",
    ) -> Optional[Vote]:
        proposal = self._proposals.get(proposal_id)
        if proposal is None:
            return None

        agent_weight = weight if weight is not None else self._agent_weights.get(voter_id, 1.0)
        vote = Vote(
            proposal_id=proposal_id,
            voter_id=voter_id,
            approve=approve,
            weight=agent_weight,
            reason=reason,
            timestamp=time.time(),
        )
        self._votes.setdefault(proposal_id, []).append(vote)
        return vote

    def evaluate_consensus(
        self, proposal_id: str, strategy: Optional[ConsensusStrategy] = None
    ) -> VoteResult:
        proposal = self._proposals.get(proposal_id)
        proposal_votes = self._votes.get(proposal_id, [])
        effective_strategy = strategy or self._default_strategy

        approve_count = 0
        oppose_count = 0
        weighted_approve = 0.0
        weighted_oppose = 0.0

        if effective_strategy == ConsensusStrategy.ARGUMENT_BASED and proposal:
            agent_confidence: Dict[str, Dict[str, List[float]]] = {}

            for arg in proposal.arguments:
                if arg.agent_id not in agent_confidence:
                    agent_confidence[arg.agent_id] = {"support": [], "oppose": []}
                entry = agent_confidence[arg.agent_id]
                if arg.stance == Stance.SUPPORT:
                    entry["support"].append(arg.confidence)
                elif arg.stance == Stance.OPPOSE:
                    entry["oppose"].append(arg.confidence)

            for vote in proposal_votes:
                if vote.approve:
                    approve_count += 1
                    conf = agent_confidence.get(vote.voter_id)
                    support_list = conf["support"] if conf else []
                    avg_conf = (
                        sum(support_list) / len(support_list)
                        if support_list
                        else 0.5
                    )
                    weighted_approve += vote.weight * avg_conf
                else:
                    oppose_count += 1
                    conf = agent_confidence.get(vote.voter_id)
                    oppose_list = conf["oppose"] if conf else []
                    avg_conf = (
                        sum(oppose_list) / len(oppose_list)
                        if oppose_list
                        else 0.5
                    )
                    weighted_oppose += vote.weight * avg_conf
        else:
            for vote in proposal_votes:
                if vote.approve:
                    approve_count += 1
                    weighted_approve += vote.weight
                else:
                    oppose_count += 1
                    weighted_oppose += vote.weight

        total_votes = len(proposal_votes)

        # 无票时返回 pending 而非 rejected
        if total_votes == 0:
            result = VoteResult(
                proposal_id=proposal_id,
                strategy=effective_strategy,
                total_votes=0,
                approve_count=0,
                oppose_count=0,
                weighted_approve=0.0,
                weighted_oppose=0.0,
                accepted=False,
                timestamp=time.time(),
            )
            node = DecisionNode(
                id=str(uuid.uuid4()),
                proposal_id=proposal_id,
                decision="pending",
                supporters=[],
                opposers=[],
                arguments=proposal.arguments if proposal else [],
                vote_result=result,
                timestamp=time.time(),
            )
            self._decision_graph.append(node)
            return result

        if effective_strategy == ConsensusStrategy.SIMPLE_MAJORITY:
            accepted = approve_count > oppose_count
        else:
            accepted = weighted_approve > weighted_oppose

        result = VoteResult(
            proposal_id=proposal_id,
            strategy=effective_strategy,
            total_votes=total_votes,
            approve_count=approve_count,
            oppose_count=oppose_count,
            weighted_approve=weighted_approve,
            weighted_oppose=weighted_oppose,
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
            arguments=proposal.arguments if proposal else [],
            vote_result=result,
            timestamp=time.time(),
        )
        self._decision_graph.append(node)

        return result

    def get_decision_graph(self) -> List[DecisionNode]:
        return list(self._decision_graph)

    def set_default_strategy(self, strategy: ConsensusStrategy) -> None:
        self._default_strategy = strategy

    def set_agent_weight(self, agent_id: str, weight: float) -> None:
        self._agent_weights[agent_id] = weight

    def get_agent_weight(self, agent_id: str) -> float:
        return self._agent_weights.get(agent_id, 1.0)

    def reset(self) -> None:
        self._proposals.clear()
        self._votes.clear()
        self._decision_graph.clear()
        self._agent_weights.clear()
