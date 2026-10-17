#!/usr/bin/env python
"""WS driver (R5) for MDH eval: send one task, collect raw messages until task_result.

Adds R5-specific summary fields:
  injection_count      - agent_messages containing 「已注入」
  review_rounds        - count of messages containing 「项目经理：第 N 轮质量审查」
  final_review_status  - structured_feedback status(es) + CEO final message text
  truncation_complaints- count of messages containing 「截断」
  workspace            - workspace dir from workspace_created
  workflow_review      - bool: any structured_feedback / review_completed msg seen
  written_file_duplicates - filenames written more than once
"""
import asyncio
import json
import os
import re
import sys
import time

import websockets

WS_URL = os.environ.get("EVAL_WS_URL", "ws://localhost:8765/ws")
EVD = os.path.dirname(os.path.abspath(__file__))
TIMEOUT = 600  # 10 minutes

REVIEW_ROUND_RE = re.compile(r"项目经理：第\s*(\d+)\s*轮质量审查")
INJECTION_TOKEN = "已注入"
TRUNCATION_TOKEN = "截断"


def _text_of(m):
    """Flatten a message's human-visible text (content / delta / nested)."""
    if not isinstance(m, dict):
        return str(m)
    parts = []
    for k in ("content", "delta", "overall_comment", "detail", "comment"):
        v = m.get(k)
        if isinstance(v, str):
            parts.append(v)
    fb = m.get("feedback")
    if isinstance(fb, dict):
        for k in ("overall_comment", "status"):
            v = fb.get(k)
            if isinstance(v, str):
                parts.append(v)
        for issue in fb.get("issues") or []:
            if isinstance(issue, dict):
                for k in ("detail", "suggestion", "type"):
                    v = issue.get(k)
                    if isinstance(v, str):
                        parts.append(v)
    for k in ("critic_result", "grounding_result", "iteration_status"):
        v = m.get(k)
        if isinstance(v, (dict, list)):
            parts.append(json.dumps(v, ensure_ascii=False))
    return "\n".join(parts)


