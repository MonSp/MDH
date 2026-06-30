/**
 * Multi-Agent Team Collaboration Test Suite v2
 * 
 * Loop Engineering: test → identify issues → fix → retest
 * Enhanced with: file verification, execution validation, tool call tracking
 */
import { WebSocket } from 'ws';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('/home/test/MDH/.env', 'utf-8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

interface TestCase {
  name: string;
  content: string;
  roles: string[];
  expectPhases: string[];
  expectAgents: number;
  expectDiscussion: boolean;
  expectTools: string[];        // tool names that MUST be called
  verifyFiles: string[];        // files that MUST exist after task
  verifyCommands: string[];     // commands to run for verification
  timeout: number;
}

const TESTS: TestCase[] = [
  {
    name: 'Simple: echo command',
    content: '用bash执行 echo "test ok"',
    roles: ['executor'],
    expectPhases: ['analyzing'],
    expectAgents: 1,
    expectDiscussion: false,
    expectTools: ['bash'],
    verifyFiles: [],
    verifyCommands: [],
    timeout: 60000,
  },
  {
    name: 'Complex: Python module + tests',
    content: '在 workspace 中创建一个 Python 模块 math_ops.py，实现 add/sub/mul/div 四个函数（div 需处理除零），然后创建 test_math_ops.py 用 unittest 编写单元测试，运行 python -m unittest test_math_ops -v 验证全部通过。',
    roles: ['coordinator', 'planner', 'executor', 'reviewer'],
    expectPhases: ['analyzing', 'discussing', 'executing'],
    expectAgents: 3,
    expectDiscussion: true,
    expectTools: ['bash'],
    verifyFiles: ['math_ops.py', 'test_math_ops.py'],
    verifyCommands: ['cd /workspace && python -m unittest test_math_ops -v 2>&1 | tail -3'],
    timeout: 120000,
  },
  {
    name: 'Complex: JSON CRUD tool',
    content: '在 workspace 中创建一个 Python CLI 工具 notes.py，使用 argparse 支持 add/list/delete 三个子命令，数据保存在 notes.json 文件中。然后创建 test_notes.py 测试所有功能，运行验证。',
    roles: ['coordinator', 'planner', 'executor', 'reviewer'],
    expectPhases: ['analyzing', 'discussing', 'executing'],
    expectAgents: 3,
    expectDiscussion: true,
    expectTools: ['bash'],
    verifyFiles: ['notes.py', 'test_notes.py'],
    verifyCommands: ['cd /workspace && python test_notes.py 2>&1 | tail -5'],
    timeout: 120000,
  },
  {
    name: 'Complex: HTML + CSS + JS',
    content: '在 workspace 的 public 目录中创建一个计算器 Web 应用：public/calc.html + public/calc.css + public/calc.js，支持加减乘除，界面美观。',
    roles: ['coordinator', 'planner', 'executor', 'reviewer'],
    expectPhases: ['analyzing', 'discussing', 'executing'],
    expectAgents: 3,
    expectDiscussion: true,
    expectTools: [],
    verifyFiles: ['public/calc.html', 'public/calc.css', 'public/calc.js'],
    verifyCommands: ['cat /workspace/public/calc.html | head -5'],
    timeout: 180000,
  },
  {
    name: 'Edge: refactoring existing code',
    content: '查看 workspace 中的 calculator.py，将其重构为面向对象的 Calculator 类，保持原有功能不变，然后运行测试验证。',
    roles: ['coordinator', 'planner', 'executor', 'reviewer'],
    expectPhases: ['analyzing', 'discussing', 'executing'],
    expectAgents: 3,
    expectDiscussion: true,
    expectTools: ['read_file'],
    verifyFiles: [],
    verifyCommands: [],
    timeout: 180000,
  },
];

interface TestResult {
  name: string;
  passed: boolean;
  issues: string[];
  phases: string[];
  agents: string[];
  toolsCalled: string[];
  filesCreated: string[];
  verificationResults: string[];
  messages: number;
  duration: number;
}

function verifyViaExecutor(toolName: string, args: Record<string, unknown>): Promise<string> {
  const body = JSON.stringify({ tool_name: toolName, arguments: args, call_id: 'verify' });
  return fetch('http://localhost:8767/execute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer mdh-executor-secret-2026',
    },
    body,
  }).then(r => r.json()).then(d => String((d as any).result || (d as any).error || '')).catch(e => 'error: ' + e.message);
}

