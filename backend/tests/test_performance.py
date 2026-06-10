"""
性能测试 - 并行多Agent系统

测试KeyManager和MessageQueue的性能。
"""
import asyncio
import os
import sys
import time
import unittest

# 添加backend目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from key_manager import KeyConfig, KeyManager
from message_queue import MessageQueue, MessagePriority
from protocol import AgentRole


class TestKeyManagerPerformance(unittest.TestCase):
    """KeyManager性能测试"""
    
    def test_rate_limit_check_performance(self):
        """测试rate limit检查性能"""
        key_manager = KeyManager(default_config=KeyConfig(api_key="test", rate_limit=10000))
        
        # 预热
        for _ in range(100):
            key_manager.check_rate_limit(AgentRole.EXECUTOR)
        
        # 性能测试
        iterations = 10000
        start_time = time.time()
        
        for _ in range(iterations):
            key_manager.check_rate_limit(AgentRole.EXECUTOR)
        
        elapsed = time.time() - start_time
        
        print(f"\nRate limit检查性能: {iterations}次, 耗时{elapsed:.3f}秒, "
              f"QPS={iterations/elapsed:.0f}")
        
        # 应该能在1秒内完成10000次检查
        self.assertLess(elapsed, 1.0)
    
    def test_record_usage_performance(self):
        """测试记录使用性能"""
        key_manager = KeyManager(default_config=KeyConfig(api_key="test", rate_limit=100000))
        
        iterations = 10000
        start_time = time.time()
        
        for _ in range(iterations):
            key_manager.record_usage(AgentRole.PLANNER)
        
        elapsed = time.time() - start_time
        
        print(f"\n记录使用性能: {iterations}次, 耗时{elapsed:.3f}秒, "
              f"QPS={iterations/elapsed:.0f}")
        
        self.assertLess(elapsed, 1.0)
    
    def test_concurrent_access(self):
        """测试并发访问"""
        key_manager = KeyManager(default_config=KeyConfig(api_key="test", rate_limit=100000))
        
        async def worker(role, count):
            for _ in range(count):
                key_manager.check_rate_limit(role)
                key_manager.record_usage(role)
        
        async def run_test():
            workers = [
                worker(AgentRole.PLANNER, 1000),
                worker(AgentRole.EXECUTOR, 1000),
                worker(AgentRole.MONITOR, 1000),
                worker(AgentRole.REVIEWER, 1000),
            ]
            
            start_time = time.time()
            await asyncio.gather(*workers)
            elapsed = time.time() - start_time
            
            print(f"\n并发访问性能: 4个worker各1000次, 耗时{elapsed:.3f}秒")
            
            # 验证计数
            for role in [AgentRole.PLANNER, AgentRole.EXECUTOR, 
                        AgentRole.MONITOR, AgentRole.REVIEWER]:
                stats = key_manager.get_usage_stats(role)
                self.assertEqual(stats["count"], 1000)
        
        asyncio.run(run_test())


class TestMessageQueuePerformance(unittest.TestCase):
    """MessageQueue性能测试"""
    
    def setUp(self):
        """测试前准备"""
        self.db_path = os.path.join(os.path.dirname(__file__), "test_perf_queue.db")
    
    def tearDown(self):
        """测试后清理"""
        if os.path.exists(self.db_path):
            os.remove(self.db_path)
    
    def test_publish_performance(self):
        """测试发布性能"""
        async def run_test():
            queue = MessageQueue(db_path=self.db_path)
            queue.start()
            
            try:
                iterations = 1000
                start_time = time.time()
                
                for i in range(iterations):
                    await queue.publish("test_topic", {"index": i})
                
                elapsed = time.time() - start_time
                
                print(f"\n发布性能: {iterations}次, 耗时{elapsed:.3f}秒, "
                      f"QPS={iterations/elapsed:.0f}")
                
                # 验证队列大小
                size = await queue.get_queue_size("test_topic")
                self.assertEqual(size, iterations)
                
                self.assertLess(elapsed, 10.0)
                
            finally:
                queue.stop()
        
        asyncio.run(run_test())
    
    def test_batch_publish_performance(self):
        """测试批量发布性能"""
        async def run_test():
            queue = MessageQueue(db_path=self.db_path)
            queue.start()
            
            try:
                # 批量发布到不同主题
                topics = [f"topic_{i}" for i in range(10)]
                iterations_per_topic = 100
                
                start_time = time.time()
                
                for topic in topics:
                    for i in range(iterations_per_topic):
                        await queue.publish(topic, {"index": i})
                
                elapsed = time.time() - start_time
                total = len(topics) * iterations_per_topic
                
                print(f"\n批量发布性能: {total}次(10主题×100条), 耗时{elapsed:.3f}秒, "
                      f"QPS={total/elapsed:.0f}")
                
                # 验证
                all_sizes = await queue.get_all_queue_sizes()
                self.assertEqual(len(all_sizes), 10)
                
                for topic in topics:
                    self.assertEqual(all_sizes[topic], iterations_per_topic)
                
            finally:
                queue.stop()
        
        asyncio.run(run_test())
    
    def test_queue_size_performance(self):
        """测试队列大小查询性能"""
        async def run_test():
            queue = MessageQueue(db_path=self.db_path)
            queue.start()
            
            try:
                # 先发布一些消息
                for i in range(100):
                    await queue.publish("test_topic", {"index": i})
                
                # 性能测试
                iterations = 10000
                start_time = time.time()
                
                for _ in range(iterations):
                    await queue.get_queue_size("test_topic")
                
                elapsed = time.time() - start_time
                
                print(f"\n队列大小查询性能: {iterations}次, 耗时{elapsed:.3f}秒, "
                      f"QPS={iterations/elapsed:.0f}")
                
                self.assertLess(elapsed, 1.0)
                
            finally:
                queue.stop()
        
        asyncio.run(run_test())


class TestIntegratedPerformance(unittest.TestCase):
    """集成性能测试"""
    
    def test_full_workflow_performance(self):
        """测试完整工作流性能"""
        async def run_test():
            # 初始化
            key_manager = KeyManager(default_config=KeyConfig(api_key="test", rate_limit=100000))
            db_path = os.path.join(os.path.dirname(__file__), "test_integrated_perf.db")
            queue = MessageQueue(db_path=db_path)
            queue.start()
            
            try:
                # 模拟多角色讨论
                roles = [AgentRole.PLANNER, AgentRole.EXECUTOR, 
                        AgentRole.MONITOR, AgentRole.REVIEWER]
                
                start_time = time.time()
                
                # 每个角色发布100条消息
                for role in roles:
                    for i in range(100):
                        # 检查rate limit
                        if key_manager.check_rate_limit(role):
                            key_manager.record_usage(role)
                            
                            # 发布消息
                            await queue.publish(f"discussion_{role.value}", {
                                "role": role.value,
                                "content": f"消息{i}",
                                "round": i // 10
                            })
                
                elapsed = time.time() - start_time
                total_messages = len(roles) * 100
                
                print(f"\n完整工作流性能: {total_messages}条消息, 耗时{elapsed:.3f}秒, "
                      f"QPS={total_messages/elapsed:.0f}")
                
                # 验证
                for role in roles:
                    stats = key_manager.get_usage_stats(role)
                    self.assertEqual(stats["count"], 100)
                
                all_sizes = await queue.get_all_queue_sizes()
                self.assertEqual(len(all_sizes), len(roles))
                
            finally:
                queue.stop()
                if os.path.exists(db_path):
                    os.remove(db_path)
        
        asyncio.run(run_test())


if __name__ == "__main__":
    unittest.main()
