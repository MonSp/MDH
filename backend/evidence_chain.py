"""
Evidence Chain - 证据链追踪系统

扩展 TraceContextManager，在每个 span 上附加 evidence 元数据，
形成完整决策证据链。
"""

import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class Evidence:
    """证据"""
    stage: str  # 阶段：routing/decomposition/assignment/execution/review
    decision: str  # 决策描述
    inputs: dict[str, Any] = field(default_factory=dict)  # 输入
    outputs: dict[str, Any] = field(default_factory=dict)  # 输出
    source_refs: list[str] = field(default_factory=list)  # 来源引用
    timestamp: str = ""

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.now().isoformat()


class EvidenceChain:
    """
    证据链追踪系统

    职责：
    1. 记录每个阶段的决策证据
    2. 通过 trace_id 形成可追溯的完整证据链
    3. 与 SpecTree 的 evidenceRefs 双向关联
    """

    def __init__(self):
        self._chains: dict[str, list[Evidence]] = {}  # trace_id -> evidences
        self._stage_index: dict[str, dict[str, list[Evidence]]] = {}  # trace_id -> stage -> evidences

    def add_evidence(self, trace_id: str, evidence: Evidence):
        """
        记录证据

        Args:
            trace_id: 追踪ID
            evidence: 证据
        """
        if trace_id not in self._chains:
            self._chains[trace_id] = []
            self._stage_index[trace_id] = {}

        self._chains[trace_id].append(evidence)

        # 按阶段索引
        stage = evidence.stage
        if stage not in self._stage_index[trace_id]:
            self._stage_index[trace_id][stage] = []
        self._stage_index[trace_id][stage].append(evidence)

    def get_chain(self, trace_id: str) -> list[Evidence]:
        """
        获取完整证据链

        Args:
            trace_id: 追踪ID

        Returns:
            List[Evidence]: 证据列表（按时间排序）
        """
        return self._chains.get(trace_id, []).copy()

    def get_decisions(self, trace_id: str, stage: str) -> list[Evidence]:
        """
        获取特定阶段的决策证据

        Args:
            trace_id: 追踪ID
            stage: 阶段名

        Returns:
            List[Evidence]: 该阶段的证据列表
        """
        if trace_id not in self._stage_index:
            return []
        return self._stage_index[trace_id].get(stage, []).copy()

    def get_stages(self, trace_id: str) -> list[str]:
        """
        获取证据链包含的所有阶段

        Args:
            trace_id: 追踪ID

        Returns:
            List[str]: 阶段名列表
        """
        if trace_id not in self._stage_index:
            return []
        return list(self._stage_index[trace_id].keys())

    def link_to_spec_tree(self, trace_id: str, spec_tree_nodes: list[dict[str, Any]]):
        """
        与 SpecTree evidenceRefs 双向关联

        Args:
            trace_id: 追踪ID
            spec_tree_nodes: SpecTree 节点列表
        """
        # 收集所有 evidence 节点的 source
        evidence_sources = {}
        for node in spec_tree_nodes:
            if node.get("type") == "evidence" and node.get("source"):
                evidence_sources[node["id"]] = node["source"]

        # 为每条证据记录关联的 evidence 节点
        for evidence in self._chains.get(trace_id, []):
            linked_refs = []
            for ref in evidence.source_refs:
                if ref in evidence_sources:
                    linked_refs.append({
                        "evidence_node_id": ref,
                        "source": evidence_sources[ref],
                    })

            # 将关联信息存入 outputs
            if linked_refs:
                evidence.outputs["linked_evidence_nodes"] = linked_refs

    def export_chain(self, trace_id: str) -> dict[str, Any]:
        """
        导出证据链为字典

        Args:
            trace_id: 追踪ID

        Returns:
            Dict: 证据链字典
        """
        chain = self.get_chain(trace_id)

        return {
            "trace_id": trace_id,
            "total_evidences": len(chain),
            "stages": self.get_stages(trace_id),
            "evidences": [
                {
                    "stage": e.stage,
                    "decision": e.decision,
                    "inputs": e.inputs,
                    "outputs": e.outputs,
                    "source_refs": e.source_refs,
                    "timestamp": e.timestamp,
                }
                for e in chain
            ],
        }

    def has_evidence(self, trace_id: str, stage: str | None = None) -> bool:
        """
        检查是否有证据

        Args:
            trace_id: 追踪ID
            stage: 阶段名（可选）

        Returns:
            bool: 是否有证据
        """
        if stage:
            return len(self.get_decisions(trace_id, stage)) > 0
        return len(self.get_chain(trace_id)) > 0

    def clear(self, trace_id: str | None = None):
        """
        清除证据

        Args:
            trace_id: 追踪ID（None则清除全部）
        """
        if trace_id:
            self._chains.pop(trace_id, None)
            self._stage_index.pop(trace_id, None)
        else:
            self._chains.clear()
            self._stage_index.clear()


if __name__ == "__main__":
    # 测试
    chain = EvidenceChain()

    # 添加路由决策证据
    chain.add_evidence("trace-001", Evidence(
        stage="routing",
        decision="选择部门A",
        inputs={"user_input": "创建登录页面"},
        outputs={"selected_dept": "frontend", "confidence": 0.9},
        source_refs=["repo://data/routing_table.json"],
    ))

    # 添加分解决策证据
    chain.add_evidence("trace-001", Evidence(
        stage="decomposition",
        decision="分解为3个子任务",
        inputs={"task": "创建登录页面"},
        outputs={"subtasks": ["表单组件", "验证逻辑", "API集成"]},
        source_refs=["spec_tree:n1", "spec_tree:n2"],
    ))

    # 添加执行证据
    chain.add_evidence("trace-001", Evidence(
        stage="execution",
        decision="执行表单组件开发",
        inputs={"subtask": "表单组件"},
        outputs={"files_created": ["LoginForm.tsx", "LoginForm.css"]},
        source_refs=["repo://src/components/LoginForm.tsx"],
    ))

    # 获取完整证据链
    print("=== 完整证据链 ===")
    full_chain = chain.get_chain("trace-001")
    for e in full_chain:
        print(f"[{e.stage}] {e.decision}")

    # 获取特定阶段证据
    print("\n=== 路由阶段证据 ===")
    routing_evidence = chain.get_decisions("trace-001", "routing")
    for e in routing_evidence:
        print(f"  决策：{e.decision}")
        print(f"  输出：{e.outputs}")

    # 导出证据链
    print("\n=== 导出证据链 ===")
    exported = chain.export_chain("trace-001")
    print(json.dumps(exported, ensure_ascii=False, indent=2))
