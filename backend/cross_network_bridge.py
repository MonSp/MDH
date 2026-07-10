"""
CrossNetworkBridge - 跨网络智能体桥接

支持本地TS智能体与远端Python/TS智能体的跨网络协作。

核心功能：
1. 智能体发现 - 发现网络中的可用智能体
2. 消息路由 - 跨网络路由消息
3. 工作区同步 - 同步本地和远端的工作区状态
"""

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional, Set

logger = logging.getLogger("cross_network_bridge")


@dataclass
class AgentEndpoint:
    """智能体端点信息"""
    agent_id: str
    name: str
    role: str
    location: str  # 'local' | 'remote'
    network_id: str  # 网络标识
    endpoint_url: Optional[str] = None  # 远端端点URL
    capabilities: List[str] = field(default_factory=list)
    status: str = "online"  # online | offline | busy
    last_heartbeat: float = 0.0


@dataclass
class NetworkMessage:
    """跨网络消息"""
    message_id: str
    from_agent_id: str
    to_agent_id: str
    message_type: str
    payload: Dict[str, Any]
    timestamp: float
    ttl: int = 10  # 消息存活时间（跳数）


class CrossNetworkBridge:
    """
    跨网络智能体桥接
    
    支持本地TS智能体与远端Python/TS智能体的跨网络协作。
    """
    
    def __init__(
        self,
        local_network_id: str,
        send_to_remote_fn: Optional[Callable[[NetworkMessage], Awaitable[None]]] = None,
    ):
        """
        初始化跨网络桥接
        
        Args:
            local_network_id: 本地网络标识
            send_to_remote_fn: 发送消息到远端的函数
        """
        self._local_network_id = local_network_id
        self._send_to_remote_fn = send_to_remote_fn
        
        # 智能体端点注册表
        self._endpoints: Dict[str, AgentEndpoint] = {}
        
        # 网络路由表
        self._network_routes: Dict[str, str] = {}  # network_id -> endpoint_url
        
        # 消息处理器
        self._message_handlers: Dict[str, List[Callable]] = {}
        
        logger.info("CrossNetworkBridge 初始化完成 (network_id=%s)", local_network_id)
    
    def register_endpoint(self, endpoint: AgentEndpoint) -> None:
        """
        注册智能体端点
        
        Args:
            endpoint: 智能体端点信息
        """
        self._endpoints[endpoint.agent_id] = endpoint
        logger.info("注册智能体端点: %s (%s/%s)", endpoint.agent_id, endpoint.location, endpoint.role)
    
    def unregister_endpoint(self, agent_id: str) -> None:
        """
        注销智能体端点
        
        Args:
            agent_id: 智能体ID
        """
        if agent_id in self._endpoints:
            del self._endpoints[agent_id]
            logger.info("注销智能体端点: %s", agent_id)
    
    def get_endpoint(self, agent_id: str) -> Optional[AgentEndpoint]:
        """
        获取智能体端点
        
        Args:
            agent_id: 智能体ID
            
        Returns:
            智能体端点信息，如果不存在则返回None
        """
        return self._endpoints.get(agent_id)
    
    def get_available_agents(
        self,
        location: Optional[str] = None,
        role: Optional[str] = None,
    ) -> List[AgentEndpoint]:
        """
        获取可用的智能体列表
        
        Args:
            location: 过滤位置（local/remote）
            role: 过滤角色
            
        Returns:
            符合条件的智能体列表
        """
        agents = []
        for endpoint in self._endpoints.values():
            if endpoint.status != "online":
                continue
            if location and endpoint.location != location:
                continue
            if role and endpoint.role != role:
                continue
            agents.append(endpoint)
        return agents
    
    async def send_message(
        self,
        from_agent_id: str,
        to_agent_id: str,
        message_type: str,
        payload: Dict[str, Any],
    ) -> bool:
        """
        发送跨网络消息
        
        Args:
            from_agent_id: 发送方智能体ID
            to_agent_id: 接收方智能体ID
            message_type: 消息类型
            payload: 消息负载
            
        Returns:
            是否发送成功
        """
        # 查找接收方端点
        to_endpoint = self._endpoints.get(to_agent_id)
        if not to_endpoint:
            logger.warning("接收方端点不存在: %s", to_agent_id)
            return False
        
        # 创建消息
        message = NetworkMessage(
            message_id=str(uuid.uuid4()),
            from_agent_id=from_agent_id,
            to_agent_id=to_agent_id,
            message_type=message_type,
            payload=payload,
            timestamp=time.time(),
        )
        
        # 根据接收方位置路由消息
        if to_endpoint.location == "local":
            # 本地投递
            return await self._deliver_locally(message)
        else:
            # 远端投递
            return await self._deliver_remotely(message, to_endpoint)
    
    async def _deliver_locally(self, message: NetworkMessage) -> bool:
        """
        本地投递消息
        
        Args:
            message: 网络消息
            
        Returns:
            是否投递成功
        """
        handlers = self._message_handlers.get(message.message_type, [])
        if not handlers:
            logger.warning("没有消息处理器: %s", message.message_type)
            return False
        
        for handler in handlers:
            try:
                await handler(message)
            except Exception as e:
                logger.error("消息处理失败: %s", e)
                return False
        
        return True
    
    async def _deliver_remotely(
        self,
        message: NetworkMessage,
        to_endpoint: AgentEndpoint,
    ) -> bool:
        """
        远端投递消息
        
        Args:
            message: 网络消息
            to_endpoint: 接收方端点
            
        Returns:
            是否投递成功
        """
        if not self._send_to_remote_fn:
            logger.warning("没有远端投递函数")
            return False
        
        try:
            # 序列化消息并发送
            serialized = self.serialize_message(message)
            await self._send_to_remote_fn(serialized)
            return True
        except Exception as e:
            logger.error("远端投递失败: %s", e)
            return False
    
    def serialize_message(self, message: NetworkMessage) -> dict:
        """
        序列化消息
        
        Args:
            message: 网络消息
            
        Returns:
            序列化后的字典
        """
        return {
            "message_id": message.message_id,
            "from_agent_id": message.from_agent_id,
            "to_agent_id": message.to_agent_id,
            "message_type": message.message_type,
            "payload": message.payload,
            "timestamp": message.timestamp,
            "ttl": message.ttl,
        }
    
    def deserialize_message(self, data: dict) -> NetworkMessage:
        """
        反序列化消息
        
        Args:
            data: 字典数据
            
        Returns:
            NetworkMessage实例
        """
        return NetworkMessage(
            message_id=data.get("message_id", ""),
            from_agent_id=data.get("from_agent_id", ""),
            to_agent_id=data.get("to_agent_id", ""),
            message_type=data.get("message_type", ""),
            payload=data.get("payload", {}),
            timestamp=data.get("timestamp", 0),
            ttl=data.get("ttl", 10),
        )
    
    def register_message_handler(
        self,
        message_type: str,
        handler: Callable[[NetworkMessage], Awaitable[None]],
    ) -> None:
        """
        注册消息处理器
        
        Args:
            message_type: 消息类型
            handler: 消息处理函数
        """
        if message_type not in self._message_handlers:
            self._message_handlers[message_type] = []
        self._message_handlers[message_type].append(handler)
        logger.info("注册消息处理器: %s", message_type)
    
    async def handle_incoming_message(self, message: NetworkMessage) -> None:
        """
        处理传入的消息
        
        Args:
            message: 网络消息
        """
        # 检查消息TTL
        if message.ttl <= 0:
            logger.warning("消息TTL已过期: %s", message.message_id)
            return
        
        # 更新发送方状态
        from_endpoint = self._endpoints.get(message.from_agent_id)
        if from_endpoint:
            from_endpoint.last_heartbeat = time.time()
        
        # 投递消息
        await self._deliver_locally(message)
    
    def update_heartbeat(self, agent_id: str) -> None:
        """
        更新智能体心跳
        
        Args:
            agent_id: 智能体ID
        """
        endpoint = self._endpoints.get(agent_id)
        if endpoint:
            endpoint.last_heartbeat = time.time()
            endpoint.status = "online"
    
    def check_health(self) -> Dict[str, Any]:
        """
        检查网络健康状态
        
        Returns:
            健康状态信息
        """
        now = time.time()
        online_count = 0
        offline_count = 0
        
        for endpoint in self._endpoints.values():
            if now - endpoint.last_heartbeat < 60:  # 60秒内有心跳
                online_count += 1
            else:
                offline_count += 1
                endpoint.status = "offline"
        
        return {
            "network_id": self._local_network_id,
            "total_endpoints": len(self._endpoints),
            "online": online_count,
            "offline": offline_count,
        }
