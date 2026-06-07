#!/usr/bin/env python3
"""WhyBuddy 文档内容质量检查器（v2）。

不是验证文件存在，而是检查规格文档本身是否成形。
v2 新增：requirements.md 的「验收标准」段必须用 EARS 句式（触发条件 + SHALL/应）。

用法:
    python scripts/check_content_quality.py docs/requirements.md docs/design.md docs/tasks.md
"""

from __future__ import annotations

import pathlib
import re
import sys

REQUIRED_SECTIONS = {
    "requirements.md": ["## 目标", "## 范围", "## 功能要求", "## 验收标准"],
    "design.md": ["## 设计目标", "## 模块划分", "## 失败处理策略", "## 质量控制"],
    "tasks.md": ["## 里程碑", "## 任务清单", "## 完成定义"],
}

EARS_MODAL = re.compile(r"(SHALL|应当|应|须|必须)", re.I)
EARS_TRIG = re.compile(r"(WHEN|WHILE|IF|WHERE|每当|一旦|当|若|如果|在|则)", re.I)


def read_text(path: pathlib.Path) -> str:
    return path.read_text(encoding="utf-8")


def main(argv: list[str]) -> int:
    if len(argv) < 4:
        print("用法: python scripts/check_content_quality.py requirements.md design.md tasks.md", file=sys.stderr)
        return 2

    failures: list[str] = []
    for raw_path in argv[1:4]:
        path = pathlib.Path(raw_path)
        if not path.exists():
            failures.append(f"文件不存在: {path}")
            continue
        content = read_text(path)
        expected = REQUIRED_SECTIONS.get(path.name)
        if not expected:
            failures.append(f"未知文档类型: {path.name}")
            continue
        for section in expected:
            if section not in content:
                failures.append(f"{path.name} 缺少必备章节: {section}")
        if len(content.strip()) < 200:
            failures.append(f"{path.name} 内容过短，疑似尚未成形")
        if path.name == "requirements.md" and "## 验收标准" in content:
            seg = content.split("## 验收标准", 1)[1]
            if not (EARS_MODAL.search(seg) and EARS_TRIG.search(seg)):
                failures.append("requirements.md 的验收标准未用 EARS 句式（需含触发条件 + SHALL/应）")

    if failures:
        print("不通过 - 文档内容质量检查失败:")
        for failure in failures:
            print(f"  - {failure}")
        return 1

    print("通过 - 规格文档内容结构完整，验收为 EARS 句式")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