function runTest(test: TestCase): Promise<TestResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const issues: string[] = [];
    const phases: string[] = [];
    const agents = new Set<string>();
    const toolsCalled = new Set<string>();
    const filesCreated: string[] = [];
    const verificationResults: string[] = [];
    let msgCount = 0;
    let taskResultContent = '';

    const ws = new WebSocket('ws://localhost:8080/ws/');
    let resolved = false;

    const finish = async (passed: boolean) => {
      if (resolved) return;
      resolved = true;
      ws.close();

      // Post-verification: check files and run commands via executor
      for (const file of test.verifyFiles) {
        try {
          const resp = await fetch('http://localhost:8767/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer mdh-executor-secret-2026' },
            body: JSON.stringify({ tool_name: 'read_file', arguments: { path: file }, call_id: 'v' }),
          });
          const data = await resp.json() as any;
          if (data.success && data.result) {
            filesCreated.push(file);
          } else {
            issues.push(`expected file not found: ${file}`);
          }
        } catch {
          issues.push(`verify error for ${file}`);
        }
      }

      for (const cmd of test.verifyCommands) {
        try {
          const resp = await fetch('http://localhost:8767/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer mdh-executor-secret-2026' },
            body: JSON.stringify({ tool_name: 'bash', arguments: { command: cmd }, call_id: 'v' }),
          });
          const data = await resp.json() as any;
          verificationResults.push(String(data.result || data.error || '').substring(0, 200));
        } catch (e: any) {
          verificationResults.push('error: ' + e.message);
        }
      }

      resolve({
        name: test.name,
        passed: passed && issues.length === 0,
        issues,
        phases,
        agents: [...agents],
        toolsCalled: [...toolsCalled],
        filesCreated,
        verificationResults,
        messages: msgCount,
        duration: Date.now() - start,
      });
    };

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'unified_message',
        content: test.content,
        provider: 'deepseek',
        api_key: env.DEEPSEEK_API_KEY,
        base_url: 'https://api.deepseek.com/v1',
        model_name: 'deepseek-chat',
        selected_roles: test.roles,
      }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      msgCount++;

      switch (msg.type) {
        case 'meeting_started':
          if (!msg.agents || msg.agents.length === 0) {
            issues.push('meeting_started with empty agents');
          } else {
            msg.agents.forEach((a: any) => agents.add(a.role));
          }
          break;

        case 'agent_message':
          if (!msg.agentId) issues.push('agent_message missing agentId');
          if (msg.agentId) agents.add(msg.agentId.replace('agent-', ''));
          break;

        case 'agenda_update':
          if (msg.agenda?.phase && !phases.includes(msg.agenda.phase)) {
            phases.push(msg.agenda.phase);
          }
          break;

        case 'tool_call':
          if (msg.tool) toolsCalled.add(msg.tool);
          break;

        case 'tool_result':
          if (!msg.tool_name) issues.push('tool_result missing tool_name');
          if (msg.tool_name) toolsCalled.add(msg.tool_name);
          break;

        case 'workspace_confirm_request':
          ws.send(JSON.stringify({ type: 'workspace_confirm_response', workspace_type: 'standalone' }));
          break;

        case 'meeting_ended':
          for (const p of test.expectPhases) {
            if (!phases.includes(p)) issues.push(`missing phase: ${p}`);
          }
          if (agents.size < test.expectAgents) {
            issues.push(`expected >= ${test.expectAgents} agents, got ${agents.size}`);
          }
          if (test.expectDiscussion) {
            const nonCoord = [...agents].filter(a => a !== 'coordinator');
            if (nonCoord.length < 2) issues.push(`expected multi-agent discussion, got: ${[...agents].join(', ')}`);
          }
          for (const t of test.expectTools) {
            if (!toolsCalled.has(t)) issues.push(`expected tool not called: ${t}`);
          }
          break;

        case 'task_result':
          taskResultContent = msg.content || '';
          finish(issues.length === 0);
          break;

        case 'error':
          if (!msg.message.includes('workspace_confirm_response')) {
            issues.push(`error: ${msg.message}`);
          }
          break;
      }
    });

    ws.on('error', (e) => { issues.push(`ws error: ${e.message}`); finish(false); });
    setTimeout(() => { issues.push('timeout'); finish(false); }, test.timeout);
  });
}

async function main() {
  console.log('========================================');
  console.log('  Loop Engineering Test Suite v2');
  console.log('========================================\n');

  const results: TestResult[] = [];

  for (let i = 0; i < TESTS.length; i++) {
    const test = TESTS[i];
    console.log(`[${i + 1}/${TESTS.length}] ${test.name}`);
    console.log(`  Task: "${test.content.substring(0, 80)}..."`);
    console.log(`  Running...`);

    const result = await runTest(test);
    results.push(result);

    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status} (${(result.duration / 1000).toFixed(1)}s, ${result.messages} msgs)`);
    console.log(`  Phases: ${result.phases.join(' → ')}`);
    console.log(`  Agents: ${result.agents.join(', ')}`);
    console.log(`  Tools: ${result.toolsCalled.join(', ')}`);
    if (result.filesCreated.length > 0) console.log(`  Files: ${result.filesCreated.join(', ')}`);
    if (result.verificationResults.length > 0) {
      console.log(`  Verify:`);
      result.verificationResults.forEach(v => console.log(`    ${v}`));
    }
    if (result.issues.length > 0) {
      console.log(`  Issues:`);
      result.issues.forEach(issue => console.log(`    - ${issue}`));
    }
    console.log('');
  }

  console.log('========================================');
  console.log('  Summary');
  console.log('========================================');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`  Passed: ${passed}/${results.length}`);
  console.log(`  Failed: ${failed}/${results.length}`);

  if (failed > 0) {
    console.log('\n  Failed:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`    ${r.name}: ${r.issues.join('; ')}`);
    });
  }

  // Collect all issues for analysis
  const allIssues = results.flatMap(r => r.issues);
  if (allIssues.length > 0) {
    console.log('\n  All Issues (for Loop Engineering):');
    const unique = [...new Set(allIssues)];
    unique.forEach(issue => console.log(`    - ${issue}`));
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
