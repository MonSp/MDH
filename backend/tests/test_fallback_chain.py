"""
Fallback Chain 回退链机制测试
"""

import pytest
import asyncio
from backend.fallback_chain import (
    FallbackChain, FallbackStep, FallbackResult, FallbackExecutor,
    RoutingFallbackBuilder, WorkflowFallbackBuilder,
)


class TestFallbackChain:
    """FallbackChain测试"""
    
    def test_get_all_targets(self):
        """获取所有目标"""
        chain = FallbackChain(
            primary="frontend",
            fallbacks=[
                FallbackStep(target_id="fullstack", reason="备选1"),
                FallbackStep(target_id="backend", reason="备选2"),
            ],
        )
        assert chain.get_all_targets() == ["frontend", "fullstack", "backend"]
    
    def test_empty_fallbacks(self):
        """无备选路径"""
        chain = FallbackChain(primary="frontend")
        assert chain.get_all_targets() == ["frontend"]


class TestRoutingFallbackBuilder:
    """RoutingFallbackBuilder测试"""
    
    def test_build_from_candidates(self):
        """从候选列表构建"""
        candidates = [
            {"dept_id": "frontend", "score": 0.9},
            {"dept_id": "fullstack", "score": 0.7},
            {"dept_id": "backend", "score": 0.5},
        ]
        
        chain = RoutingFallbackBuilder.build_from_candidates(candidates)
        assert chain.primary == "frontend"
        assert len(chain.fallbacks) == 2
        assert chain.fallbacks[0].target_id == "fullstack"
        assert chain.fallbacks[1].target_id == "backend"
    
    def test_build_max_fallbacks(self):
        """限制最大备选数"""
        candidates = [
            {"dept_id": "frontend", "score": 0.9},
            {"dept_id": "fullstack", "score": 0.7},
            {"dept_id": "backend", "score": 0.5},
            {"dept_id": "devops", "score": 0.3},
        ]
        
        chain = RoutingFallbackBuilder.build_from_candidates(candidates, max_fallbacks=1)
        assert chain.primary == "frontend"
        assert len(chain.fallbacks) == 1
        assert chain.fallbacks[0].target_id == "fullstack"
    
    def test_build_empty_candidates(self):
        """空候选列表"""
        with pytest.raises(ValueError):
            RoutingFallbackBuilder.build_from_candidates([])
    
    def test_build_single_candidate(self):
        """单个候选"""
        candidates = [{"dept_id": "frontend", "score": 0.9}]
        chain = RoutingFallbackBuilder.build_from_candidates(candidates)
        assert chain.primary == "frontend"
        assert len(chain.fallbacks) == 0


class TestWorkflowFallbackBuilder:
    """WorkflowFallbackBuilder测试"""
    
    def test_build_for_node(self):
        """为节点构建回退链"""
        chain = WorkflowFallbackBuilder.build_for_node(
            "frontend",
            ["fullstack", "backend"],
        )
        assert chain.primary == "frontend"
        assert len(chain.fallbacks) == 2
        assert chain.fallbacks[0].target_id == "fullstack"
        assert chain.fallbacks[1].target_id == "backend"


class TestFallbackExecutor:
    """FallbackExecutor测试"""
    
    def test_execute_success_first(self):
        """首选成功"""
        async def test():
            chain = FallbackChain(
                primary="frontend",
                fallbacks=[FallbackStep(target_id="backend", reason="备选")],
            )
            
            async def executor(target_id):
                return {"status": "ok"}
            
            executor_instance = FallbackExecutor()
            result = await executor_instance.execute_with_fallback(chain, executor)
            
            assert result.success is True
            assert result.target_id == "frontend"
            assert result.attempts == 1
            assert result.fallback_used is False
        
        asyncio.run(test())
    
    def test_execute_fallback_success(self):
        """首选失败，备选成功"""
        async def test():
            chain = FallbackChain(
                primary="frontend",
                fallbacks=[
                    FallbackStep(target_id="fullstack", reason="备选1"),
                    FallbackStep(target_id="backend", reason="备选2"),
                ],
            )
            
            call_log = []
            
            async def executor(target_id):
                call_log.append(target_id)
                if target_id == "frontend":
                    raise ValueError("前端不可用")
                return {"status": "ok"}
            
            executor_instance = FallbackExecutor()
            result = await executor_instance.execute_with_fallback(chain, executor)
            
            assert result.success is True
            assert result.target_id == "fullstack"
            assert result.attempts == 2
            assert result.fallback_used is True
            assert call_log == ["frontend", "fullstack"]
        
        asyncio.run(test())
    
    def test_execute_all_fail(self):
        """全部失败"""
        async def test():
            chain = FallbackChain(
                primary="frontend",
                fallbacks=[FallbackStep(target_id="backend", reason="备选")],
            )
            
            async def executor(target_id):
                raise ValueError(f"{target_id}不可用")
            
            executor_instance = FallbackExecutor()
            result = await executor_instance.execute_with_fallback(chain, executor)
            
            assert result.success is False
            assert result.attempts == 2
            assert result.fallback_used is True
        
        asyncio.run(test())
    
    def test_execute_max_attempts(self):
        """最大尝试次数限制"""
        async def test():
            chain = FallbackChain(
                primary="a",
                fallbacks=[
                    FallbackStep(target_id="b", reason="备选1"),
                    FallbackStep(target_id="c", reason="备选2"),
                    FallbackStep(target_id="d", reason="备选3"),
                ],
                max_attempts=2,
            )
            
            call_log = []
            
            async def executor(target_id):
                call_log.append(target_id)
                raise ValueError(f"{target_id}失败")
            
            executor_instance = FallbackExecutor()
            result = await executor_instance.execute_with_fallback(chain, executor)
            
            assert result.success is False
            assert result.attempts == 2
            assert call_log == ["a", "b"]  # 只尝试了2次
        
        asyncio.run(test())
    
    def test_compensation_triggered(self):
        """全部失败后触发补偿"""
        async def test():
            chain = FallbackChain(
                primary="frontend",
                fallbacks=[],
            )
            
            async def executor(target_id):
                raise ValueError("失败")
            
            compensation_called = False
            
            async def compensation(context):
                nonlocal compensation_called
                compensation_called = True
                return True
            
            executor_instance = FallbackExecutor(compensation_callback=compensation)
            result = await executor_instance.execute_with_fallback(
                chain, executor, context={"task_id": "test"}
            )
            
            assert result.success is False
            assert result.compensated is True
            assert compensation_called is True
        
        asyncio.run(test())
    
    def test_compensation_not_triggered_without_callback(self):
        """无补偿回调时不触发补偿"""
        async def test():
            chain = FallbackChain(primary="frontend", fallbacks=[])
            
            async def executor(target_id):
                raise ValueError("失败")
            
            executor_instance = FallbackExecutor()  # 无补偿回调
            result = await executor_instance.execute_with_fallback(chain, executor)
            
            assert result.success is False
            assert result.compensated is False
        
        asyncio.run(test())
    
    def test_results_recorded(self):
        """每次尝试的结果都应被记录"""
        async def test():
            chain = FallbackChain(
                primary="frontend",
                fallbacks=[FallbackStep(target_id="backend", reason="备选")],
            )
            
            async def executor(target_id):
                if target_id == "frontend":
                    raise ValueError("前端失败")
                return {"data": "ok"}
            
            executor_instance = FallbackExecutor()
            result = await executor_instance.execute_with_fallback(chain, executor)
            
            assert len(result.results) == 2
            assert result.results[0]["success"] is False
            assert result.results[1]["success"] is True
        
        asyncio.run(test())


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
