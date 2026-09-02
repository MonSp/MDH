"""
确定性门禁管理器测试
"""

import json
import os
import tempfile

import pytest

from gate_manager import ChecksLedger, GateManager, GateResult
from spec_tree import (
    Provenance,
    SpecTree,
    SpecTreeNode,
    SpecTreeNodeType,
    SuccessCriterion,
)


class TestGateManager:
    """GateManager测试类"""

    def setup_method(self):
        self.manager = GateManager()

    # ============ 注册与执行测试 ============

    def test_register_custom_gate(self):
        """注册自定义门禁"""
        def custom_gate(context):
            return GateResult(
                gate_name="custom",
                passed=True,
                exit_code=0,
                stdout="OK",
                stderr="",
                timestamp="2024-01-01",
            )

        self.manager.register_gate("custom", custom_gate)
        result = self.manager.run_gate("custom", None)
        assert result.passed is True

    def test_unregistered_gate(self):
        """执行未注册的门禁"""
        with pytest.raises(KeyError):
            self.manager.run_gate("nonexistent", None)

    # ============ EARS门禁测试 ============

    def test_ears_gate_valid(self):
        """EARS门禁 - 合法输入"""
        result = self.manager.run_gate("ears_gate", "WHEN 用户操作时 SHALL 响应")
        assert result.passed is True
        assert result.exit_code == 0

    def test_ears_gate_invalid(self):
        """EARS门禁 - 非法输入"""
        result = self.manager.run_gate("ears_gate", "系统应验证")
        assert result.passed is False
        assert result.exit_code == 1

    def test_ears_gate_batch(self):
        """EARS门禁 - 批量校验"""
        texts = [
            "WHEN 用户操作时 SHALL 响应",
            "系统应验证",  # 缺少触发条件
        ]
        result = self.manager.run_gate("ears_gate", texts)
        assert result.passed is False

    def test_ears_gate_invalid_type(self):
        """EARS门禁 - 不支持的输入类型"""
        result = self.manager.run_gate("ears_gate", 123)
        assert result.passed is False

    # ============ 覆盖门禁测试 ============

    def test_coverage_gate_full(self):
        """覆盖门禁 - 完整覆盖"""
        result = self.manager.run_gate("coverage_gate", {
            "criteria_ids": ["sc1", "sc2"],
            "covered_ids": ["sc1", "sc2"],
        })
        assert result.passed is True

    def test_coverage_gate_partial(self):
        """覆盖门禁 - 不完整覆盖"""
        result = self.manager.run_gate("coverage_gate", {
            "criteria_ids": ["sc1", "sc2", "sc3"],
            "covered_ids": ["sc1"],
        })
        assert result.passed is False

    def test_coverage_gate_empty(self):
        """覆盖门禁 - 空标准列表"""
        result = self.manager.run_gate("coverage_gate", {
            "criteria_ids": [],
            "covered_ids": [],
        })
        assert result.passed is False

    def test_coverage_gate_invalid_type(self):
        """覆盖门禁 - 不支持的输入类型"""
        result = self.manager.run_gate("coverage_gate", "invalid")
        assert result.passed is False

    # ============ Spec Tree门禁测试 ============

    def test_spec_tree_gate_valid(self):
        """Spec Tree门禁 - 合法树"""
        tree = SpecTree(
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
                    id="nE1", parentId="n0", type=SpecTreeNodeType.EVIDENCE,
                    title="证据1", source="repo://src/foo.py",
                ),
            ],
            provenance=Provenance(generationSource="llm"),
        )
        result = self.manager.run_gate("spec_tree_gate", tree)
        assert result.passed is True

    def test_spec_tree_gate_from_dict(self):
        """Spec Tree门禁 - 从字典校验"""
        data = {
            "rootNodeId": "n0",
            "version": 2,
            "successCriteria": [{"id": "sc1", "text": "标准1"}, {"id": "sc2", "text": "标准2"}],
            "nodes": [
                {
                    "id": "n0", "parentId": None, "type": "requirement",
                    "title": "根需求", "acceptance": "WHEN 操作时 SHALL 响应",
                    "coversCriteria": ["sc1"], "evidenceRefs": ["nE1"],
                },
                {
                    "id": "n1", "parentId": "n0", "type": "requirement",
                    "title": "子需求", "acceptance": "IF 输入无效 THEN 系统 SHALL 显示错误",
                    "coversCriteria": ["sc2"], "evidenceRefs": ["nE1"],
                },
                {
                    "id": "n2", "parentId": "n0", "type": "design",
                    "title": "设计1", "evidenceRefs": ["nE1"],
                },
                {
                    "id": "nE1", "parentId": "n0", "type": "evidence",
                    "title": "证据1", "source": "repo://src/foo.py",
                },
            ],
            "provenance": {"generationSource": "llm"},
        }
        result = self.manager.run_gate("spec_tree_gate", data)
        assert result.passed is True

    def test_spec_tree_gate_invalid(self):
        """Spec Tree门禁 - 非法树"""
        tree = SpecTree(
            rootNodeId="n0",
            version=2,
            successCriteria=[],
            nodes=[
                SpecTreeNode(
                    id="n0", parentId=None, type=SpecTreeNodeType.REQUIREMENT,
                    title="根需求",
                ),
            ],
            provenance=Provenance(generationSource="llm"),
        )
        result = self.manager.run_gate("spec_tree_gate", tree)
        assert result.passed is False


class TestChecksLedger:
    """ChecksLedger测试类"""

    def test_record_and_export(self):
        """记录和导出"""
        ledger = ChecksLedger()

        ledger.record(GateResult(
            gate_name="test",
            passed=True,
            exit_code=0,
            stdout="OK",
            stderr="",
            timestamp="2024-01-01",
        ))

        records = ledger.export()
        assert len(records) == 1
        assert records[0].gate_name == "test"

    def test_to_json(self):
        """持久化到JSON"""
        ledger = ChecksLedger()
        ledger.record(GateResult(
            gate_name="test",
            passed=True,
            exit_code=0,
            stdout="OK",
            stderr="",
            timestamp="2024-01-01",
        ))

        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            temp_path = f.name

        try:
            ledger.to_json(temp_path)

            with open(temp_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            assert len(data) == 1
            assert data[0]["gate_name"] == "test"
        finally:
            os.unlink(temp_path)

    def test_summary(self):
        """生成摘要"""
        ledger = ChecksLedger()

        ledger.record(GateResult(
            gate_name="gate1", passed=True, exit_code=0,
            stdout="OK", stderr="", timestamp="2024-01-01",
        ))
        ledger.record(GateResult(
            gate_name="gate2", passed=False, exit_code=1,
            stdout="", stderr="Error", timestamp="2024-01-02",
        ))

        summary = ledger.summary()
        assert summary["total"] == 2
        assert summary["passed"] == 1
        assert summary["failed"] == 1
        assert summary["pass_rate"] == 0.5


class TestGateManagerWithLedgerPath:
    """带持久化路径的GateManager测试"""

    def test_auto_persist(self):
        """自动持久化台账"""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            temp_path = f.name

        try:
            manager = GateManager(ledger_path=temp_path)

            # 执行门禁
            manager.run_gate("ears_gate", "WHEN 用户操作时 SHALL 响应")

            # 验证文件已写入
            assert os.path.exists(temp_path)

            with open(temp_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            assert len(data) == 1
            assert data[0]["gate_name"] == "ears_gate"
        finally:
            os.unlink(temp_path)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
