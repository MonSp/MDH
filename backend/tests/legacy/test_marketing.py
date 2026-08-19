import json
import asyncio
import websockets

async def test_marketing_team():
    uri = 'ws://localhost:8765/ws'
    
    async with websockets.connect(uri) as ws:
        # 接收连接消息
        msg = await ws.recv()
        data = json.loads(msg)
        print('Connected:', data.get('session_id'))
        
        # 发送营销任务，选择营销团队角色
        task_msg = {
            'type': 'unified_message',
            'content': '为我们的新产品设计一套完整的营销推广方案，包括内容策略、增长黑客方案和销售渠道设计',
            'selected_roles': [
                'coordinator',      # 产品经理/项目经理
                'growth_hacker',    # 增长黑客
                'content_strategist', # 内容策略师
                'sales_strategist', # 销售策略师
                'ui_designer',      # UI设计师
            ],
            'provider': 'deepseek',
            'model_name': 'deepseek-v4-flash',
        }
        
        print('Sending marketing task with team:')
        for role in task_msg['selected_roles']:
            print('  -', role)
        
        await ws.send(json.dumps(task_msg))
        
        # 接收消息
        print()
        print('=== Response ===')
        msg_count = 0
        while msg_count < 50:
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=30)
                data = json.loads(msg)
                msg_type = data.get('type')
                
                if msg_type == 'agent_message':
                    agent_id = data.get('agentId', '')
                    content = data.get('content', '')
                    if not data.get('delta'):
                        print('[%s] %s' % (agent_id, content[:200]))
                        msg_count += 1
                
                elif msg_type == 'complexity_result':
                    level = data.get('level')
                    conf = data.get('confidence', 0)
                    print('[Analysis] %s (%.0f%%)' % (level, conf * 100))
                
                elif msg_type == 'meeting_started':
                    agents = data.get('agents', [])
                    print('[Meeting] Started with %d agents:' % len(agents))
                    for a in agents:
                        print('  - %s: %s' % (a.get('id'), a.get('name')))
                    msg_count += 1
                
                elif msg_type == 'workspace_created':
                    print('[Workspace] Created: %s' % data.get('workspace_id'))
                    print('  Path: %s' % data.get('workspace_path'))
                
                elif msg_type == 'task_result':
                    print('[Result] Task completed!')
                    print('  Success: %s' % data.get('success'))
                    print('  Written files: %s' % data.get('written_files', []))
                    break
                
                elif msg_type == 'meeting_error':
                    print('[Error] %s' % data.get('message'))
                    break
                    
            except asyncio.TimeoutError:
                print('Timeout waiting for message')
                break
        
        print()
        print('Test complete!')

asyncio.run(test_marketing_team())
