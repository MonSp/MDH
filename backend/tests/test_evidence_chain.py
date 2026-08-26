"""
Evidence Chain 测试
"""

import pytest
from evidence_chain import EvidenceChain, Evidence


class TestEvidenceChain:
    """EvidenceChain测试类"""

    def setup_method(self):
        self.chain = EvidenceChain()

    # ============ 基本功能测试 ============

    def test_add_and_get_evidence(self):
        """添加和获取证据"""
        self.chain.add_evidence("trace-001", Evidence(
            stage="routing",
            decision="选择部门A",
            inputs={"input": "test"},
            outputs={"output": "result"},
        ))

        chain = self.chain.get_chain("trace-001")
        assert len(chain) == 1
        assert chain[0].stage == "routing"
        assert chain[0].decision == "选择部门A"

    def test_empty_chain(self):
        """不存在的trace_id应返回空列表"""
        chain = self.chain.get_chain("nonexistent")
        assert chain == []

    # ============ 多阶段证据测试 ============

    def test_multiple_stages(self):
        """多阶段证据"""
        self.chain.add_evidence("trace-001", Evidence(
            stage="routing",
            decision="路由决策",
        ))
        self.chain.add_evidence("trace-001", Evidence(
            stage="decomposition",
            decision="分解决策",
        ))
        self.chain.add_evidence("trace-001", Evidence(
            stage="execution",
            decision="执行决策",
        ))

        chain = self.chain.get_chain("trace-001")
        assert len(chain) == 3

        stages = self.chain.get_stages("trace-001")
        assert set(stages) == {"routing", "decomposition", "execution"}

    # ============ 阶段查询测试 ============

    def test_get_decisions_by_stage(self):
        """按阶段查询决策"""
        self.chain.add_evidence("trace-001", Evidence(
            stage="routing",
            decision="路由决策1",
        ))
        self.chain.add_evidence("trace-001", Evidence(
            stage="routing",
            decision="路由决策2",
        ))
        self.chain.add_evidence("trace-001", Evidence(
            stage="execution",
            decision="执行决策",
        ))

        routing = self.chain.get_decisions("trace-001", "routing")
        assert len(routing) == 2

        execution = self.chain.get_decisions("trace-001", "execution")
        assert len(execution) == 1

    def test_get_decisions_nonexistent_stage(self):
        """查询不存在的阶段"""
        self.chain.add_evidence("trace-001", Evidence(
            stage="routing",
            decision="路由决策",
        ))

        result = self.chain.get_decisions("trace-001", "nonexistent")
        assert result == []

    def test_get_decisions_nonexistent_trace(self):
        """查询不存在的trace_id"""
        result = self.chain.get_decisions("nonexistent", "routing")
        assert result == []

    # ============ has_evidence 测试 ============

    def test_has_evidence_true(self):
        """有证据时返回True"""
        self.chain.add_evidence("trace-001", Evidence(
            stage="routing",
            decision="决策",
        ))
        assert self.chain.has_evidence("trace-001") is True

    def test_has_evidence_false(self):
        """无证据时返回False"""
        assert self.chain.has_evidence("trace-001") is False

    def test_has_evidence_with_stage(self):
        """按阶段检查"""
        self.chain.add_evidence("trace-001", Evidence(
            stage="routing",
            decision="决策",
        ))
        assert self.chain.has_evidence("trace-001", "routing") is True
        assert self.chain.has_evidence("trace-001", "execution") is False

    # ============ 导出测试 ============

    def test_export_chain(self):
        """导出证据链"""
        self.chain.add_evidence("trace-001", Evidence(
            stage="routing",
            decision="路由决策",
            inputs={"input": "test"},
            outputs={"output": "result"},
            source_refs=["repo://src/foo.py"],
        ))

        exported = self.chain.export_chain("trace-001")

        assert exported["trace_id"] == "trace-001"
        assert exported["total_evidences"] == 1
        assert "routing" in exported["stages"]
        assert len(exported["evidences"]) == 1
        assert exported["evidences"][0]["decision"] == "路由决策"

    # ============ 关联SpecTree测试 ============

    def test_link_to_spec_tree(self):
        """与SpecTree关联"""
        self.chain.add_evidence("trace-001", Evidence(
            stage="routing",
            decision="决策",
            source_refs=["nE1"],
        ))

        spec_tree_nodes = [
            {"id": "nE1", "type": "evidence", "source": "repo://src/foo.py"},
            {"id": "nE2", "type": "evidence", "source": "repo://src/bar.py"},
        ]

        self.chain.link_to_spec_tree("trace-001", spec_tree_nodes)

        chain = self.chain.get_chain("trace-001")
        assert "linked_evidence_nodes" in chain[0].outputs
        assert len(chain[0].outputs["linked_evidence_nodes"]) == 1
        assert chain[0].outputs["linked_evidence_nodes"][0]["source"] == "repo://src/foo.py"

    # ============ 清除测试 ============

    def test_clear_specific_trace(self):
        """清除特定trace"""
        self.chain.add_evidence("trace-001", Evidence(stage="routing", decision="d1"))
        self.chain.add_evidence("trace-002", Evidence(stage="routing", decision="d2"))

        self.chain.clear("trace-001")

        assert self.chain.has_evidence("trace-001") is False
        assert self.chain.has_evidence("trace-002") is True

    def test_clear_all(self):
        """清除全部"""
        self.chain.add_evidence("trace-001", Evidence(stage="routing", decision="d1"))
        self.chain.add_evidence("trace-002", Evidence(stage="routing", decision="d2"))

        self.chain.clear()

        assert self.chain.has_evidence("trace-001") is False
        assert self.chain.has_evidence("trace-002") is False

    # ============ 多trace隔离测试 ============

    def test_trace_isolation(self):
        """不同trace之间应隔离"""
        self.chain.add_evidence("trace-001", Evidence(stage="routing", decision="d1"))
        self.chain.add_evidence("trace-002", Evidence(stage="execution", decision="d2"))

        chain1 = self.chain.get_chain("trace-001")
        chain2 = self.chain.get_chain("trace-002")

        assert len(chain1) == 1
        assert len(chain2) == 1
        assert chain1[0].stage == "routing"
        assert chain2[0].stage == "execution"

    # ============ 时间戳测试 ============

    def test_auto_timestamp(self):
        """时间戳应自动生成"""
        evidence = Evidence(stage="routing", decision="决策")
        assert evidence.timestamp  # 不为空

    def test_custom_timestamp(self):
        """自定义时间戳"""
        evidence = Evidence(
            stage="routing",
            decision="决策",
            timestamp="2024-01-01T00:00:00",
        )
        assert evidence.timestamp == "2024-01-01T00:00:00"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
