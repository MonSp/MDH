/**
 * Persistence Layer — 检查点与跨迭代记忆
 * 
 * 每轮迭代保存 JSON 检查点，支持断点恢复。
 * 跨迭代记忆记录历史决策和模式，避免重复犯错。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CHECKPOINTS_DIR = join(__dirname, '../checkpoints');
const MEMORY_DIR = join(__dirname, '../memory');

// ====== 数据类型 ======

export interface Issue {
  id: string;
  type: 'bug' | 'perf' | 'refactor' | 'test' | 'feature' | 'lint' | 'security';
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;
  line?: number;
  description: string;
  discoveredAt: string;
  source: string;           // scanner, test, lint, manual
}

export interface FixAttempt {
  issueId: string;
  agent: string;            // 执行修复的 agent 类型
  filesChanged: string[];
  diff: string;
  timestamp: string;
  tokenUsage: number;
}

export interface ValidationResult {
  issueId: string;
  passed: boolean;
  testsPass: boolean;
  lintPass: boolean;
  typecheckPass: boolean;
  noRegressions: boolean;
  details: string;
  validatedBy: string;      // 验证者标识（不能和执行者相同）
  timestamp: string;
}

export interface IterationCheckpoint {
  iterationId: number;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed' | 'converged';
  issuesFound: Issue[];
  issuesFixed: string[];    // issue IDs
  issuesRemaining: string[];
  fixAttempts: FixAttempt[];
  validationResults: ValidationResult[];
  tokenBudgetUsed: number;
  summary: string;
}

export interface MemoryEntry {
  timestamp: string;
  type: 'pattern' | 'decision' | 'failure' | 'success';
  context: string;
  detail: string;
  tags: string[];
}

// ====== 检查点管理 ======

export class CheckpointManager {
  private checkpointsDir: string;

  constructor(baseDir: string = CHECKPOINTS_DIR) {
    this.checkpointsDir = baseDir;
    if (!existsSync(this.checkpointsDir)) {
      mkdirSync(this.checkpointsDir, { recursive: true });
    }
  }

  save(checkpoint: IterationCheckpoint): void {
    const path = join(this.checkpointsDir, `iteration-${checkpoint.iterationId}.json`);
    writeFileSync(path, JSON.stringify(checkpoint, null, 2));
  }

  load(iterationId: number): IterationCheckpoint | null {
    const path = join(this.checkpointsDir, `iteration-${iterationId}.json`);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf-8'));
  }

  getLatest(): IterationCheckpoint | null {
    const files = readdirSync(this.checkpointsDir)
      .filter(f => f.startsWith('iteration-') && f.endsWith('.json'))
      .sort();
    if (files.length === 0) return null;
    return JSON.parse(readFileSync(join(this.checkpointsDir, files[files.length - 1]), 'utf-8'));
  }

  getNextIterationId(): number {
    const latest = this.getLatest();
    return latest ? latest.iterationId + 1 : 1;
  }

  getAll(): IterationCheckpoint[] {
    const files = readdirSync(this.checkpointsDir)
      .filter(f => f.startsWith('iteration-') && f.endsWith('.json'))
      .sort();
    return files.map(f => JSON.parse(readFileSync(join(this.checkpointsDir, f), 'utf-8')));
  }
}

// ====== 记忆层 ======

export class MemoryStore {
  private memoryDir: string;
  private entries: MemoryEntry[] = [];

  constructor(baseDir: string = MEMORY_DIR) {
    this.memoryDir = baseDir;
    if (!existsSync(this.memoryDir)) {
      mkdirSync(this.memoryDir, { recursive: true });
    }
    this.load();
  }

  private load(): void {
    const path = join(this.memoryDir, 'memory.json');
    if (existsSync(path)) {
      this.entries = JSON.parse(readFileSync(path, 'utf-8'));
    }
  }

  private save(): void {
    writeFileSync(join(this.memoryDir, 'memory.json'), JSON.stringify(this.entries, null, 2));
  }

  record(type: MemoryEntry['type'], context: string, detail: string, tags: string[] = []): void {
    this.entries.push({
      timestamp: new Date().toISOString(),
      type,
      context,
      detail,
      tags,
    });
    this.save();
  }

  query(keyword: string): MemoryEntry[] {
    const lower = keyword.toLowerCase();
    return this.entries.filter(e =>
      e.context.toLowerCase().includes(lower) ||
      e.detail.toLowerCase().includes(lower) ||
      e.tags.some(t => t.toLowerCase().includes(lower))
    );
  }

  getByType(type: MemoryEntry['type']): MemoryEntry[] {
    return this.entries.filter(e => e.type === type);
  }

  getRecent(n: number = 10): MemoryEntry[] {
    return this.entries.slice(-n);
  }

  getPatterns(): MemoryEntry[] {
    return this.entries.filter(e => e.type === 'pattern' || e.type === 'failure');
  }
}

// ====== 收敛分析 ======

export function analyzeConvergence(checkpoints: IterationCheckpoint[]): {
  converged: boolean;
  trend: 'improving' | 'stagnant' | 'regressing';
  issuesByIteration: number[];
  fixRateByIteration: number[];
} {
  const issuesByIteration = checkpoints.map(c => c.issuesRemaining.length);
  const fixRateByIteration = checkpoints.map(c =>
    c.issuesFound.length > 0 ? c.issuesFixed.length / c.issuesFound.length : 0
  );

  // 收敛：连续 2 轮无剩余问题
  const last2 = issuesByIteration.slice(-2);
  const converged = last2.length >= 2 && last2.every(n => n === 0);

  // 趋势：最近 3 轮的问题数变化
  const recent3 = issuesByIteration.slice(-3);
  let trend: 'improving' | 'stagnant' | 'regressing' = 'stagnant';
  if (recent3.length >= 2) {
    const diffs = recent3.slice(1).map((n, i) => n - recent3[i]);
    if (diffs.every(d => d <= 0)) trend = 'improving';
    else if (diffs.every(d => d >= 0)) trend = 'regressing';
  }

  return { converged, trend, issuesByIteration, fixRateByIteration };
}
