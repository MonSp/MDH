"""
Grounding Agent 测试
"""

import pytest
import json
import os
import tempfile
from backend.collaboration.grounding_agent import GroundingAgent, GroundingResult


class TestGroundingAgent:
    """GroundingAgent测试类"""
    
    def setup_method(self):
        self.temp_dir = tempfile.mkdtemp()
        self.log_path = os.path.join(self.temp_dir, "companion_log.json")
        self.agent = GroundingAgent(companion_log_path=self.log_path)
    
    def teardown_method(self):
        if os.path.exists(self.log_path):
            os.unlink(self.log_path)
        os.rmdir(self.temp_dir)
    
    # ============ 基本功能测试 ============
    
    def test_verify_returns_result(self):
        """verify应返回GroundingResult"""
        result = self.agent.verify({
            "conclusions": [],
            "decisions": [],
            "evidence": [],
        })
        assert isinstance(result, GroundingResult)
        assert result.timestamp
    
    # ============ 无仓库场景 ============
    
    def test_no_repo_no_evidence(self):
        """无仓库无证据，grounded应为False"""
        result = self.agent.verify({
            "conclusions": ["结论1"],
            "decisions": [],
            "evidence": [],
        }, repo_context=None)
        assert result.grounded is False
    
    def test_no_repo_with_text_evidence(self):
        """无仓库有文本证据，grounded应为False（因为不是repo://或file://格式）"""
        result = self.agent.verify({
            "conclusions": [],
            "decisions": [],
            "evidence": ["some evidence text"],
        }, repo_context=None)
        # 纯文本证据不匹配repo://或file://格式，sources为空
        assert result.grounded is False
    
    # ============ 有仓库场景 ============
    
    def test_repo_with_code_evidence(self):
        """有仓库有代码证据，grounded应为True"""
        result = self.agent.verify({
            "conclusions": [
                {"text": "使用JWT", "source": "repo://src/auth/jwt.py#L10-L50"},
            ],
            "decisions": [],
            "evidence": ["repo://src/auth/jwt.py"],
        }, repo_context={"repo_available": True})
        assert result.grounded is True
        assert len(result.sources) > 0
    
    def test_repo_without_code_evidence(self):
        """有仓库无代码证据，grounded应为False"""
        result = self.agent.verify({
            "conclusions": ["应该使用JWT"],
            "decisions": [],
            "evidence": [],
        }, repo_context={"repo_available": True})
        assert result.grounded is False
    
    def test_repo_with_file_evidence(self):
        """有仓库有file://证据"""
        result = self.agent.verify({
            "conclusions": [],
            "decisions": [],
            "evidence": ["file:///src/auth/README.md"],
        }, repo_context={"repo_available": True})
        assert result.grounded is True
    
    # ============ 结论检查 ============
    
    def test_conclusion_with_source(self):
        """结论有source字段"""
        result = self.agent.verify({
            "conclusions": [
                {"text": "结论1", "source": "repo://src/foo.py"},
            ],
            "decisions": [],
            "evidence": [],
        }, repo_context={"repo_available": True})
        assert any("repo://src/foo.py" in s for s in result.sources)
    
    def test_conclusion_without_source_repo_available(self):
        """结论无source但仓库可用，字符串结论没有路径引用所以不会被添加"""
        result = self.agent.verify({
            "conclusions": ["结论1"],
            "decisions": [],
            "evidence": [],
        }, repo_context={"repo_available": True})
        # 字符串结论没有/路径引用，不会被添加到sources
        # 但repo_available=True时，如果没有repo://或file://来源，grounded应为False
        assert result.grounded is False
    
    # ============ 决策检查 ============
    
    def test_decision_with_basis(self):
        """决策有basis字段"""
        result = self.agent.verify({
            "conclusions": [],
            "decisions": [
                {"choice": "JWT", "basis": "repo://src/auth/README.md"},
            ],
            "evidence": [],
        }, repo_context={"repo_available": True})
        assert any("repo://src/auth/README.md" in s for s in result.sources)
    
    # ============ 证据有效性检查 ============
    
    def test_valid_evidence_formats(self):
        """有效证据格式"""
        result = self.agent.verify({
            "conclusions": [],
            "decisions": [],
            "evidence": [
                "repo://src/foo.py",
                "file:///src/bar.py",
                "clarified_brief:sc1",
                "spec_tree:n1",
            ],
        })
        assert len(result.sources) == 4
    
    def test_dict_evidence_with_source(self):
        """字典格式证据"""
        result = self.agent.verify({
            "conclusions": [],
            "decisions": [],
            "evidence": [
                {"source": "repo://src/foo.py", "description": "证据1"},
            ],
        })
        assert any("repo://src/foo.py" in s for s in result.sources)
    
    # ============ 日志写入测试 ============
    
    def test_log_written(self):
        """审查结果应写入日志"""
        self.agent.verify({
            "conclusions": [],
            "decisions": [],
            "evidence": ["repo://src/foo.py"],
        })
        
        assert os.path.exists(self.log_path)
        
        with open(self.log_path, 'r', encoding='utf-8') as f:
            log = json.load(f)
        
        assert len(log) == 1
        assert log[0]["role"] == "grounding"
        assert "sources" in log[0]
        assert "grounded" in log[0]
    
    def test_stage_parameter(self):
        """阶段参数应正确记录"""
        self.agent.verify({
            "conclusions": [],
            "decisions": [],
            "evidence": [],
        }, stage="input")
        
        with open(self.log_path, 'r', encoding='utf-8') as f:
            log = json.load(f)
        
        assert log[0]["stage"] == "input"
    
    # ============ 详情测试 ============
    
    def test_details_repo_available(self):
        """详情应包含repo_available"""
        result = self.agent.verify({
            "conclusions": [],
            "decisions": [],
            "evidence": [],
        }, repo_context={"repo_available": True})
        
        assert result.details["repo_available"] is True
    
    def test_details_total_sources(self):
        """详情应包含total_sources"""
        result = self.agent.verify({
            "conclusions": [],
            "decisions": [],
            "evidence": ["repo://src/a.py", "repo://src/b.py"],
        })
        
        assert result.details["total_sources"] == 2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
