"""
并行多Agent系统模块测试

测试KeyManager、MessageQueue、AgentPool和ParallelDiscussionManager。
"""
import asyncio
import os
import sys
import tempfile
import time
import unittest

# 添加backend目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from key_manager import KeyManager, KeyConfig
from message_queue import MessageQueue, MessagePriority, MessageStatus
from protocol import AgentRole


class TestKeyManager(unittest.TestCase):
    """KeyManager测试"""
    
    def setUp(self):
        """测试前准备"""
        self.default_config = KeyConfig(
            api_key="default_key",
            base_url="https://api.example.com",
            rate_limit=100
        )
        self.key_manager = KeyManager(default_config=self.default_config)
    
    def test_default_config(self):
        """测试默认配置"""
        config = self.key_manager.get_config(AgentRole.CEO)
        self.assertEqual(config.api_key, "default_key")
        self.assertEqual(config.rate_limit, 100)
    
    def test_custom_config(self):
        """测试自定义配置"""
        custom_config = KeyConfig(
            api_key="custom_key",
            rate_limit=200
        )
        self.key_manager.configure(AgentRole.PLANNER, custom_config)
        
        config = self.key_manager.get_config(AgentRole.PLANNER)
        self.assertEqual(config.api_key, "custom_key")
        self.assertEqual(config.rate_limit, 200)
    
    def test_rate_limit(self):
        """测试rate limit检查"""
        config = KeyConfig(api_key="test_key", rate_limit=2)
        self.key_manager.configure(AgentRole.EXECUTOR, config)
        
        # 前两次应该通过
        self.assertTrue(self.key_manager.check_rate_limit(AgentRole.EXECUTOR))
        self.key_manager.record_usage(AgentRole.EXECUTOR)
        
        self.assertTrue(self.key_manager.check_rate_limit(AgentRole.EXECUTOR))
        self.key_manager.record_usage(AgentRole.EXECUTOR)
        
        # 第三次应该超出限制
        self.assertFalse(self.key_manager.check_rate_limit(AgentRole.EXECUTOR))
    
    def test_usage_stats(self):
        """测试使用统计"""
        config = KeyConfig(api_key="test_key", rate_limit=10)
        self.key_manager.configure(AgentRole.REVIEWER, config)
        
        # 记录几次使用
        for _ in range(3):
            self.key_manager.record_usage(AgentRole.REVIEWER)
        
        stats = self.key_manager.get_usage_stats(AgentRole.REVIEWER)
        self.assertEqual(stats["count"], 3)
        self.assertEqual(stats["remaining"], 7)
    
    def test_reset_usage(self):
        """测试重置使用计数"""
        config = KeyConfig(api_key="test_key", rate_limit=10)
        self.key_manager.configure(AgentRole.MONITOR, config)
        
        # 记录使用
        self.key_manager.record_usage(AgentRole.MONITOR)
        self.key_manager.record_usage(AgentRole.MONITOR)
        
        # 重置
        self.key_manager.reset_usage(AgentRole.MONITOR)
        
        stats = self.key_manager.get_usage_stats(AgentRole.MONITOR)
        self.assertEqual(stats["count"], 0)
    
    def test_remove_config(self):
        """测试移除配置"""
        config = KeyConfig(api_key="test_key")
        self.key_manager.configure(AgentRole.COORDINATOR, config)
        
        # 移除配置
        result = self.key_manager.remove_config(AgentRole.COORDINATOR)
        self.assertTrue(result)
        
        # 应该使用默认配置
        config = self.key_manager.get_config(AgentRole.COORDINATOR)
        self.assertEqual(config.api_key, "default_key")


