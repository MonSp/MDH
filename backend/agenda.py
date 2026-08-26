import time
from dataclasses import dataclass
from typing import List, Optional, Callable, Dict
from enum import Enum


class AgendaPhase(str, Enum):
    IDLE = "idle"
    OPEN_TOPIC = "open_topic"
    DISCUSSION = "discussion"
    PROPOSAL = "proposal"
    VOTING = "voting"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    CLOSED = "closed"
    EMERGENCY = "emergency"


VALID_TRANSITIONS: Dict[AgendaPhase, List[AgendaPhase]] = {
    AgendaPhase.IDLE: [AgendaPhase.OPEN_TOPIC, AgendaPhase.EMERGENCY],
    AgendaPhase.OPEN_TOPIC: [AgendaPhase.DISCUSSION, AgendaPhase.CLOSED, AgendaPhase.EMERGENCY],
    AgendaPhase.DISCUSSION: [AgendaPhase.PROPOSAL, AgendaPhase.CLOSED, AgendaPhase.EMERGENCY],
    AgendaPhase.PROPOSAL: [AgendaPhase.VOTING, AgendaPhase.DISCUSSION, AgendaPhase.CLOSED, AgendaPhase.EMERGENCY],
    AgendaPhase.VOTING: [AgendaPhase.ACCEPTED, AgendaPhase.REJECTED, AgendaPhase.EMERGENCY],
    AgendaPhase.ACCEPTED: [AgendaPhase.CLOSED, AgendaPhase.DISCUSSION, AgendaPhase.EMERGENCY],
    AgendaPhase.REJECTED: [AgendaPhase.DISCUSSION, AgendaPhase.CLOSED, AgendaPhase.EMERGENCY],
    AgendaPhase.EMERGENCY: [AgendaPhase.DISCUSSION],
    AgendaPhase.CLOSED: [AgendaPhase.IDLE],
}

EMERGENCY_ALLOWED = [
    AgendaPhase.IDLE,
    AgendaPhase.OPEN_TOPIC,
    AgendaPhase.DISCUSSION,
    AgendaPhase.PROPOSAL,
    AgendaPhase.VOTING,
    AgendaPhase.ACCEPTED,
    AgendaPhase.REJECTED,
]


@dataclass
class SpeakingToken:
    agent_id: str
    granted_at: float
    expires_at: float
    relevance_score: float = 0.0


@dataclass
class AgendaEvent:
    type: str
    timestamp: float
    from_phase: Optional[AgendaPhase] = None
    to_phase: Optional[AgendaPhase] = None
    agent_id: Optional[str] = None
    reason: Optional[str] = None


