#!/usr/bin/env python3
"""WhyBuddy 伴随层留痕校验器（对应架构图「伴随式审查与接地」）。

伴随层(挑刺者/接地者)是按需触发的方法，不是常驻脚本；但「它到底有没有真发力」
不能靠嘴说。本校验器强制：发力就得留痕，没痕迹=没发力。

规则(确定性可查)：
  - companion_log.json 必须是列表；每条含 stage、role∈{critic,grounding}、ts。
  - critic 条目的 findings 必须非空（挑出了什么）。
  - grounding 条目的 sources 必须非空（引用了哪些真实出处）。
  - 给了 project_context 且 repoAvailable=true → 必须至少有一条 grounding 且 sources 非空
    （有真仓库却没接地 = 没读代码，直接判不通过）。
  - greenfield/低风险下空 log 允许通过（按需触发），但会打印提示。

诚实边界：脚本能查「有没有留痕、出处是否非空」，查不了「挑得对不对、出处是不是真的」。

用法:
    python scripts/check_companion.py companion_log.json [project_context.json]
"""
from __future__ import annotations
import json, pathlib, sys

VALID_ROLES = {"critic", "grounding"}


def main(argv):
    if len(argv) < 2:
        print("用法: python scripts/check_companion.py companion_log.json [project_context.json]", file=sys.stderr)
        return 2
    p = pathlib.Path(argv[1])
    if not p.exists():
        print(f"不通过 - 找不到 {p}（伴随层若发力必须产出 companion_log.json）")
        return 1
    try:
        log = json.loads(p.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"不通过 - companion_log.json 解析失败: {exc}")
        return 1
    if not isinstance(log, list):
        print("不通过 - companion_log.json 必须是列表")
        return 1

    failures = []
    n_critic = n_ground = 0
    for i, e in enumerate(log):
        if not isinstance(e, dict):
            failures.append(f"第 {i} 条不是对象"); continue
        if not str(e.get("stage") or "").strip():
            failures.append(f"第 {i} 条缺 stage")
        role = e.get("role")
        if role not in VALID_ROLES:
            failures.append(f"第 {i} 条 role 非法: {role!r}（应为 critic/grounding）"); continue
        if not str(e.get("ts") or "").strip():
            failures.append(f"第 {i} 条缺 ts")
        if role == "critic":
            n_critic += 1
            if not isinstance(e.get("findings"), list) or not e.get("findings"):
                failures.append(f"第 {i} 条(critic) findings 为空——挑刺者没挑出东西就别记")
        if role == "grounding":
            n_ground += 1
            if not isinstance(e.get("sources"), list) or not e.get("sources"):
                failures.append(f"第 {i} 条(grounding) sources 为空——接地必须写真实出处")

    repo_available = None
    if len(argv) > 2 and pathlib.Path(argv[2]).exists():
        try:
            ctx = json.loads(pathlib.Path(argv[2]).read_text(encoding="utf-8"))
            repo_available = bool(ctx.get("grounding", {}).get("repoAvailable"))
        except Exception:
            pass
    if repo_available is True and n_ground == 0:
        failures.append("有真实仓库(repoAvailable=true)却没有任何 grounding 留痕——接地者没真读代码")

    if failures:
        print("不通过 - 伴随层留痕校验失败:")
        for f in failures:
            print(f"  - {f}")
        return 1

    if not log:
        print("通过 - 本轮未触发伴随层（空 log，按需触发允许）。若本轮接了真仓库或风险高，应当有留痕。")
        return 0
    print(f"通过 - 伴随层留痕合法（挑刺 {n_critic} 条 / 接地 {n_ground} 条" +
          (f"，repoAvailable={repo_available}" if repo_available is not None else "") + "）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