class TestMessageQueue(unittest.TestCase):
    """MessageQueue测试"""
    
    def setUp(self):
        """测试前准备"""
        self.db_path = os.path.join(tempfile.gettempdir(), "test_message_queue.db")
        self.queue = MessageQueue(db_path=self.db_path)
        self.queue.start()
    
    def tearDown(self):
        """测试后清理"""
        self.queue.stop()
        if os.path.exists(self.db_path):
            os.remove(self.db_path)
    
    def test_publish_message(self):
        """测试发布消息"""
        async def run_test():
            message = await self.queue.publish(
                topic="test_topic",
                payload={"data": "test"},
                priority=MessagePriority.NORMAL
            )
            
            self.assertIsNotNone(message.id)
            self.assertEqual(message.topic, "test_topic")
            self.assertEqual(message.status, MessageStatus.PENDING)
        
        asyncio.run(run_test())
    
    def test_queue_size(self):
        """测试队列大小"""
        async def run_test():
            # 发布几条消息
            await self.queue.publish("test_topic", "msg1")
            await self.queue.publish("test_topic", "msg2")
            await self.queue.publish("other_topic", "msg3")
            
            size = await self.queue.get_queue_size("test_topic")
            self.assertEqual(size, 2)
            
            all_sizes = await self.queue.get_all_queue_sizes()
            self.assertEqual(all_sizes["test_topic"], 2)
            self.assertEqual(all_sizes["other_topic"], 1)
        
        asyncio.run(run_test())
    
    def test_persistence(self):
        """测试消息持久化"""
        async def run_test():
            # 发布消息
            await self.queue.publish("test_topic", "persisted_payload")
            
            # 从数据库获取待处理消息
            messages = self.queue.get_pending_messages("test_topic")
            self.assertEqual(len(messages), 1)
            self.assertEqual(messages[0].payload, "persisted_payload")
        
        asyncio.run(run_test())
    
    def test_clear_queue(self):
        """测试清空队列"""
        async def run_test():
            # 发布消息
            await self.queue.publish("test_topic", "msg1")
            await self.queue.publish("test_topic", "msg2")
            
            # 清空队列
            count = self.queue.clear_queue("test_topic")
            self.assertEqual(count, 2)
            
            size = await self.queue.get_queue_size("test_topic")
            self.assertEqual(size, 0)
        
        asyncio.run(run_test())
    
    def test_multiple_topics(self):
        """测试多主题"""
        async def run_test():
            # 发布到不同主题
            await self.queue.publish("topic1", "msg1")
            await self.queue.publish("topic2", "msg2")
            await self.queue.publish("topic1", "msg3")
            
            # 检查各主题的队列大小
            size1 = await self.queue.get_queue_size("topic1")
            size2 = await self.queue.get_queue_size("topic2")
            
            self.assertEqual(size1, 2)
            self.assertEqual(size2, 1)
        
        asyncio.run(run_test())


class TestIntegration(unittest.TestCase):
    """集成测试"""
    
    def test_key_manager_with_queue(self):
        """测试KeyManager与MessageQueue集成"""
        async def run_test():
            # 初始化KeyManager
            key_manager = KeyManager()
            config = KeyConfig(api_key="test_key", rate_limit=10)
            key_manager.configure(AgentRole.EXECUTOR, config)
            
            # 初始化MessageQueue
            db_path = os.path.join(tempfile.gettempdir(), "test_integration.db")
            queue = MessageQueue(db_path=db_path)
            queue.start()
            
            try:
                # 检查rate limit
                self.assertTrue(key_manager.check_rate_limit(AgentRole.EXECUTOR))
                
                # 发布消息
                message = await queue.publish("test_topic", "test_payload")
                self.assertIsNotNone(message)
                
                # 记录使用
                key_manager.record_usage(AgentRole.EXECUTOR)
                
                # 检查使用统计
                stats = key_manager.get_usage_stats(AgentRole.EXECUTOR)
                self.assertEqual(stats["count"], 1)
                
            finally:
                queue.stop()
                if os.path.exists(db_path):
                    os.remove(db_path)
        
        asyncio.run(run_test())


if __name__ == "__main__":
    unittest.main()
