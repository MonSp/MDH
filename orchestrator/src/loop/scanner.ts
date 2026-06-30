/**
 * Scanner — 自动扫描 MDH 代码库发现问题
 * 
 * 扫描源：
 * 1. Python 测试执行 (pytest)
 * 2. TypeScript 类型检查 (tsc)
 * 3. Lint 检查
 * 4. 代码模式分析（硬编码、TODO、安全问题）
 * 5. Docker 服务健康检查
 */
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { glob } from 'glob';
import type { Issue } from './persistence.js';

const MDH_ROOT = '/home/test/MDH';

function run(cmd: string, cwd: string = MDH_ROOT, timeout: number = 30000): string {
  try {
    return execSync(cmd, { cwd, timeout, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e: any) {
    return e.stdout || e.stderr || '';
  }
}

let issueCounter = 0;
function makeIssue(partial: Omit<Issue, 'id' | 'discoveredAt'>): Issue {
  return {
    id: `issue-${++issueCounter}`,
    discoveredAt: new Date().toISOString(),
    ...partial,
  };
}

// ====== 扫描器 1: Python 测试 ======
async function scanPythonTests(): Promise<Issue[]> {
  const issues: Issue[] = [];
  const output = run('python3 -m pytest backend/tests/ -v --tb=short 2>&1', MDH_ROOT, 60000);

  // 解析失败的测试
  const failures = output.match(/FAILED .+::.+$/gm) || [];
  for (const fail of failures) {
    const match = fail.match(/FAILED (.+?)::(.+)/);
    if (match) {
      issues.push(makeIssue({
        type: 'test',
        severity: 'high',
        file: match[1],
        description: `测试失败: ${match[2]}`,
        source: 'scanner:test',
      }));
    }
  }

  // 解析错误
  const errors = output.match(/ERROR .+$/gm) || [];
  for (const err of errors) {
    issues.push(makeIssue({
      type: 'bug',
      severity: 'critical',
      file: 'backend/tests',
      description: `测试错误: ${err}`,
      source: 'scanner:test',
    }));
  }

  return issues;
}

// ====== 扫描器 2: TypeScript 类型检查 ======
async function scanTypeScript(): Promise<Issue[]> {
  const issues: Issue[] = [];
  const output = run('npx tsc --noEmit 2>&1', MDH_ROOT, 60000);

  const errors = output.match(/(.+\.ts)\((\d+),\d+\): error TS\d+: (.+)/g) || [];
  for (const err of errors) {
    const match = err.match(/(.+?)\((\d+),\d+\): error TS\d+: (.+)/);
    if (match) {
      issues.push(makeIssue({
        type: 'bug',
        severity: 'high',
        file: match[1],
        line: parseInt(match[2]),
        description: `TypeScript 错误: ${match[3]}`,
        source: 'scanner:tsc',
      }));
    }
  }

  return issues;
}

// ====== 扫描器 3: 代码模式分析 ======
async function scanCodePatterns(): Promise<Issue[]> {
  const issues: Issue[] = [];

  // 扫描 Python 文件
  const pyFiles = await glob('backend/**/*.py', { cwd: MDH_ROOT, ignore: ['**/__pycache__/**', '**/test_*.py'] });

  for (const file of pyFiles) {
    const fullPath = join(MDH_ROOT, file);
    if (!existsSync(fullPath)) continue;
    const content = readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // 硬编码密码/token
      if (/password\s*=\s*['"][^'"]+['"]/i.test(line) && !line.includes('password_')) {
        issues.push(makeIssue({
          type: 'security',
          severity: 'critical',
          file,
          line: lineNum,
          description: `硬编码密码: ${line.trim().substring(0, 80)}`,
          source: 'scanner:pattern',
        }));
      }

      // TODO/FIXME/HACK
      if (/\b(TODO|FIXME|HACK|XXX)\b/.test(line)) {
        issues.push(makeIssue({
          type: 'refactor',
          severity: 'low',
          file,
          line: lineNum,
          description: `${line.match(/\b(TODO|FIXME|HACK|XXX)\b/)?.[0]}: ${line.trim().substring(0, 80)}`,
          source: 'scanner:pattern',
        }));
      }

      // bare except
      if (/^\s*except\s*:/.test(line)) {
        issues.push(makeIssue({
          type: 'refactor',
          severity: 'medium',
          file,
          line: lineNum,
          description: 'Bare except — 应捕获具体异常类型',
          source: 'scanner:pattern',
        }));
      }

      // subprocess.run without timeout
      if (/subprocess\.run\(/.test(line) && !line.includes('timeout')) {
        issues.push(makeIssue({
          type: 'perf',
          severity: 'medium',
          file,
          line: lineNum,
          description: 'subprocess.run 未设置 timeout，可能阻塞',
          source: 'scanner:pattern',
        }));
      }
    }
  }

  // 扫描 TypeScript 文件
  const tsFiles = await glob('orchestrator/src/**/*.ts', { cwd: MDH_ROOT });
  for (const file of tsFiles) {
    const fullPath = join(MDH_ROOT, file);
    if (!existsSync(fullPath)) continue;
    const content = readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // any 类型
      if (/: any\b/.test(line) && !line.includes('// eslint')) {
        issues.push(makeIssue({
          type: 'refactor',
          severity: 'low',
          file,
          line: lineNum,
          description: `使用了 any 类型: ${line.trim().substring(0, 60)}`,
          source: 'scanner:pattern',
        }));
      }

      // console.log (应使用 logger)
      if (/console\.(log|error|warn)/.test(line) && !file.includes('test')) {
        issues.push(makeIssue({
          type: 'refactor',
          severity: 'low',
          file,
          line: lineNum,
          description: `直接使用 console 输出，建议使用结构化日志`,
          source: 'scanner:pattern',
        }));
      }
    }
  }

  return issues;
}

// ====== 扫描器 4: Docker 服务健康检查 ======
async function scanDockerHealth(): Promise<Issue[]> {
  const issues: Issue[] = [];
  const output = run('docker compose ps --format json 2>/dev/null', MDH_ROOT);

  try {
    const lines = output.trim().split('\n').filter(l => l.startsWith('{'));
    for (const line of lines) {
      const svc = JSON.parse(line);
      if (svc.State && svc.State !== 'running') {
        issues.push(makeIssue({
          type: 'bug',
          severity: 'critical',
          file: 'docker-compose.yml',
          description: `服务 ${svc.Service} 状态异常: ${svc.State}`,
          source: 'scanner:docker',
        }));
      }
    }
  } catch {}

  return issues;
}

// ====== 扫描器 5: 服务健康检查 ======
async function scanOrchestratorTests(): Promise<Issue[]> {
  const issues: Issue[] = [];

  const healthOutput = run('curl -s http://localhost:8080/api/health 2>/dev/null', MDH_ROOT, 5000);
  if (!healthOutput.includes('"status":"ok"')) {
    issues.push(makeIssue({
      type: 'bug',
      severity: 'critical',
      file: 'orchestrator',
      description: '编排器服务不可用',
      source: 'scanner:orchestrator',
    }));
  }

  const executorOutput = run('curl -s http://localhost:8767/health 2>/dev/null', MDH_ROOT, 5000);
  if (!executorOutput.includes('"status":"ok"')) {
    issues.push(makeIssue({
      type: 'bug',
      severity: 'critical',
      file: 'executor',
      description: '执行器服务不可用',
      source: 'scanner:executor',
    }));
  }

  return issues;
}

// ====== 主扫描函数 ======

export async function scanAll(): Promise<Issue[]> {
  console.log('  [Scanner] 扫描 Python 测试...');
  const pyTestIssues = await scanPythonTests();
  console.log(`  [Scanner] Python 测试: ${pyTestIssues.length} issues`);

  console.log('  [Scanner] 扫描 TypeScript 类型...');
  const tsIssues = await scanTypeScript();
  console.log(`  [Scanner] TypeScript: ${tsIssues.length} issues`);

  console.log('  [Scanner] 扫描代码模式...');
  const patternIssues = await scanCodePatterns();
  console.log(`  [Scanner] 代码模式: ${patternIssues.length} issues`);

  console.log('  [Scanner] 检查 Docker 服务...');
  const dockerIssues = await scanDockerHealth();
  console.log(`  [Scanner] Docker: ${dockerIssues.length} issues`);

  console.log('  [Scanner] 运行编排器测试...');
  const orchIssues = await scanOrchestratorTests();
  console.log(`  [Scanner] 编排器测试: ${orchIssues.length} issues`);

  const all = [...pyTestIssues, ...tsIssues, ...patternIssues, ...dockerIssues, ...orchIssues];
  console.log(`  [Scanner] 总计: ${all.length} issues`);
  return all;
}
