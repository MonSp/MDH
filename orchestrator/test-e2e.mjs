import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import { setTimeout as sleep } from 'timers/promises';

const PORT = 9092;
const EXECUTOR = 'http://localhost:8767';

// Start orchestrator as child process
const orch = spawn('node', ['--import', 'tsx', 'src/cli.ts', `--port=${PORT}`, `--executor=${EXECUTOR}`, '--workspace=/workspace'], {
  cwd: process.cwd(),
  stdio: 'pipe',
});

orch.stdout.on('data', d => process.stdout.write('[orch] ' + d));
orch.stderr.on('data', d => process.stderr.write('[orch:err] ' + d));

await sleep(4000);

const API_KEY = process.env.DEEPSEEK_API_KEY || '';
console.log('\n[E2E] Starting test...\n');

const ws = new WebSocket(`ws://localhost:${PORT}`);
let eventCount = 0;
let exitCode = 1;

ws.on('open', () => {
  console.log('[E2E] Connected to orchestrator');
  ws.send(JSON.stringify({
    type: 'config',
    config: { provider: 'deepseek', apiKey: API_KEY, baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    workspace: '/workspace',
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  eventCount++;

  if (msg.type === 'config_updated') {
    console.log('[E2E] Config OK, sending multi-role task...\n');
    ws.send(JSON.stringify({
      type: 'user_message',
      content: '在workspace中创建一个hello.py文件，内容为 print("Hello from MDH Team!")，然后用bash运行它验证结果。',
      selected_roles: ['planner', 'executor'],
    }));
  } else if (msg.type === 'agent_message') {
    if (msg.tool) {
      console.log(`  [tool:${msg.tool}] ${String(msg.args || '').substring(0, 100)}`);
    } else if (msg.type === 'agent_message' && msg.content) {
      console.log(`  [reply] ${String(msg.content).substring(0, 150)}`);
    } else {
      console.log(`  [${msg.type || 'event'}] ${JSON.stringify(msg).substring(0, 120)}`);
    }
  } else if (msg.type === 'task_result') {
    console.log('\n========================================');
    console.log('  TASK RESULT');
    console.log('========================================');
    console.log(msg.content);
    console.log('========================================');
    console.log(`Events: ${eventCount}`);
    exitCode = 0;
    ws.close();
  } else if (msg.type === 'error') {
    console.error(`[ERROR] ${msg.message}`);
    ws.close();
  }
});

ws.on('error', (e) => { console.error('[WS ERR]', e.message); });

setTimeout(() => {
  console.error('\n[E2E] TIMEOUT 90s');
  ws.close();
}, 90000);

ws.on('close', () => {
  orch.kill();
  process.exit(exitCode);
});
