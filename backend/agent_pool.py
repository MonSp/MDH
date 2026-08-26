"""
AgentPool - Agent池管理模块

支持动态创建和销毁Agent实例，基于团队模板而非固定角色。
"""
import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from agentscope.agent import Agent
from agentscope.message import Msg

from agent import PROVIDER_REGISTRY
from key_manager import KeyManager

logger = logging.getLogger("agent_pool")


@dataclass
class AgentConfig:
    """Agent配置"""
    id: str
    name: str
    role: str  # 角色名称，不再限制为AgentRole枚举
    capabilities: List[str] = field(default_factory=list)
    system_prompt: str = ""  # 自定义系统提示词
    provider: str = ""  # 可选：覆盖默认provider
    model_name: str = ""  # 可选：覆盖默认模型
    api_key: str = ""  # 可选：覆盖默认API密钥
    base_url: str = ""  # 可选：覆盖默认base_url


@dataclass
class AgentInstance:
    """Agent实例信息"""
    id: str
    config: AgentConfig
    agent: Agent
    created_at: float = field(default_factory=time.time)
    last_used: float = 0.0
    use_count: int = 0
    healthy: bool = True
    last_health_check: float = 0.0
    error_count: int = 0


# 默认角色提示词模板
DEFAULT_ROLE_PROMPTS = {
    "ceo": "你是编程团队的CTO（技术总监）。你的职责是分析用户技术需求、判断技术意图、将开发任务自动分配给最合适的团队成员。你熟悉前后端技术栈、系统架构和团队成员能力。请用简洁果断的技术语言发言。",
    "planner": "你是团队的系统架构师。你的职责是分析技术任务、设计系统架构、将复杂需求分解为可执行的开发子任务，并为每个子任务定义验收标准和所需技能标签。请用专业的技术语言发言。",
    "executor": "你是团队的全栈开发工程师。你的职责是评估任务的技术可行性、提出实现方案、负责代码编写和功能实现。你精通前后端开发技术和最佳实践。请用务实高效的开发语言发言。",
    "monitor": "你是团队的DevOps工程师。你的职责是评估部署风险、监控系统性能、提出CI/CD和运维建议。你熟悉容器化、部署流水线和性能调优。请用严谨细致的语言发言。",
    "reviewer": "你是团队的QA工程师。你的职责是审查代码质量、编写测试用例、发现潜在bug和安全漏洞、提出改进建议。你精通代码审查和测试方法论。请用客观公正的语言发言。",
    "coordinator": "你是团队的项目经理。你的职责是协调开发各方意见、整合技术方案、跟踪项目进度、管理风险和依赖。请用简明果断的语言发言。",
}

# 默认团队模板
DEFAULT_TEAM_TEMPLATE = [
    {"id": "agent-ceo", "name": "CTO-技术总监", "role": "ceo",
     "capabilities": ["semantic_analysis", "task_delegation", "meeting_coordination", "tech_architecture"]},
    {"id": "agent-planner", "name": "架构师-Alpha", "role": "planner",
     "capabilities": ["task_decomposition", "data_analysis", "system_design", "tech_spec"]},
    {"id": "agent-executor", "name": "全栈开发-Beta", "role": "executor",
     "capabilities": ["code_generation", "file_operation", "browser_automation", "frontend_dev", "backend_dev"]},
    {"id": "agent-monitor", "name": "DevOps-Gamma", "role": "monitor",
     "capabilities": ["monitoring", "data_analysis", "deployment", "performance_tuning"]},
    {"id": "agent-reviewer", "name": "QA工程师-Delta", "role": "reviewer",
     "capabilities": ["code_review", "testing", "bug_analysis", "quality_assurance"]},
    {"id": "agent-coordinator", "name": "项目经理-Epsilon", "role": "coordinator",
     "capabilities": ["task_decomposition", "monitoring", "progress_tracking", "risk_management"]},
]

# 单人助理模板
PERSONAL_ASSISTANT_TEMPLATE = [
    {"id": "agent-assistant", "name": "私人助理", "role": "executor",
     "capabilities": ["browser_automation", "file_operation", "code_generation", "frontend_dev", "backend_dev"]},
]


