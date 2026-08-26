# Multi-Agent Collaboration Module
# This module provides extensions for multi-agent collaboration
# without modifying the original agentscope submodule code.

from .communication import CommunicationInterface, InMemoryCommunication, CommunicationManager, Message, MessageType
from .planner_agent import PlannerAgent
from .executor_agent import ExecutorAgent
from .collaborative_agent import CollaborativeAgent

__all__ = [
    "CommunicationInterface",
    "InMemoryCommunication",
    "CommunicationManager",
    "Message",
    "MessageType",
    "PlannerAgent",
    "ExecutorAgent",
    "CollaborativeAgent",
]
