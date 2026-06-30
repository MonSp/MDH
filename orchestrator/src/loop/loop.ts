/**
 * Loop Engineering v5 — 全系统覆盖
 * 
 * 不只是测编排器，而是测整个 MDH 系统的每个子模块：
 * - 智能体核心 (agent, ceo_agent, session)
 * - 多Agent协作 (meeting, discussion, negotiation)
 * - 工具执行 (tool_executor, tool_registry)
 * - 技能进化 (skill_registry, experience_extractor)
 * - 质量保障 (review_pipeline, gate_manager)
 * - Orchestrator (coordinator, templates)
 * - Executor (executor_server)
 * 
 * 核心原则：
 * 1. 测试场景覆盖每个子系统
 * 2. prompt 不硬编码，从 roles_config.yaml 模板来
 * 3. 改代码不只是改 coordinator.ts，而是改任何有问题的模块
 * 4. 验证不只是"通过/失败"，而是量化质量指标
 */
import { WebSocket } from 'ws';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const MDH_ROOT = process.env.MDH_ROOT || '/home/test/MDH';
const LOOP_DIR = join(MDH_ROOT, 'orchestrator');
const CHECKPOINTS_DIR = join(LOOP_DIR, 'checkpoints');

if (!existsSync(CHECKPOINTS_DIR)) mkdirSync(CHECKPOINTS_DIR, { recursive: true });

