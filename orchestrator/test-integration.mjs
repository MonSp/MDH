// Quick WebSocket test: send a task and trace the full flow
import { WebSocket } from 'ws';

const ws = new WebSocket('ws://localhost:9090/ws/');
const events = [];

ws.on('open', () => {
  console.log('[TEST] Connected to TS Orchestrator');
  
  // Send a simple task
  ws.send(JSON.stringify({
    type: 'user_message',
    content: '创建一个文件 hello.txt，内容为 "Hello from TS Orchestrator"',
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
  
  const type = msg.type;
  const summary = msg.content || msg.message || msg.delta || '';
  
  if (type === 'workspace_confirm_request') {
    console.log(`[TEST] Auto-confirming workspace: standalone`);
    ws.send(JSON.stringify({
      type: 'workspace_confirm_response',
      workspace_type: 'standalone',
    }));
  } else if (type === 'agent_message' || type === 'assistant_message') {
    process.stdout.write(`[${type}] ${summary.substring(0, 120)}\n`);
  } else if (type === 'tool_call') {
    console.log(`[${type}] ${msg.tool_name}(${JSON.stringify(msg.arguments || {}).substring(0, 80)})`);
  } else if (type === 'tool_result') {
    console.log(`[${type}] ${msg.tool_name}: ${(msg.result || msg.error || '').substring(0, 100)}`);
  } else if (type === 'task_result') {
    console.log(`\n[TEST] === TASK COMPLETE ===`);
    console.log(`[TEST] Result: ${JSON.stringify(msg).substring(0, 300)}`);
    ws.close();
    process.exit(0);
  } else if (type === 'error') {
    console.error(`[ERROR] ${msg.message}`);
    ws.close();
    process.exit(1);
  } else {
    console.log(`[${type}] ${JSON.stringify(msg).substring(0, 150)}`);
  }
});

ws.on('error', (err) => {
  console.error('[WS Error]', err.message);
  process.exit(1);
});

// Timeout after 120 seconds
setTimeout(() => {
  console.log('\n[TEST] Timeout. Events received:', events.length);
  events.forEach((e, i) => console.log(`  ${i}: ${e.type}`));
  ws.close();
  process.exit(1);
}, 120000);
