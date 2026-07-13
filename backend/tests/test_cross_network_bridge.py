"""
测试 CrossNetworkBridge - 跨网络智能体桥接
"""
import asyncio
import time
import pytest
from unittest.mock import AsyncMock, MagicMock

from cross_network_bridge import CrossNetworkBridge, AgentEndpoint, NetworkMessage


@pytest.mark.asyncio
async def test_register_endpoint():
    """测试注册智能体端点"""
    bridge = CrossNetworkBridge(local_network_id="test-network")
    
    endpoint = AgentEndpoint(
        agent_id="agent-1",
        name="Test Agent",
        role="executor",
        location="local",
        network_id="test-network",
    )
    
    bridge.register_endpoint(endpoint)
    
    assert bridge.get_endpoint("agent-1") == endpoint
    assert len(bridge._endpoints) == 1


@pytest.mark.asyncio
async def test_unregister_endpoint():
    """测试注销智能体端点"""
    bridge = CrossNetworkBridge(local_network_id="test-network")
    
    endpoint = AgentEndpoint(
        agent_id="agent-1",
        name="Test Agent",
        role="executor",
        location="local",
        network_id="test-network",
    )
    
    bridge.register_endpoint(endpoint)
    assert bridge.get_endpoint("agent-1") is not None
    
    bridge.unregister_endpoint("agent-1")
    assert bridge.get_endpoint("agent-1") is None


@pytest.mark.asyncio
async def test_get_available_agents():
    """测试获取可用智能体"""
    bridge = CrossNetworkBridge(local_network_id="test-network")
    
    # 注册本地智能体
    local_endpoint = AgentEndpoint(
        agent_id="agent-local",
        name="Local Agent",
        role="executor",
        location="local",
        network_id="test-network",
        status="online",
    )
    bridge.register_endpoint(local_endpoint)
    
    # 注册远端智能体
    remote_endpoint = AgentEndpoint(
        agent_id="agent-remote",
        name="Remote Agent",
        role="reviewer",
        location="remote",
        network_id="remote-network",
        status="online",
    )
    bridge.register_endpoint(remote_endpoint)
    
    # 获取所有智能体
    all_agents = bridge.get_available_agents()
    assert len(all_agents) == 2
    
    # 按位置过滤
    local_agents = bridge.get_available_agents(location="local")
    assert len(local_agents) == 1
    assert local_agents[0].agent_id == "agent-local"
    
    remote_agents = bridge.get_available_agents(location="remote")
    assert len(remote_agents) == 1
    assert remote_agents[0].agent_id == "agent-remote"


@pytest.mark.asyncio
async def test_send_message_locally():
    """测试本地消息投递"""
    bridge = CrossNetworkBridge(local_network_id="test-network")
    
    # 注册智能体
    endpoint = AgentEndpoint(
        agent_id="agent-1",
        name="Test Agent",
        role="executor",
        location="local",
        network_id="test-network",
    )
    bridge.register_endpoint(endpoint)
    
    # 注册消息处理器
    received_messages = []
    
    async def handler(message: NetworkMessage):
        received_messages.append(message)
    
    bridge.register_message_handler("test_message", handler)
    
    # 发送消息
    result = await bridge.send_message(
        from_agent_id="sender",
        to_agent_id="agent-1",
        message_type="test_message",
        payload={"data": "test"},
    )
    
    assert result == True
    assert len(received_messages) == 1
    assert received_messages[0].payload == {"data": "test"}


@pytest.mark.asyncio
async def test_send_message_remotely():
    """测试远端消息投递"""
    send_to_remote_fn = AsyncMock()
    bridge = CrossNetworkBridge(
        local_network_id="test-network",
        send_to_remote_fn=send_to_remote_fn,
    )
    
    # 注册远端智能体
    endpoint = AgentEndpoint(
        agent_id="agent-remote",
        name="Remote Agent",
        role="executor",
        location="remote",
        network_id="remote-network",
    )
    bridge.register_endpoint(endpoint)
    
    # 发送消息
    result = await bridge.send_message(
        from_agent_id="sender",
        to_agent_id="agent-remote",
        message_type="test_message",
        payload={"data": "test"},
    )
    
    assert result == True
    send_to_remote_fn.assert_called_once()


