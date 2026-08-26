#!/usr/bin/env python3
"""CI Guard: LLM 成本追踪架构守卫

受 Cumora '每次 LLM 调用必须记账' 原则启发。
检查所有 LLM 调用点是否接入了成本追踪。
"""

import re
import sys
from pathlib import Path

BACKEND = Path(__file__).parent.parent / "backend"

# 允许直接调用 LLM 的角色（agent turn）
ALLOWED_DIRECT_CALLERS = {
    "agent.py",           # AgentScope 封装
    "model_factory.py",   # 模型创建工厂
    "model_manager.py",   # 模型生命周期
    "llm_guard.py",       # LLM 超时守卫
    "llm_cache.py",       # LLM 缓存
    "llm_cost_tracker.py",# 成本追踪器自身
}

# 包含 LLM 调用的模式
LLM_CALL_PATTERNS = [
    r'\.reply\(',
    r'\.chat\(',
    r'create_agent\(',
    r'get_model\(',
]

# 排除的目录/文件
EXCLUDES = {"tests", "__pycache__", "legacy", "node_modules"}


def scan_files():
    """扫描所有 Python 文件中的 LLM 调用"""
    violations = []

    for py_file in BACKEND.rglob("*.py"):
        # 排除测试和缓存目录
        if any(ex in py_file.parts for ex in EXCLUDES):
            continue

        rel_path = py_file.relative_to(BACKEND)
        filename = py_file.name

        # 跳过允许的直接调用者
        if filename in ALLOWED_DIRECT_CALLERS:
            continue

        try:
            content = py_file.read_text(encoding="utf-8")
        except Exception:
            continue

        for pattern in LLM_CALL_PATTERNS:
            for match in re.finditer(pattern, content):
                line_num = content[:match.start()].count("\n") + 1
                violations.append({
                    "file": str(rel_path),
                    "line": line_num,
                    "pattern": pattern,
                    "context": content[match.start():match.start()+60].strip(),
                })

    return violations


def main():
    print("🔍 LLM 成本追踪守卫检查...")
    print(f"   扫描目录: {BACKEND}")

    violations = scan_files()

    if violations:
        print(f"\n⚠️  发现 {len(violations)} 个潜在的未追踪 LLM 调用点：\n")
        for v in violations:
            print(f"  {v['file']}:{v['line']} — {v['context'][:50]}")
        print("\n请确保这些调用点接入了 LLMCostTracker.record_call()")
        print("参考: backend/llm_cost_tracker.py")
        sys.exit(1)
    else:
        print("✅ 所有 LLM 调用点已接入成本追踪")
        sys.exit(0)


if __name__ == "__main__":
    main()
