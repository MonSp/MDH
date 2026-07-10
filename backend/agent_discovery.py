"""
AgentDiscovery - 智能体发现服务

支持发现网络中的可用智能体，包括本地和远端智能体。
"""

import asyncio
import logging
import time
from typing import Any, Awaitable, Callable, Dict, List, Optional

from cross_network_bridge import AgentEndpoint, CrossNetworkBridge

logger = logging.getLogger("agent_discovery")


class AgentDiscovery:
    """
    智能体发现服务
    
    支持发现网络中的可用智能体，包括本地和远端智能体。
    """
    
    def __init__(
        self,
        bridge: CrossNetworkBridge,
        discovery_interval: float = 30.0,
    ):
        """
        初始化智能体发现服务
        
        Args:
            bridge: 跨网络桥接
            discovery_interval: 发现间隔（秒）
        """
        self._bridge = bridge
        self._discovery_interval = discovery_interval
        self._discovery_task: Optional[asyncio.Task] = None
        self._on_agent_discovered: Optional[Callable[[AgentEndpoint], Awaitable[None]]] = None
        self._on_agent_lost: Optional[Callable[[str], Awaitable[None]]] = None
        
        logger.info("AgentDiscovery 初始化完成")
    
    def set_callbacks(
        self,
        on_agent_discovered: Optional[Callable[[AgentEndpoint], Awaitable[None]]] = None,
        on_agent_lost: Optional[Callable[[str], Awaitable[None]]] = None,
    ) -> None:
        """
        设置回调函数
        
        Args:
            on_agent_discovered: 发现新智能体时的回调
            on_agent_lost: 智能体丢失时的回调
        """
        self._on_agent_discovered = on_agent_discovered
        self._on_agent_lost = on_agent_lost
    
    async def start(self) -> None:
        """启动发现服务"""
        if self._discovery_task:
            return
        
        self._discovery_task = asyncio.create_task(self._discovery_loop())
        logger.info("AgentDiscovery 已启动")
    
    async def stop(self) -> None:
        """停止发现服务"""
        if self._discovery_task:
            self._discovery_task.cancel()
            try:
                await self._discovery_task
            except asyncio.CancelledError:
                pass
            self._discovery_task = None
        logger.info("AgentDiscovery 已停止")
    
    async def _discovery_loop(self) -> None:
        """发现循环"""
        while True:
            try:
                await self._discover_agents()
                await asyncio.sleep(self._discovery_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("发现循环异常: %s", e)
                await asyncio.sleep(5)
    
    async def _discover_agents(self) -> None:
        """发现智能体"""
        # 检查已注册智能体的健康状态
        health = self._bridge.check_health()
        logger.debug("健康检查: %s", health)
        
        # 检查丢失的智能体
        for agent_id, endpoint in list(self._bridge._endpoints.items()):
            if endpoint.status == "offline":
                if self._on_agent_lost:
                    await self._on_agent_lost(agent_id)
        
        # 可以添加网络扫描逻辑
        # await self._scan_network_for_agents()
    
    def register_local_agent(
        self,
        agent_id: str,
        name: str,
        role: str,
        capabilities: List[str] = None,
    ) -> None:
        """
        注册本地智能体
        
        Args:
            agent_id: 智能体ID
            name: 智能体名称
            role: 智能体角色
            capabilities: 能力列表
        """
        endpoint = AgentEndpoint(
            agent_id=agent_id,
            name=name,
            role=role,
            location="local",
            network_id=self._bridge._local_network_id,
            capabilities=capabilities or [],
            last_heartbeat=time.time(),
        )
        self._bridge.register_endpoint(endpoint)
        logger.info("注册本地智能体: %s", agent_id)
    
    def register_remote_agent(
        self,
        agent_id: str,
        name: str,
        role: str,
        network_id: str,
        endpoint_url: str,
        capabilities: List[str] = None,
    ) -> None:
        """
        注册远端智能体
        
        Args:
            agent_id: 智能体ID
            name: 智能体名称
            role: 智能体角色
            network_id: 网络标识
            endpoint_url: 端点URL
            capabilities: 能力列表
        """
        endpoint = AgentEndpoint(
            agent_id=agent_id,
            name=name,
            role=role,
            location="remote",
            network_id=network_id,
            endpoint_url=endpoint_url,
            capabilities=capabilities or [],
            last_heartbeat=time.time(),
        )
        self._bridge.register_endpoint(endpoint)
        logger.info("注册远端智能体: %s", agent_id)
    
    def get_agents_by_role(self, role: str) -> List[AgentEndpoint]:
        """
        按角色获取智能体
        
        Args:
            role: 智能体角色
            
        Returns:
            符合条件的智能体列表
        """
        return self._bridge.get_available_agents(role=role)
    
    def get_agents_by_location(self, location: str) -> List[AgentEndpoint]:
        """
        按位置获取智能体
        
        Args:
            location: 位置（local/remote）
            
        Returns:
            符合条件的智能体列表
        """
        return self._bridge.get_available_agents(location=location)
    
    def get_all_agents(self) -> List[AgentEndpoint]:
        """
        获取所有智能体
        
        Returns:
            所有智能体列表
        """
        return list(self._bridge._endpoints.values())
