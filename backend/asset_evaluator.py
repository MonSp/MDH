"""资产评测把关：确定性检查 + LLM judge seam（仿 AIP Evals）。

设计 [S4]：确定性检查是主门槛（纯代码可测）；judge 可注入
（默认 None 跳过——试点接真实 key，单测用 fake）。
"""

from dataclasses import dataclass
from typing import Callable

from asset_store import AssetStore

_JUDGE_THRESHOLD = 0.5
_MIN_LENGTH = {"artifact": 20, "template": 50}


@dataclass
class EvaluationResult:
    passed: bool
    checks: dict
    judge_score: float | None
    reason: str = ""


class AssetEvaluator:
    def __init__(self, store: AssetStore, judge: Callable[[dict], float] | None = None):
        self._store = store
        self._judge = judge

    def evaluate(self, asset: dict) -> EvaluationResult:
        checks = {
            "completeness": bool(asset.get("title", "").strip()) and bool(asset.get("content", "").strip()),
            "structure": self._check_structure(asset),
            "duplicate": not self._is_duplicate(asset),
            "quality": len(asset.get("content", "")) >= _MIN_LENGTH.get(asset.get("type", "artifact"), 20),
        }
        judge_score = None
        if self._judge is not None:
            judge_score = float(self._judge(asset))
        passed = all(checks.values()) and (judge_score is None or judge_score >= _JUDGE_THRESHOLD)
        reason = "" if passed else "; ".join(k for k, v in checks.items() if not v) or "judge_score 低于阈值"
        return EvaluationResult(passed=passed, checks=checks, judge_score=judge_score, reason=reason)

    def _check_structure(self, asset: dict) -> bool:
        content = asset.get("content", "")
        if content.count("\n") >= 1:
            return True
        return any(k in content for k in ("待办", "要点", "标题", "日期", "决定"))

    def _is_duplicate(self, asset: dict) -> bool:
        hits = self._store.search(asset.get("team_id", ""), query=asset.get("title", ""), asset_type=asset.get("type"))
        return any(h.get("asset_id") != asset.get("asset_id") for h in hits)