def summarize(messages, task_text, elapsed, timeout_hit, conn_error):
    counts = {}
    for m in messages:
        t = m.get("type", "<no-type>") if isinstance(m, dict) else "<not-dict>"
        counts[t] = counts.get(t, 0) + 1

    summary = {
        "task_text": task_text,
        "elapsed_sec": round(elapsed, 1),
        "timeout": timeout_hit,
        "connection_error": conn_error,
        "total_messages": len(messages),
        "counts_by_type": counts,
        "path_used": None,
        "success": None,
        "upgraded_from": None,
        "written_files": None,
        "project_id": None,
        "review_passed": None,
        "complexity_result": None,
        "path_selected": None,
        "task_result_keys": None,
        # --- R4 fields ---
        "workspace": None,
        "injection_count": 0,
        "injection_excerpt": [],
        "review_rounds": 0,
        "review_round_numbers": [],
        "review_round_excerpt": [],
        "final_review_status": None,
        "structured_feedback_statuses": [],
        "final_structured_feedback": None,
        "ceo_final_message": None,
        "last_agent_message": None,
        "truncation_complaints": 0,
        "truncation_excerpt": [],
        # --- R5 fields ---
        "workflow_review": False,
        "written_file_duplicates": [],
        "has_structured_feedback": False,
        "has_review_completed": False,
        # --- R6 fields ---
        "prev_context_injected": False,
        "prev_context_excerpt": [],
        "written_files_on_disk": None,
    }

    for m in messages:
        if not isinstance(m, dict):
            continue
        t = m.get("type")
        if t == "complexity_result":
            summary["complexity_result"] = m
        elif t == "path_selected":
            summary["path_selected"] = m
        elif t == "path_upgrade":
            summary["upgraded_from"] = m.get("from", m.get("upgraded_from", "unknown"))
        elif t == "workspace_created":
            summary["workspace"] = {
                "workspace_id": m.get("workspace_id") or m.get("id"),
                "workspace_path": m.get("path") or m.get("workspace_path"),
                "branch_name": m.get("branch"),
            }
            if not summary["workspace"]["workspace_path"]:
                summary["workspace"] = {k: v for k, v in m.items()} or m
        elif t == "task_result":
            summary["path_used"] = m.get("path_used")
            summary["success"] = m.get("success")
            summary["written_files"] = m.get("written_files")
            summary["project_id"] = m.get("project_id")
            if summary["upgraded_from"] is None:
                summary["upgraded_from"] = m.get("upgraded_from")
            if "review_passed" in m:
                summary["review_passed"] = m.get("review_passed")
            summary["task_result_keys"] = sorted(m.keys())
        elif t == "review_completed":
            summary["review_passed"] = m.get(
                "review_passed", summary["review_passed"]
            )
            summary["review_completed"] = json.dumps(m, ensure_ascii=False)[:3000]

    # --- structured_feedback statuses (last one is authoritative) ---
    sfb_msgs = [
        m for m in messages
        if isinstance(m, dict) and m.get("type") == "structured_feedback"
    ]
    for m in sfb_msgs:
        st = (m.get("feedback") or {}).get("status")
        if st:
            summary["structured_feedback_statuses"].append(st)
    if sfb_msgs:
        summary["final_structured_feedback"] = json.dumps(
            sfb_msgs[-1], ensure_ascii=False
        )[:4000]

    # --- R5: workflow post-execution review presence ---
    summary["has_structured_feedback"] = bool(sfb_msgs)
    summary["has_review_completed"] = any(
        isinstance(m, dict) and m.get("type") == "review_completed"
        for m in messages
    )
    summary["workflow_review"] = (
        summary["has_structured_feedback"] or summary["has_review_completed"]
    )

    # --- R5: duplicate filenames in written_files ---
    wf = summary["written_files"]
    if isinstance(wf, list):
        seen, dups = {}, []
        for item in wf:
            name = item if isinstance(item, str) else (
                item.get("path") or item.get("file") or item.get("filename")
                if isinstance(item, dict) else str(item)
            )
            if not name:
                continue
            base = os.path.basename(str(name))
            seen[base] = seen.get(base, 0) + 1
        summary["written_file_duplicates"] = sorted(
            k for k, v in seen.items() if v > 1
        )
        summary["written_files_resolved"] = [
            (i if isinstance(i, str) else
             (i.get("path") or i.get("file") or i.get("filename")
              if isinstance(i, dict) else str(i)))
            for i in wf
        ]

    # --- R6: cross-task previous-workspace context evidence ---
    prev_token = "[上一任务产物]"
    for m in messages:
        if not isinstance(m, dict):
            continue
        txt = _text_of(m)
        if prev_token in txt or prev_token in json.dumps(m, ensure_ascii=False):
            summary["prev_context_injected"] = True
            if len(summary["prev_context_excerpt"]) < 3:
                i = (txt or json.dumps(m, ensure_ascii=False)).find(prev_token)
                summary["prev_context_excerpt"].append(
                    (txt or json.dumps(m, ensure_ascii=False))[
                        max(0, i - 50): i + 400
                    ]
                )
    # also grep the raw message dump (prompts may live outside _text_of keys)
    if not summary["prev_context_injected"]:
        blob = json.dumps(messages, ensure_ascii=False)
        if prev_token in blob:
            summary["prev_context_injected"] = True
            i = blob.find(prev_token)
            summary["prev_context_excerpt"].append(blob[max(0, i - 50): i + 400])

    # --- CEO final message / last agent message ---
    am = [
        m for m in messages
        if isinstance(m, dict) and m.get("type") == "agent_message"
        and isinstance(m.get("content"), str) and m["content"].strip()
    ]
    ceo = [m["content"] for m in am if m["content"].startswith("CEO：")]
    if ceo:
        summary["ceo_final_message"] = ceo[-1]
    if am:
        summary["last_agent_message"] = am[-1]["content"]

    # --- injection / review rounds / truncation ---
    for m in messages:
        if not isinstance(m, dict):
            continue
        txt = _text_of(m)
        if INJECTION_TOKEN in txt:
            summary["injection_count"] += 1
            if len(summary["injection_excerpt"]) < 3:
                summary["injection_excerpt"].append(txt[:300])
        rounds = REVIEW_ROUND_RE.findall(txt)
        if rounds:
            summary["review_rounds"] += 1
            summary["review_round_numbers"].extend(int(r) for r in rounds)
            if len(summary["review_round_excerpt"]) < 5:
                summary["review_round_excerpt"].append(txt[:300])
        if TRUNCATION_TOKEN in txt:
            summary["truncation_complaints"] += 1
            if len(summary["truncation_excerpt"]) < 5:
                summary["truncation_excerpt"].append(txt[:300])

    # --- combined final_review_status ---
    summary["final_review_status"] = {
        "structured_feedback_status": (
            summary["structured_feedback_statuses"][-1]
            if summary["structured_feedback_statuses"] else None
        ),
        "all_structured_feedback_statuses": summary["structured_feedback_statuses"],
        "review_rounds": summary["review_rounds"],
        "ceo_final_message": summary["ceo_final_message"],
        "truncation_complaints": summary["truncation_complaints"],
        "injection_count": summary["injection_count"],
    }

    # review evidence samples
    for sample_key, msg_type in (
        ("first_structured_feedback", "structured_feedback"),
        ("first_iteration_update", "iteration_update"),
    ):
        for m in messages:
            if isinstance(m, dict) and m.get("type") == msg_type:
                summary[sample_key] = json.dumps(m, ensure_ascii=False)[:3000]
                break

    # --- R6: disk listing when written_files field is empty ---
    wf = summary["written_files"]
    if not wf:
        ws = summary.get("workspace") or {}
        ws_path = ws.get("workspace_path") if isinstance(ws, dict) else None
        listing = []
        if ws_path and os.path.isdir(ws_path):
            for root, dirs, files in os.walk(ws_path):
                dirs[:] = [d for d in dirs if d not in (".git", "node_modules", "__pycache__")]
                for fn in files:
                    fp = os.path.join(root, fn)
                    try:
                        listing.append(
                            {"path": os.path.relpath(fp, ws_path),
                             "size": os.path.getsize(fp)}
                        )
                    except OSError:
                        pass
        summary["written_files_on_disk"] = listing
    return summary


