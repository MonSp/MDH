"""资产评测把关：确定性检查 + LLM judge seam（仿 AIP Evals）。

设计 [S4]：确定性检查是主门槛（纯代码可测）；judge 可注入
（默认 None 跳过——试点接真实 key，单测用 fake）。
"""

from collections.abc import Callable
from dataclasses import dataclass

from asset_store import AssetStore, _norm_title

_JUDGE_THRESHOLD = 0.5
_MIN_LENGTH = {"artifact": 20, "template": 50}


@dataclass
class EvaluationResult:
    passed: bool
    checks: dict[str, bool]
    judge_score: float | None
    reason: str = ""


class AssetEvaluator:
    def __init__(self, store: AssetStore, judge: Callable[[dict], float] | None = None):
        self._store = store
        self._judge = judge

    def evaluate(self, asset: dict) -> EvaluationResult:
        """评测资产。

        judge 抛异常时 fail-closed：LLM 出错不放行资产（judge_score=None +
        passed=False + reason="judge 异常: <msg>"），避免网络/解析错误把
        不合格资产漏进演示闭环（仿 AIP Evals 评测纪律）。
        """
        checks = {
            "completeness": bool(asset.get("title", "").strip()) and bool(asset.get("content", "").strip()),
            "structure": self._check_structure(asset),
            "duplicate": not self._is_duplicate(asset),
            "quality": len(asset.get("content", "").strip()) >= _MIN_LENGTH.get(asset.get("type", "artifact"), 20),
        }
        judge_score = None
        if self._judge is not None:
            try:
                judge_score = float(self._judge(asset))
            except Exception as exc:  # fail-closed：LLM 出错不放行资产（仿 AIP Evals 评测纪律）
                return EvaluationResult(
                    passed=False, checks=checks, judge_score=None,
                    reason=f"judge 异常: {exc}",
                )
        passed = all(checks.values()) and (judge_score is None or judge_score >= _JUDGE_THRESHOLD)
        reason = "" if passed else "; ".join(k for k, v in checks.items() if not v) or "judge_score 低于阈值"
        return EvaluationResult(passed=passed, checks=checks, judge_score=judge_score, reason=reason)

    def _check_structure(self, asset: dict) -> bool:
        content = asset.get("content", "")
        if content.count("\n") >= 1:
            return True
        return any(k in content for k in ("待办", "要点", "标题", "日期", "决定"))

    def _is_duplicate(self, asset: dict) -> bool:
        # search 的 query 匹配是 标题+内容 包含：用它做候选召回，再用归一化标题
        # 精确相等判定，避免"既有资产内容提到新标题"被误判为重复。
        hits = self._store.search(asset.get("team_id", ""), query=asset.get("title", ""), asset_type=asset.get("type"))
        title = _norm_title(asset.get("title", ""))
        return any(
            h.get("asset_id") != asset.get("asset_id")
            and _norm_title(h.get("title", "")) == title
            for h in hits
        )
