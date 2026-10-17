#!/usr/bin/env python
"""
A/B 评测：程序路径 vs LLM 直调（program-pivot T8）

验收产物：research/program-pivot-ab/
  arm_llm.json      五任务基线（registry 空 → 全部 LLM 路径）
  arm_program.json  五任务程序臂（预置 promoted 程序包 → 命中/回退实测）
  compare.json      p50/p95 耗时、成功得分、路径分布、程序事件、token 代理

前置：
  1. 后端运行于 EVAL_WS_URL（本分支代码，MDH_PORT 可配置）
  2. env 已导出 DEEPSEEK_API_KEY（session 默认取用）
  3. arm_program 前须 registry 可写（backend/data/program_packs）

用法：
  EVAL_WS_URL=ws://localhost:8766/ws python run_ab.py [--skip-llm] [--skip-program]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import sys
import time

EVD = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, EVD)

import ws_driver  # noqa: E402  （EVAL_WS_URL 已在模块加载时读取）

TASKS = [
    ("E1", "写一个 Python 函数，把嵌套 JSON 拍平成 key.path=value 的字典，并写 3 个单元测试"),
    ("E2", "给 Flask 应用加一个 /api/users 端点：GET 返回用户列表（内存数据即可），含输入校验和错误处理，补 pytest 测试"),
    ("E3", "前端 React 写一个倒计时组件（暂停/重置），并和 E2 的 API 对接说明"),
    ("E4", "开发+测试+部署准备：为 E2 的 API 加 Dockerfile 和 CI 配置说明"),
    ("E5", "写一个 Python 函数，把嵌套 TOML 配置拍平成 key.path=value，并写 3 个单元测试"),
]

FLATTEN_MAIN = '''"""拍平策略程序（E1/E5 触发）——本地计算 + 策略提示，零 LLM 执行。"""
import json
import sys


def run(data):
    task = (data or {}).get("task", "")
    fmt = "TOML" if "TOML" in task or "toml" in task else "JSON"
    return {
        "ok": True,
        "strategy": "flatten to key.path=value",
        "format": fmt,
        "steps": [
            f"递归遍历 {fmt}：叶子节点拼接 '.' 路径",
            "键序按插入序；空对象/数组输出空串",
            "为拍平函数写 3 个单元测试（嵌套/边界/深层）",
        ],
        "note": "本地程序产出策略；文件落盘由审阅后的执行方决定",
    }


if __name__ == "__main__":
    json.dump(run(json.load(sys.stdin)), sys.stdout)
'''

FLATTEN_TEST = '''import main


def test_strategy():
    out = main.run({"task": "拍平 JSON"})
    assert out["ok"] is True
    assert "flatten" in out["strategy"]
'''


def _backend_data_dir() -> str:
    """worktree 内 backend/data（相对本文件 ../../backend/data）。"""
    return os.path.abspath(os.path.join(EVD, "..", "..", "backend", "data"))


def seed_program_pack() -> str:
    """预置 promoted+fresh 的拍平程序包（E1/E5 关键词命中）。"""
    sys.path.insert(0, os.path.abspath(os.path.join(EVD, "..", "..", "backend")))
    from program_registry import ProgramManifest, ProgramRegistry, ProgramTrigger

    data_dir = _backend_data_dir()
    reg = ProgramRegistry(os.path.join(data_dir, "program_packs"))
    pid = "flatten_strategy"
    if reg.get(pid) is None:
        reg.create(
            ProgramManifest(
                program_id=pid,
                version="1.0.0",
                description="嵌套数据拍平为 key.path=value 的策略程序",
                trigger=ProgramTrigger(keywords=["拍平", "flatten", "key.path"]),
            )
        )
    pack = reg.pack_dir(pid)
    os.makedirs(os.path.join(pack, "tests"), exist_ok=True)
    with open(os.path.join(pack, "main.py"), "w", encoding="utf-8") as f:
        f.write(FLATTEN_MAIN)
    with open(os.path.join(pack, "tests", "test_main.py"), "w", encoding="utf-8") as f:
        f.write(FLATTEN_TEST)
    m = reg.get(pid)
    if m is not None and m.status.value != "promoted":
        reg.promote(pid)
    reg.record_validation(pid, model="deepseek-chat")  # 与会话默认模型一致，保新鲜
    return pid


def _pctl(values: list[float], p: float) -> float | None:
    if not values:
        return None
    vs = sorted(values)
    k = min(len(vs) - 1, max(0, int(round((p / 100) * (len(vs) - 1)))))
    return round(vs[k], 1)


def arm_metrics(summaries: list[dict]) -> dict:
    elapsed = [s.get("elapsed_sec") or 0 for s in summaries]
    successes = sum(1 for s in summaries if s.get("success"))
    paths: dict[str, int] = {}
    program_events = {"path_program": 0, "review_failed": 0, "fallback_notes": 0}
    for s in summaries:
        p = s.get("path_used") or "unknown"
        paths[p] = paths.get(p, 0) + 1
        if p == "program":
            program_events["path_program"] += 1
        for m in s.get("_raw_messages", []):
            if not isinstance(m, dict):
                continue
            if m.get("type") == "program_review_failed":
                program_events["review_failed"] += 1
            if m.get("type") == "agent_message" and "回退 LLM" in str(
                m.get("content", "")
            ):
                program_events["fallback_notes"] += 1
    return {
        "n": len(summaries),
        "success_score": f"{successes}/{len(summaries)}",
        "elapsed_p50_sec": _pctl(elapsed, 50),
        "elapsed_p95_sec": _pctl(elapsed, 95),
        "elapsed_mean_sec": round(statistics.mean(elapsed), 1) if elapsed else None,
        "paths": paths,
        "program_events": program_events,
        # token 代理：无 token 计量时以消息量近似（对照同口径）
        "token_proxy_messages": sum(s.get("total_messages") or 0 for s in summaries),
        "token_proxy_agent_msgs": sum(
            s.get("counts_by_type", {}).get("agent_message", 0) for s in summaries
        ),
    }


async def run_arm(name: str) -> list[dict]:
    summaries = []
    for tid, task in TASKS:
        print(f"[{name}] {tid}: {task[:40]}...", flush=True)
        out_prefix = os.path.join(EVD, f"{name}_{tid}")
        await ws_driver.run_task(task, out_prefix)
        # driver 无返回值（只落盘）→ 从 summary 文件回读
        with open(out_prefix + "_summary.json", encoding="utf-8") as f:
            summary = json.load(f)
        # 保留原始消息引用供程序事件统计
        try:
            with open(out_prefix + "_messages.json", encoding="utf-8") as f:
                summary["_raw_messages"] = json.load(f).get("messages") or []
        except OSError:
            summary["_raw_messages"] = []
        summaries.append(summary)
        print(
            f"[{name}] {tid}: elapsed={summary.get('elapsed_sec')}s "
            f"path={summary.get('path_used')} success={summary.get('success')}",
            flush=True,
        )
        # 落盘逐任务摘要（中断可恢复）
        with open(os.path.join(EVD, f"arm_{name}.partial.json"), "w", encoding="utf-8") as f:
            json.dump(summaries, f, ensure_ascii=False, indent=2)
    return summaries


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-llm", action="store_true")
    ap.add_argument("--skip-program", action="store_true")
    args = ap.parse_args()

    report: dict = {
        "date": time.strftime("%Y-%m-%d %H:%M:%S"),
        "ws_url": ws_driver.WS_URL,
        "note": "token 代理=消息数（无 token 计量）；得分=success 计数",
    }

    if not args.skip_llm:
        llm_summaries = await run_arm("llm")
        with open(os.path.join(EVD, "arm_llm.json"), "w", encoding="utf-8") as f:
            json.dump(llm_summaries, f, ensure_ascii=False, indent=2)
        report["arm_llm"] = arm_metrics(llm_summaries)

    if not args.skip_program:
        pid = seed_program_pack()
        report["seeded_program"] = pid
        print(f"seeded promoted pack: {pid}", flush=True)
        prog_summaries = await run_arm("program")
        with open(
            os.path.join(EVD, "arm_program.json"), "w", encoding="utf-8"
        ) as f:
            json.dump(prog_summaries, f, ensure_ascii=False, indent=2)
        report["arm_program"] = arm_metrics(prog_summaries)

    # 简明对比表
    if "arm_llm" in report and "arm_program" in report:
        a, b = report["arm_llm"], report["arm_program"]
        report["delta"] = {
            "p50_sec": (b["elapsed_p50_sec"] or 0) - (a["elapsed_p50_sec"] or 0),
            "p95_sec": (b["elapsed_p95_sec"] or 0) - (a["elapsed_p95_sec"] or 0),
            "success": b["success_score"] + " vs " + a["success_score"],
            "token_proxy_msgs": b["token_proxy_messages"]
            - a["token_proxy_messages"],
        }

    with open(os.path.join(EVD, "compare.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