class AgendaStateMachine:
    TOKEN_DURATION = 60.0

    def __init__(self):
        self._phase: AgendaPhase = AgendaPhase.IDLE
        self._current_token: Optional[SpeakingToken] = None
        self._token_queue: List[SpeakingToken] = []
        self._event_history: List[AgendaEvent] = []
        self._listeners: List[Callable] = []
        self._topic: str = ""

    def get_phase(self) -> AgendaPhase:
        self._check_token_expiration()
        return self._phase

    def get_current_speaker(self) -> Optional[str]:
        self._check_token_expiration()
        if self._current_token:
            return self._current_token.agent_id
        return None

    def open_topic(self, topic: str) -> bool:
        if not self._can_transition(AgendaPhase.OPEN_TOPIC):
            return False
        self._topic = topic
        self._transition(AgendaPhase.OPEN_TOPIC, "open_topic")
        return True

    def start_discussion(self) -> bool:
        if not self._can_transition(AgendaPhase.DISCUSSION):
            return False
        self._transition(AgendaPhase.DISCUSSION, "start_discussion")
        return True

    def propose(self, proposal_id: str) -> bool:
        if not self._can_transition(AgendaPhase.PROPOSAL):
            return False
        self._transition(AgendaPhase.PROPOSAL, "propose")
        return True

    def start_voting(self) -> bool:
        if not self._can_transition(AgendaPhase.VOTING):
            return False
        self._transition(AgendaPhase.VOTING, "start_voting")
        return True

    def accept(self) -> bool:
        if not self._can_transition(AgendaPhase.ACCEPTED):
            return False
        self._transition(AgendaPhase.ACCEPTED, "accept")
        return True

    def reject(self) -> bool:
        if not self._can_transition(AgendaPhase.REJECTED):
            return False
        self._transition(AgendaPhase.REJECTED, "reject")
        return True

    def close(self) -> bool:
        if not self._can_transition(AgendaPhase.CLOSED):
            return False
        self._transition(AgendaPhase.CLOSED, "close")
        return True

    def declare_emergency(self, reason: str) -> bool:
        if self._phase not in EMERGENCY_ALLOWED:
            return False
        from_phase = self._phase
        self._phase = AgendaPhase.EMERGENCY
        self._emit(AgendaEvent(
            type="emergency_declared",
            from_phase=from_phase,
            to_phase=AgendaPhase.EMERGENCY,
            timestamp=time.time(),
            reason=reason,
        ))
        return True

    def resolve_emergency(self) -> bool:
        if self._phase != AgendaPhase.EMERGENCY:
            return False
        self._transition(AgendaPhase.DISCUSSION, "resolve_emergency")
        return True

    def request_token(self, agent_id: str, relevance_score: float) -> bool:
        now = time.time()
        if self._current_token is None:
            self._current_token = SpeakingToken(
                agent_id=agent_id,
                granted_at=now,
                expires_at=now + self.TOKEN_DURATION,
                relevance_score=relevance_score,
            )
            self._emit(AgendaEvent(
                type="token_granted",
                agent_id=agent_id,
                timestamp=now,
            ))
            return True
        token = SpeakingToken(
            agent_id=agent_id,
            granted_at=0,
            expires_at=0,
            relevance_score=relevance_score,
        )
        self._token_queue.append(token)
        self._token_queue.sort(key=lambda t: t.relevance_score, reverse=True)
        return True

    def release_token(self) -> None:
        if self._current_token is None:
            return
        now = time.time()
        self._current_token = None
        if self._token_queue:
            next_token = self._token_queue.pop(0)
            self._current_token = SpeakingToken(
                agent_id=next_token.agent_id,
                granted_at=now,
                expires_at=now + self.TOKEN_DURATION,
                relevance_score=next_token.relevance_score,
            )
            self._emit(AgendaEvent(
                type="token_granted",
                agent_id=next_token.agent_id,
                timestamp=now,
            ))

    def force_token(self, agent_id: str, reason: str) -> bool:
        now = time.time()
        if self._current_token:
            self._emit(AgendaEvent(
                type="token_revoked",
                agent_id=self._current_token.agent_id,
                timestamp=now,
                reason=reason,
            ))
        self._token_queue = [t for t in self._token_queue if t.agent_id != agent_id]
        self._current_token = SpeakingToken(
            agent_id=agent_id,
            granted_at=now,
            expires_at=now + self.TOKEN_DURATION,
            relevance_score=float("inf"),
        )
        self._emit(AgendaEvent(
            type="token_granted",
            agent_id=agent_id,
            timestamp=now,
            reason=reason,
        ))
        return True

    def add_listener(self, listener: Callable) -> None:
        self._listeners.append(listener)

    def remove_listener(self, listener: Callable) -> None:
        self._listeners = [l for l in self._listeners if l is not listener]

    def get_event_history(self) -> List[AgendaEvent]:
        return list(self._event_history)

    def get_token_queue(self) -> List[SpeakingToken]:
        return list(self._token_queue)

    def reset(self) -> None:
        self._phase = AgendaPhase.IDLE
        self._current_token = None
        self._token_queue = []
        self._topic = ""

    def _can_transition(self, to: AgendaPhase) -> bool:
        allowed = VALID_TRANSITIONS.get(self._phase, [])
        return to in allowed

    def _transition(self, to: AgendaPhase, trigger: str) -> None:
        from_phase = self._phase
        self._phase = to
        self._emit(AgendaEvent(
            type="phase_change",
            from_phase=from_phase,
            to_phase=to,
            timestamp=time.time(),
        ))

    def _emit(self, event: AgendaEvent) -> None:
        self._event_history.append(event)
        for listener in self._listeners:
            listener(event)

    def _check_token_expiration(self) -> None:
        if self._current_token is None:
            return
        if time.time() >= self._current_token.expires_at:
            self.release_token()