async def run_task(task_text, out_prefix, timeout=TIMEOUT):
    messages = []
    timeout_hit = False
    conn_error = None
    start = time.time()
    try:
        async with websockets.connect(
            WS_URL, max_size=50 * 1024 * 1024, ping_interval=20, ping_timeout=60
        ) as ws:
            try:
                first = await asyncio.wait_for(ws.recv(), timeout=15)
                messages.append(json.loads(first))
            except Exception as e:
                conn_error = f"initial recv failed: {e}"

            await ws.send(json.dumps({
                "type": "unified_message",
                "content": task_text,
                "selected_roles": [],
                "execution_preference": "auto",
            }))

            deadline = start + timeout
            while True:
                remaining = deadline - time.time()
                if remaining <= 0:
                    timeout_hit = True
                    break
                try:
                    raw = await asyncio.wait_for(
                        ws.recv(), timeout=min(remaining, 60)
                    )
                except asyncio.TimeoutError:
                    continue
                try:
                    msg = json.loads(raw)
                except Exception:
                    msg = {"type": "<unparsable>", "raw": str(raw)}
                messages.append(msg)
                if isinstance(msg, dict) and msg.get("type") == "task_result":
                    break
                if isinstance(msg, dict) and msg.get("type") == \
                        "workspace_confirm_request":
                    wt = msg.get("suggested_type") or "standalone"
                    reply = {"type": "workspace_confirm_response",
                             "workspace_type": wt}
                    await ws.send(json.dumps(reply))
                    messages.append({"type": "<client_send>", "sent": reply})
                if isinstance(msg, dict) and msg.get("type") == \
                        "human_approval_request":
                    rid = (msg.get("approval") or msg).get("id") or \
                        msg.get("requestId")
                    reply = {"type": "human_approval_response", "requestId": rid,
                             "approved": True, "reason": "eval-run auto-approve"}
                    await ws.send(json.dumps(reply))
                    messages.append({"type": "<client_send>", "sent": reply})
    except Exception as e:
        conn_error = f"{type(e).__name__}: {e}"

    elapsed = time.time() - start
    with open(f"{out_prefix}_messages.json", "w") as f:
        json.dump({
            "task_text": task_text,
            "started_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(start)),
            "elapsed_sec": round(elapsed, 1),
            "timeout": timeout_hit,
            "connection_error": conn_error,
            "messages": messages,
        }, f, ensure_ascii=False, indent=1)
    summary = summarize(messages, task_text, elapsed, timeout_hit, conn_error)
    with open(f"{out_prefix}_summary.json", "w") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(json.dumps({k: summary[k] for k in (
        "path_used", "success", "timeout", "elapsed_sec", "total_messages",
        "written_files", "project_id", "connection_error",
        "injection_count", "review_rounds", "truncation_complaints",
        "workflow_review", "written_file_duplicates",
        "prev_context_injected")},
        ensure_ascii=False))
    frs = summary["final_review_status"]
    print("final_review_status:", json.dumps(frs, ensure_ascii=False)[:1500])
    print("workspace:", json.dumps(summary.get("workspace"), ensure_ascii=False))
    print("counts_by_type:", json.dumps(summary["counts_by_type"],
                                         ensure_ascii=False))


if __name__ == "__main__":
    idx = sys.argv[1]          # e.g. E1
    text = sys.argv[2]         # task text
    to = int(sys.argv[3]) if len(sys.argv) > 3 else TIMEOUT
    asyncio.run(run_task(text, os.path.join(EVD, idx), timeout=to))