class AgentPool:
    """
    Agent池管理器

    支持动态创建和销毁Agent实例，基于团队模板而非固定角色。
    """

    def __init__(
        self,
        key_manager: KeyManager,
        role_prompts: Optional[Dict[str, str]] = None,
        max_instances_per_role: int = 3,
        incremental_dir: str = "",
    ):
        """
        初始化Agent池

        Args:
            key_manager: 密钥管理器
            role_prompts: 角色提示词映射，None使用默认提示词
            max_instances_per_role: 每个角色的最大实例数
            incremental_dir: 增量区目录（进化后的 CoW 技能），传入后自动注入到 agent system prompt
        """
        self._key_manager = key_manager
        self._role_prompts = role_prompts or DEFAULT_ROLE_PROMPTS.copy()
        self._max_instances = max_instances_per_role
        self._incremental_dir = incremental_dir

        # 按角色分组存储Agent实例
        self._agents: Dict[str, List[AgentInstance]] = {}
        self._round_robin_index: Dict[str, int] = {}

        # 按ID索引Agent实例
        self._agents_by_id: Dict[str, AgentInstance] = {}

        logger.info("AgentPool 初始化完成 (max_instances_per_role=%d)",
                   max_instances_per_role)

    def _create_agent(self, config: AgentConfig) -> Agent:
        """
        创建新的Agent实例

        Args:
            config: Agent配置

        Returns:
            Agent: 新创建的Agent实例
        """
        # 获取provider配置
        provider_name = config.provider or self._key_manager.get_default_provider()
        reg = PROVIDER_REGISTRY.get(provider_name)
        if reg is None:
            raise ValueError(f"不支持的模型提供商: {provider_name}")

        # 获取API密钥
        api_key = config.api_key or self._key_manager.get_default_api_key()
        base_url = config.base_url or self._key_manager.get_default_base_url()

        # 创建session对象
        class _Session:
            pass

        session = _Session()
        session.api_key = api_key
        session.base_url = base_url

        # 创建credential和model
        credential = reg["credential_cls"](**reg["credential_kwargs"](session))
        formatter = reg["formatter_cls"]()
        model_name = config.model_name or reg["default_model"]
        model = reg["model_cls"](
            credential=credential,
            model=model_name,
            stream=True,
            formatter=formatter,
        )

        # 获取系统提示词
        system_prompt = config.system_prompt or self._role_prompts.get(
            config.role, f"你是{config.name}，请根据你的角色和能力完成任务。"
        )

        # 注入增量区内容（进化后的技能知识 + 经验规则）
        if self._incremental_dir:
            system_prompt = self._inject_incremental_context(system_prompt)

        # 创建Agent
        agent = Agent(
            name=config.name,
            system_prompt=system_prompt,
            model=model,
        )

        return agent

    def create_team(self, team_template: List[Dict[str, Any]]) -> List[str]:
        """
        根据团队模板创建团队

        Args:
            team_template: 团队模板列表，每个元素包含id, name, role, capabilities等

        Returns:
            List[str]: 创建的Agent实例ID列表
        """
        created_ids = []

        for agent_def in team_template:
            config = AgentConfig(
                id=agent_def.get("id", f"agent-{uuid.uuid4().hex[:8]}"),
                name=agent_def.get("name", f"Agent-{agent_def.get('role', 'unknown')}"),
                role=agent_def.get("role", "executor"),
                capabilities=agent_def.get("capabilities", []),
                system_prompt=agent_def.get("system_prompt", ""),
                provider=agent_def.get("provider", ""),
                model_name=agent_def.get("model_name", ""),
                api_key=agent_def.get("api_key", ""),
                base_url=agent_def.get("base_url", ""),
            )

            instance = self._create_instance(config)

            # 添加到池中
            if config.role not in self._agents:
                self._agents[config.role] = []
                self._round_robin_index[config.role] = 0

            self._agents[config.role].append(instance)
            self._agents_by_id[instance.id] = instance

            created_ids.append(instance.id)
            logger.info("创建Agent: id=%s, name=%s, role=%s",
                       instance.id, config.name, config.role)

        return created_ids

    def _create_instance(self, config: AgentConfig) -> AgentInstance:
        """创建新的Agent实例"""
        agent = self._create_agent(config)

        instance = AgentInstance(
            id=config.id,
            config=config,
            agent=agent
        )

        return instance

    def get_agent_by_id(self, agent_id: str) -> Optional[AgentInstance]:
        """
        根据ID获取Agent实例

        Args:
            agent_id: Agent ID

        Returns:
            Optional[AgentInstance]: Agent实例
        """
        return self._agents_by_id.get(agent_id)

    def get_agent_by_role(self, role: str) -> Optional[AgentInstance]:
        """
        根据角色获取可用的Agent实例（轮询负载均衡）

        Args:
            role: 角色名称

        Returns:
            Optional[AgentInstance]: Agent实例
        """
        if role not in self._agents or not self._agents[role]:
            return None

        agents = self._agents[role]

        # 查找健康的Agent
        healthy_agents = [a for a in agents if a.healthy]

        if not healthy_agents:
            # 重置不健康的Agent
            for agent in agents:
                agent.healthy = True
                agent.error_count = 0
            healthy_agents = agents

        # 轮询选择
        index = self._round_robin_index.get(role, 0) % len(healthy_agents)
        self._round_robin_index[role] = index + 1

        instance = healthy_agents[index]
        instance.last_used = time.time()
        instance.use_count += 1

        return instance

    def get_agents_by_capability(self, capability: str) -> List[AgentInstance]:
        """
        根据能力获取Agent实例列表

        Args:
            capability: 能力名称

        Returns:
            List[AgentInstance]: 具有该能力的Agent实例列表
        """
        result = []
        for agent_id, instance in self._agents_by_id.items():
            if capability in instance.config.capabilities:
                result.append(instance)
        return result

    def get_all_agents(self) -> List[AgentInstance]:
        """获取所有Agent实例"""
        return list(self._agents_by_id.values())

    async def health_check(self, timeout: float = 5.0) -> Dict[str, bool]:
        """
        执行健康检查

        Args:
            timeout: 检查超时时间

        Returns:
            Dict[str, bool]: 各实例的健康状态
        """
        results = {}

        for agent_id, instance in self._agents_by_id.items():
            try:
                # 发送简单的健康检查消息
                msg = Msg(name="health_check", role="user",
                         content=[{"type": "text", "text": "ping"}])

                # 设置超时
                response = await asyncio.wait_for(
                    instance.agent.reply(msg),
                    timeout=timeout
                )

                # 检查响应
                instance.healthy = True
                instance.last_health_check = time.time()
                results[agent_id] = True

            except asyncio.TimeoutError:
                instance.healthy = False
                instance.error_count += 1
                results[agent_id] = False
                logger.warning("Agent健康检查超时: %s", agent_id)

            except Exception as e:
                instance.healthy = False
                instance.error_count += 1
                results[agent_id] = False
                logger.error("Agent健康检查失败: %s, 错误: %s", agent_id, e)

        return results

    def mark_unhealthy(self, agent_id: str) -> bool:
        """
        标记实例为不健康

        Args:
            agent_id: Agent ID

        Returns:
            bool: 是否成功标记
        """
        instance = self._agents_by_id.get(agent_id)
        if instance:
            instance.healthy = False
            instance.error_count += 1
            logger.info("标记Agent为不健康: %s", agent_id)
            return True
        return False

    def scale_up(self, role: str, count: int = 1) -> List[str]:
        """
        扩容Agent实例

        Args:
            role: 角色名称
            count: 扩容数量

        Returns:
            List[str]: 新创建的实例ID列表
        """
        new_ids = []

        if role not in self._agents:
            self._agents[role] = []

        # 获取现有配置作为模板
        existing_configs = self._agents.get(role, [])
        if not existing_configs:
            logger.warning("无法扩容：角色 %s 没有现有实例作为模板", role)
            return new_ids

        template_config = existing_configs[0].config

        for _ in range(count):
            if len(self._agents[role]) < self._max_instances:
                # 创建新配置
                new_config = AgentConfig(
                    id=f"{role}-{uuid.uuid4().hex[:8]}",
                    name=f"{template_config.name}-副本",
                    role=role,
                    capabilities=template_config.capabilities.copy(),
                    system_prompt=template_config.system_prompt,
                    provider=template_config.provider,
                    model_name=template_config.model_name,
                    api_key=template_config.api_key,
                    base_url=template_config.base_url,
                )

                instance = self._create_instance(new_config)
                self._agents[role].append(instance)
                self._agents_by_id[instance.id] = instance
                new_ids.append(instance.id)

                logger.info("扩容Agent: id=%s, role=%s", instance.id, role)
            else:
                logger.warning("已达到最大实例数，无法继续扩容: %s", role)
                break

        return new_ids

    def scale_down(self, role: str, count: int = 1) -> List[str]:
        """
        缩容Agent实例

        Args:
            role: 角色名称
            count: 缩容数量

        Returns:
            List[str]: 被移除的实例ID列表
        """
        removed_ids = []

        if role not in self._agents:
            return removed_ids

        for _ in range(min(count, len(self._agents[role]))):
            if self._agents[role]:
                instance = self._agents[role].pop()
                self._agents_by_id.pop(instance.id, None)
                removed_ids.append(instance.id)
                logger.info("移除Agent实例: %s", instance.id)

        return removed_ids

    def remove_agent(self, agent_id: str) -> bool:
        """
        移除指定Agent实例

        Args:
            agent_id: Agent ID

        Returns:
            bool: 是否成功移除
        """
        instance = self._agents_by_id.pop(agent_id, None)
        if not instance:
            return False

        # 从角色列表中移除
        role = instance.config.role
        if role in self._agents:
            self._agents[role] = [a for a in self._agents[role] if a.id != agent_id]

        logger.info("移除Agent实例: %s", agent_id)
        return True

    def get_pool_status(self) -> Dict:
        """
        获取池状态

        Returns:
            Dict: 池状态信息
        """
        status = {
            "total_instances": len(self._agents_by_id),
            "healthy_instances": sum(1 for a in self._agents_by_id.values() if a.healthy),
            "unhealthy_instances": sum(1 for a in self._agents_by_id.values() if not a.healthy),
            "roles": {}
        }

        for role, agents in self._agents.items():
            healthy_count = sum(1 for a in agents if a.healthy)
            unhealthy_count = len(agents) - healthy_count

            status["roles"][role] = {
                "total": len(agents),
                "healthy": healthy_count,
                "unhealthy": unhealthy_count,
                "max_instances": self._max_instances,
                "instances": [
                    {
                        "id": a.id,
                        "name": a.config.name,
                        "healthy": a.healthy,
                        "use_count": a.use_count,
                        "error_count": a.error_count,
                        "last_used": a.last_used,
                        "capabilities": a.config.capabilities
                    }
                    for a in agents
                ]
            }

        return status

    def clear(self) -> None:
        """清空Agent池"""
        self._agents.clear()
        self._agents_by_id.clear()
        self._round_robin_index.clear()
        logger.info("Agent池已清空")

    def update_role_prompt(self, role: str, prompt: str) -> None:
        """
        更新角色提示词

        Args:
            role: 角色名称
            prompt: 系统提示词
        """
        self._role_prompts[role] = prompt
        logger.info("更新角色提示词: %s", role)

    def _inject_incremental_context(self, system_prompt: str) -> str:
        """将增量区的进化知识和经验规则注入到 system prompt。

        增量区结构（CoW）：
        - system_prompt_addon.md: 追加到 system prompt 的补充内容
        - rules/: 经验规则 YAML 文件
        - knowledge_add/: 领域知识文件

        Args:
            system_prompt: 原始 system prompt
        Returns:
            注入增量区内容后的 system prompt
        """
        import os

        parts = [system_prompt]

        addon_path = os.path.join(self._incremental_dir, "system_prompt_addon.md")
        if os.path.isfile(addon_path):
            try:
                with open(addon_path, encoding="utf-8") as f:
                    addon = f.read().strip()
                if addon:
                    parts.append(f"\n## 进化技能补充\n\n{addon}")
            except Exception:
                pass

        rules_dir = os.path.join(self._incremental_dir, "rules")
        if os.path.isdir(rules_dir):
            rule_lines = []
            try:
                import yaml
                for fname in sorted(os.listdir(rules_dir)):
                    if not fname.endswith((".yaml", ".yml")):
                        continue
                    fpath = os.path.join(rules_dir, fname)
                    if not os.path.isfile(fpath):
                        continue
                    try:
                        with open(fpath, encoding="utf-8") as f:
                            data = yaml.safe_load(f)
                        if isinstance(data, dict) and data.get("trigger_condition"):
                            if data.get("status", "approved") == "approved":
                                rule_lines.append(f"- {data['trigger_condition']} → {data.get('action', '')}")
                        elif isinstance(data, dict) and "rules" in data:
                            for r in data["rules"]:
                                if isinstance(r, dict) and r.get("status", "approved") == "approved":
                                    rule_lines.append(f"- {r.get('trigger_condition', '')} → {r.get('action', '')}")
                    except Exception:
                        continue
            except Exception:
                pass
            if rule_lines:
                parts.append("\n## 进化经验规则\n\n" + "\n".join(rule_lines))

        knowledge_dir = os.path.join(self._incremental_dir, "knowledge_add")
        if os.path.isdir(knowledge_dir):
            knowledge_parts = []
            try:
                for fname in sorted(os.listdir(knowledge_dir)):
                    if not fname.endswith((".md", ".txt")):
                        continue
                    fpath = os.path.join(knowledge_dir, fname)
                    if not os.path.isfile(fpath):
                        continue
                    try:
                        with open(fpath, encoding="utf-8") as f:
                            content = f.read().strip()
                        if content:
                            knowledge_parts.append(content)
                    except Exception:
                        continue
            except Exception:
                pass
            if knowledge_parts:
                parts.append("\n## 进化领域知识\n\n" + "\n\n".join(knowledge_parts))

        return "\n".join(parts)
