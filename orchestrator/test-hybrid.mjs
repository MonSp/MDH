import { WebSocket } from 'ws';

const PORT = process.env.PORT || '9091';
const ws = new WebSocket(`ws://localhost:${PORT}/ws/`);
const events = [];

ws.on('open', () => {
  console.log('[TEST] Connected to hybrid orchestrator');
  ws.send(JSON.stringify({
    type: 'user_message',
    content: '创建一个文件 README.md，内容为 "# Hello from Hybrid Router"',
    provider: 'deepseek',
    api_key: process.env.DEEPSEEK_API_KEY,
    base_url: process.env.DEEPSEEK_BASE_URL,
    model_name: process.env.DEEPSEEK_MODEL,
    selected_roles: ['executor'],
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  events.push(msg);

  if (msg.type === 'workspace_confirm_request') {
    console.log('[TEST] Auto-confirm workspace: standalone');
    ws.send(JSON.stringify({ type: 'workspace_confirm_response', workspace_type: 'standalone' }));
  } else if (msg.type === 'tool_result') {
    console.log(`[tool_result] ${msg.tool_name}: ${(msg.result || msg.error || '').substring(0, 120)}`);
  } else if (msg.type === 'task_result' || msg.type === 'task_complete') {
    console.log(`\n[DONE] ${JSON.stringify(msg).substring(0, 300)}`);
    ws.terminate();
    setTimeout(() => process.exit(0), 100);
  } else if (msg.type === 'error') {
    console.error(`[ERROR] ${msg.message}`);
    ws.terminate();
    setTimeout(() => process.exit(1), 100);
  } else if (msg.type === 'assistant_message' || msg.type === 'agent_message') {
    const c = msg.content || msg.delta || '';
    if (c) console.log(`[${msg.type}] ${c.substring(0, 120)}`);
  } else {
    console.log(`[${msg.type}]`);
  }
});

ws.on('error', (e) => { console.error('[ERR]', e.message); process.exit(1); });
setTimeout(() => { console.log('[TIMEOUT] Events:', events.length); ws.close(); process.exit(1); }, 90000);
