"""
WS 模式试点：通过真实 WebSocket 服务器完成会议纪要任务全链路。

与直驱试点（pilot_minutes.py）的区别：本脚本走真实服务器链路——
  server.py (uvicorn :8765) → WS 客户端连接 → start_meeting → meeting_message
  → CeoAgent/MeetingCoordinator 处理（意图识别 → DAG 真实 LLM 执行）
  → draft 节点把关钩子经 session.send_and_buffer 推送 human_approval_request
  → 客户端（模拟员工）回 human_approval_response 批准 → 闭环

运行方式（需先启动后端）：
  终端1（启动 server，免 WS 鉴权）：
    cd backend
    BACKEND_TOKEN="" DEEPSEEK_API_KEY=... DEEPSEEK_BASE_URL=... DEEPSEEK_MODEL=... \
      /home/test/miniconda3/envs/agentscope/bin/python server.py
  终端2（运行 WS 试点客户端）：
    /home/test/miniconda3/envs/agentscope/bin/python pilot_minutes_ws.py \
      --api-key $DEEPSEEK_API_KEY --auto-approve

验收清单（脚本末尾打印 PASS/FAIL）：
  1. WS 连接与会议启动（connected + start_meeting）
  2. 任务提交（meeting_message_ack）
  3. 员工把关：收到 human_approval_request（WS 推送）并响应审批
  4. 链路完成：收到结果消息（workflow_executed / task_result）
"""

import argparse
import asyncio
import json
import os
import sys
import time

TRANSCRIPT = (
    "今天的会议讨论了新产品发布计划：确定 8 月 15 日上线，"
    "市场部负责宣传物料，研发部负责版本冻结，销售部准备客户通知。"
    "请把速记整理成会议纪要并生成待办清单。"
)


def parse_args():
    p = argparse.ArgumentParser(description="会议纪要任务 WS 模式试点客户端")
    p.add_argument("--api-key", required=True, help="DeepSeek API key")
    p.add_argument("--base-url", default=os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com"))
    p.add_argument("--model", default=os.environ.get("DEEPSEEK_MODEL", ""))
    p.add_argument("--ws-url", default="ws://localhost:8765/ws")
    p.add_argument("--token", default="", help="WS 鉴权 token（server BACKEND_TOKEN 为空则无需）")
    p.add_argument("--auto-approve", action="store_true", help="收到把关推送自动批准")
    p.add_argument("--timeout", type=float, default=180.0, help="总等待超时（秒）")
    return p.parse_args()


def check(label, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}{(' — ' + detail) if detail else ''}")
    return ok


async def run(args):
    import websockets

    ws_url = args.ws_url
    if args.token:
        import urllib.parse
        ws_url += ("&" if "?" in ws_url else "?") + f"token={urllib.parse.quote(args.token)}"

    gate_requests = []
    responses = []
    saw_result = False
    results = []

    async with websockets.connect(ws_url, max_size=None) as ws:
        # 1. connected
        first = json.loads(await asyncio.wait_for(ws.recv(), timeout=15))
        session_id = first.get("session_id")
        results.append(check("WS 连接（connected）", first.get("type") == "connected", f"session={session_id}"))

        # 2. start_meeting（经 WS 传 api key，与前端一致）
        await ws.send(json.dumps({
            "type": "start_meeting",
            "provider": "deepseek",
            "model_name": args.model,
            "api_key": args.api_key,
            "base_url": args.base_url,
        }, ensure_ascii=False))

        # 3. meeting_message
        await ws.send(json.dumps({"type": "meeting_message", "content": TRANSCRIPT}, ensure_ascii=False))

        # 4. 监听：把关推送 → 审批；结果 → 完成
        t0 = time.time()
        while time.time() - t0 < args.timeout:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=min(30.0, max(1.0, args.timeout - (time.time() - t0))))
            except asyncio.TimeoutError:
                print("  [监听] 30s 无消息，继续等待")
                continue
            msg = json.loads(raw)
            mtype = msg.get("type")

            if mtype == "human_approval_request":
                req = msg.get("request", {}) or {}
                gate_requests.append(req)
                print(f"  [把关推送] {req.get('operation')} task={req.get('taskId')} gate={req.get('gateId')} approver={req.get('approver')}")
                if args.auto_approve:
                    await ws.send(json.dumps({
                        "type": "human_approval_response",
                        "requestId": req.get("id", ""),
                        "approved": True,
                        "reason": "WS试点批准",
                    }))
                    responses.append(req.get("id"))
                    print(f"  [把关响应] 已批准 {req.get('id')}")
            elif mtype == "workflow_executed":
                saw_result = True
                status = (msg.get("workflow_result") or {}).get("status")
                print(f"  [结果] workflow_executed status={status}")
                results.append(check("链路完成（workflow_executed）", True, f"status={status}"))
                break
            elif mtype == "task_result":
                saw_result = True
                print(f"  [结果] task_result success={msg.get('success')}")
                results.append(check("链路完成（task_result）", bool(msg.get("success")), str(msg.get("success"))))
                break
            elif mtype == "meeting_error":
                print(f"  [错误] {msg.get('message')}")
            elif mtype == "meeting_message_ack":
                print("  [提交] meeting_message_ack（任务已进入处理）")
            elif mtype in ("agent_message", "complexity_result", "path_selected"):
                content = str(msg.get("content", ""))[:110]
                if content:
                    print(f"  [{mtype}] {content}")

    results.append(check("员工把关：收到 human_approval_request（WS 推送）", len(gate_requests) > 0,
                         f"收到 {len(gate_requests)} 个把关请求"))
    results.append(check("员工把关：审批响应已发送", len(responses) > 0 and len(responses) == len(gate_requests) if gate_requests else False,
                         f"响应 {len(responses)} 个"))
    if not saw_result:
        results.append(check("链路完成", False, "超时未收到结果消息"))

    ok = all(results)
    print(f"\n{'=' * 60}\n  WS 试点结果: {'全部通过' if ok else '存在未通过项'}\n{'=' * 60}")
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    asyncio.run(run(parse_args()))
