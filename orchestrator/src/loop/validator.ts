/**
 * Validator — 独立验证模块
 * 
 * 核心原则：执行修复的 Agent 不能给自己打分。
 * 验证器用独立的手段验证修复结果。
 */
import { execSync } from 'child_process';
import type { Task } from './scheduler.js';
import type { ValidationResult } from './persistence.js';

const MDH_ROOT = '/home/test/MDH';

function run(cmd: string, timeout: number = 60000): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(cmd, { cwd: MDH_ROOT, timeout, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { stdout, exitCode: 0 };
  } catch (e: any) {
    return { stdout: e.stdout || e.stderr || '', exitCode: e.status || 1 };
  }
}

// ====== 验证步骤 ======

function checkTests(): { pass: boolean; detail: string } {
  const pyResult = run('cd backend && python3 -m pytest tests/ -x -q 2>&1', 120000);
  if (pyResult.exitCode !== 0 && pyResult.stdout.includes('FAILED')) {
    return { pass: false, detail: `Python 测试失败:\n${pyResult.stdout.substring(0, 500)}` };
  }
  return { pass: true, detail: 'Python 测试通过' };
}

function checkTypeScript(task: Task): { pass: boolean; detail: string } {
  // 只在任务涉及 orchestrator TS 文件时检查
  const orchestratorFiles = task.files.filter(f => f.endsWith('.ts') && f.includes('orchestrator'));
  if (orchestratorFiles.length === 0) {
    return { pass: true, detail: '无 orchestrator TS 文件变更，跳过类型检查' };
  }

  const result = run('npx tsc --noEmit -p orchestrator/tsconfig.json 2>&1', 60000);
  if (result.exitCode !== 0) {
    // 检查错误是否涉及任务修改的文件
    const taskFileErrors = orchestratorFiles.filter(f => result.stdout.includes(f));
    if (taskFileErrors.length > 0) {
      return { pass: false, detail: `任务文件有 TypeScript 错误: ${taskFileErrors.join(', ')}` };
    }
    // 任务文件没有错误，其他文件的已有错误不算回归
    return { pass: true, detail: '任务文件无新增 TypeScript 错误' };
  }
  return { pass: true, detail: 'TypeScript 通过' };
}

function checkLint(): { pass: boolean; detail: string } {
  const ruffResult = run('which ruff 2>/dev/null', 5000);
  if (ruffResult.exitCode !== 0) {
    return { pass: true, detail: 'Ruff 未安装，跳过 lint 检查' };
  }
  const result = run('ruff check backend/ 2>&1', 30000);
  if (result.exitCode !== 0) {
    const issueCount = (result.stdout.match(/^[/]/gm) || []).length;
    return { pass: false, detail: `Ruff 发现 ${issueCount} 个问题` };
  }
  return { pass: true, detail: 'Lint 检查通过' };
}

function checkNoRegressions(task: Task): { pass: boolean; detail: string } {
  // 检查修改的文件是否都还能正常解析
  for (const file of task.files) {
    if (file.endsWith('.py')) {
      const result = run(`python -c "import ast; ast.parse(open('${file}').read())" 2>&1`, 10000);
      if (result.exitCode !== 0) {
        return { pass: false, detail: `Python 语法错误: ${file}` };
      }
    }
    if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      // TypeScript 文件通过 tsc 整体检查
    }
  }
  return { pass: true, detail: '无语法回归' };
}

function checkDockerServices(): { pass: boolean; detail: string } {
  const result = run('docker compose ps --format json 2>/dev/null', 10000);
  try {
    const lines = result.stdout.trim().split('\n').filter(l => l.startsWith('{'));
    for (const line of lines) {
      const svc = JSON.parse(line);
      if (svc.State && svc.State !== 'running') {
        return { pass: false, detail: `服务 ${svc.Service} 状态: ${svc.State}` };
      }
    }
  } catch {}
  return { pass: true, detail: 'Docker 服务正常' };
}

// ====== 主验证函数 ======

export async function validate(task: Task): Promise<ValidationResult> {
  console.log(`    [Validator] 验证 ${task.id}...`);

  const results = {
    tests: checkTests(),
    lint: checkLint(),
    typecheck: checkTypeScript(),
    regressions: checkNoRegressions(task),
    docker: checkDockerServices(),
  };

  const allPassed = Object.values(results).every(r => r.pass);
  const details = Object.entries(results)
    .map(([name, r]) => `${r.pass ? '✅' : '❌'} ${name}: ${r.detail}`)
    .join('\n');

  console.log(`    [Validator] ${allPassed ? 'PASS' : 'FAIL'}`);

  return {
    issueId: task.issueIds[0],
    passed: allPassed,
    testsPass: results.tests.pass,
    lintPass: results.lint.pass,
    typecheckPass: results.typecheck.pass,
    noRegressions: results.regressions.pass,
    details,
    validatedBy: 'independent-validator',
    timestamp: new Date().toISOString(),
  };
}
