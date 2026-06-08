"""
拆分模块测试（SemanticAnalyzer、DiscussionManager、ReviewPipeline、TaskOrchestrator）

由于这些模块依赖agentscope等外部库，使用sys.modules mock进行测试。
"""

import pytest
import sys
from unittest.mock import MagicMock


# Mock agentscope modules before importing
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
    }
    
    original_modules = {}
    for name, mock in mock_modules.items():
        if name in sys.modules:
            original_modules[name] = sys.modules[name]
        sys.modules[name] = mock
    
    yield
    
    # Restore original modules
    for name in mock_modules:
        if name in original_modules:
            sys.modules[name] = original_modules[name]
        elif name in sys.modules:
            del sys.modules[name]


class TestSemanticAnalyzerStructure:
    """SemanticAnalyzer结构测试"""
    
    def test_import(self):
        """模块应可导入"""
        from backend.semantic_analyzer import SemanticAnalyzer
        assert SemanticAnalyzer is not None
    
    def test_class_has_analyze_method(self):
        """应有analyze方法"""
        from backend.semantic_analyzer import SemanticAnalyzer
        assert hasattr(SemanticAnalyzer, 'analyze')
    
    def test_class_has_detect_complex_task(self):
        """应有_detect_complex_task方法"""
        from backend.semantic_analyzer import SemanticAnalyzer
        assert hasattr(SemanticAnalyzer, '_detect_complex_task')


class TestDiscussionManagerStructure:
    """DiscussionManager结构测试"""
    
    def test_import(self):
        """模块应可导入"""
        from backend.discussion_manager import DiscussionManager
        assert DiscussionManager is not None
    
    def test_class_has_run_method(self):
        """应有run方法"""
        from backend.discussion_manager import DiscussionManager
        assert hasattr(DiscussionManager, 'run')


class TestReviewPipelineStructure:
    """ReviewPipeline结构测试"""
    
    def test_import(self):
        """模块应可导入"""
        from backend.review_pipeline import ReviewPipeline
        assert ReviewPipeline is not None
    
    def test_class_has_review_method(self):
        """应有review方法"""
        from backend.review_pipeline import ReviewPipeline
        assert hasattr(ReviewPipeline, 'review')


class TestTaskOrchestratorStructure:
    """TaskOrchestrator结构测试"""
    
    def test_import(self):
        """模块应可导入"""
        from backend.task_orchestrator import TaskOrchestrator
        assert TaskOrchestrator is not None
    
    def test_class_has_decompose_method(self):
        """应有decompose方法"""
        from backend.task_orchestrator import TaskOrchestrator
        assert hasattr(TaskOrchestrator, 'decompose')
    
    def test_class_has_assign_method(self):
        """应有assign方法"""
        from backend.task_orchestrator import TaskOrchestrator
        assert hasattr(TaskOrchestrator, 'assign')
    
    def test_class_has_execute_method(self):
        """应有execute方法"""
        from backend.task_orchestrator import TaskOrchestrator
        assert hasattr(TaskOrchestrator, 'execute')


class TestModuleIndependence:
    """模块独立性测试"""
    
    def test_semantic_analyzer_independent(self):
        """SemanticAnalyzer应可独立实例化（mock依赖）"""
        from backend.semantic_analyzer import SemanticAnalyzer
        
        mock_router = MagicMock()
        mock_get_model = MagicMock()
        
        analyzer = SemanticAnalyzer(
            router=mock_router,
            get_model_fn=mock_get_model,
        )
        assert analyzer is not None
    
    def test_task_orchestrator_independent(self):
        """TaskOrchestrator应可独立实例化（mock依赖）"""
        from backend.task_orchestrator import TaskOrchestrator
        
        mock_get_model = MagicMock()
        mock_meeting = MagicMock()
        mock_router = MagicMock()
        
        orchestrator = TaskOrchestrator(
            get_model_fn=mock_get_model,
            meeting=mock_meeting,
            router=mock_router,
        )
        assert orchestrator is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