const env = Object.fromEntries(
  readFileSync(join(MDH_ROOT, '.env'), 'utf-8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

// ====== 场景定义 — 覆盖 MDH 全系统 ======

interface Scenario {
  id: string;
  name: string;
  subsystem: string;          // 对应 MDH 的哪个子系统
  content: string;
  roles: string[];
  verifyFiles: string[];
  verifyCommands: string[];
  qualityChecks: { name: string; check: (r: Result) => boolean; desc: string }[];
  timeout: number;
}

const SCENARIOS: Scenario[] = [
  // --- 智能体核心 ---
  {
    id: 'agent-single',
    name: '单Agent直接执行',
    subsystem: 'agent-core',
    content: '在 workspace 中创建 hello.py 打印 "Hello Agent"，运行验证。',
    roles: ['executor'],
    verifyFiles: ['hello.py'],
    verifyCommands: ['python3 hello.py'],
    qualityChecks: [],
    timeout: 60000,
  },
  // --- 多Agent协作 (讨论+执行+审查) ---
  {
    id: 'team-collab-module',
    name: '多Agent协作开发模块',
    subsystem: 'meeting',
    content: '在 workspace 中创建一个用户认证模块：auth.py（注册/登录/密码哈希），models.py（User dataclass），test_auth.py 测试所有功能。要求使用 hashlib 做密码哈希。',
    roles: ['coordinator', 'planner', 'executor', 'reviewer'],
    verifyFiles: ['auth.py', 'models.py', 'test_auth.py'],
    verifyCommands: ['find /workspace -name "test_auth.py" -exec python3 -m pytest {} -v \\; 2>&1 | tail -10'],
    qualityChecks: [
      { name: '讨论充分', check: r => r.phases.includes('discussing'), desc: '多角色应有讨论阶段' },
      { name: '审查参与', check: r => r.agents.includes('reviewer'), desc: 'reviewer 应参与审查' },
    ],
    timeout: 120000,
  },
  // --- 工具执行 ---
  {
    id: 'tool-exec-bash',
    name: '工具执行: Shell命令',
    subsystem: 'tool-executor',
    content: '在 workspace 中创建 run_tests.sh 脚本，内容为运行 pytest 并输出结果。然后用 bash 执行它验证能正常工作。',
    roles: ['executor'],
    verifyFiles: ['run_tests.sh'],
    verifyCommands: ['bash run_tests.sh 2>&1 | head -5'],
    qualityChecks: [],
    timeout: 60000,
  },
  {
    id: 'tool-exec-files',
    name: '工具执行: 文件操作',
    subsystem: 'tool-executor',
    content: '在 workspace 根目录下创建 data/config.json（包含 name, version, features 三个字段）和 data/README.md（描述这个配置文件的用途）。直接在 workspace 根目录创建，不要创建子目录。',
    roles: ['executor'],
    verifyFiles: ['config.json', 'README.md'],
    verifyCommands: ['cat data/config.json'],
    qualityChecks: [],
    timeout: 120000,
  },
  // --- 技能进化 (创建可复用的代码模式) ---
  {
    id: 'skill-reusable',
    name: '技能: 可复用工具函数',
    subsystem: 'skill',
    content: '在 workspace 中创建 utils.py，实现：1) retry_with_backoff 装饰器（指数退避重试）2) safe_json_parse 函数（解析失败返回默认值）3) format_bytes 函数（字节数转可读格式）。创建 test_utils.py 测试。',
    roles: ['coordinator', 'planner', 'executor', 'reviewer'],
    verifyFiles: ['utils.py', 'test_utils.py'],
    verifyCommands: ['find /workspace -name "test_utils.py" -exec python3 -m pytest {} -v \\; 2>&1 | tail -10'],
    qualityChecks: [
      { name: '函数设计', check: r => r.agents.length >= 3, desc: '多角色协作' },
    ],
    timeout: 120000,
  },
  // --- 质量保障 (代码审查+测试) ---
  {
    id: 'quality-review',
    name: '质量: 代码审查流程',
    subsystem: 'review-pipeline',
    content: '在 workspace 中创建 calculator.py 实现 Calculator 类（add/sub/mul/div/divide_by_zero_handling），创建 test_calculator.py 覆盖正常和边界情况。重点：div 必须处理除零，返回 None 而不是报错。',
    roles: ['coordinator', 'planner', 'executor', 'reviewer'],
    verifyFiles: ['calculator.py', 'test_calculator.py'],
    verifyCommands: ['find /workspace -name "test_calculator.py" -exec python3 -m pytest {} -v \\; 2>&1 | tail -10'],
    qualityChecks: [
      { name: '审查通过', check: r => r.agents.includes('reviewer'), desc: 'reviewer 审查' },
    ],
    timeout: 120000,
  },
  // --- 工作流 (多步骤任务) ---
  {
    id: 'workflow-pipeline',
    name: '工作流: 多步骤数据处理',
    subsystem: 'workflow',
    content: '在 workspace 中创建数据处理流水线：1) generator.py 生成 100 条模拟销售数据 (date, product, amount, region) 保存为 sales.csv 2) analyzer.py 读取 sales.csv 按地区汇总销售额 3) test_pipeline.py 测试生成+分析两个步骤。',
    roles: ['coordinator', 'planner', 'executor', 'reviewer'],
    verifyFiles: ['generator.py', 'analyzer.py', 'test_pipeline.py'],
    verifyCommands: ['find /workspace -name "test_pipeline.py" -exec python3 -m pytest {} -v \\; 2>&1 | tail -10'],
    qualityChecks: [
      { name: '多文件', check: r => r.filesCreated.length >= 3, desc: '至少创建3个文件' },
    ],
    timeout: 150000,
  },
  // --- 路由 (任务分发) ---
  {
    id: 'routing-task',
    name: '路由: 根据任务类型分发',
    subsystem: 'dynamic-router',
    content: '在 workspace 中创建 task_dispatcher.py，实现一个任务分发器：根据任务类型（"code"/"test"/"deploy"）分配给不同的处理函数。每种类型有不同的处理逻辑。创建 test_dispatcher.py 测试所有路径。',
    roles: ['planner', 'executor', 'reviewer'],
    verifyFiles: ['task_dispatcher.py', 'test_dispatcher.py'],
    verifyCommands: ['find /workspace -name "test_dispatcher.py" -exec python3 -m pytest {} -v \\; 2>&1 | tail -10'],
    qualityChecks: [],
    timeout: 120000,
  },
  // --- 安全 (输入验证) ---
  {
    id: 'security-validation',
    name: '安全: 输入验证与防护',
    subsystem: 'security',
    content: '在 workspace 中创建 secure_input.py，实现：1) sanitize_filename 函数（防止路径穿越）2) validate_email 函数（正则验证）3) rate_limiter 装饰器（限制调用频率）。创建 test_security.py 测试所有边界情况。',
    roles: ['coordinator', 'planner', 'executor', 'reviewer'],
    verifyFiles: ['secure_input.py', 'test_security.py'],
    verifyCommands: ['find /workspace -name "test_security.py" -exec python3 -m pytest {} -v \\; 2>&1 | tail -10'],
    qualityChecks: [
      { name: '安全审查', check: r => r.agents.includes('reviewer'), desc: 'reviewer 应参与安全审查' },
    ],
    timeout: 120000,
  },
  // --- 降级 (错误恢复) ---
  {
    id: 'fallback-recovery',
    name: '降级: 错误恢复机制',
    subsystem: 'fallback',
    content: '在 workspace 中创建 resilient_service.py，实现一个带降级的服务：主处理器失败时自动切换到备用处理器，备用也失败时返回缓存结果。使用装饰器模式实现。创建 test_resilient.py 测试正常、主失败、主备都失败三种场景。',
    roles: ['coordinator', 'planner', 'executor', 'reviewer'],
    verifyFiles: ['resilient_service.py', 'test_resilient.py'],
    verifyCommands: ['find /workspace -name "test_resilient.py" -exec python3 -m pytest {} -v \\; 2>&1 | tail -10'],
    qualityChecks: [],
    timeout: 120000,
  },

  // ===== 新增场景 — 扩展覆盖 =====

  // --- Git 操作 ---
  {
    id: 'git-workflow',
    name: 'Git: 提交工作流',
    subsystem: 'tool-executor',
    content: '在 workspace 中创建一个 Git 提交工作流：1) 创建 project/README.md 描述项目 2) 创建 project/app.py 一个简单的 Flask hello world 3) 初始化 git 仓库并做首次提交。验证 git log 有提交记录。',
    roles: ['executor'],
    verifyFiles: ['README.md', 'app.py'],
    verifyCommands: ['cd /workspace && git log --oneline 2>&1 | head -3'],
    qualityChecks: [
      { name: 'Git 操作', check: r => r.toolsUsed.includes('bash') || r.toolsUsed.includes('execute_command'), desc: '应使用工具执行 git 命令' },
    ],
    timeout: 120000,
  },
  // --- API 开发 ---
  {
    id: 'api-endpoint',
    name: 'API: FastAPI 端点开发',
    subsystem: 'workflow',
    content: '在 workspace 中使用 FastAPI 创建一个 REST API：1) main.py 定义 /items 和 /items/{id} 两个端点（CRUD）2) models.py 定义 Pydantic 模型 3) test_api.py 使用 httpx 测试所有端点。要求支持分页查询。',
    roles: ['coordinator', 'planner', 'executor', 'reviewer'],
    verifyFiles: ['main.py', 'models.py', 'test_api.py'],
    verifyCommands: ['find /workspace -name "test_api.py" -exec python3 -m pytest {} -v \\; 2>&1 | tail -10'],
    qualityChecks: [
      { name: 'API 设计', check: r => r.filesCreated.length >= 3, desc: '至少创建3个文件' },
      { name: '审查参与', check: r => r.agents.includes('reviewer'), desc: 'reviewer 应参与 API 审查' },
    ],
    timeout: 150000,
  },
  // --- 大项目 ---
  {
    id: 'multi-file-project',
    name: '大项目: 6文件工程',
    subsystem: 'agent-core',
    content: '在 workspace 中创建一个完整的博客系统，至少 6 个文件：1) models.py（Post, Comment dataclass）2) database.py（SQLite CRUD 操作）3) api.py（REST 端点）4) auth.py（简单 token 认证）5) config.py（配置管理）6) test_blog.py（测试核心功能）。要求模块间正确 import。',
    roles: ['coordinator', 'planner', 'executor', 'reviewer'],
    verifyFiles: ['models.py', 'database.py', 'api.py', 'auth.py', 'config.py', 'test_blog.py'],
    verifyCommands: ['find /workspace -name "test_blog.py" -exec python3 -m pytest {} -v \\; 2>&1 | tail -10'],
    qualityChecks: [
      { name: '大文件数', check: r => r.filesCreated.length >= 5, desc: '至少创建5个文件' },
      { name: '多角色', check: r => r.agents.length >= 3, desc: '多角色协作' },
    ],
    timeout: 180000,
  },
  // --- 数据库持久化 ---
  {
    id: 'database-persistence',
    name: '数据库: SQLite 持久化',
    subsystem: 'workflow',
    content: '在 workspace 中创建一个 SQLite 持久化层：1) db.py 实现连接管理、建表、CRUD 操作 2) migrations.py 实现简单的 schema 迁移 3) seed.py 填充测试数据 4) test_db.py 测试增删改查和迁移。要求使用 context manager 管理连接。',
    roles: ['coordinator', 'planner', 'executor', 'reviewer'],
    verifyFiles: ['db.py', 'migrations.py', 'seed.py', 'test_db.py'],
    verifyCommands: ['find /workspace -name "test_db.py" -exec python3 -m pytest {} -v \\; 2>&1 | tail -10'],
    qualityChecks: [
      { name: '数据库文件', check: r => r.filesCreated.length >= 3, desc: '至少创建3个文件' },
    ],
    timeout: 150000,
  },
  // --- 角色选择 ---
  {
    id: 'role-selection',
    name: '角色: 自动角色选择',
    subsystem: 'dynamic-router',
    content: '在 workspace 中创建 role_selector.py，实现一个自动角色选择器：给定任务描述文本，自动判断需要哪些角色（planner/executor/reviewer/coordinator）。使用关键词匹配和简单规则。创建 test_role_selector.py 测试各种任务类型的自动选择结果。',
    roles: [],
    verifyFiles: ['role_selector.py', 'test_role_selector.py'],
    verifyCommands: ['find /workspace -name "test_role_selector.py" -exec python3 -m pytest {} -v \\; 2>&1 | tail -10'],
    qualityChecks: [
      { name: '空角色触发自动选择', check: r => r.agents.length >= 1, desc: '空 roles 应触发自动角色选择' },
    ],
    timeout: 120000,
  },
];

// ====== 执行任务 ======

interface Result {
  scenarioId: string;
  success: boolean;
  duration: number;
  phases: string[];
  agents: string[];
  toolsUsed: string[];
  filesCreated: string[];
  testOutput: string;
  issues: { type: string; severity: string; desc: string }[];
}

async function exec(cmd: string): Promise<string> {
  try { return execSync(cmd, { timeout: 15000, encoding: 'utf-8' }); } catch (e: any) { return e.stdout || ''; }
}

async function cleanWorkspace() {
  // 彻底清空 workspace 内容
  await exec(`curl -s -X POST http://localhost:8767/execute -H "Content-Type: application/json" -H "Authorization: Bearer mdh-executor-secret-2026" -d '{"tool_name":"bash","arguments":{"command":"cd /workspace && find . -maxdepth 1 -not -name . -not -name .git -exec rm -rf {} + 2>/dev/null; echo clean"},"call_id":"clean","permission_token":"loop"}'`);
}

function runScenario(s: Scenario): Promise<Result> {
  return new Promise(async (resolve) => {
    const start = Date.now();
    const issues: { type: string; severity: string; desc: string }[] = [];
    const phases: string[] = [];
    const agents = new Set<string>();
    const toolsUsed = new Set<string>();
    const filesCreated: string[] = [];
    let testOutput = '';

    await cleanWorkspace();

    const ws = new WebSocket('ws://localhost:8080/ws/');
    let resolved = false;

    const finish = async () => {
      if (resolved) return;
      resolved = true;
      ws.close();

      // 文件验收
      for (const file of s.verifyFiles) {
        const findCmd = `find /workspace -name ${file} -type f 2>/dev/null | head -1`;
        const check = await exec(`curl -s -X POST http://localhost:8767/execute -H "Content-Type: application/json" -H "Authorization: Bearer mdh-executor-secret-2026" -d '{"tool_name":"bash","arguments":{"command":"${findCmd}"},"call_id":"v"}'`);
        console.log(`    [verify] find ${file}: ${check.substring(0, 100)}`);
        try {
          const d = JSON.parse(check);
          if (d.success && d.result && String(d.result).trim()) {
            const foundPath = String(d.result).trim().replace('/workspace/', '');
            const readCheck = await exec(`curl -s -X POST http://localhost:8767/execute -H "Content-Type: application/json" -H "Authorization: Bearer mdh-executor-secret-2026" -d '{"tool_name":"read_file","arguments":{"path":"${foundPath}"},"call_id":"r"}'`);
            const rd = JSON.parse(readCheck);
            console.log(`    [verify] read ${foundPath}: ${rd.success ? 'OK' : 'FAIL'} len=${String(rd.result || '').length}`);
            if (rd.success && rd.result && String(rd.result).length > 10) filesCreated.push(file);
            else issues.push({ type: 'quality', severity: 'high', desc: `文件为空: ${file}` });
          } else {
            issues.push({ type: 'quality', severity: 'high', desc: `文件未创建: ${file}` });
          }
        } catch (e: any) { issues.push({ type: 'quality', severity: 'high', desc: `文件检查失败: ${file} ${e.message}` }); }
      }

      // 测试执行
      for (const cmd of s.verifyCommands) {
        const r = await exec(`curl -s -X POST http://localhost:8767/execute -H "Content-Type: application/json" -H "Authorization: Bearer mdh-executor-secret-2026" -d '{"tool_name":"bash","arguments":{"command":"${cmd.replace(/"/g, '\\"')}"},"call_id":"t"}'`);
        try { testOutput += JSON.parse(r).result || ''; } catch {}
      }

      const result: Result = {
        scenarioId: s.id, success: issues.filter(i => i.severity === 'high').length === 0,
        duration: Date.now() - start, phases, agents: [...agents], toolsUsed: [...toolsUsed],
        filesCreated, testOutput, issues,
      };

      for (const qc of s.qualityChecks) {
        if (!qc.check(result)) issues.push({ type: 'quality', severity: 'medium', desc: `${qc.name}: ${qc.desc}` });
      }
      result.issues = issues;
      result.success = issues.filter(i => i.severity === 'high').length === 0;
      resolve(result);
    };

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'unified_message', content: s.content,
        provider: 'deepseek', api_key: env.DEEPSEEK_API_KEY, base_url: 'https://api.deepseek.com/v1', model_name: 'deepseek-chat',
        selected_roles: s.roles,
      }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'agenda_update' && msg.agenda?.phase && !phases.includes(msg.agenda.phase)) phases.push(msg.agenda.phase);
      if (msg.type === 'agent_message' && msg.agentId) agents.add(msg.agentId.replace('agent-', ''));
      if ((msg.type === 'tool_call' || msg.type === 'tool_result') && (msg.tool || msg.tool_name)) toolsUsed.add(msg.tool || msg.tool_name);
      if (msg.type === 'workspace_confirm_request') ws.send(JSON.stringify({ type: 'workspace_confirm_response', workspace_type: 'standalone' }));
      if (msg.type === 'meeting_ended' || msg.type === 'task_result') finish();
      if (msg.type === 'error' && !msg.message?.includes('workspace_confirm_response')) issues.push({ type: 'flow', severity: 'low', desc: msg.message });
    });

    ws.on('error', () => finish());
    setTimeout(() => { if (!resolved) { issues.push({ type: 'performance', severity: 'critical', desc: 'timeout' }); finish(); } }, s.timeout);
  });
}

