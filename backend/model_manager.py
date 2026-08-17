"""
ModelManager — 模型生命周期管理

从 MeetingCoordinator 提取的模型创建、缓存、故障转移逻辑。
"""

import logging
from typing import Dict, Optional

from agentscope.agent import Agent

from protocol import AgentRole

# 角色提示词（从 meeting_coordinator.py 提取）
AGENT_ROLE_PROMPTS = {
    AgentRole.COORDINATOR: "你是团队的协调者，负责任务分配和进度管理。",
    AgentRole.PLANNER: "你是团队的规划者，负责系统设计和任务分解。",
    AgentRole.EXECUTOR: "你是团队的执行者，负责代码实现和功能开发。",
    AgentRole.REVIEWER: "你是团队的审查者，负责代码审查和质量把控。",
    AgentRole.MONITOR: "你是团队的监控者，负责进度监控和风险评估。",
}

logger = logging.getLogger("model_manager")


class ModelManager:
    """模型生命周期管理器

    职责：
    - 创建模型实例（通过 model_factory）
    - 缓存模型实例（避免重复创建）
    - 故障转移（驱逐不健康实例，重新获取健康实例）
    - AgentPool 集成（复用和负载均衡）
    """

    def __init__(
        self,
        provider: str,
        api_key: str,
        base_url: str = "",
        model_name: str = "",
        agent_pool=None,
    ):
        self._provider = provider
        self._api_key = api_key
        self._base_url = base_url
        self._model_name = model_name
        self._agent_pool = agent_pool
        self._models: Dict[str, Agent] = {}
        self._model_pool_ids: Dict[str, str] = {}

    def get_model(self, role: AgentRole) -> Agent:
        """获取指定角色的模型实例（缓存优先，池优先）"""
        key = role.value
        if key not in self._models:
            # 优先从 AgentPool 获取（支持复用和负载均衡）
            if self._agent_pool:
                instance = self._agent_pool.get_agent_by_role(key)
                if instance:
                    self._models[key] = instance.agent
                    self._model_pool_ids[key] = instance.id
                    logger.info("从 AgentPool 获取模型: role=%s, pool_id=%s", key, instance.id)
                    return instance.agent
            self._models[key] = self._create_model(role)
        return self._models[key]

    def mark_failed(self, role: AgentRole) -> None:
        """模型调用失败：驱逐缓存 + 标记 pool 实例不健康"""
        key = role.value
        self._models.pop(key, None)
        pool_id = self._model_pool_ids.pop(key, None)
        if pool_id and self._agent_pool:
            self._agent_pool.mark_unhealthy(pool_id)
            logger.info("标记 pool 实例不健康: role=%s, pool_id=%s", key, pool_id)

    def safe_mark_failed(self, role: AgentRole) -> None:
        """模型失败通知（异常安全版本）"""
        try:
            self.mark_failed(role)
        except Exception as e:
            logger.warning("模型失败通知回调异常: %s", e)

    def _create_model(self, role: AgentRole) -> Agent:
        """创建新模型实例"""
        from model_factory import create_agent

        logger.info("创建模型: role=%s provider=%s model=%s",
                    role.value, self._provider, self._model_name or "(默认)")

        return create_agent(
            provider=self._provider,
            api_key=self._api_key,
            base_url=self._base_url,
            model_name=self._model_name,
            system_prompt=AGENT_ROLE_PROMPTS.get(role, "你是一个AI助手。"),
            agent_name=role.value,
            stream=True,
        )
