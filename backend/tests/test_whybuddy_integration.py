"""
端到端集成验证 - WhyBuddy 化闭环测试

验证完整的闭环：输入 -> Spec Tree -> 门禁 -> 伴随审查 -> 执行 -> 证据链 -> 交付
"""

import pytest
import json
import os
import tempfile

from spec_tree import (
    SpecTree, SpecTreeNode, SpecTreeNodeType,
    SuccessCriterion, Provenance, SpecTreeValidator,
)
from ears_validator import EarsValidator
from gate_manager import GateManager
from collaboration.critic_agent import CriticAgent
from collaboration.grounding_agent import GroundingAgent
from evidence_chain import EvidenceChain, Evidence
from fallback_chain import FallbackChain, FallbackStep, FallbackExecutor
from spec_manager import SpecManager


class TestWhybuddyIntegration:
    """WhyBuddy化端到端集成测试"""

    def setup_method(self):
        self.temp_dir = tempfile.mkdtemp()
        self.companion_log_path = os.path.join(self.temp_dir, "companion_log.json")
        self.checks_ledger_path = os.path.join(self.temp_dir, "checks_ledger.json")

    def teardown_method(self):
        for f in [self.companion_log_path, self.checks_ledger_path]:
            if os.path.exists(f):
                os.unlink(f)
        os.rmdir(self.temp_dir)

    def test_full_whybuddy_loop(self):
        """完整的WhyBuddy闭环：输入 -> Spec Tree -> 门禁 -> 伴随审查 -> 证据链 -> 交付"""

        # ===== 第1步：输入接地 =====
        clarified_brief = {
            "goal": "实现用户认证系统",
            "successCriteria": [
                {"id": "sc1", "text": "用户可以注册新账户"},
                {"id": "sc2", "text": "用户可以登录系统"},
                {"id": "sc3", "text": "密码必须加密存储"},
            ],
            "constraints": ["必须支持中文", "响应时间<200ms"],
        }

        # ===== 第2步：Critic伴随审查 =====
        critic = CriticAgent(companion_log_path=self.companion_log_path)
        critic_result = critic.review({
            "task_description": clarified_brief["goal"],
            "requirements": [],
            "constraints": clarified_brief["constraints"],
            "success_criteria": clarified_brief["successCriteria"],
        }, stage="clarification")

        assert critic_result.severity in ["low", "medium", "high", "critical"]
        assert len(critic_result.findings) > 0  # 应该发现缺少requirements

        # ===== 第3步：Grounding伴随审查 =====
        grounding = GroundingAgent(companion_log_path=self.companion_log_path)
        grounding_result = grounding.verify({
            "conclusions": [{"text": "使用JWT认证", "source": "repo://src/auth/jwt.py"}],
            "decisions": [],
            "evidence": ["repo://src/auth/jwt.py"],
        }, repo_context={"repo_available": True}, stage="clarification")

        assert grounding_result.grounded is True
        assert len(grounding_result.sources) > 0

        # ===== 第4步：生成Spec Tree =====
        spec_manager = SpecManager()
        tree = spec_manager.generate_spec_tree(clarified_brief)

        assert len(tree.nodes) >= 3
        assert len(tree.successCriteria) == 3

        # ===== 第5步：确定性门禁校验 =====
        gate_manager = GateManager(ledger_path=self.checks_ledger_path)

        # Spec Tree门禁
        spec_gate_result = gate_manager.run_gate("spec_tree_gate", tree)
        assert spec_gate_result.passed is True

        # EARS门禁
        ears_gate_result = gate_manager.run_gate("ears_gate", tree.nodes[0].acceptance)
        assert ears_gate_result.passed is True

        # 覆盖门禁
        covered_ids = set()
        for node in tree.nodes:
            if node.type == SpecTreeNodeType.REQUIREMENT:
                covered_ids.update(node.coversCriteria)

        coverage_gate_result = gate_manager.run_gate("coverage_gate", {
            "criteria_ids": [sc.id for sc in tree.successCriteria],
            "covered_ids": list(covered_ids),
        })
        assert coverage_gate_result.passed is True

        # ===== 第6步：证据链记录 =====
        evidence_chain = EvidenceChain()
        trace_id = "integration-test-001"

        evidence_chain.add_evidence(trace_id, Evidence(
            stage="routing",
            decision="选择认证部门",
            inputs={"user_input": clarified_brief["goal"]},
            outputs={"selected_dept": "dept-backend"},
            source_refs=["repo://data/routing_table.json"],
        ))

        evidence_chain.add_evidence(trace_id, Evidence(
            stage="decomposition",
            decision="分解为3个子任务",
            inputs={"task": clarified_brief["goal"]},
            outputs={"subtasks": ["注册模块", "登录模块", "加密模块"]},
        ))

        # 关联SpecTree
        spec_tree_nodes = [
            {"id": n.id, "type": n.type.value, "source": n.source}
            for n in tree.nodes
        ]
        evidence_chain.link_to_spec_tree(trace_id, spec_tree_nodes)

        chain = evidence_chain.get_chain(trace_id)
        assert len(chain) == 2

        # ===== 第7步：导出交付包 =====
        docs = spec_manager.generate_documents(tree)
        handoff = spec_manager.export_handoff(
            tree, docs,
            companion_log=critic.get_log_entries() + grounding.get_log_entries(),
            trace_id=trace_id,
        )

        assert handoff.spec_tree is not None
        assert handoff.documents is not None
        assert handoff.generated_at
        assert len(handoff.companion_log) >= 2  # critic + grounding

        # ===== 第8步：验证台账 =====
        ledger_summary = gate_manager.get_summary()
        assert ledger_summary["total"] == 3  # 3个门禁
        assert ledger_summary["passed"] == 3
        assert ledger_summary["failed"] == 0

        # 验证companion_log文件已写入
        assert os.path.exists(self.companion_log_path)
        with open(self.companion_log_path, 'r', encoding='utf-8') as f:
            log_data = json.load(f)
        assert len(log_data) >= 2

        # 验证checks_ledger文件已写入
        assert os.path.exists(self.checks_ledger_path)
        with open(self.checks_ledger_path, 'r', encoding='utf-8') as f:
            ledger_data = json.load(f)
        assert len(ledger_data) == 3

    def test_ears_validation_enforcement(self):
        """EARS验收标准强制执行"""
        ears_validator = EarsValidator()

        # 合法EARS
        valid_ears = "WHEN 用户注册时，系统 SHALL 验证邮箱格式"
        passed, violations = ears_validator.validate(valid_ears)
        assert passed is True

        # 非法EARS（缺少触发条件）
        invalid_ears = "系统应验证邮箱格式"
        passed, violations = ears_validator.validate(invalid_ears)
        assert passed is False
        assert any("触发条件" in v.message for v in violations)

    def test_fallback_chain_compensation(self):
        """回退链补偿机制"""
        import asyncio

        async def test():
            chain = FallbackChain(
                primary="dept-frontend",
                fallbacks=[
                    FallbackStep(target_id="dept-fullstack", reason="备选1"),
                    FallbackStep(target_id="dept-backend", reason="备选2"),
                ],
            )

            call_log = []

            async def executor(target_id):
                call_log.append(target_id)
                if target_id in ["dept-frontend", "dept-fullstack"]:
                    raise ValueError(f"{target_id}不可用")
                return {"status": "ok"}

            compensation_called = False

            async def compensation(context):
                nonlocal compensation_called
                compensation_called = True
                return True

            executor_instance = FallbackExecutor(compensation_callback=compensation)
            result = await executor_instance.execute_with_fallback(
                chain, executor, context={"task_id": "test"}
            )

            assert result.success is True
            assert result.target_id == "dept-backend"
            assert result.attempts == 3
            assert result.fallback_used is True
            assert call_log == ["dept-frontend", "dept-fullstack", "dept-backend"]

        asyncio.run(test())

    def test_spec_tree_validation_comprehensive(self):
        """Spec Tree综合校验"""
        validator = SpecTreeValidator()

        # 创建合法的完整规格树
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
                    id="n0", parentId=None, type=SpecTreeNodeType.REQUIREMENT,
                    title="根需求", acceptance="WHEN 系统启动时 SHALL 初始化所有模块",
                    coversCriteria=["sc1"], evidenceRefs=["nE1"],
                ),
                SpecTreeNode(
                    id="n1", parentId="n0", type=SpecTreeNodeType.REQUIREMENT,
                    title="子需求1", acceptance="IF 用户未登录 THEN 系统 SHALL 重定向到登录页",
                    coversCriteria=["sc2"], evidenceRefs=["nE1"],
                ),
                SpecTreeNode(
                    id="n2", parentId="n0", type=SpecTreeNodeType.REQUIREMENT,
                    title="子需求2", acceptance="WHEN 用户提交表单 THEN 系统 SHALL 验证必填字段",
                    coversCriteria=["sc3"], evidenceRefs=["nE1"],
                ),
                SpecTreeNode(
                    id="n3", parentId="n0", type=SpecTreeNodeType.DESIGN,
                    title="设计方案", evidenceRefs=["nE1"],
                ),
                SpecTreeNode(
                    id="n4", parentId="n3", type=SpecTreeNodeType.TASK,
                    title="实现任务", verify="pytest tests/",
                ),
                SpecTreeNode(
                    id="n5", parentId="n3", type=SpecTreeNodeType.TASK,
                    title="测试任务", verify="pytest tests/",
                ),
                SpecTreeNode(
                    id="nE1", parentId="n0", type=SpecTreeNodeType.EVIDENCE,
                    title="代码证据", source="repo://src/auth/login.py#L1-L50",
                ),
                SpecTreeNode(
                    id="nE2", parentId="n0", type=SpecTreeNodeType.EVIDENCE,
                    title="设计证据", source="repo://docs/auth_design.md",
                ),
            ],
            provenance=Provenance(generationSource="llm"),
        )

        result = validator.validate(tree)
        assert result.passed is True
        assert len(result.violations) == 0
        assert result.stats["node_count"] == 8


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
