#!/usr/bin/env python3
"""WhyBuddy 确定性兜底树生成器（v2）。

当 LLM 不可用、超时、输出非 JSON，或无法通过结构守卫时使用。
该兜底树按构造满足 v2 不变量（含 successCriteria 覆盖、EARS 验收、证据贯穿），
避免落入 reject -> fallback -> reject 的死循环。兜底树不再回校验。

用法:
    python scripts/fallback_tree.py "目标描述"
"""

from __future__ import annotations

import json
import sys


def build(goal: str) -> dict:
    goal = (goal or "未命名目标").strip()
    nodes = [
        {
            "id": "n0",
            "parentId": None,
            "type": "requirement",
            "title": goal,
            "acceptance": f"当用户提交「{goal}」时，系统应产出可评审的规格与可交付的产物包。",
            "coversCriteria": ["sc1"],
            "evidenceRefs": ["nE1"],
        },
        {
            "id": "n1",
            "parentId": "n0",
            "type": "design",
            "title": "闭环流程设计",
            "notes": "覆盖输入、澄清、路线规划、规格树、交付、反馈闭环",
            "evidenceRefs": ["nE1"],
        },
        {
            "id": "n2",
            "parentId": "n1",
            "type": "task",
            "title": "生成规格文档与技能说明",
            "verify": "输出 requirements.md、design.md、tasks.md，且通过内容质量检查",
        },
        {
            "id": "nE1",
            "parentId": "n0",
            "type": "evidence",
            "title": "来源：用户输入的目标",
            "source": "user_input:goal",
        },
    ]
    return {
        "rootNodeId": "n0",
        "version": 2,
        "status": "fallback",
        "successCriteria": [
            {"id": "sc1", "text": f"「{goal}」的最小可评审、可交付闭环"}
        ],
        "nodes": nodes,
        "provenance": {
            "generationSource": "template",
            "promptId": None,
            "model": None,
            "fingerprint": None,
            "error": "llm 不可用或输出未通过校验",
        },
    }


def main() -> int:
    goal = sys.argv[1] if len(sys.argv) > 1 else ""
    print(json.dumps(build(goal), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
