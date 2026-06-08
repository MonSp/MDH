"""
Spec Manager 测试
"""

import pytest
from backend.spec_manager import SpecManager, SpecDocuments, HandoffPackage
from backend.spec_tree import SpecTree, SpecTreeNode, SpecTreeNodeType, SuccessCriterion, Provenance


class TestSpecManager:
    """SpecManager测试类"""
    
    def setup_method(self):
        self.manager = SpecManager()
    
    # ============ generate_spec_tree 测试 ============
    
    def test_generate_from_brief(self):
        """从澄清简报生成Spec Tree"""
        brief = {
            "goal": "实现用户认证",
            "successCriteria": [
                {"id": "sc1", "text": "用户可以注册"},
                {"id": "sc2", "text": "用户可以登录"},
            ],
        }
        
        tree = self.manager.generate_spec_tree(brief)
        
        assert tree.rootNodeId == "n0"
        assert len(tree.successCriteria) == 2
        assert len(tree.nodes) >= 3  # root + sub-reqs + evidence
    
    def test_generate_covers_criteria(self):
        """生成的树应覆盖所有成功标准"""
        brief = {
            "goal": "目标",
            "successCriteria": [
                {"id": "sc1", "text": "标准1"},
                {"id": "sc2", "text": "标准2"},
                {"id": "sc3", "text": "标准3"},
            ],
        }
        
        tree = self.manager.generate_spec_tree(brief)
        
        covered = set()
        for node in tree.nodes:
            if node.type == SpecTreeNodeType.REQUIREMENT:
                covered.update(node.coversCriteria)
        
        assert covered == {"sc1", "sc2", "sc3"}
    
    # ============ validate_and_gate 测试 ============
    
    def test_validate_valid_tree(self):
        """合法树应通过校验"""
        tree = self._create_valid_tree()
        passed, _ = self.manager.validate_and_gate(tree)
        assert passed is True
    
    def test_validate_invalid_tree(self):
        """非法树应失败"""
        tree = SpecTree(
            rootNodeId="n0",
            version=2,
            successCriteria=[],
            nodes=[
                SpecTreeNode(
                    id="n0", parentId=None, type=SpecTreeNodeType.REQUIREMENT,
                    title="根",
                ),
            ],
            provenance=Provenance(generationSource="llm"),
        )
        passed, _ = self.manager.validate_and_gate(tree)
        assert passed is False
    
    # ============ generate_documents 测试 ============
    
    def test_generate_documents(self):
        """生成文档"""
        tree = self._create_valid_tree()
        docs = self.manager.generate_documents(tree)
        
        assert isinstance(docs, SpecDocuments)
        assert len(docs.requirements_md) > 0
        assert len(docs.design_md) > 0
        assert len(docs.tasks_md) > 0
    
    def test_requirements_contains_sections(self):
        """requirements.md应包含必要章节"""
        tree = self._create_valid_tree()
        docs = self.manager.generate_documents(tree)
        
        assert "## 目标" in docs.requirements_md
        assert "## 功能要求" in docs.requirements_md
        assert "## 验收标准" in docs.requirements_md
    
    # ============ build_traceability_matrix 测试 ============
    
    def test_traceability_matrix(self):
        """可追溯矩阵"""
        tree = self._create_valid_tree()
        matrix = self.manager.build_traceability_matrix(tree)
        
        assert "mappings" in matrix
        assert len(matrix["mappings"]) == len(tree.successCriteria)
    
    # ============ export_handoff 测试 ============
    
    def test_export_handoff(self):
        """导出交付包"""
        tree = self._create_valid_tree()
        docs = self.manager.generate_documents(tree)
        
        handoff = self.manager.export_handoff(tree, docs)
        
        assert isinstance(handoff, HandoffPackage)
        assert handoff.spec_tree is not None
        assert handoff.documents is not None
        assert handoff.generated_at
    
    def test_export_with_companion_log(self):
        """导出时包含companion_log"""
        tree = self._create_valid_tree()
        docs = self.manager.generate_documents(tree)
        
        log = [{"stage": "input", "role": "critic", "findings": ["test"]}]
        handoff = self.manager.export_handoff(tree, docs, companion_log=log)
        
        assert len(handoff.companion_log) == 1
    
    # ============ 辅助方法 ============
    
    def _create_valid_tree(self) -> SpecTree:
        """创建合法的规格树"""
        return SpecTree(
            rootNodeId="n0",
            version=2,
            successCriteria=[
                SuccessCriterion(id="sc1", text="标准1"),
                SuccessCriterion(id="sc2", text="标准2"),
            ],
            nodes=[
                SpecTreeNode(
                    id="n0", parentId=None, type=SpecTreeNodeType.REQUIREMENT,
                    title="根需求", acceptance="WHEN 操作时 SHALL 响应",
                    coversCriteria=["sc1"], evidenceRefs=["nE1"],
                ),
                SpecTreeNode(
                    id="n1", parentId="n0", type=SpecTreeNodeType.REQUIREMENT,
                    title="子需求", acceptance="IF 输入无效 THEN 系统 SHALL 显示错误",
                    coversCriteria=["sc2"], evidenceRefs=["nE1"],
                ),
                SpecTreeNode(
                    id="n2", parentId="n0", type=SpecTreeNodeType.DESIGN,
                    title="设计1", evidenceRefs=["nE1"],
                ),
                SpecTreeNode(
                    id="n3", parentId="n2", type=SpecTreeNodeType.TASK,
                    title="任务1",
                ),
                SpecTreeNode(
                    id="nE1", parentId="n0", type=SpecTreeNodeType.EVIDENCE,
                    title="证据1", source="repo://src/foo.py",
                ),
            ],
            provenance=Provenance(generationSource="llm"),
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
