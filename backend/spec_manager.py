"""
Spec Manager - 规格管理器

封装 Spec Tree 的生成、校验、文档派生全流程。
集成 GateManager、EarsValidator、EvidenceChain。
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
import json
import os

from spec_tree import (
    SpecTree, SpecTreeNode, SpecTreeNodeType,
    SuccessCriterion, Provenance, SpecTreeValidator, ValidationResult,
)
from gate_manager import GateManager, GateResult
from ears_validator import EarsValidator
from evidence_chain import EvidenceChain, Evidence


@dataclass
class SpecDocuments:
    """规格文档集合"""
    requirements_md: str
    design_md: str
    tasks_md: str


@dataclass
class HandoffPackage:
    """交付包"""
    spec_tree: Dict[str, Any]
    documents: SpecDocuments
    checks_ledger: List[Dict[str, Any]]
    traceability_matrix: Dict[str, Any]
    companion_log: List[Dict[str, Any]]
    evidence_chain: Dict[str, Any]
    generated_at: str


class SpecManager:
    """
    规格管理器
    
    职责：
    1. 从澄清简报生成 Spec Tree
    2. 校验并通过门禁
    3. 从树派生 requirements/design/tasks 文档
    4. 导出交付包
    """
    
    def __init__(
        self,
        gate_manager: Optional[GateManager] = None,
        ears_validator: Optional[EarsValidator] = None,
        evidence_chain: Optional[EvidenceChain] = None,
    ):
        self._gate_manager = gate_manager or GateManager()
        self._ears_validator = ears_validator or EarsValidator()
        self._evidence_chain = evidence_chain or EvidenceChain()
        self._spec_validator = SpecTreeValidator()
    
    def generate_spec_tree(self, clarified_brief: Dict[str, Any]) -> SpecTree:
        """
        从澄清简报生成 Spec Tree
        
        Args:
            clarified_brief: 澄清简报，包含：
                - goal: 目标
                - successCriteria: 成功标准列表
                - constraints: 约束列表
                
        Returns:
            SpecTree
        """
        goal = clarified_brief.get("goal", "")
        criteria = clarified_brief.get("successCriteria", [])
        
        # 构建成功标准
        success_criteria = [
            SuccessCriterion(id=sc["id"], text=sc["text"])
            for sc in criteria
        ]
        
        # 构建根节点
        root = SpecTreeNode(
            id="n0",
            parentId=None,
            type=SpecTreeNodeType.REQUIREMENT,
            title=goal,
            acceptance=f"WHEN 任务进入系统时，系统 SHALL 完成: {goal}",
            coversCriteria=[sc["id"] for sc in criteria[:1]],  # 根节点覆盖第一条标准
            evidenceRefs=["nE1"],
        )
        
        # 为每条成功标准创建需求节点
        nodes = [root]
        for i, sc in enumerate(criteria[1:], 1):
            req_node = SpecTreeNode(
                id=f"n{i}",
                parentId="n0",
                type=SpecTreeNodeType.REQUIREMENT,
                title=f"需求: {sc['text'][:50]}",
                acceptance=f"WHEN 条件满足时，系统 SHALL {sc['text']}",
                coversCriteria=[sc["id"]],
                evidenceRefs=["nE1"],
            )
            nodes.append(req_node)
        
        # 添加证据节点
        evidence_node = SpecTreeNode(
            id="nE1",
            parentId="n0",
            type=SpecTreeNodeType.EVIDENCE,
            title="来源证据",
            source="clarified_brief:successCriteria",
        )
        nodes.append(evidence_node)
        
        return SpecTree(
            rootNodeId="n0",
            version=2,
            successCriteria=success_criteria,
            nodes=nodes,
            provenance=Provenance(generationSource="llm"),
        )
    
    def validate_and_gate(self, tree: SpecTree) -> Tuple[bool, SpecTree]:
        """
        校验并通过门禁
        
        Args:
            tree: 规格树
            
        Returns:
            Tuple[bool, SpecTree]: (是否通过, 规格树)
        """
        # 运行Spec Tree门禁
        result = self._gate_manager.run_gate("spec_tree_gate", tree)
        
        if result.passed:
            return True, tree
        
        # 如果失败，尝试一次重生成（简化版：直接返回失败）
        return False, tree
    
    def generate_documents(self, tree: SpecTree) -> SpecDocuments:
        """
        从树派生文档
        
        Args:
            tree: 规格树
            
        Returns:
            SpecDocuments
        """
        # 生成requirements.md
        requirements_md = self._generate_requirements_md(tree)
        
        # 生成design.md
        design_md = self._generate_design_md(tree)
        
        # 生成tasks.md
        tasks_md = self._generate_tasks_md(tree)
        
        return SpecDocuments(
            requirements_md=requirements_md,
            design_md=design_md,
            tasks_md=tasks_md,
        )
    
    def _generate_requirements_md(self, tree: SpecTree) -> str:
        """生成requirements.md"""
        lines = ["# 需求规格\n"]
        lines.append("## 目标\n")
        lines.append(f"{tree.nodes[0].title}\n")
        lines.append("## 功能要求\n")
        
        for node in tree.nodes:
            if node.type == SpecTreeNodeType.REQUIREMENT:
                lines.append(f"### {node.title}\n")
                if node.acceptance:
                    lines.append(f"**验收标准**: {node.acceptance}\n")
        
        lines.append("## 验收标准\n")
        for sc in tree.successCriteria:
            lines.append(f"- **{sc.id}**: {sc.text}\n")
        
        return "\n".join(lines)
    
    def _generate_design_md(self, tree: SpecTree) -> str:
        """生成design.md"""
        lines = ["# 设计规格\n"]
        lines.append("## 设计目标\n")
        lines.append("实现规格树中定义的所有需求。\n")
        lines.append("## 模块划分\n")
        
        for node in tree.nodes:
            if node.type == SpecTreeNodeType.DESIGN:
                lines.append(f"### {node.title}\n")
                if node.notes:
                    lines.append(f"{node.notes}\n")
        
        lines.append("## 失败处理策略\n")
        lines.append("使用回退链机制，首选路径失败时自动尝试备选路径。\n")
        lines.append("## 质量控制\n")
        lines.append("每个阶段转换经过确定性门禁校验。\n")
        
        return "\n".join(lines)
    
    def _generate_tasks_md(self, tree: SpecTree) -> str:
        """生成tasks.md"""
        lines = ["# 任务清单\n"]
        lines.append("## 里程碑\n")
        lines.append("按需求分解为独立任务。\n")
        lines.append("## 任务清单\n")
        
        for node in tree.nodes:
            if node.type == SpecTreeNodeType.TASK:
                lines.append(f"### {node.title}\n")
                if node.verify:
                    lines.append(f"**验证**: {node.verify}\n")
        
        lines.append("## 完成定义\n")
        lines.append("所有任务完成且通过门禁校验。\n")
        
        return "\n".join(lines)
    
    def build_traceability_matrix(self, tree: SpecTree) -> Dict[str, Any]:
        """
        构建可追溯矩阵
        
        Args:
            tree: 规格树
            
        Returns:
            可追溯矩阵字典
        """
        mappings = []
        
        for sc in tree.successCriteria:
            mapping = {
                "successCriteria": sc.id,
                "requirements": [],
                "designs": [],
                "tasks": [],
                "evidence": [],
            }
            
            for node in tree.nodes:
                if node.type == SpecTreeNodeType.REQUIREMENT and sc.id in node.coversCriteria:
                    mapping["requirements"].append(node.id)
                elif node.type == SpecTreeNodeType.DESIGN:
                    mapping["designs"].append(node.id)
                elif node.type == SpecTreeNodeType.TASK:
                    mapping["tasks"].append(node.id)
                elif node.type == SpecTreeNodeType.EVIDENCE:
                    mapping["evidence"].append(node.id)
            
            mappings.append(mapping)
        
        return {"mappings": mappings}
    
    def export_handoff(
        self,
        tree: SpecTree,
        documents: SpecDocuments,
        companion_log: Optional[List[Dict[str, Any]]] = None,
        trace_id: Optional[str] = None,
    ) -> HandoffPackage:
        """
        导出交付包
        
        Args:
            tree: 规格树
            documents: 文档
            companion_log: 伴随层日志
            trace_id: 追踪ID
            
        Returns:
            HandoffPackage
        """
        # 构建可追溯矩阵
        traceability_matrix = self.build_traceability_matrix(tree)
        
        # 获取证据链
        evidence_data = {}
        if trace_id:
            evidence_data = self._evidence_chain.export_chain(trace_id)
        
        # 获取校验台账
        ledger_summary = self._gate_manager.get_summary()
        
        return HandoffPackage(
            spec_tree={
                "rootNodeId": tree.rootNodeId,
                "version": tree.version,
                "successCriteria": [{"id": sc.id, "text": sc.text} for sc in tree.successCriteria],
                "nodes": [
                    {
                        "id": n.id,
                        "parentId": n.parentId,
                        "type": n.type.value,
                        "title": n.title,
                        "acceptance": n.acceptance,
                        "coversCriteria": n.coversCriteria,
                        "evidenceRefs": n.evidenceRefs,
                    }
                    for n in tree.nodes
                ],
                "provenance": {
                    "generationSource": tree.provenance.generationSource,
                },
            },
            documents=documents,
            checks_ledger=ledger_summary.get("gates", []),
            traceability_matrix=traceability_matrix,
            companion_log=companion_log or [],
            evidence_chain=evidence_data,
            generated_at=datetime.now().isoformat(),
        )


if __name__ == "__main__":
    # 测试
    manager = SpecManager()
    
    # 从澄清简报生成Spec Tree
    brief = {
        "goal": "实现用户认证系统",
        "successCriteria": [
            {"id": "sc1", "text": "用户可以注册"},
            {"id": "sc2", "text": "用户可以登录"},
            {"id": "sc3", "text": "密码加密存储"},
        ],
    }
    
    tree = manager.generate_spec_tree(brief)
    print(f"生成Spec Tree: {len(tree.nodes)} 个节点")
    
    # 校验
    passed, tree = manager.validate_and_gate(tree)
    print(f"校验{'通过' if passed else '失败'}")
    
    # 生成文档
    docs = manager.generate_documents(tree)
    print(f"生成文档: requirements={len(docs.requirements_md)}字, design={len(docs.design_md)}字, tasks={len(docs.tasks_md)}字")
    
    # 导出交付包
    handoff = manager.export_handoff(tree, docs)
    print(f"交付包生成于: {handoff.generated_at}")
