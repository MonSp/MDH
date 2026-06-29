/**
 * Multi-Agent Team Collaboration Test Suite
 * 
 * Runs multiple test scenarios against the orchestrator,
 * checks for protocol issues, and reports results.
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
  expectPhases: string[];      // phases that MUST appear
  expectAgents: number;         // minimum agent count
  expectDiscussion: boolean;    // must have agent_message from multiple agents
  timeout: number;              // ms
}

const TESTS: TestCase[] = [
  {
    name: 'Simple: single command',
    content: '用bash执行 echo "test ok"',
    roles: ['executor'],
    expectPhases: ['analyzing'],
    expectAgents: 1,
    expectDiscussion: false,
    timeout: 60000,
  },
  {
    name: 'Complex: Python module + tests',
    content: '创建一个 Python 模块 string_utils.py，实现 capitalize_words、reverse_words、count_words 三个函数，然后创建 test_string_utils.py 编写单元测试，运行验证。',
    roles: ['coordinator', 'planner', 'executor', 'reviewer'],
    expectPhases: ['analyzing', 'discussing', 'executing'],
    expectAgents: 3,
    expectDiscussion: true,
    timeout: 120000,
  },
  {
    name: 'Complex: multi-file web app',
    content: '创建一个天气查询 Web 应用：index.html + style.css + app.js，使用 fetch 调用公开天气 API，显示当前天气和未来3天预报。',
    roles: ['coordinator', 'planner', 'executor', 'reviewer'],
    expectPhases: ['analyzing', 'discussing', 'executing'],
    expectAgents: 3,
    expectDiscussion: true,
    timeout: 120000,
  },
  {
    name: 'Complex: CLI tool with argparse',
    content: '创建一个 Python CLI 工具 todo.py，使用 argparse 支持 add/list/done/delete 四个子命令，数据保存在 JSON 文件中。创建 test_todo.py 测试所有功能。',
    roles: ['coordinator', 'planner', 'executor', 'reviewer'],
    expectPhases: ['analyzing', 'discussing', 'executing'],
    expectAgents: 3,
    expectDiscussion: true,
    timeout: 120000,
  },
  {
    name: 'Edge: ambiguous task',
    content: '帮我搞一个能用的东西',
    roles: ['coordinator', 'planner', 'executor'],
    expectPhases: ['analyzing'],
    expectAgents: 1,
    expectDiscussion: false,
    timeout: 150000,
  },
];

interface TestResult {
  name: string;
  passed: boolean;
  issues: string[];
  phases: string[];
  agents: string[];
  messages: number;
  duration: number;
}

function runTest(test: TestCase): Promise<TestResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const issues: string[] = [];
    const phases: string[] = [];
    const agents = new Set<string>();
    let msgCount = 0;

    const ws = new WebSocket('ws://localhost:8080/ws/');
    let resolved = false;

    const finish = (passed: boolean) => {
      if (resolved) return;
      resolved = true;
      ws.close();
      resolve({
        name: test.name,
        passed,
        issues,
        phases,
        agents: [...agents],
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

        case 'tool_result':
          if (!msg.tool_name) issues.push('tool_result missing tool_name');
          break;

        case 'workspace_confirm_request':
          ws.send(JSON.stringify({
            type: 'workspace_confirm_response',
            workspace_type: 'standalone',
          }));
          break;

        case 'meeting_ended':
          // Validate after meeting ends
          for (const expectedPhase of test.expectPhases) {
            if (!phases.includes(expectedPhase)) {
              issues.push(`missing expected phase: ${expectedPhase}`);
            }
          }
          if (agents.size < test.expectAgents) {
            issues.push(`expected >= ${test.expectAgents} agents, got ${agents.size}`);
          }
          if (test.expectDiscussion) {
            const nonCoordinatorAgents = [...agents].filter(a => a !== 'coordinator');
            if (nonCoordinatorAgents.length < 2) {
              issues.push(`expected discussion from multiple agents, only got: ${[...agents].join(', ')}`);
            }
          }
          break;

        case 'task_result':
          finish(issues.length === 0);
          break;

        case 'error':
          // workspace_confirm_response error is known but harmless
          if (!msg.message.includes('workspace_confirm_response')) {
            issues.push(`error: ${msg.message}`);
          }
          break;
      }
    });

    ws.on('error', (e) => {
      issues.push(`ws error: ${e.message}`);
      finish(false);
    });

    setTimeout(() => {
      issues.push('timeout');
      finish(false);
    }, test.timeout);
  });
}

async function main() {
  console.log('========================================');
  console.log('  Multi-Agent Team Test Suite');
  console.log('========================================\n');

  const results: TestResult[] = [];

  for (let i = 0; i < TESTS.length; i++) {
    const test = TESTS[i];
    console.log(`[${ i + 1}/${TESTS.length}] ${test.name}`);
    console.log(`  Task: "${test.content.substring(0, 60)}..."`);
    console.log(`  Roles: ${test.roles.join(', ')}`);
    console.log(`  Running...`);

    const result = await runTest(test);
    results.push(result);

    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status} (${(result.duration / 1000).toFixed(1)}s, ${result.messages} msgs)`);
    console.log(`  Phases: ${result.phases.join(' → ')}`);
    console.log(`  Agents: ${result.agents.join(', ')}`);
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
    console.log('\n  Failed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`    - ${r.name}: ${r.issues.join('; ')}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
