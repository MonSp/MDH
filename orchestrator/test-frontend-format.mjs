import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import { setTimeout as sleep } from 'timers/promises';
import { readFileSync } from 'fs';

// Load API key from .env
const envContent = readFileSync('/home/test/MDH/.env', 'utf-8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) envVars[match[1].trim()] = match[2].trim();
}
const API_KEY = envVars['DEEPSEEK_API_KEY'] || '';

const PORT = 9094;
const orch = spawn('node', ['--import', 'tsx', 'src/cli.ts', `--port=${PORT}`, '--executor=http://localhost:8767', '--workspace=/workspace'], {
  cwd: '/home/test/MDH/orchestrator',
  stdio: 'pipe',
  env: { ...process.env, ...envVars },
});
orch.stdout.on('data', d => {});
orch.stderr.on('data', d => {});
await sleep(4000);

console.log('[TEST] Orchestrator started on port', PORT);
console.log('[TEST] API Key:', API_KEY ? API_KEY.substring(0, 8) + '...' : 'NOT SET');

const ws = new WebSocket(`ws://localhost:${PORT}/ws/`);
let events = 0;

ws.on('open', () => {
  console.log('[TEST] Connected via /ws/\n');
  // Send in MDH frontend format
  ws.send(JSON.stringify({
    type: 'user_message',
    content: '在workspace中创建一个app.js文件，实现一个简单的Express HTTP服务器，监听3000端口，返回JSON。然后用node运行它验证没有语法错误。',
    provider: 'deepseek',
    api_key: API_KEY,
    base_url: 'https://api.deepseek.com/v1',
    model_name: 'deepseek-chat',
    selected_roles: ['planner', 'executor', 'reviewer'],
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  events++;

  if (msg.type === 'agent_message') {
    if (msg.tool) {
      console.log('  [tool:' + msg.tool + '] ' + String(msg.args || '').substring(0, 100));
    } else if (msg.content) {
      console.log('  [reply] ' + String(msg.content).substring(0, 150));
    } else {
      console.log('  [' + (msg.subtype || 'event') + '] ' + JSON.stringify(msg).substring(0, 100));
    }
  } else if (msg.type === 'task_result') {
    console.log('\n========================================');
    console.log('  FINAL RESULT');
    console.log('========================================');
    console.log(msg.content);
    console.log('========================================');
    console.log('Events:', events);
    ws.close();
  } else if (msg.type === 'error') {
    console.error('[ERROR]', msg.message);
    ws.close();
  }
});

ws.on('error', e => { console.error('[ERR]', e.message); });
ws.on('close', () => { orch.kill(); process.exit(0); });
setTimeout(() => { console.error('[TIMEOUT]'); ws.close(); }, 85000);
