import { WebSocket } from 'ws';

const PORT = process.env.PORT || '9091';
const ws = new WebSocket(`ws://localhost:${PORT}/ws/`);
const events = [];
let startTime = Date.now();

ws.on('open', () => {
  console.log('[TEST] Connected to orchestrator');
  startTime = Date.now();
  ws.send(JSON.stringify({
    type: 'user_message',
    content: '创建一个Python项目：main.py 打印 "Hello from MDH"，再创建 README.md 说明项目用途',
    provider: 'deepseek',
    api_key: process.env.DEEPSEEK_API_KEY,
    base_url: process.env.DEEPSEEK_BASE_URL,
    model_name: process.env.DEEPSEEK_MODEL,
    selected_roles: ['executor'],
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  events.push({ type: msg.type, ts: Date.now() - startTime });

  if (msg.type === 'workspace_confirm_request') {
    console.log('[TEST] Auto-confirm workspace');
    ws.send(JSON.stringify({ type: 'workspace_confirm_response', workspace_type: 'standalone' }));
  } else if (msg.type === 'tool_call') {
    console.log(`  [tool_call] ${msg.tool || msg.tool_name}`);
  } else if (msg.type === 'tool_result') {
    const preview = (msg.result || msg.error || '').toString().substring(0, 80);
    console.log(`  [tool_result] ${msg.tool_name}: ${preview}`);
  } else if (msg.type === 'task_result' || msg.type === 'task_complete') {
    const elapsed = Date.now() - startTime;
    console.log(`\n[DONE] ${elapsed}ms`);
    console.log(`[RESULT] ${(msg.content || msg.result || '').substring(0, 200)}`);

    // 统计
    const toolCalls = events.filter(e => e.type === 'tool_call').length;
    const toolResults = events.filter(e => e.type === 'tool_result').length;
    const errors = events.filter(e => e.type === 'error').length;
    console.log(`\n[STATS] Events: ${events.length}, Tool calls: ${toolCalls}, Results: ${toolResults}, Errors: ${errors}`);

    ws.terminate();
    setTimeout(() => process.exit(errors > 0 ? 1 : 0), 100);
  } else if (msg.type === 'error') {
    console.error(`[ERROR] ${msg.message}`);
    ws.terminate();
    setTimeout(() => process.exit(1), 100);
  } else if (msg.type === 'assistant_message' || msg.type === 'agent_message') {
    const c = msg.content || msg.delta || '';
    if (c) console.log(`  [${msg.type}] ${c.substring(0, 100)}`);
  } else if (msg.type === 'meeting_started') {
    const agents = msg.agents || [];
    console.log(`[MEETING] ${agents.length} agents: ${agents.map(a => a.name).join(', ')}`);
  } else {
    // silent for agenda_update, agent_status_update, etc.
  }
});

ws.on('error', (e) => { console.error('[ERR]', e.message); process.exit(1); });
setTimeout(() => {
  console.log(`\n[TIMEOUT] ${events.length} events received:`);
  events.forEach(e => console.log(`  ${e.ts}ms ${e.type}`));
  ws.terminate();
  process.exit(1);
}, 120_000);
