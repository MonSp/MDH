"""
工作区确认功能 - 握手验证测试

只验证 workspace_confirm_request/response 握手，不等待完整会议流程。
"""

import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import websockets


async def test():
    uri = "ws://localhost:8765/ws"
    print("=" * 60)
    print("工作区确认 - 握手验证")
    print("=" * 60)

    async with websockets.connect(uri) as ws:
        print("[OK] WebSocket 已连接")

        api_key = os.environ.get("DEEPSEEK_API_KEY", "")
        if api_key:
            print(f"[OK] API key: {api_key[:8]}...{api_key[-4:]}")
        else:
            print("[--] 未设置 DEEPSEEK_API_KEY，将使用 test-key")

        # 发送任务
        await ws.send(json.dumps({
            "type": "unified_message",
            "content": "创建一个hello world Python脚本",
            "selected_roles": ["coordinator", "executor"],
            "api_key": api_key or "test-key",
            "base_url": "https://api.deepseek.com",
        }))
        print("[OK] 已发送 unified_message")

        # 等待 workspace_confirm_request（最多30秒）
        ws_request = None
        for _ in range(30):
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=2)
                data = json.loads(raw)
                if data.get("type") == "workspace_confirm_request":
                    ws_request = data
                    break
            except asyncio.TimeoutError:
                continue

        if not ws_request:
            print("[FAIL] 未收到 workspace_confirm_request")
            return False

        print("[OK] 收到 workspace_confirm_request")
        print(f"     project_id:      {ws_request.get('project_id', '')[:20]}...")
        print(f"     suggested_type:  {ws_request.get('suggested_type', '')}")

        options = ws_request.get("options", {})
        types = options.get("workspace_types", [])
        print(f"     workspace_types: {len(types)} 种")
        for t in types:
            print(f"       - {t['id']}: {t['name']}")

        # 发送确认响应
        await ws.send(json.dumps({
            "type": "workspace_confirm_response",
            "workspace_type": "standalone",
            "repo_path": "",
            "branch_name": "",
            "output_dir": "",
        }))
        print("[OK] 已发送 workspace_confirm_response")

        # 等待 workspace_created 或 meeting_started（最多120秒）
        got_workspace = False
        got_meeting = False
        for _ in range(120):
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=2)
                data = json.loads(raw)
                t = data.get("type", "")
                if t == "workspace_created":
                    got_workspace = True
                    print(f"[OK] 收到 workspace_created: {data.get('workspace_path', '')}")
                elif t == "meeting_started":
                    got_meeting = True
                    print(f"[OK] 收到 meeting_started: {data.get('meeting_id', '')}")
                    break
                elif t == "meeting_error":
                    print(f"[--] meeting_error: {data.get('message', '')[:200]}")
                    break
                elif t == "agent_message" and not data.get("delta"):
                    agent_id = data.get("agentId", "")
                    content = data.get("content", "")[:100]
                    print(f"     [{agent_id}] {content}")
                elif t == "complexity_result":
                    print(f"     [复杂度] {data.get('level', '')} ({data.get('confidence', 0):.0%})")
                elif t == "workspace_confirm_request":
                    print("     [再次收到] workspace_confirm_request (忽略)")
            except asyncio.TimeoutError:
                continue

        print()
        print("=" * 60)
        print("结果")
        print("=" * 60)
        print("  workspace_confirm_request:  OK")
        print("  workspace_confirm_response: OK")
        print(f"  workspace_created:          {'OK' if got_workspace else '未收到（可能API key无效）'}")
        print(f"  meeting_started:            {'OK' if got_meeting else '未收到（可能API key无效）'}")
        print()
        print("  握手流程: 通过")
        return True


if __name__ == "__main__":
    try:
        asyncio.run(test())
    except ConnectionRefusedError:
        print("无法连接 ws://localhost:8765，请先启动后端: python backend/server.py")
        sys.exit(1)
    except Exception as e:
        print(f"异常: {e}")
        sys.exit(1)
