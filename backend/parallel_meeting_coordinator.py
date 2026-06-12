"""
ParallelMeetingCoordinator - 并行会议协调器

集成KeyManager、AgentPool和ParallelDiscussionManager，提供并行多Agent协作能力。
支持动态团队模板。
"""
import asyncio
import logging
from typing import Any, Awaitable, Callable, Dict, List, Optional

from agent_pool import AgentPool, AgentConfig, DEFAULT_TEAM_TEMPLATE, PERSONAL_ASSISTANT_TEMPLATE
from key_manager import KeyManager, KeyConfig
from parallel_discussion_manager import ParallelDiscussionManager
from agenda import AgendaStateMachine

logger = logging.getLogger("parallel_meeting_coordinator")


class ParallelMeetingCoordinator:
    """
    并行会议协调器
    
    集成KeyManager、AgentPool和ParallelDiscussionManager，
    提供并行多Agent协作能力。
    """
    
    def __init__(
        self,
        provider: str,
        model_name: str,
        api_key: str,
        base_url: str = "",
        max_concurrent: int = 5,
        timeout: float = 30.0,
        max_instances_per_role: int = 3,
        role_prompts: Optional[Dict[str, str]] = None
    ):
        """
        初始化并行会议协调器
        
        Args:
            provider: 模型提供商
            model_name: 模型名称
            api_key: API密钥
            base_url: API基础URL
            max_concurrent: 最大并发数
            timeout: 单个Agent响应超时时间
            max_instances_per_role: 每个角色的最大实例数
            role_prompts: 角色提示词映射
        """
        self.provider = provider
        self.model_name = model_name
        
        # 初始化KeyManager
        default_config = KeyConfig(
            api_key=api_key,
            base_url=base_url,
            rate_limit=100,
            model_name=model_name,
            provider=provider
        )
        self.key_manager = KeyManager(default_config=default_config)
        
        # 初始化AgentPool
        self.agent_pool = AgentPool(
            key_manager=self.key_manager,
            role_prompts=role_prompts,
            max_instances_per_role=max_instances_per_role
        )
        
        # 初始化议程状态机
        self.agenda = AgendaStateMachine()

        # 初始化ParallelDiscussionManager
        self.discussion_manager = ParallelDiscussionManager(
            agent_pool=self.agent_pool,
            agenda=self.agenda,
            max_concurrent=max_concurrent,
            timeout=timeout
        )
        
        # 当前团队
        self._current_team_ids: List[str] = []
        
        logger.info("ParallelMeetingCoordinator 初始化完成")
    
    def create_team(self, team_template: Optional[List[Dict[str, Any]]] = None) -> List[str]:
        """
        创建团队
        
        Args:
            team_template: 团队模板，None使用默认模板
            
        Returns:
            List[str]: 创建的Agent ID列表
        """
        if team_template is None:
            team_template = DEFAULT_TEAM_TEMPLATE
        
        # 清空现有团队
        self.agent_pool.clear()
        
        # 创建新团队
        self._current_team_ids = self.agent_pool.create_team(team_template)
        
        logger.info("创建团队完成，共 %d 个Agent", len(self._current_team_ids))
        return self._current_team_ids
    
    def create_personal_assistant(self) -> str:
        """
        创建单人助理团队
        
        Returns:
            str: 助理Agent ID
        """
        # 清空现有团队
        self.agent_pool.clear()
        
        # 创建单人助理
        ids = self.agent_pool.create_team(PERSONAL_ASSISTANT_TEMPLATE)
        self._current_team_ids = ids
        
        logger.info("创建单人助理完成")
        return ids[0] if ids else None
    
    def get_team_ids(self) -> List[str]:
        """获取当前团队Agent ID列表"""
        return self._current_team_ids.copy()
    
    def configure_role_key(self, role: str, config: KeyConfig) -> None:
        """
        为指定角色配置独立的API密钥
        
        Args:
            role: 角色名称
            config: 密钥配置
        """
        self.key_manager.configure(role, config)
        logger.info("已为角色 %s 配置独立API密钥", role)
    
    async def run_parallel_discussion(
        self,
        topic: str,
        agent_ids: Optional[List[str]] = None,
        max_rounds: int = 2,
        on_message: Optional[Callable[[str, str, str], Awaitable[None]]] = None
    ) -> Dict[str, Any]:
        """
        运行并行讨论
        
        Args:
            topic: 讨论主题
            agent_ids: 参与讨论的Agent ID列表，None使用当前团队
            max_rounds: 最大轮数
            on_message: 消息回调函数
            
        Returns:
            讨论结果
        """
        if agent_ids is None:
            agent_ids = self._current_team_ids
        
        if not agent_ids:
            raise ValueError("没有可用的Agent，请先创建团队")
        
        logger.info("开始并行讨论: topic=%s, agents=%d, max_rounds=%d", 
                   topic, len(agent_ids), max_rounds)
        
        # 推进议程：开题 → 讨论
        self.agenda.open_topic(topic)
        self.agenda.start_discussion()
        
        # 运行并行讨论
        discussions = await self.discussion_manager.run_discussion(
            topic=topic,
            agent_ids=agent_ids,
            max_rounds=max_rounds,
            on_message=on_message
        )
        
        # 查找协调者进行总结
        coordinator_id = self._find_coordinator_id()
        summary = ""
        if coordinator_id:
            try:
                summary = await self.discussion_manager.summarize_discussion(
                    topic=topic,
                    discussions=discussions,
                    summarizer_id=coordinator_id
                )
            except Exception as e:
                logger.warning("总结失败: %s", e)
        
        return {
            "topic": topic,
            "discussions": discussions,
            "summary": summary,
            "rounds": max(d.get("round", 0) for d in discussions) if discussions else 0,
            "participant_count": len(agent_ids)
        }
    
    def _find_coordinator_id(self) -> Optional[str]:
        """查找协调者Agent ID"""
        for agent_id in self._current_team_ids:
            instance = self.agent_pool.get_agent_by_id(agent_id)
            if instance and instance.config.role in ["coordinator", "ceo"]:
                return agent_id
        return None
    
    def get_pool_status(self) -> Dict:
        """获取Agent池状态"""
        return self.agent_pool.get_pool_status()
    
    def get_key_stats(self) -> Dict:
        """获取密钥使用统计"""
        return self.key_manager.get_all_stats()
    
    async def health_check(self) -> Dict[str, bool]:
        """执行健康检查"""
        return await self.agent_pool.health_check()
    
    def scale_up(self, role: str, count: int = 1) -> List[str]:
        """扩容Agent实例"""
        return self.agent_pool.scale_up(role, count)
    
    def scale_down(self, role: str, count: int = 1) -> List[str]:
        """缩容Agent实例"""
        return self.agent_pool.scale_down(role, count)
    
    def add_agent(self, agent_def: Dict[str, Any]) -> str:
        """
        添加单个Agent到团队
        
        Args:
            agent_def: Agent定义，包含id, name, role, capabilities等
            
        Returns:
            str: Agent ID
        """
        ids = self.agent_pool.create_team([agent_def])
        if ids:
            self._current_team_ids.extend(ids)
            return ids[0]
        return None
    
    def remove_agent(self, agent_id: str) -> bool:
        """
        从团队移除Agent
        
        Args:
            agent_id: Agent ID
            
        Returns:
            bool: 是否成功移除
        """
        success = self.agent_pool.remove_agent(agent_id)
        if success and agent_id in self._current_team_ids:
            self._current_team_ids.remove(agent_id)
        return success
