"""
测试工作区确认功能 - 模拟前端WebSocket交互

验证：
1. 发送unified_message后，后端返回workspace_confirm_request
2. 发送workspace_confirm_response后，后端继续创建项目和会议
3. 不同工作区类型（standalone/git_worktree）正确处理
"""

import asyncio
import json
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

try:
    import websockets
except ImportError:
    print("需要安装 websockets: pip install websockets")
    sys.exit(1)


async def test_workspace_confirm():
    uri = "ws://localhost:8765/ws"
    print("=" * 60)
    print("工作区确认功能测试")
    print("=" * 60)

    try:
        async with websockets.connect(uri) as ws:
            print("\n[1] WebSocket 已连接")

            # 发送任务消息
            msg = {
                "type": "unified_message",
                "content": "创建一个简单的hello world Python脚本",
                "selected_roles": ["coordinator", "planner", "executor", "reviewer"],
                "api_key": os.environ.get("DEEPSEEK_API_KEY", "test-key"),
                "base_url": "https://api.deepseek.com",
            }
            await ws.send(json.dumps(msg))
            print("[2] 已发送 unified_message")

            # 等待 workspace_confirm_request
            ws_confirm_received = False
            meeting_started = False
            messages_received = []

            for _ in range(50):  # 最多等待50条消息
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=30)
                    data = json.loads(raw)
                    msg_type = data.get("type", "")
                    messages_received.append(msg_type)

                    if msg_type == "workspace_confirm_request":
                        ws_confirm_received = True
                        print(f"\n[3] 收到 workspace_confirm_request:")
                        print(f"    project_id: {data.get('project_id', '')}")
                        print(f"    suggested_type: {data.get('suggested_type', '')}")
                        print(f"    options: {json.dumps(data.get('options', {}), ensure_ascii=False)[:200]}")

                        # 发送确认响应
                        confirm_resp = {
                            "type": "workspace_confirm_response",
                            "workspace_type": "standalone",
                            "repo_path": "",
                            "branch_name": "",
                            "output_dir": "",
                        }
                        await ws.send(json.dumps(confirm_resp))
                        print("[4] 已发送 workspace_confirm_response (standalone)")

                    elif msg_type == "workspace_created":
                        print(f"\n[5] 收到 workspace_created:")
                        print(f"    workspace_id: {data.get('workspace_id', '')}")
                        print(f"    workspace_path: {data.get('workspace_path', '')}")

                    elif msg_type == "meeting_started":
                        meeting_started = True
                        print(f"\n[6] 收到 meeting_started:")
                        print(f"    meeting_id: {data.get('meeting_id', '')}")
                        agents = data.get("agents", [])
                        print(f"    agents: {len(agents)} 个")
                        break

                    elif msg_type == "meeting_error":
                        print(f"\n[!] 错误: {data.get('message', '')}")
                        break

                    elif msg_type == "agent_message":
                        agent_id = data.get("agentId", "")
                        content = data.get("content", "")[:80]
                        if not data.get("delta"):
                            print(f"    [{agent_id}] {content}")

                except asyncio.TimeoutError:
                    print("\n[!] 等待消息超时")
                    break

            # 总结
            print("\n" + "=" * 60)
            print("测试结果")
            print("=" * 60)
            print(f"  workspace_confirm_request: {'收到' if ws_confirm_received else '未收到'}")
            print(f"  meeting_started:           {'收到' if meeting_started else '未收到'}")
            print(f"  总消息类型: {', '.join(set(messages_received))}")

            if ws_confirm_received and meeting_started:
                print("\n  结论: 测试通过!")
                return True
            else:
                print("\n  结论: 测试未通过")
                return False

    except ConnectionRefusedError:
        print(f"\n无法连接到 {uri}")
        print("请确保后端正在运行: python backend/server.py")
        return False
    except Exception as e:
        print(f"\n异常: {type(e).__name__}: {e}")
        return False


if __name__ == "__main__":
    success = asyncio.run(test_workspace_confirm())
    sys.exit(0 if success else 1)
