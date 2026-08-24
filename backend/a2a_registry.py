"""
A2A Registry — 执行节点注册中心

管理通过 A2A 协议接入的执行节点（TS Orchestrator、Claude Code Adapter 等）。
每个节点启动时注册 Agent Card，关闭时注销。
"""

import json
import logging
import time
import threading
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger("a2a_registry")


@dataclass
class AgentSkill:
    """A2A Agent Card 中的技能声明"""
    id: str
    name: str
    description: str
    tags: List[str] = field(default_factory=list)
    examples: List[str] = field(default_factory=list)


@dataclass
class AgentCard:
    """A2A Agent Card — 执行节点能力声明"""
    name: str
    description: str
    url: str
    skills: List[AgentSkill] = field(default_factory=list)
    capabilities: Dict = field(default_factory=lambda: {"streaming": True})
    version: str = "1.0.0"


@dataclass
class RegisteredAgent:
    """已注册的执行节点"""
    agent_id: str
    card: AgentCard
    registered_at: float = field(default_factory=time.time)
    last_heartbeat: float = field(default_factory=time.time)
    status: str = "active"  # active | unhealthy | offline
    task_count: int = 0
    success_count: int = 0

    @property
    def success_rate(self) -> float:
        if self.task_count == 0:
            return 1.0
        return self.success_count / self.task_count


class A2ARegistry:
    """A2A 执行节点注册中心

    线程安全，支持持久化到 JSON 文件。
    """

    def __init__(self, persist_path: str = None):
        self._agents: Dict[str, RegisteredAgent] = {}
        self._lock = threading.Lock()
        self._persist_path = persist_path or str(
            Path(__file__).parent / "data" / "a2a_agents.json"
        )
        self._load()

    def register(self, agent_id: str, card: AgentCard) -> RegisteredAgent:
        """注册执行节点"""
        with self._lock:
            agent = RegisteredAgent(
                agent_id=agent_id,
                card=card,
            )
            self._agents[agent_id] = agent
            self._save()
            logger.info("A2A 节点注册: %s (%s) skills=%s",
                        agent_id, card.name, [s.id for s in card.skills])
            return agent

    def unregister(self, agent_id: str) -> bool:
        """注销执行节点"""
        with self._lock:
            if agent_id in self._agents:
                del self._agents[agent_id]
                self._save()
                logger.info("A2A 节点注销: %s", agent_id)
                return True
            return False

    def heartbeat(self, agent_id: str) -> bool:
        """更新心跳"""
        with self._lock:
            agent = self._agents.get(agent_id)
            if agent:
                agent.last_heartbeat = time.time()
                agent.status = "active"
                return True
            return False

    def get(self, agent_id: str) -> Optional[RegisteredAgent]:
        """获取指定节点"""
        with self._lock:
            return self._agents.get(agent_id)

    def list_active(self) -> List[RegisteredAgent]:
        """列出所有活跃节点"""
        with self._lock:
            return [a for a in self._agents.values() if a.status == "active"]

    def find_by_skill(self, skill_id: str) -> List[RegisteredAgent]:
        """按技能查找节点"""
        with self._lock:
            result = []
            for agent in self._agents.values():
                if agent.status != "active":
                    continue
                for skill in agent.card.skills:
                    if skill.id == skill_id:
                        result.append(agent)
                        break
            return result

    def find_by_tag(self, tag: str) -> List[RegisteredAgent]:
        """按标签查找节点"""
        with self._lock:
            result = []
            for agent in self._agents.values():
                if agent.status != "active":
                    continue
                for skill in agent.card.skills:
                    if tag in skill.tags:
                        result.append(agent)
                        break
            return result

    def record_task(self, agent_id: str, success: bool):
        """记录任务执行结果"""
        with self._lock:
            agent = self._agents.get(agent_id)
            if agent:
                agent.task_count += 1
                if success:
                    agent.success_count += 1
                self._save()

    def check_health(self, timeout_seconds: float = 60):
        """检查节点健康状态，超时标记为 unhealthy"""
        with self._lock:
            now = time.time()
            for agent in self._agents.values():
                if agent.status == "active" and (now - agent.last_heartbeat) > timeout_seconds:
                    agent.status = "unhealthy"
                    logger.warning("A2A 节点超时: %s", agent.agent_id)

    def _save(self):
        """持久化到 JSON"""
        try:
            Path(self._persist_path).parent.mkdir(parents=True, exist_ok=True)
            data = {}
            for aid, agent in self._agents.items():
                data[aid] = {
                    "agent_id": agent.agent_id,
                    "card": asdict(agent.card),
                    "registered_at": agent.registered_at,
                    "last_heartbeat": agent.last_heartbeat,
                    "status": agent.status,
                    "task_count": agent.task_count,
                    "success_count": agent.success_count,
                }
            with open(self._persist_path, "w") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error("A2A 注册表持久化失败: %s", e)

    def _load(self):
        """从 JSON 加载"""
        try:
            path = Path(self._persist_path)
            if not path.exists():
                return
            with open(path) as f:
                data = json.load(f)
            for aid, d in data.items():
                card_data = d["card"]
                skills = [AgentSkill(**s) for s in card_data.get("skills", [])]
                card = AgentCard(
                    name=card_data["name"],
                    description=card_data["description"],
                    url=card_data["url"],
                    skills=skills,
                    capabilities=card_data.get("capabilities", {}),
                    version=card_data.get("version", "1.0.0"),
                )
                self._agents[aid] = RegisteredAgent(
                    agent_id=d["agent_id"],
                    card=card,
                    registered_at=d.get("registered_at", 0),
                    last_heartbeat=d.get("last_heartbeat", 0),
                    status="offline",  # 重启后标记为 offline，等心跳激活
                    task_count=d.get("task_count", 0),
                    success_count=d.get("success_count", 0),
                )
            logger.info("A2A 注册表加载: %d 个节点", len(self._agents))
        except Exception as e:
            logger.error("A2A 注册表加载失败: %s", e)
