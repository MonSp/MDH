#!/usr/bin/env python
"""T12 实网 E2E：同会话双任务二命（program-pivot T12）

流程（单一 WebSocket = 同一 session = 同一 CeoAgent）：
  1. 种入 promoted 落盘型程序（io_schema 要求 workspace）
  2. 任务 A：复杂措辞 → LLM 路径建 workspace（HITL auto-confirm）
  3. 任务 B：命中关键词 → 期望 path_used=program 且文件写入 workspace

用法（后端已在 EVAL_WS_URL 监听）：
  EVAL_WS_URL=ws://localhost:8766/ws python run_same_session_e2e.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time

import websockets

EVD = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.abspath(os.path.join(EVD, "..", "..", "backend"))
sys.path.insert(0, BACKEND)
sys.path.insert(0, os.path.abspath(os.path.join(EVD, "..", "program-pivot-ab")))

from ws_driver import summarize  # noqa: E402

WS_URL = os.environ.get("EVAL_WS_URL", "ws://localhost:8766/ws")
TIMEOUT_A = int(os.environ.get("T12_TIMEOUT_A", "600"))
TIMEOUT_B = int(os.environ.get("T12_TIMEOUT_B", "120"))

TASK_A = (
    "请设计并开发一个最小 Python 项目：创建 hello.py 包含 greet 函数，"
    "并编写 README.md 说明用法"
)
TASK_B = "请写文件：生成 out.txt，内容为 t12-e2e-hit"

PROGRAM_ID = "t12_file_writer"
KEYWORDS = ["写文件", "生成 out"]

FILE_MAIN = '''import json, os, sys


def run(data):
    ws = data.get("workspace_path")
    task = data.get("task", "")
    if not ws:
        return {"ok": False, "error": "no workspace"}
    path = os.path.join(ws, "out.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write(task)
    return {"ok": True, "files_written": [path], "task": task}


if __name__ == "__main__":
    json.dump(run(json.load(sys.stdin)), sys.stdout)
'''

FILE_TEST = '''import main


def test_run(tmp_path):
    r = main.run({"task": "t12-e2e-hit", "workspace_path": str(tmp_path)})
    assert r["ok"] is True
    assert (tmp_path / "out.txt").read_text() == "t12-e2e-hit"
'''


def seed_program() -> str:
    from program_registry import (
        ProgramManifest,
        ProgramRegistry,
        ProgramStatus,
        ProgramTrigger,
    )

    data_dir = os.path.join(BACKEND, "data")
    reg = ProgramRegistry(os.path.join(data_dir, "program_packs"))
    if reg.get(PROGRAM_ID) is None:
        reg.create(
            ProgramManifest(
                program_id=PROGRAM_ID,
                version="1.0.0",
                description="T12 E2E 落盘程序：写 out.txt 到 workspace",
                trigger=ProgramTrigger(keywords=KEYWORDS),
                io_schema={
                    "inputs": {
                        "task": {"type": "string", "required": True},
                        "workspace_path": {
                            "type": "string",
                            "required": True,
                        },
                    },
                    "outputs": {
                        "description": "files_written under workspace"
                    },
                },
            )
        )
    pack = reg.pack_dir(PROGRAM_ID)
    os.makedirs(os.path.join(pack, "tests"), exist_ok=True)
    with open(os.path.join(pack, "main.py"), "w", encoding="utf-8") as f:
        f.write(FILE_MAIN)
    with open(
        os.path.join(pack, "tests", "test_main.py"), "w", encoding="utf-8"
    ) as f:
        f.write(FILE_TEST)
    m = reg.get(PROGRAM_ID)
    if m is not None and m.status != ProgramStatus.PROMOTED:
        reg.promote(PROGRAM_ID)
    reg.record_validation(PROGRAM_ID, model="deepseek-chat")
    return PROGRAM_ID


def _load_api_key() -> str:
    env_path = os.path.abspath(os.path.join(EVD, "..", "..", "..", ".env"))
    if not os.path.isfile(env_path):
        return os.environ.get("DEEPSEEK_API_KEY", "")
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("DEEPSEEK_API_KEY="):
                return line.split("=", 1)[1].strip().strip("'\"")
    return os.environ.get("DEEPSEEK_API_KEY", "")


async def _recv_until_task_result(ws, messages, timeout):
    start = time.time()
    deadline = start + timeout
    while True:
        remaining = deadline - time.time()
        if remaining <= 0:
            return True, start  # timeout
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=min(remaining, 30))
        except asyncio.TimeoutError:
            continue
        try:
            msg = json.loads(raw)
        except Exception:
            msg = {"type": "<unparsable>", "raw": str(raw)[:200]}
        messages.append(msg)
        t = msg.get("type") if isinstance(msg, dict) else None
        if t == "workspace_confirm_request":
            wt = msg.get("suggested_type") or "standalone"
            reply = {
                "type": "workspace_confirm_response",
                "workspace_type": wt,
            }
            await ws.send(json.dumps(reply))
            messages.append({"type": "<client_send>", "sent": reply})
        if t == "human_approval_request":
            rid = (msg.get("approval") or msg).get("id") or msg.get("requestId")
            reply = {
                "type": "human_approval_response",
                "requestId": rid,
                "approved": True,
                "reason": "t12-e2e auto-approve",
            }
            await ws.send(json.dumps(reply))
            messages.append({"type": "<client_send>", "sent": reply})
        if t == "task_result":
            return False, start
    return False, start


async def main() -> int:
    pid = seed_program()
    print(f"seeded promoted pack: {pid}", flush=True)

    api_key = _load_api_key()
    results = {}
    all_msgs_a: list = []
    all_msgs_b: list = []

    async with websockets.connect(
        WS_URL, max_size=50 * 1024 * 1024, ping_interval=20, ping_timeout=60
    ) as ws:
        try:
            first = await asyncio.wait_for(ws.recv(), timeout=15)
            all_msgs_a.append(json.loads(first))
        except Exception as e:
            print(f"initial recv: {e}", flush=True)

        # ── Task A: complex → workspace ──
        print(f"[A] {TASK_A[:50]}...", flush=True)
        await ws.send(
            json.dumps(
                {
                    "type": "unified_message",
                    "content": TASK_A,
                    "selected_roles": [],
                    "execution_preference": "auto",
                    "api_key": api_key,
                    "model_name": os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"),
                    "provider": "deepseek",
                }
            )
        )
        to_a, start_a = await _recv_until_task_result(ws, all_msgs_a, TIMEOUT_A)
        elapsed_a = round(time.time() - start_a, 1)
        sum_a = summarize(all_msgs_a, TASK_A, elapsed_a, to_a, None)
        results["task_a"] = sum_a
        print(
            f"[A] path={sum_a.get('path_used')} success={sum_a.get('success')} "
            f"ws={sum_a.get('workspace')} elapsed={elapsed_a}s",
            flush=True,
        )

        # ── Task B: same session, expect program ──
        print(f"[B] {TASK_B[:50]}...", flush=True)
        await ws.send(
            json.dumps(
                {
                    "type": "unified_message",
                    "content": TASK_B,
                    "selected_roles": [],
                    "execution_preference": "auto",
                    "api_key": api_key,
                    "model_name": os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"),
                    "provider": "deepseek",
                }
            )
        )
        to_b, start_b = await _recv_until_task_result(ws, all_msgs_b, TIMEOUT_B)
        elapsed_b = round(time.time() - start_b, 1)
        sum_b = summarize(all_msgs_b, TASK_B, elapsed_b, to_b, None)
        # B 无 workspace_created 消息 → 用 A 的 workspace 补全摘要字段
        ws_path = None
        if isinstance(sum_a.get("workspace"), dict):
            ws_path = sum_a["workspace"].get("workspace_path")
        if ws_path and not sum_b.get("workspace"):
            sum_b["workspace"] = {
                "workspace_id": None,
                "workspace_path": ws_path,
                "from_task_a": True,
            }
        out_file = os.path.join(ws_path, "out.txt") if ws_path else None
        sum_b["t12_out_file"] = out_file
        sum_b["t12_out_file_exists"] = bool(out_file and os.path.isfile(out_file))
        if sum_b["t12_out_file_exists"]:
            with open(out_file, encoding="utf-8") as f:
                sum_b["t12_out_file_content"] = f.read()
        results["task_b"] = sum_b
        print(
            f"[B] path={sum_b.get('path_used')} success={sum_b.get('success')} "
            f"out_exists={sum_b.get('t12_out_file_exists')} elapsed={elapsed_b}s",
            flush=True,
        )

    dods = {
        "task_a_created_workspace": bool(
            isinstance(sum_a.get("workspace"), dict)
            and sum_a["workspace"].get("workspace_path")
        ),
        "task_b_path_program": sum_b.get("path_used") == "program",
        "task_b_out_file_exists": sum_b.get("t12_out_file_exists") is True,
        "task_b_success": sum_b.get("success") is True,
    }
    dods["passed"] = all(dods.values())

    report = {
        "dod": dods,
        "seeded_program": pid,
        "ws_url": WS_URL,
        "task_a_summary": {
            k: sum_a.get(k)
            for k in (
                "path_used",
                "success",
                "elapsed_sec",
                "timeout",
                "workspace",
                "total_messages",
            )
        },
        "task_b_summary": {
            k: sum_b.get(k)
            for k in (
                "path_used",
                "success",
                "elapsed_sec",
                "timeout",
                "total_messages",
                "program_id",
                "output",
                "t12_out_file",
                "t12_out_file_exists",
                "t12_out_file_content",
                "ceo_final_message",
            )
        },
        "task_b_ceo_messages": [
            m.get("content")
            for m in all_msgs_b
            if isinstance(m, dict)
            and m.get("type") == "agent_message"
            and "程序" in str(m.get("content", ""))
        ][:10],
    }
    out_path = os.path.join(EVD, "same_session_e2e_result.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    with open(os.path.join(EVD, "task_a_messages.json"), "w") as f:
        json.dump(
            {"task": TASK_A, "messages": all_msgs_a}, f, ensure_ascii=False, indent=1
        )
    with open(os.path.join(EVD, "task_b_messages.json"), "w") as f:
        json.dump(
            {"task": TASK_B, "messages": all_msgs_b}, f, ensure_ascii=False, indent=1
        )
    print(json.dumps(dods, ensure_ascii=False), flush=True)
    print(f"report: {out_path}", flush=True)
    return 0 if dods["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
