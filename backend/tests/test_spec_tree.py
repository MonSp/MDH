"""
Spec Tree 数据结构与校验器测试
"""

import pytest

from spec_tree import (
    Provenance,
    SpecTree,
    SpecTreeNode,
    SpecTreeNodeType,
    SpecTreeValidator,
    SuccessCriterion,
)


class TestSpecTreeValidator:
    """SpecTreeValidator测试类"""

    def setup_method(self):
        self.validator = SpecTreeValidator()

    def _create_valid_tree(self) -> SpecTree:
        """创建合法的规格树"""
        return SpecTree(
            rootNodeId="n0",
            version=2,
            successCriteria=[
                SuccessCriterion(id="sc1", text="成功标准1"),
                SuccessCriterion(id="sc2", text="成功标准2"),
            ],
            nodes=[
                SpecTreeNode(
                    id="n0",
                    parentId=None,
                    type=SpecTreeNodeType.REQUIREMENT,
                    title="根需求",
                    acceptance="WHEN 用户操作时，系统 SHALL 响应",
                    coversCriteria=["sc1"],
                    evidenceRefs=["nE1"],
                ),
                SpecTreeNode(
                    id="n1",
                    parentId="n0",
                    type=SpecTreeNodeType.REQUIREMENT,
                    title="子需求",
                    acceptance="IF 输入无效 THEN 系统 SHALL 显示错误",
                    coversCriteria=["sc2"],
                    evidenceRefs=["nE1"],
                ),
                SpecTreeNode(
                    id="n2",
                    parentId="n0",
                    type=SpecTreeNodeType.DESIGN,
                    title="设计1",
                    evidenceRefs=["nE1"],
                ),
                SpecTreeNode(
                    id="n3",
                    parentId="n2",
                    type=SpecTreeNodeType.TASK,
                    title="任务1",
                ),
                SpecTreeNode(
                    id="nE1",
                    parentId="n0",
                    type=SpecTreeNodeType.EVIDENCE,
                    title="证据1",
                    source="repo://src/foo.py#L1-L10",
                ),
            ],
            provenance=Provenance(generationSource="llm"),
        )

    # ============ 合法树测试 ============

    def test_valid_tree(self):
        """合法规格树应通过校验"""
        tree = self._create_valid_tree()
        result = self.validator.validate(tree)
        assert result.passed is True
        assert len(result.violations) == 0

    # ============ 结构校验测试 ============

    def test_too_few_nodes(self):
        """节点数不足"""
        tree = SpecTree(
            rootNodeId="n0",
            version=2,
            successCriteria=[SuccessCriterion(id="sc1", text="标准1")],
            nodes=[
                SpecTreeNode(
                    id="n0",
                    parentId=None,
                    type=SpecTreeNodeType.REQUIREMENT,
                    title="根需求",
                    acceptance="WHEN 操作时 SHALL 响应",
                    coversCriteria=["sc1"],
                    evidenceRefs=["nE1"],
                ),
                SpecTreeNode(
                    id="nE1",
                    parentId="n0",
                    type=SpecTreeNodeType.EVIDENCE,
                    title="证据1",
                    source="repo://src/foo.py",
                ),
            ],
            provenance=Provenance(generationSource="llm"),
        )
        result = self.validator.validate(tree)
        assert result.passed is False
        assert any("节点数不足" in v for v in result.violations)

    def test_duplicate_ids(self):
        """ID不唯一"""
        tree = self._create_valid_tree()
        tree.nodes[2].id = "n0"  # 重复ID
        result = self.validator.validate(tree)
        assert result.passed is False
        assert any("ID不唯一" in v for v in result.violations)

    def test_empty_id(self):
        """空ID"""
        tree = self._create_valid_tree()
        tree.nodes[2].id = ""
        result = self.validator.validate(tree)
        assert result.passed is False
        assert any("空ID" in v for v in result.violations)

    def test_no_root(self):
        """无根节点"""
        tree = self._create_valid_tree()
        tree.nodes[0].parentId = "n2"  # 变成非根节点
        result = self.validator.validate(tree)
        assert result.passed is False
        assert any("根节点数量不为1" in v for v in result.violations)

    def test_multiple_roots(self):
        """多个根节点"""
        tree = self._create_valid_tree()
        tree.nodes[2].parentId = None  # 变成第二个根节点
        result = self.validator.validate(tree)
        assert result.passed is False
        assert any("根节点数量不为1" in v for v in result.violations)

    def test_root_id_mismatch(self):
        """rootNodeId与实际根节点不匹配"""
        tree = self._create_valid_tree()
        tree.rootNodeId = "n999"
        result = self.validator.validate(tree)
        assert result.passed is False
        assert any("rootNodeId" in v for v in result.violations)

    def test_root_not_requirement(self):
        """根节点类型不是requirement"""
        tree = self._create_valid_tree()
        tree.nodes[0].type = SpecTreeNodeType.DESIGN
        result = self.validator.validate(tree)
        assert result.passed is False
        assert any("根节点类型必须为requirement" in v for v in result.violations)

    def test_parent_not_found(self):
        """父节点不存在"""
        tree = self._create_valid_tree()
        tree.nodes[2].parentId = "n999"
        result = self.validator.validate(tree)
        assert result.passed is False
        assert any("父节点" in v and "不存在" in v for v in result.violations)

    def test_cycle_detection(self):
        """循环依赖检测"""
        tree = self._create_valid_tree()
        tree.nodes[3].parentId = "n3"  # 自环
        result = self.validator.validate(tree)
        assert result.passed is False
        assert any("循环依赖" in v for v in result.violations)

    def test_depth_exceeded(self):
        """深度超过限制"""
        tree = SpecTree(
            rootNodeId="n0",
            version=2,
            successCriteria=[SuccessCriterion(id="sc1", text="标准1")],
            nodes=[
                SpecTreeNode(id="n0", parentId=None, type=SpecTreeNodeType.REQUIREMENT, title="n0",
                            acceptance="WHEN 操作时 SHALL 响应", coversCriteria=["sc1"], evidenceRefs=["nE1"]),
                SpecTreeNode(id="n1", parentId="n0", type=SpecTreeNodeType.DESIGN, title="n1", evidenceRefs=["nE1"]),
                SpecTreeNode(id="n2", parentId="n1", type=SpecTreeNodeType.DESIGN, title="n2", evidenceRefs=["nE1"]),
                SpecTreeNode(id="n3", parentId="n2", type=SpecTreeNodeType.DESIGN, title="n3", evidenceRefs=["nE1"]),
                SpecTreeNode(id="n4", parentId="n3", type=SpecTreeNodeType.DESIGN, title="n4", evidenceRefs=["nE1"]),
                SpecTreeNode(id="n5", parentId="n4", type=SpecTreeNodeType.TASK, title="n5"),  # 深度5
                SpecTreeNode(id="nE1", parentId="n0", type=SpecTreeNodeType.EVIDENCE, title="e1", source="repo://src"),
            ],
            provenance=Provenance(generationSource="llm"),
        )
        result = self.validator.validate(tree)
        assert result.passed is False
        assert any("树深度超过限制" in v for v in result.violations)

    # ============ 来源诚实校验测试 ============

    def test_invalid_source(self):
        """来源不合法"""
        tree = self._create_valid_tree()
        tree.provenance.generationSource = "human"
        result = self.validator.validate(tree)
        assert result.passed is False
        assert any("来源不合法" in v for v in result.violations)

    # ============ 成功标准覆盖测试 ============

    def test_empty_criteria(self):
        """成功标准为空"""
        tree = self._create_valid_tree()
        tree.successCriteria = []
        result = self.validator.validate(tree)
        assert result.passed is False
        assert any("成功标准列表为空" in v for v in result.violations)

    def test_uncovered_criteria(self):
        """成功标准未被覆盖"""
        tree = self._create_valid_tree()
        tree.successCriteria.append(SuccessCriterion(id="sc3", text="未覆盖的标准"))
        result = self.validator.validate(tree)
        assert result.passed is False
        assert any("未被覆盖" in v for v in result.violations)

    def test_criteria_collapse(self):
        """需求节点塌缩"""
        tree = SpecTree(
            rootNodeId="n0",
            version=2,
            successCriteria=[
                SuccessCriterion(id="sc1", text="标准1"),
                SuccessCriterion(id="sc2", text="标准2"),
                SuccessCriterion(id="sc3", text="标准3"),
            ],
            nodes=[
                SpecTreeNode(
                    id="n0",
                    parentId=None,
                    type=SpecTreeNodeType.REQUIREMENT,
                    title="根需求",
                    acceptance="WHEN 操作时 SHALL 响应",
                    coversCriteria=["sc1", "sc2", "sc3"],  # 全部塞进一个节点
                    evidenceRefs=["nE1"],
                ),
                SpecTreeNode(id="n1", parentId="n0", type=SpecTreeNodeType.TASK, title="任务1"),
                SpecTreeNode(id="nE1", parentId="n0", type=SpecTreeNodeType.EVIDENCE, title="证据1", source="repo://src"),
            ],
            provenance=Provenance(generationSource="llm"),
        )
        result = self.validator.validate(tree)
        assert result.passed is False
        assert any("需求节点塌缩" in v for v in result.violations)

    # ============ EARS验收测试 ============

    def test_missing_acceptance(self):
        """需求节点缺少acceptance"""
        tree = self._create_valid_tree()
        tree.nodes[0].acceptance = None
        result = self.validator.validate(tree)
        assert result.passed is False
        assert any("缺少acceptance" in v for v in result.violations)

    def test_invalid_ears(self):
        """acceptance不符合EARS句式"""
        tree = self._create_valid_tree()
        tree.nodes[0].acceptance = "系统应验证输入"  # 缺少触发条件
        result = self.validator.validate(tree)
        assert result.passed is False
        assert any("不符合EARS" in v for v in result.violations)

    # ============ 证据贯穿测试 ============

    def test_missing_evidence_refs(self):
        """需求节点缺少evidenceRefs"""
        tree = self._create_valid_tree()
        tree.nodes[0].evidenceRefs = []
        result = self.validator.validate(tree)
        assert result.passed is False
        assert any("缺少evidenceRefs" in v for v in result.violations)

    def test_evidence_not_found(self):
        """引用的证据节点不存在"""
        tree = self._create_valid_tree()
        tree.nodes[0].evidenceRefs = ["nE999"]
        result = self.validator.validate(tree)
        assert result.passed is False
        assert any("不存在" in v for v in result.violations)

    def test_evidence_missing_source(self):
        """证据节点缺少source"""
        tree = self._create_valid_tree()
        tree.nodes[4].source = None
        result = self.validator.validate(tree)
        assert result.passed is False
        assert any("缺少source" in v for v in result.violations)