// ====== 主循环 ======

async function main() {
  const args = process.argv.slice(2);
  const retryFailed = args.includes('--retry-failed');
  const singleScenario = args.find(a => a.startsWith('--scenario='))?.split('=')[1];

  const checkpointFile = join(CHECKPOINTS_DIR, 'latest.json');
  const iterationId = existsSync(checkpointFile) ? JSON.parse(readFileSync(checkpointFile, 'utf-8')).iterationId + 1 : 1;

  // 确定要运行的场景
  let scenariosToRun = SCENARIOS;

  if (retryFailed && existsSync(checkpointFile)) {
    const prev = JSON.parse(readFileSync(checkpointFile, 'utf-8'));
    const failedIds = prev.results.filter((r: Result) => !r.success).map((r: Result) => r.scenarioId);
    scenariosToRun = SCENARIOS.filter(s => failedIds.includes(s.id));
    if (scenariosToRun.length === 0) {
      console.log('上一轮全部通过，无需重测。');
      return;
    }
    console.log(`重测 ${scenariosToRun.length} 个失败场景: ${scenariosToRun.map(s => s.id).join(', ')}`);
  } else if (singleScenario) {
    scenariosToRun = SCENARIOS.filter(s => s.id === singleScenario);
    if (scenariosToRun.length === 0) {
      console.log(`未找到场景: ${singleScenario}`);
      console.log(`可用: ${SCENARIOS.map(s => s.id).join(', ')}`);
      return;
    }
  }

  const label = retryFailed ? '重测失败场景' : singleScenario ? `单场景: ${singleScenario}` : '全量测试';
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Loop Engineering v5 — Full System Coverage          ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\n迭代 #${iterationId} | ${label} | ${scenariosToRun.length} 场景\n`);

  const results: Result[] = [];

  for (let i = 0; i < scenariosToRun.length; i++) {
    const s = scenariosToRun[i];
    console.log(`[${i + 1}/${scenariosToRun.length}] ${s.name} (${s.subsystem})`);
    const r = await runScenario(s);
    results.push(r);
    console.log(`  ${r.success ? '✅' : '❌'} ${(r.duration / 1000).toFixed(1)}s | ${r.agents.length} agents | ${r.toolsUsed.length} tools | ${r.filesCreated.length} files`);
    console.log(`  Phases: ${r.phases.join(' → ')}`);
    if (r.issues.length > 0) r.issues.forEach(i => console.log(`  [${i.type}:${i.severity}] ${i.desc}`));
    console.log('');
  }

  // 按子系统汇总
  console.log('═'.repeat(55));
  console.log('  按子系统汇总');
  console.log('═'.repeat(55));
  const bySubsystem = new Map<string, { pass: number; total: number; issues: number }>();
  for (const r of results) {
    const s = SCENARIOS.find(sc => sc.id === r.scenarioId)!;
    const key = s.subsystem;
    if (!bySubsystem.has(key)) bySubsystem.set(key, { pass: 0, total: 0, issues: 0 });
    const agg = bySubsystem.get(key)!;
    agg.total++;
    if (r.success) agg.pass++;
    agg.issues += r.issues.length;
  }
  for (const [sub, agg] of bySubsystem) {
    console.log(`  ${sub}: ${agg.pass}/${agg.total} passed, ${agg.issues} issues`);
  }

  const allIssues = results.flatMap(r => r.issues);
  const passed = results.filter(r => r.success).length;
  console.log(`\n  总计: ${passed}/${results.length} passed, ${allIssues.length} issues`);

  if (allIssues.length > 0) {
    console.log('\n  需要改进:');
    const byType = new Map<string, number>();
    for (const i of allIssues) byType.set(i.desc, (byType.get(i.desc) || 0) + 1);
    for (const [desc, count] of byType) console.log(`    ${desc} (${count}x)`);
  }

  const checkpoint = { iterationId, timestamp: new Date().toISOString(), passed, total: results.length, issues: allIssues, results };
  writeFileSync(join(CHECKPOINTS_DIR, `iteration-${iterationId}.json`), JSON.stringify(checkpoint, null, 2));
  writeFileSync(checkpointFile, JSON.stringify(checkpoint));
  console.log(`\n  检查点: iteration-${iterationId}.json`);
}

main().catch(console.error);
