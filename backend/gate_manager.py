"""
确定性门禁管理器

管理阶段转换的确定性校验门禁，记录台账。
移植自 WhyBuddy gate.py 的设计哲学。
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Callable, Optional
from datetime import datetime
import json
import os


@dataclass
class GateResult:
    """门禁执行结果"""
    gate_name: str
    passed: bool
    exit_code: int
    stdout: str
    stderr: str
    timestamp: str
    context: Optional[Dict[str, Any]] = None


@dataclass
class ChecksLedger:
    """校验台账"""
    records: List[GateResult] = field(default_factory=list)

    def record(self, result: GateResult):
        """追加记录到台账"""
        self.records.append(result)

    def export(self) -> List[GateResult]:
        """导出全部记录"""
        return self.records.copy()

    def to_json(self, path: str):
        """持久化到JSON文件"""
        data = [
            {
                "gate_name": r.gate_name,
                "passed": r.passed,
                "exit_code": r.exit_code,
                "stdout": r.stdout,
                "stderr": r.stderr,
                "timestamp": r.timestamp,
                "context": r.context,
            }
            for r in self.records
        ]

        # 确保目录存在
        os.makedirs(os.path.dirname(path) if os.path.dirname(path) else '.', exist_ok=True)

        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def summary(self) -> Dict[str, Any]:
        """生成台账摘要"""
        total = len(self.records)
        passed = sum(1 for r in self.records if r.passed)
        failed = total - passed

        return {
            "total": total,
            "passed": passed,
            "failed": failed,
            "pass_rate": passed / total if total > 0 else 0,
            "gates": [
                {
                    "name": r.gate_name,
                    "passed": r.passed,
                    "timestamp": r.timestamp,
                }
                for r in self.records
            ],
        }


# 门禁函数类型
GateValidator = Callable[[Any], GateResult]


class GateManager:
    """门禁管理器"""

    def __init__(self, ledger_path: Optional[str] = None):
        """
        Args:
            ledger_path: 台账文件路径（可选，不提供则只在内存中记录）
        """
        self._gates: Dict[str, GateValidator] = {}
        self._ledger = ChecksLedger()
        self._ledger_path = ledger_path

        # 注册内置门禁
        self._register_builtin_gates()

    def _register_builtin_gates(self):
        """注册内置门禁"""
        self.register_gate("spec_tree_gate", self._spec_tree_gate)
        self.register_gate("ears_gate", self._ears_gate)
        self.register_gate("coverage_gate", self._coverage_gate)

    def register_gate(self, name: str, validator: GateValidator):
        """
        注册门禁

        Args:
            name: 门禁名称
            validator: 门禁验证函数，接收context返回GateResult
        """
        self._gates[name] = validator

    def run_gate(self, name: str, context: Any) -> GateResult:
        """
        执行门禁并自动记台账

        Args:
            name: 门禁名称
            context: 门禁上下文（传给验证函数的参数）

        Returns:
            GateResult: 门禁执行结果

        Raises:
            KeyError: 门禁未注册
        """
        if name not in self._gates:
            raise KeyError(f"门禁未注册：{name}")

        validator = self._gates[name]
        result = validator(context)

        # 记录到台账
        self._ledger.record(result)

        # 持久化（如果配置了路径）
        if self._ledger_path:
            self._ledger.to_json(self._ledger_path)

        return result

    def get_ledger(self) -> ChecksLedger:
        """获取台账"""
        return self._ledger

    def get_summary(self) -> Dict[str, Any]:
        """获取台账摘要"""
        return self._ledger.summary()

    # ============ 内置门禁实现 ============

    def _spec_tree_gate(self, context: Any) -> GateResult:
        """
        Spec Tree结构校验门禁

        Args:
            context: SpecTree对象或字典

        Returns:
            GateResult
        """
        from spec_tree import SpecTreeValidator

        validator = SpecTreeValidator()

        try:
            if isinstance(context, dict):
                result = validator.validate_from_dict(context)
            else:
                result = validator.validate(context)

            return GateResult(
                gate_name="spec_tree_gate",
                passed=result.passed,
                exit_code=0 if result.passed else 1,
                stdout=f"校验{'通过' if result.passed else '失败'}：{len(result.violations)} 个违规",
                stderr="\n".join(result.violations) if result.violations else "",
                timestamp=datetime.now().isoformat(),
                context={"stats": result.stats, "violations": result.violations},
            )
        except Exception as e:
            return GateResult(
                gate_name="spec_tree_gate",
                passed=False,
                exit_code=2,
                stdout="",
                stderr=f"校验异常：{str(e)}",
                timestamp=datetime.now().isoformat(),
            )

    def _ears_gate(self, context: Any) -> GateResult:
        """
        EARS句式校验门禁

        Args:
            context: 验收标准文本或文本列表

        Returns:
            GateResult
        """
        from ears_validator import EarsValidator

        validator = EarsValidator()

        try:
            if isinstance(context, list):
                texts = context
            elif isinstance(context, str):
                texts = [context]
            else:
                return GateResult(
                    gate_name="ears_gate",
                    passed=False,
                    exit_code=2,
                    stdout="",
                    stderr=f"不支持的输入类型：{type(context)}",
                    timestamp=datetime.now().isoformat(),
                )

            violations = []
            for text in texts:
                passed, v = validator.validate(text)
                if not passed:
                    violations.extend(v)

            all_passed = len(violations) == 0

            return GateResult(
                gate_name="ears_gate",
                passed=all_passed,
                exit_code=0 if all_passed else 1,
                stdout=f"校验{'通过' if all_passed else '失败'}：{len(violations)} 个违规",
                stderr="\n".join([v.message for v in violations]) if violations else "",
                timestamp=datetime.now().isoformat(),
                context={"violations": [v.message for v in violations]},
            )
        except Exception as e:
            return GateResult(
                gate_name="ears_gate",
                passed=False,
                exit_code=2,
                stdout="",
                stderr=f"校验异常：{str(e)}",
                timestamp=datetime.now().isoformat(),
            )

    def _coverage_gate(self, context: Any) -> GateResult:
        """
        成功标准覆盖校验门禁

        Args:
            context: dict with keys: criteria_ids (List[str]), covered_ids (List[str])

        Returns:
            GateResult
        """
        try:
            if not isinstance(context, dict):
                return GateResult(
                    gate_name="coverage_gate",
                    passed=False,
                    exit_code=2,
                    stdout="",
                    stderr="输入必须是字典类型",
                    timestamp=datetime.now().isoformat(),
                )

            criteria_ids = set(context.get("criteria_ids", []))
            covered_ids = set(context.get("covered_ids", []))

            uncovered = criteria_ids - covered_ids

            if not criteria_ids:
                return GateResult(
                    gate_name="coverage_gate",
                    passed=False,
                    exit_code=1,
                    stdout="成功标准列表为空",
                    stderr="成功标准列表为空",
                    timestamp=datetime.now().isoformat(),
                )

            all_covered = len(uncovered) == 0

            return GateResult(
                gate_name="coverage_gate",
                passed=all_covered,
                exit_code=0 if all_covered else 1,
                stdout=f"覆盖{'完整' if all_covered else '不完整'}：{len(covered_ids)}/{len(criteria_ids)}",
                stderr=f"未覆盖的标准：{uncovered}" if uncovered else "",
                timestamp=datetime.now().isoformat(),
                context={
                    "total": len(criteria_ids),
                    "covered": len(covered_ids),
                    "uncovered": list(uncovered),
                },
            )
        except Exception as e:
            return GateResult(
                gate_name="coverage_gate",
                passed=False,
                exit_code=2,
                stdout="",
                stderr=f"校验异常：{str(e)}",
                timestamp=datetime.now().isoformat(),
            )


if __name__ == "__main__":
    # 测试用例
    manager = GateManager()

    # 测试EARS门禁
    print("=== EARS门禁测试 ===")

    # 合法EARS
    result = manager.run_gate("ears_gate", "WHEN 用户操作时 SHALL 响应")
    print(f"合法EARS：{'通过' if result.passed else '失败'}")

    # 非法EARS
    result = manager.run_gate("ears_gate", "系统应验证")
    print(f"非法EARS：{'通过' if result.passed else '失败'}")

    # 测试覆盖门禁
    print("\n=== 覆盖门禁测试 ===")

    # 完整覆盖
    result = manager.run_gate("coverage_gate", {
        "criteria_ids": ["sc1", "sc2"],
        "covered_ids": ["sc1", "sc2"],
    })
    print(f"完整覆盖：{'通过' if result.passed else '失败'}")

    # 不完整覆盖
    result = manager.run_gate("coverage_gate", {
        "criteria_ids": ["sc1", "sc2", "sc3"],
        "covered_ids": ["sc1"],
    })
    print(f"不完整覆盖：{'通过' if result.passed else '失败'}")

    # 打印台账摘要
    print("\n=== 台账摘要 ===")
    summary = manager.get_summary()
    print(json.dumps(summary, ensure_ascii=False, indent=2))
