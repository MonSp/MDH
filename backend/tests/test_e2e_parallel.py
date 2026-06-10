"""
端到端测试 - 并行多Agent系统

测试ParallelMeetingCoordinator的完整流程。
使用mock避免依赖agentscope。
"""
import asyncio
import os
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

# 添加backend目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 模拟agentscope模块
sys.modules['agentscope'] = MagicMock()
sys.modules['agentscope.agent'] = MagicMock()
sys.modules['agentscope.message'] = MagicMock()
sys.modules['agentscope.model'] = MagicMock()
sys.modules['agentscope.formatter'] = MagicMock()
sys.modules['agentscope.credential'] = MagicMock()
sys.modules['agentscope.event'] = MagicMock()
sys.modules['agentscope.skill'] = MagicMock()
sys.modules['agentscope.tool'] = MagicMock()

from key_manager import KeyConfig, KeyManager
from message_queue import MessageQueue, MessagePriority
from protocol import AgentRole


class TestKeyManagerE2E(unittest.TestCase):
    """KeyManager端到端测试"""
    
    def test_multi_role_key_config(self):
        """测试多角色密钥配置"""
        key_manager = KeyManager()
        
        # 为不同角色配置不同密钥
        configs = {
            AgentRole.PLANNER: KeyConfig(api_key="planner_key", rate_limit=100),
            AgentRole.EXECUTOR: KeyConfig(api_key="executor_key", rate_limit=200),
            AgentRole.MONITOR: KeyConfig(api_key="monitor_key", rate_limit=50),
        }
        
        for role, config in configs.items():
            key_manager.configure(role, config)
        
        # 验证配置
        for role, expected_config in configs.items():
            actual_config = key_manager.get_config(role)
            self.assertEqual(actual_config.api_key, expected_config.api_key)
            self.assertEqual(actual_config.rate_limit, expected_config.rate_limit)
        
        # 测试rate limit
        self.assertTrue(key_manager.check_rate_limit(AgentRole.MONITOR))
        
        # 消耗完rate limit
        for _ in range(50):
            key_manager.record_usage(AgentRole.MONITOR)
        
        self.assertFalse(key_manager.check_rate_limit(AgentRole.MONITOR))
        
        # 其他角色不受影响
        self.assertTrue(key_manager.check_rate_limit(AgentRole.PLANNER))
    
    def test_key_stats(self):
        """测试密钥统计"""
        key_manager = KeyManager(default_config=KeyConfig(api_key="default", rate_limit=100))
        
        # 记录使用
        for _ in range(5):
            key_manager.record_usage(AgentRole.EXECUTOR)
        
        stats = key_manager.get_all_stats()
        
        self.assertIn("executor", stats)
        self.assertEqual(stats["executor"]["count"], 5)
        self.assertEqual(stats["executor"]["remaining"], 95)


class TestMessageQueueE2E(unittest.TestCase):
    """MessageQueue端到端测试"""
    
    def setUp(self):
        """测试前准备"""
        self.db_path = os.path.join(os.path.dirname(__file__), "test_e2e_queue.db")
    
    def tearDown(self):
        """测试后清理"""
        if os.path.exists(self.db_path):
            os.remove(self.db_path)
    
    def test_full_lifecycle(self):
        """测试完整生命周期"""
        async def run_test():
            queue = MessageQueue(db_path=self.db_path)
            queue.start()
            
            try:
                # 发布多条消息
                msg1 = await queue.publish("topic1", {"data": "msg1"}, MessagePriority.HIGH)
                msg2 = await queue.publish("topic1", {"data": "msg2"}, MessagePriority.LOW)
                msg3 = await queue.publish("topic2", {"data": "msg3"}, MessagePriority.NORMAL)
                
                # 验证队列大小
                size1 = await queue.get_queue_size("topic1")
                size2 = await queue.get_queue_size("topic2")
                self.assertEqual(size1, 2)
                self.assertEqual(size2, 1)
                
                # 验证持久化
                pending1 = queue.get_pending_messages("topic1")
                pending2 = queue.get_pending_messages("topic2")
                self.assertEqual(len(pending1), 2)
                self.assertEqual(len(pending2), 1)
                
                # 清空队列
                cleared = queue.clear_queue("topic1")
                self.assertEqual(cleared, 2)
                
                size1_after = await queue.get_queue_size("topic1")
                self.assertEqual(size1_after, 0)
                
            finally:
                queue.stop()
        
        asyncio.run(run_test())
    
    def test_multiple_queues(self):
        """测试多队列场景"""
        async def run_test():
            queue = MessageQueue(db_path=self.db_path)
            queue.start()
            
            try:
                # 发布到不同主题
                topics = ["discussion", "task", "review", "notification"]
                for i, topic in enumerate(topics):
                    await queue.publish(topic, {"index": i})
                
                # 验证所有主题
                all_sizes = await queue.get_all_queue_sizes()
                self.assertEqual(len(all_sizes), 4)
                
                for topic in topics:
                    self.assertEqual(all_sizes[topic], 1)
                
            finally:
                queue.stop()
        
        asyncio.run(run_test())


class TestIntegrationE2E(unittest.TestCase):
    """集成端到端测试"""
    
    def test_key_manager_queue_integration(self):
        """测试KeyManager和MessageQueue集成"""
        async def run_test():
            # 初始化KeyManager
            key_manager = KeyManager(default_config=KeyConfig(api_key="default", rate_limit=100))
            
            # 为不同角色配置
            key_manager.configure(AgentRole.PLANNER, KeyConfig(api_key="p1", rate_limit=10))
            key_manager.configure(AgentRole.EXECUTOR, KeyConfig(api_key="e1", rate_limit=20))
            
            # 初始化MessageQueue
            db_path = os.path.join(os.path.dirname(__file__), "test_integration_queue.db")
            queue = MessageQueue(db_path=db_path)
            queue.start()
            
            try:
                # 模拟讨论流程
                for i in range(5):
                    # 检查rate limit
                    if key_manager.check_rate_limit(AgentRole.PLANNER):
                        key_manager.record_usage(AgentRole.PLANNER)
                        
                        # 发布讨论结果
                        await queue.publish("discussion", {
                            "role": "planner",
                            "content": f"建议方案{i}",
                            "round": i
                        })
                
                # 验证
                stats = key_manager.get_usage_stats(AgentRole.PLANNER)
                self.assertEqual(stats["count"], 5)
                
                queue_size = await queue.get_queue_size("discussion")
                self.assertEqual(queue_size, 5)
                
            finally:
                queue.stop()
                if os.path.exists(db_path):
                    os.remove(db_path)
        
        asyncio.run(run_test())


if __name__ == "__main__":
    unittest.main()