@pytest.mark.asyncio
async def test_update_heartbeat():
    """测试心跳更新"""
    bridge = CrossNetworkBridge(local_network_id="test-network")
    
    endpoint = AgentEndpoint(
        agent_id="agent-1",
        name="Test Agent",
        role="executor",
        location="local",
        network_id="test-network",
        last_heartbeat=0,
    )
    bridge.register_endpoint(endpoint)
    
    # 更新心跳
    bridge.update_heartbeat("agent-1")
    
    updated_endpoint = bridge.get_endpoint("agent-1")
    assert updated_endpoint.last_heartbeat > 0
    assert updated_endpoint.status == "online"


@pytest.mark.asyncio
async def test_check_health():
    """测试健康检查"""
    bridge = CrossNetworkBridge(local_network_id="test-network")
    
    # 注册在线智能体
    online_endpoint = AgentEndpoint(
        agent_id="agent-online",
        name="Online Agent",
        role="executor",
        location="local",
        network_id="test-network",
        status="online",
        last_heartbeat=time.time(),
    )
    bridge.register_endpoint(online_endpoint)
    
    # 注册离线智能体
    offline_endpoint = AgentEndpoint(
        agent_id="agent-offline",
        name="Offline Agent",
        role="executor",
        location="local",
        network_id="test-network",
        status="online",
        last_heartbeat=time.time() - 120,  # 2分钟前
    )
    bridge.register_endpoint(offline_endpoint)
    
    # 检查健康状态
    health = bridge.check_health()
    
    assert health["network_id"] == "test-network"
    assert health["total_endpoints"] == 2
    assert health["online"] == 1
    assert health["offline"] == 1


# ── get_endpoint ──

@pytest.mark.asyncio
async def test_get_endpoint():
    """get_endpoint 应返回已注册的端点"""
    bridge = CrossNetworkBridge(local_network_id="test-net")
    ep = AgentEndpoint(
        agent_id="a1", name="Agent-1", role="executor",
        location="local", network_id="test-net", status="online",
    )
    bridge.register_endpoint(ep)
    assert bridge.get_endpoint("a1") is not None
    assert bridge.get_endpoint("a1").name == "Agent-1"
    assert bridge.get_endpoint("nonexistent") is None


# ── serialize / deserialize ──

def test_serialize_deserialize_roundtrip():
    """序列化→反序列化应保持数据一致"""
    bridge = CrossNetworkBridge(local_network_id="test-net")
    msg = NetworkMessage(
        message_id="msg-1",
        from_agent_id="a1",
        to_agent_id="a2",
        message_type="task_assign",
        payload={"task": "build UI"},
        timestamp=time.time(),
    )
    data = bridge.serialize_message(msg)
    assert isinstance(data, dict)
    assert data["message_id"] == "msg-1"
    assert data["from_agent_id"] == "a1"

    restored = bridge.deserialize_message(data)
    assert restored.message_id == msg.message_id
    assert restored.from_agent_id == msg.from_agent_id
    assert restored.payload == msg.payload


# ── register_message_handler ──

@pytest.mark.asyncio
async def test_register_message_handler():
    """注册消息处理器后应能接收消息"""
    bridge = CrossNetworkBridge(local_network_id="test-net")
    received = []

    async def handler(msg):
        received.append(msg)

    bridge.register_message_handler("task_result", handler)

    ep = AgentEndpoint(
        agent_id="a1", name="Agent-1", role="executor",
        location="local", network_id="test-net", status="online",
    )
    bridge.register_endpoint(ep)

    msg = NetworkMessage(
        message_id="msg-2", from_agent_id="a1", to_agent_id="a2",
        message_type="task_result", payload={"result": "done"},
        timestamp=time.time(),
    )
    await bridge.handle_incoming_message(msg)
    assert len(received) == 1
    assert received[0].payload["result"] == "done"


@pytest.mark.asyncio
async def test_handle_incoming_no_handler():
    """无处理器时不应崩溃"""
    bridge = CrossNetworkBridge(local_network_id="test-net")
    msg = NetworkMessage(
        message_id="msg-3", from_agent_id="a1", to_agent_id="a2",
        message_type="unknown_type", payload={},
        timestamp=time.time(),
    )
    # 不应抛异常
    await bridge.handle_incoming_message(msg)


# ── send_message error cases ──

@pytest.mark.asyncio
async def test_send_message_to_nonexistent():
    """发送消息到不存在的端点应返回失败"""
    bridge = CrossNetworkBridge(local_network_id="test-net")
    result = await bridge.send_message("a1", "ghost", "test", {"data": "x"})
    assert result is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
