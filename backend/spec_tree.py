"""
Spec Tree 数据结构与校验器

定义树形规格数据结构（SpecTreeNode、SpecTree）和确定性校验器（SpecTreeValidator）。
校验规则移植自 WhyBuddy 的 validate_spec_tree.py 逻辑。
"""

import json
from collections import defaultdict, deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class SpecTreeNodeType(str, Enum):
    """节点类型枚举"""
    REQUIREMENT = "requirement"
    DESIGN = "design"
    TASK = "task"
    EVIDENCE = "evidence"


@dataclass
class SuccessCriterion:
    """成功标准"""
    id: str
    text: str


@dataclass
class Provenance:
    """来源追踪"""
    generationSource: str  # "llm" | "llm_fallback" | "template"
    promptId: str = ""
    model: str = ""
    fingerprint: str = ""


@dataclass
class SpecTreeNode:
    """规格树节点"""
    id: str
    parentId: str | None
    type: SpecTreeNodeType
    title: str
    acceptance: str | None = None  # EARS句式验收标准（仅requirement类型）
    coversCriteria: list[str] = field(default_factory=list)  # 覆盖的成功标准ID列表
    evidenceRefs: list[str] = field(default_factory=list)  # 证据节点引用
    notes: str | None = None
    source: str | None = None  # 证据来源（仅evidence类型）
    verify: str | None = None  # 验证方法（仅task类型）


@dataclass
class SpecTree:
    """规格树"""
    rootNodeId: str
    version: int
    successCriteria: list[SuccessCriterion]
    nodes: list[SpecTreeNode]
    provenance: Provenance


@dataclass
class ValidationResult:
    """校验结果"""
    passed: bool
    violations: list[str] = field(default_factory=list)
    stats: dict[str, Any] = field(default_factory=dict)


