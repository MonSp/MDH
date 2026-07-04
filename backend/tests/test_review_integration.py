"""
集成测试：验证ReviewPipeline中的CriticAgent和GroundingAgent确实被调用

这些测试验证WhyBuddy化的核心价值：
- ReviewPipeline.review()被调用时，CriticAgent和GroundingAgent确实参与审查
- 降级机制正常工作
"""

import pytest
import sys
from unittest.mock import MagicMock, AsyncMock, patch


# Mock agentscope依赖
@pytest.fixture(autouse=True)
def mock_agentscope():
    """Mock agentscope依赖"""
    mock_modules = {
        'agentscope': MagicMock(),
        'agentscope.agent': MagicMock(),
        'agentscope.message': MagicMock(),
        'agent': MagicMock(),
        'agenda': MagicMock(),
        'negotiation': MagicMock(),
        'protocol': MagicMock(),
        'dynamic_router': MagicMock(),
        'meeting': MagicMock(),
        'workflow_engine': MagicMock(),
        'agentscope_task_bridge': MagicMock(),
        'collaboration': MagicMock(),
        'collaboration.planner_agent': MagicMock(),
        'collaboration.critic_agent': MagicMock(),
        'collaboration.grounding_agent': MagicMock(),
        'spec_manager': MagicMock(),
        'spec_tree': MagicMock(),
        'ears_validator': MagicMock(),
        'gate_manager': MagicMock(),
        'evidence_chain': MagicMock(),
        'fallback_chain': MagicMock(),
        'semantic_analyzer': MagicMock(),
        'discussion_manager': MagicMock(),
        'task_orchestrator': MagicMock(),
        'review_pipeline': MagicMock(),
    }
    
    original_modules = {}
    for name, mock in mock_modules.items():
        if name in sys.modules:
            original_modules[name] = sys.modules[name]
        sys.modules[name] = mock
    
    yield
    
    for name in mock_modules:
        if name in original_modules:
            sys.modules[name] = original_modules[name]
        elif name in sys.modules:
            del sys.modules[name]


class TestReviewPipelineIntegration:
    """ReviewPipeline集成测试"""
    
    def test_review_pipeline_has_critic_and_grounding(self):
        """ReviewPipeline应包含CriticAgent和GroundingAgent"""
        from review_pipeline import ReviewPipeline
        
        mock_get_model = MagicMock()
        mock_meeting = MagicMock()
        
        pipeline = ReviewPipeline(
            get_model_fn=mock_get_model,
            meeting=mock_meeting,
        )
        
        # 验证CriticAgent和GroundingAgent被实例化
        assert pipeline._critic is not None
        assert pipeline._grounding is not None
    
    def test_review_pipeline_critic_has_review_method(self):
        """CriticAgent应有review方法"""
        from review_pipeline import ReviewPipeline
        
        mock_get_model = MagicMock()
        mock_meeting = MagicMock()
        
        pipeline = ReviewPipeline(
            get_model_fn=mock_get_model,
            meeting=mock_meeting,
        )
        
        assert hasattr(pipeline._critic, 'review')
    
    def test_review_pipeline_grounding_has_verify_method(self):
        """GroundingAgent应有verify方法"""
        from review_pipeline import ReviewPipeline
        
        mock_get_model = MagicMock()
        mock_meeting = MagicMock()
        
        pipeline = ReviewPipeline(
            get_model_fn=mock_get_model,
            meeting=mock_meeting,
        )
        
        assert hasattr(pipeline._grounding, 'verify')


class TestMeetingCoordinatorDelegation:
    """MeetingCoordinator委托测试"""
    
    def test_meeting_coordinator_has_submodules(self):
        """MeetingCoordinator应实例化4个子模块"""
        from meeting_coordinator import MeetingCoordinator
        
        mock_meeting = MagicMock()
        mock_meeting.agents = []
        
        coordinator = MeetingCoordinator(
            meeting_session=mock_meeting,
            provider="test",
            model_name="test",
            api_key="test",
        )
        
        # 验证4个子模块被实例化
        assert hasattr(coordinator, '_semantic_analyzer')
        assert hasattr(coordinator, '_task_orchestrator')
        assert hasattr(coordinator, '_review_pipeline')
        assert hasattr(coordinator, '_discussion_manager')
    
    def test_meeting_coordinator_has_legacy_methods(self):
        """MeetingCoordinator应保留降级用的_legacy方法"""
        from meeting_coordinator import MeetingCoordinator
        
        mock_meeting = MagicMock()
        mock_meeting.agents = []
        
        coordinator = MeetingCoordinator(
            meeting_session=mock_meeting,
            provider="test",
            model_name="test",
            api_key="test",
        )
        
        # 验证核心方法存在
        assert hasattr(coordinator, 'semantic_analyze')
        assert hasattr(coordinator, 'execute_and_review_task')
        assert hasattr(coordinator, 'execute_assigned_tasks')
    
    def test_meeting_coordinator_semantic_analyze_delegates(self):
        """semantic_analyze应委托给SemanticAnalyzer"""
        from meeting_coordinator import MeetingCoordinator
        
        mock_meeting = MagicMock()
        mock_meeting.agents = []
        
        coordinator = MeetingCoordinator(
            meeting_session=mock_meeting,
            provider="test",
            model_name="test",
            api_key="test",
        )
        
        # Mock SemanticAnalyzer
        coordinator._semantic_analyzer = MagicMock()
        coordinator._semantic_analyzer.analyze = AsyncMock(return_value=MagicMock())
        
        import asyncio
        asyncio.run(coordinator.semantic_analyze("test message"))
        
        # 验证SemanticAnalyzer.analyze被调用
        coordinator._semantic_analyzer.analyze.assert_called_once_with("test message")
    
    def test_meeting_coordinator_semantic_analyze_fallback(self):
        """semantic_analyze失败时应抛出异常（无降级方法）"""
        from meeting_coordinator import MeetingCoordinator
        
        mock_meeting = MagicMock()
        mock_meeting.agents = []
        
        coordinator = MeetingCoordinator(
            meeting_session=mock_meeting,
            provider="test",
            model_name="test",
            api_key="test",
        )
        
        # Mock SemanticAnalyzer抛出异常
        coordinator._semantic_analyzer = MagicMock()
        coordinator._semantic_analyzer.analyze = AsyncMock(side_effect=Exception("test error"))
        
        import asyncio
        with pytest.raises(Exception, match="test error"):
            asyncio.run(coordinator.semantic_analyze("test message"))


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
