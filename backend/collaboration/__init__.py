# Multi-Agent Collaboration Module
# This module provides extensions for multi-agent collaboration
# without modifying the original agentscope submodule code.

from .collaborative_agent import CollaborativeAgent
from .communication import (
    CommunicationInterface,
    CommunicationManager,
    InMemoryCommunication,
    Message,
    MessageType,
)
from .executor_agent import ExecutorAgent
from .planner_agent import PlannerAgent

__all__ = [
    "CollaborativeAgent",
    "CommunicationInterface",
    "CommunicationManager",
    "ExecutorAgent",
    "InMemoryCommunication",
    "Message",
    "MessageType",
    "PlannerAgent",
]