class SpecTreeValidator:
    """规格树确定性校验器"""

    # 约束常量
    MIN_NODES = 3
    MAX_NODES = 60
    MAX_DEPTH = 4

    # 来源合法值
    VALID_SOURCES = {"llm", "llm_fallback", "template"}

    # 节点类型合法值
    VALID_TYPES = {t.value for t in SpecTreeNodeType}

    def validate(self, tree: SpecTree) -> ValidationResult:
        """
        校验规格树

        Args:
            tree: 待校验的规格树

        Returns:
            ValidationResult: 校验结果
        """
        violations = []
        stats = {}

        # 1. 结构校验
        struct_violations, struct_stats = self._validate_structure(tree)
        violations.extend(struct_violations)
        stats.update(struct_stats)

        # 2. 来源诚实校验
        source_violations = self._validate_provenance(tree)
        violations.extend(source_violations)

        # 3. 成功标准覆盖且不塌缩
        coverage_violations = self._validate_coverage(tree)
        violations.extend(coverage_violations)

        # 4. EARS验收句式校验
        ears_violations = self._validate_ears(tree)
        violations.extend(ears_violations)

        # 5. 证据贯穿校验
        evidence_violations = self._validate_evidence(tree)
        violations.extend(evidence_violations)

        passed = len(violations) == 0
        return ValidationResult(passed=passed, violations=violations, stats=stats)

    def _validate_structure(self, tree: SpecTree) -> tuple:
        """结构校验：节点数、唯一根、父可达、无环、深度"""
        violations = []
        stats = {}

        node_count = len(tree.nodes)
        stats["node_count"] = node_count

        # 节点数范围
        if node_count < self.MIN_NODES:
            violations.append(f"节点数不足：{node_count} < {self.MIN_NODES}")
        if node_count > self.MAX_NODES:
            violations.append(f"节点数过多：{node_count} > {self.MAX_NODES}")

        # ID唯一性
        ids = [n.id for n in tree.nodes]
        if len(ids) != len(set(ids)):
            duplicates = [id for id in ids if ids.count(id) > 1]
            violations.append(f"节点ID不唯一：{set(duplicates)}")

        # ID非空
        empty_ids = [n.id for n in tree.nodes if not n.id or not n.id.strip()]
        if empty_ids:
            violations.append("存在空ID节点")

        # 唯一根节点
        root_nodes = [n for n in tree.nodes if n.parentId is None]
        if len(root_nodes) != 1:
            violations.append(f"根节点数量不为1：{len(root_nodes)}")
        elif root_nodes[0].id != tree.rootNodeId:
            violations.append(f"rootNodeId {tree.rootNodeId} 与实际根节点 {root_nodes[0].id} 不匹配")
        elif root_nodes[0].type != SpecTreeNodeType.REQUIREMENT:
            violations.append(f"根节点类型必须为requirement，实际为{root_nodes[0].type}")

        # 父可达性
        node_ids = {n.id for n in tree.nodes}
        for node in tree.nodes:
            if node.parentId is not None and node.parentId not in node_ids:
                violations.append(f"节点 {node.id} 的父节点 {node.parentId} 不存在")

        # 无环检测
        if self._has_cycle(tree.nodes):
            violations.append("存在循环依赖")

        # 深度检测
        depth = self._calculate_depth(tree)
        stats["max_depth"] = depth
        if depth > self.MAX_DEPTH:
            violations.append(f"树深度超过限制：{depth} > {self.MAX_DEPTH}")

        # 类型合法性
        for node in tree.nodes:
            if node.type.value not in self.VALID_TYPES:
                violations.append(f"节点 {node.id} 类型非法：{node.type}")

        return violations, stats

    def _has_cycle(self, nodes: list[SpecTreeNode]) -> bool:
        """检测是否有环（DFS）"""
        adj = defaultdict(list)
        for node in nodes:
            if node.parentId:
                adj[node.parentId].append(node.id)

        visited = set()
        rec_stack = set()

        def dfs(node_id):
            visited.add(node_id)
            rec_stack.add(node_id)
            for neighbor in adj[node_id]:
                if neighbor not in visited:
                    if dfs(neighbor):
                        return True
                elif neighbor in rec_stack:
                    return True
            rec_stack.discard(node_id)
            return False

        for node in nodes:
            if node.id not in visited:
                if dfs(node.id):
                    return True
        return False

    def _calculate_depth(self, tree: SpecTree) -> int:
        """计算树的最大深度（BFS避免递归问题）"""
        children = defaultdict(list)
        for node in tree.nodes:
            if node.parentId:
                children[node.parentId].append(node.id)

        if not tree.rootNodeId:
            return 0

        max_depth = 0
        queue = deque([(tree.rootNodeId, 0)])
        visited = set()

        while queue:
            node_id, depth = queue.popleft()
            if node_id in visited:
                continue
            visited.add(node_id)
            max_depth = max(max_depth, depth)

            for child_id in children[node_id]:
                if child_id not in visited:
                    queue.append((child_id, depth + 1))

        return max_depth

    def _validate_provenance(self, tree: SpecTree) -> list[str]:
        """来源诚实校验"""
        violations = []

        if tree.provenance.generationSource not in self.VALID_SOURCES:
            violations.append(
                f"来源不合法：{tree.provenance.generationSource}，"
                f"必须为 {self.VALID_SOURCES} 之一"
            )

        return violations

    def _validate_coverage(self, tree: SpecTree) -> list[str]:
        """成功标准覆盖且不塌缩"""
        violations = []

        # 成功标准非空
        if not tree.successCriteria:
            violations.append("成功标准列表为空")
            return violations

        criteria_ids = {sc.id for sc in tree.successCriteria}

        # 收集所有requirement节点覆盖的标准
        req_nodes = [n for n in tree.nodes if n.type == SpecTreeNodeType.REQUIREMENT]
        covered_criteria = set()
        for req in req_nodes:
            covered_criteria.update(req.coversCriteria)

        # 检查每条标准是否被覆盖
        uncovered = criteria_ids - covered_criteria
        if uncovered:
            violations.append(f"成功标准未被覆盖：{uncovered}")

        # 不塌缩：requirement节点数 >= min(标准数, 3)
        min_req_count = min(len(tree.successCriteria), 3)
        if len(req_nodes) < min_req_count:
            violations.append(
                f"需求节点塌缩：{len(req_nodes)} < {min_req_count}，"
                f"不能把所有标准塞进一个节点"
            )

        return violations

    def _validate_ears(self, tree: SpecTree) -> list[str]:
        """EARS验收句式校验"""
        from ears_validator import EarsValidator

        violations = []
        ears_validator = EarsValidator()

        req_nodes = [n for n in tree.nodes if n.type == SpecTreeNodeType.REQUIREMENT]

        for req in req_nodes:
            if not req.acceptance:
                violations.append(f"需求节点 {req.id} 缺少acceptance字段")
                continue

            passed, ears_violations = ears_validator.validate(req.acceptance)
            if not passed:
                for v in ears_violations:
                    violations.append(f"需求节点 {req.id} 的acceptance不符合EARS：{v.message}")

        return violations

    def _validate_evidence(self, tree: SpecTree) -> list[str]:
        """证据贯穿校验"""
        violations = []

        # 收集所有evidence节点
        evidence_nodes = {n.id: n for n in tree.nodes if n.type == SpecTreeNodeType.EVIDENCE}

        # 检查每个requirement和design节点是否有evidenceRefs
        for node in tree.nodes:
            if node.type in (SpecTreeNodeType.REQUIREMENT, SpecTreeNodeType.DESIGN):
                if not node.evidenceRefs:
                    violations.append(f"节点 {node.id} ({node.type.value}) 缺少evidenceRefs")
                else:
                    # 检查引用的evidence节点是否存在且有source
                    for ref in node.evidenceRefs:
                        if ref not in evidence_nodes:
                            violations.append(f"节点 {node.id} 引用的证据 {ref} 不存在")
                        elif not evidence_nodes[ref].source:
                            violations.append(f"证据节点 {ref} 缺少source字段")

        return violations

    def validate_from_dict(self, data: dict) -> ValidationResult:
        """
        从字典校验规格树

        Args:
            data: 规格树字典

        Returns:
            ValidationResult: 校验结果
        """
        try:
            tree = self._dict_to_tree(data)
            return self.validate(tree)
        except Exception as e:
            return ValidationResult(passed=False, violations=[f"解析失败：{e!s}"])

    def _dict_to_tree(self, data: dict) -> SpecTree:
        """字典转SpecTree对象"""
        success_criteria = [
            SuccessCriterion(id=sc["id"], text=sc["text"])
            for sc in data.get("successCriteria", [])
        ]

        nodes = []
        for n in data.get("nodes", []):
            node = SpecTreeNode(
                id=n["id"],
                parentId=n.get("parentId"),
                type=SpecTreeNodeType(n["type"]),
                title=n["title"],
                acceptance=n.get("acceptance"),
                coversCriteria=n.get("coversCriteria", []),
                evidenceRefs=n.get("evidenceRefs", []),
                notes=n.get("notes"),
                source=n.get("source"),
                verify=n.get("verify"),
            )
            nodes.append(node)

        provenance_data = data.get("provenance", {})
        provenance = Provenance(
            generationSource=provenance_data.get("generationSource", "llm"),
            promptId=provenance_data.get("promptId", ""),
            model=provenance_data.get("model", ""),
            fingerprint=provenance_data.get("fingerprint", ""),
        )

        return SpecTree(
            rootNodeId=data["rootNodeId"],
            version=data.get("version", 2),
            successCriteria=success_criteria,
            nodes=nodes,
            provenance=provenance,
        )

    def validate_from_json(self, json_path: str) -> ValidationResult:
        """
        从JSON文件校验规格树

        Args:
            json_path: JSON文件路径

        Returns:
            ValidationResult: 校验结果
        """
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return self.validate_from_dict(data)
        except Exception as e:
            return ValidationResult(passed=False, violations=[f"读取文件失败：{e!s}"])