class TestValidateFromDict:
    """从字典校验测试"""

    def setup_method(self):
        self.validator = SpecTreeValidator()

    def test_valid_dict(self):
        """合法字典"""
        data = {
            "rootNodeId": "n0",
            "version": 2,
            "successCriteria": [{"id": "sc1", "text": "标准1"}, {"id": "sc2", "text": "标准2"}],
            "nodes": [
                {
                    "id": "n0",
                    "parentId": None,
                    "type": "requirement",
                    "title": "根需求",
                    "acceptance": "WHEN 操作时 SHALL 响应",
                    "coversCriteria": ["sc1"],
                    "evidenceRefs": ["nE1"],
                },
                {
                    "id": "n1",
                    "parentId": "n0",
                    "type": "requirement",
                    "title": "子需求",
                    "acceptance": "IF 输入无效 THEN 系统 SHALL 显示错误",
                    "coversCriteria": ["sc2"],
                    "evidenceRefs": ["nE1"],
                },
                {
                    "id": "n2",
                    "parentId": "n0",
                    "type": "design",
                    "title": "设计1",
                    "evidenceRefs": ["nE1"],
                },
                {
                    "id": "n3",
                    "parentId": "n2",
                    "type": "task",
                    "title": "任务1",
                },
                {
                    "id": "nE1",
                    "parentId": "n0",
                    "type": "evidence",
                    "title": "证据1",
                    "source": "repo://src/foo.py",
                },
            ],
            "provenance": {"generationSource": "llm"},
        }
        result = self.validator.validate_from_dict(data)
        assert result.passed is True

    def test_invalid_json(self):
        """非法JSON结构"""
        data = {"invalid": "data"}
        result = self.validator.validate_from_dict(data)
        assert result.passed is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
