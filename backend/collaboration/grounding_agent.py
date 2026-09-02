"""
Grounding Agent - 伴随式接地角色

强制每条结论挂上真实代码/文件/接口出处。
每次审查结果写入 companion_log.json。
"""

import json
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass
class GroundingResult:
    """Grounding审查结果"""
    sources: list[str]
    grounded: bool
    timestamp: str
    stage: str
    details: dict[str, Any] | None = None


class GroundingAgent:
    """
    伴随式接地角色 - Grounding

    职责：
    1. 检查每条结论是否有真实代码/文件/接口出处
    2. 有仓库时读真代码验证
    3. 无仓库时标记降级

    按需触发，不常驻。
    """

    def __init__(self, companion_log_path: str | None = None):
        """
        Args:
            companion_log_path: companion_log.json 文件路径
        """
        self._companion_log_path = companion_log_path or "companion_log.json"
        self._log_entries: list[dict[str, Any]] = []

    def verify(self, task_output: dict[str, Any], repo_context: dict[str, Any] | None = None,
               stage: str = "review") -> GroundingResult:
        """
        验证任务产出的接地性

        Args:
            task_output: 任务产出，包含：
                - conclusions: 结论列表
                - decisions: 决策列表
                - evidence: 证据列表
            repo_context: 仓库上下文（可选），包含：
                - repo_available: 是否可用
                - files: 文件列表
                - interfaces: 接口列表
            stage: 审查阶段

        Returns:
            GroundingResult: 审查结果
        """
        sources = []
        repo_available = repo_context and repo_context.get("repo_available", False)

        # 1. 检查结论的证据来源
        sources.extend(self._check_conclusions(task_output, repo_available))

        # 2. 检查决策的依据
        sources.extend(self._check_decisions(task_output, repo_available))

        # 3. 检查现有证据的有效性
        sources.extend(self._check_evidence_validity(task_output, repo_context))

        # 判断是否充分接地
        grounded = len(sources) > 0

        # 如果仓库可用，要求至少有一条真实仓库出处
        if repo_available:
            real_repo_sources = [s for s in sources if "repo://" in s or "file://" in s]
            grounded = len(real_repo_sources) > 0

        result = GroundingResult(
            sources=sources,
            grounded=grounded,
            timestamp=datetime.now().isoformat(),
            stage=stage,
            details={
                "repo_available": repo_available,
                "total_sources": len(sources),
                "real_repo_sources": len([s for s in sources if "repo://" in s or "file://" in s]),
            },
        )

        # 写入companion_log
        self._write_to_log(result)

        return result

    def _check_conclusions(self, output: dict[str, Any], repo_available: bool) -> list[str]:
        """检查结论的证据来源"""
        sources = []

        conclusions = output.get("conclusions", [])
        for i, conclusion in enumerate(conclusions):
            if isinstance(conclusion, dict):
                # 检查是否有source字段
                source = conclusion.get("source", "")
                if source:
                    sources.append(source)
                elif repo_available:
                    sources.append(f"[待补充] 结论{i+1}缺少代码出处")
            elif isinstance(conclusion, str):
                # 字符串结论，检查是否包含路径引用
                if "/" in conclusion or "\\" in conclusion:
                    sources.append(conclusion)

        return sources

    def _check_decisions(self, output: dict[str, Any], repo_available: bool) -> list[str]:
        """检查决策的依据"""
        sources = []

        decisions = output.get("decisions", [])
        for decision in decisions:
            if isinstance(decision, dict):
                rationale = decision.get("rationale", "")
                if rationale:
                    # 检查rationale中是否有代码引用
                    if "repo://" in rationale or "file://" in rationale:
                        sources.append(rationale)

                # 检查是否有依据来源
                basis = decision.get("basis", "")
                if basis:
                    sources.append(basis)

        return sources

    def _check_evidence_validity(self, output: dict[str, Any],
                                  repo_context: dict[str, Any] | None) -> list[str]:
        """检查现有证据的有效性"""
        sources = []

        evidence_list = output.get("evidence", [])
        for evidence in evidence_list:
            if isinstance(evidence, str):
                # 检查是否是有效的证据格式
                if evidence.startswith("repo://") or evidence.startswith("file://") or evidence.startswith("clarified_brief:") or evidence.startswith("spec_tree:"):
                    sources.append(evidence)
            elif isinstance(evidence, dict):
                source = evidence.get("source", "")
                if source:
                    sources.append(source)

        return sources

    def _write_to_log(self, result: GroundingResult):
        """写入companion_log.json"""
        entry = {
            "stage": result.stage,
            "role": "grounding",
            "ts": result.timestamp,
            "sources": result.sources,
            "grounded": result.grounded,
        }

        self._log_entries.append(entry)

        # 尝试持久化
        try:
            # 读取现有日志
            existing = []
            if os.path.exists(self._companion_log_path):
                with open(self._companion_log_path, 'r', encoding='utf-8') as f:
                    existing = json.load(f)

            # 追加新条目
            existing.append(entry)

            # 写入文件
            os.makedirs(os.path.dirname(self._companion_log_path) if os.path.dirname(self._companion_log_path) else '.', exist_ok=True)
            with open(self._companion_log_path, 'w', encoding='utf-8') as f:
                json.dump(existing, f, ensure_ascii=False, indent=2)
        except Exception:
            # 日志写入失败不影响主流程
            pass

    def get_log_entries(self) -> list[dict[str, Any]]:
        """获取内存中的日志条目"""
        return self._log_entries.copy()


if __name__ == "__main__":
    # 测试
    agent = GroundingAgent()

    # 测试用例1：无仓库，无证据
    result = agent.verify({
        "conclusions": ["应该使用JWT认证"],
        "decisions": [],
        "evidence": [],
    }, repo_context=None, stage="review")

    print("测试1：无仓库，无证据")
    print(f"  接地：{'是' if result.grounded else '否'}")
    print(f"  来源：{len(result.sources)} 个")

    # 测试用例2：有仓库，有代码证据
    result = agent.verify({
        "conclusions": [
            {"text": "使用JWT认证", "source": "repo://src/auth/jwt.py#L10-L50"},
        ],
        "decisions": [
            {"choice": "JWT", "basis": "repo://src/auth/README.md"},
        ],
        "evidence": ["repo://src/auth/jwt.py"],
    }, repo_context={"repo_available": True}, stage="review")

    print("\n测试2：有仓库，有代码证据")
    print(f"  接地：{'是' if result.grounded else '否'}")
    print(f"  来源：{len(result.sources)} 个")
    for s in result.sources:
        print(f"    - {s}")