if __name__ == "__main__":
    # 测试用例
    validator = SpecTreeValidator()

    # 合法的规格树
    valid_tree = SpecTree(
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
                coversCriteria=["sc1", "sc2"],
                evidenceRefs=["nE1"],
            ),
            SpecTreeNode(
                id="n1",
                parentId="n0",
                type=SpecTreeNodeType.DESIGN,
                title="设计1",
                evidenceRefs=["nE1"],
            ),
            SpecTreeNode(
                id="n2",
                parentId="n1",
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

    result = validator.validate(valid_tree)
    print(f"合法树校验：{'通过' if result.passed else '失败'}")
    if result.violations:
        for v in result.violations:
            print(f"  违规：{v}")

    # 非法的规格树（缺少evidenceRefs）
    invalid_tree = SpecTree(
        rootNodeId="n0",
        version=2,
        successCriteria=[
            SuccessCriterion(id="sc1", text="成功标准1"),
        ],
        nodes=[
            SpecTreeNode(
                id="n0",
                parentId=None,
                type=SpecTreeNodeType.REQUIREMENT,
                title="根需求",
                acceptance="WHEN 用户操作时，系统 SHALL 响应",
                coversCriteria=["sc1"],
                # 缺少evidenceRefs
            ),
            SpecTreeNode(
                id="n1",
                parentId="n0",
                type=SpecTreeNodeType.DESIGN,
                title="设计1",
                # 缺少evidenceRefs
            ),
        ],
        provenance=Provenance(generationSource="llm"),
    )

    result = validator.validate(invalid_tree)
    print(f"\n非法树校验：{'通过' if result.passed else '失败'}")
    for v in result.violations:
        print(f"  违规：{v}")
