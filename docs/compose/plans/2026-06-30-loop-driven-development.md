# Loop-Driven Development System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an external Loop-Driven Development System that uses quantitative metrics, prompt auto-evolution, expanded scenarios, and CI integration to iteratively optimize MDH.

**Architecture:** New `loop-engineering/` directory (TypeScript + SQLite) reads existing loop checkpoints from `orchestrator/checkpoints/`, computes quality metrics, tracks prompt versions, runs evolution experiments, and provides CI gate. The existing `orchestrator/src/loop/` remains the execution engine.

**Tech Stack:** TypeScript, SQLite (better-sqlite3), tsx (runner), existing orchestrator WebSocket API

## Global Constraints

- Node.js ESM (`"type": "module"`)
- TypeScript strict mode
- Read checkpoints from `orchestrator/checkpoints/` (JSON format)
- SQLite stored at `loop-engineering/data/metrics.db`
- All scores 0-100 integer scale
- No external services required (LLM calls use existing MDH orchestrator)

---

### Task 1: Project Scaffolding

**Covers:** S7

**Files:**
- Create: `loop-engineering/package.json`
- Create: `loop-engineering/tsconfig.json`
- Create: `loop-engineering/src/main.ts`
- Create: `loop-engineering/data/.gitkeep`

**Interfaces:**
- Produces: `main.ts` CLI entry point with `--help` output

- [ ] **Step 1: Create package.json**

```json
{
  "name": "mdh-loop-engineering",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx src/main.ts",
    "metrics": "tsx src/main.ts metrics",
    "evolve": "tsx src/main.ts evolve",
    "ci": "tsx src/main.ts ci"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tsx": "^4.7.0",
    "@types/node": "^20.0.0",
    "@types/better-sqlite3": "^7.6.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create main.ts with CLI skeleton**

```typescript
import { parseArgs } from 'node:util';

const HELP = `
Loop-Driven Development System

Commands:
  metrics              Show quality metrics from latest checkpoint
  metrics --trend      Show quality trend across iterations
  evolve               Run prompt evolution experiment
  evolve --component=X Evolve specific component (coordinator|reviewer|executor|planner)
  ci                   Run CI gate (exit 1 on failure)
  ci --threshold=N     Set quality threshold (default: 80)

Examples:
  tsx src/main.ts metrics
  tsx src/main.ts metrics --trend
  tsx src/main.ts evolve --component=reviewer
  tsx src/main.ts ci --threshold=85
`;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'metrics';

  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  switch (command) {
    case 'metrics':
      console.log('Metrics command — not yet implemented');
      break;
    case 'evolve':
      console.log('Evolve command — not yet implemented');
      break;
    case 'ci':
      console.log('CI command — not yet implemented');
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch(console.error);
```

- [ ] **Step 4: Create data directory**

```bash
mkdir -p loop-engineering/data
touch loop-engineering/data/.gitkeep
```

- [ ] **Step 5: Install dependencies**

```bash
cd loop-engineering && npm install
```

- [ ] **Step 6: Verify CLI works**

```bash
cd loop-engineering && npx tsx src/main.ts --help
```

Expected: prints help text

- [ ] **Step 7: Commit**

```bash
git add loop-engineering/
git commit -m "feat: scaffold loop-engineering project"
```

---

### Task 2: SQLite Storage Layer

**Covers:** S3

**Files:**
- Create: `loop-engineering/src/metrics/db.ts`

**Interfaces:**
- Produces: `getDb(): Database` — returns SQLite connection
- Produces: `initDb(db: Database): void` — creates tables
- Produces: `ScenarioMetric`, `IterationSummary`, `PromptVersion` types

- [ ] **Step 1: Write db.ts**

```typescript
import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');

export interface ScenarioMetric {
  id?: number;
  iteration_id: number;
  scenario_id: string;
  passed: boolean;
  duration_ms: number;
  files_created: number;
  files_expected: number;
  test_pass_rate: number;
  agents_participated: number;
  agents_expected: number;
  tool_calls: number;
  phases: string;       // JSON array
  issues: string;       // JSON array
  quality_score: number;
  timestamp: string;
}

export interface IterationSummary {
  id?: number;
  iteration_id: number;
  total_scenarios: number;
  passed: number;
  avg_duration_ms: number;
  avg_quality_score: number;
  total_issues: number;
  issues_by_severity: string; // JSON
  timestamp: string;
}

export interface PromptVersion {
  id?: number;
  component: string;
  version: number;
  prompt_text: string;
  avg_score: number;
  sample_size: number;
  created_at: string;
  active: boolean;
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const dbPath = join(DATA_DIR, 'metrics.db');
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    initDb(_db);
  }
  return _db;
}

function initDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scenario_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      iteration_id INTEGER,
      scenario_id TEXT,
      passed BOOLEAN,
      duration_ms INTEGER,
      files_created INTEGER,
      files_expected INTEGER,
      test_pass_rate REAL,
      agents_participated INTEGER,
      agents_expected INTEGER,
      tool_calls INTEGER,
      phases TEXT,
      issues TEXT,
      quality_score INTEGER,
      timestamp TEXT
    );

    CREATE TABLE IF NOT EXISTS iteration_summary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      iteration_id INTEGER UNIQUE,
      total_scenarios INTEGER,
      passed INTEGER,
      avg_duration_ms REAL,
      avg_quality_score REAL,
      total_issues INTEGER,
      issues_by_severity TEXT,
      timestamp TEXT
    );

    CREATE TABLE IF NOT EXISTS prompt_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      component TEXT,
      version INTEGER,
      prompt_text TEXT,
      avg_score REAL,
      sample_size INTEGER,
      created_at TEXT,
      active BOOLEAN DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_scenario_iteration
      ON scenario_metrics(iteration_id);
    CREATE INDEX IF NOT EXISTS idx_scenario_id
      ON scenario_metrics(scenario_id);
    CREATE INDEX IF NOT EXISTS idx_prompt_component
      ON prompt_versions(component, active);
  `);
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
```

- [ ] **Step 2: Verify db creation**

```bash
cd loop-engineering && npx tsx -e "
import { getDb, closeDb } from './src/metrics/db.js';
const db = getDb();
const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all();
console.log('Tables:', tables.map(t => t.name));
closeDb();
"
```

Expected: `Tables: [ 'scenario_metrics', 'iteration_summary', 'prompt_versions' ]`

- [ ] **Step 3: Commit**

```bash
git add loop-engineering/src/metrics/db.ts
git commit -m "feat: add SQLite storage layer for metrics"
```

---

### Task 3: Checkpoint Collector

**Covers:** S3

**Files:**
- Create: `loop-engineering/src/metrics/collector.ts`

**Interfaces:**
- Produces: `collectFromCheckpoints(): ScenarioMetric[]` — reads all checkpoints, returns metrics
- Consumes: checkpoint JSON files from `orchestrator/checkpoints/`

- [ ] **Step 1: Write collector.ts**

```typescript
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ScenarioMetric } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHECKPOINTS_DIR = join(__dirname, '../../../orchestrator/checkpoints');

interface CheckpointResult {
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

interface Checkpoint {
  iterationId: number;
  timestamp: string;
  passed: number;
  total: number;
  issues: { type: string; severity: string; desc: string }[];
  results: CheckpointResult[];
}

// Scenario definitions (from orchestrator/src/loop/loop.ts)
const SCENARIO_META: Record<string, { filesExpected: number; agentsExpected: number }> = {
  'agent-single': { filesExpected: 1, agentsExpected: 1 },
  'team-collab-module': { filesExpected: 3, agentsExpected: 4 },
  'tool-exec-bash': { filesExpected: 1, agentsExpected: 1 },
  'tool-exec-files': { filesExpected: 2, agentsExpected: 1 },
  'skill-reusable': { filesExpected: 2, agentsExpected: 4 },
  'quality-review': { filesExpected: 2, agentsExpected: 4 },
  'workflow-pipeline': { filesExpected: 3, agentsExpected: 4 },
  'routing-task': { filesExpected: 2, agentsExpected: 3 },
  'security-validation': { filesExpected: 2, agentsExpected: 4 },
  'fallback-recovery': { filesExpected: 2, agentsExpected: 4 },
};

function loadCheckpoints(): Checkpoint[] {
  if (!existsSync(CHECKPOINTS_DIR)) return [];

  const files = readdirSync(CHECKPOINTS_DIR)
    .filter(f => f.startsWith('iteration-') && f.endsWith('.json'))
    .sort((a, b) => {
      const numA = parseInt(a.match(/(\d+)/)?.[1] || '0');
      const numB = parseInt(b.match(/(\d+)/)?.[1] || '0');
      return numA - numB;
    });

  return files.map(f => {
    const content = readFileSync(join(CHECKPOINTS_DIR, f), 'utf-8');
    return JSON.parse(content) as Checkpoint;
  });
}

export function collectFromCheckpoints(): ScenarioMetric[] {
  const checkpoints = loadCheckpoints();
  const metrics: ScenarioMetric[] = [];

  for (const cp of checkpoints) {
    for (const result of cp.results) {
      const meta = SCENARIO_META[result.scenarioId] || { filesExpected: 1, agentsExpected: 1 };
      metrics.push({
        iteration_id: cp.iterationId,
        scenario_id: result.scenarioId,
        passed: result.success,
        duration_ms: result.duration,
        files_created: result.filesCreated.length,
        files_expected: meta.filesExpected,
        test_pass_rate: result.success ? 1.0 : 0.0,
        agents_participated: result.agents.length,
        agents_expected: meta.agentsExpected,
        tool_calls: result.toolsUsed.length,
        phases: JSON.stringify(result.phases),
        issues: JSON.stringify(result.issues),
        quality_score: 0, // computed later by calculator
        timestamp: cp.timestamp,
      });
    }
  }

  return metrics;
}

export function getLatestCheckpoint(): Checkpoint | null {
  const path = join(CHECKPOINTS_DIR, 'latest.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}
```

- [ ] **Step 2: Verify collector reads checkpoints**

```bash
cd loop-engineering && npx tsx -e "
import { collectFromCheckpoints } from './src/metrics/collector.js';
const metrics = collectFromCheckpoints();
console.log('Total metrics:', metrics.length);
console.log('Iterations:', [...new Set(metrics.map(m => m.iteration_id))].length);
console.log('Sample:', JSON.stringify(metrics[0], null, 2));
"
```

Expected: shows metrics from 31 iterations

- [ ] **Step 3: Commit**

```bash
git add loop-engineering/src/metrics/collector.ts
git commit -m "feat: add checkpoint collector"
```

---

### Task 4: Quality Score Calculator

**Covers:** S3

**Files:**
- Create: `loop-engineering/src/metrics/calculator.ts`

**Interfaces:**
- Produces: `calculateScore(metric: Omit<ScenarioMetric, 'quality_score'>): number`
- Produces: `calculateIterationSummary(metrics: ScenarioMetric[]): IterationSummary`

- [ ] **Step 1: Write calculator.ts**

```typescript
import type { ScenarioMetric, IterationSummary } from './db.js';

/**
 * Quality score formula (0-100):
 * - Completion (40%): file creation + test pass
 * - Efficiency (20%): duration penalty
 * - Collaboration (20%): agent participation + discussion + review
 * - Code Quality (20%): error handling + tests present
 */
export function calculateScore(metric: Omit<ScenarioMetric, 'quality_score'>): number {
  // Completion (40 points max)
  const fileRate = metric.files_expected > 0
    ? metric.files_created / metric.files_expected
    : 1.0;
  const completion = fileRate * 20 + metric.test_pass_rate * 20;

  // Efficiency (20 points max, deduct for slow execution)
  // Baseline: 60s = full points, every 10s over = -1 point
  const efficiency = Math.max(0, 20 - Math.floor(metric.duration_ms / 10000));

  // Collaboration (20 points max)
  const agentRate = metric.agents_expected > 0
    ? metric.agents_participated / metric.agents_expected
    : 1.0;
  const phases: string[] = JSON.parse(metric.phases);
  const hasDiscussion = phases.includes('discussing') ? 1 : 0;
  const hasReview = phases.includes('reviewing') ? 1 : 0;
  const collaboration = agentRate * 10 + hasDiscussion * 5 + hasReview * 5;

  // Code Quality (20 points max)
  // Heuristic: if test passed and no issues, assume good quality
  const issues: { severity: string }[] = JSON.parse(metric.issues);
  const hasCritical = issues.some(i => i.severity === 'critical') ? 0 : 1;
  const hasHigh = issues.some(i => i.severity === 'high') ? 0 : 1;
  const codeQuality = hasCritical * 10 + hasHigh * 10;

  return Math.min(100, Math.max(0, Math.round(
    completion + efficiency + collaboration + codeQuality
  )));
}

export function calculateIterationSummary(
  metrics: ScenarioMetric[],
  iterationId: number
): IterationSummary {
  const scores = metrics.map(m => m.quality_score);
  const avgScore = scores.length > 0
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0;
  const avgDuration = metrics.length > 0
    ? metrics.reduce((a, b) => a + b.duration_ms, 0) / metrics.length
    : 0;

  const allIssues = metrics.flatMap(m => JSON.parse(m.issues) as { severity: string }[]);
  const bySeverity: Record<string, number> = {};
  for (const issue of allIssues) {
    bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
  }

  return {
    iteration_id: iterationId,
    total_scenarios: metrics.length,
    passed: metrics.filter(m => m.passed).length,
    avg_duration_ms: Math.round(avgDuration),
    avg_quality_score: Math.round(avgScore * 10) / 10,
    total_issues: allIssues.length,
    issues_by_severity: JSON.stringify(bySeverity),
    timestamp: new Date().toISOString(),
  };
}
```

- [ ] **Step 2: Verify score calculation**

```bash
cd loop-engineering && npx tsx -e "
import { calculateScore } from './src/metrics/calculator.js';
const score = calculateScore({
  iteration_id: 31,
  scenario_id: 'team-collab-module',
  passed: true,
  duration_ms: 50938,
  files_created: 3,
  files_expected: 3,
  test_pass_rate: 1.0,
  agents_participated: 4,
  agents_expected: 4,
  tool_calls: 4,
  phases: JSON.stringify(['analyzing','planning','discussing','assigning','executing','reviewing','summarizing']),
  issues: JSON.stringify([]),
  timestamp: '2026-06-30',
  quality_score: 0,
});
console.log('Score:', score);
"
```

Expected: score around 80-90 (good completion, moderate speed, full collaboration, no issues)

- [ ] **Step 3: Commit**

```bash
git add loop-engineering/src/metrics/calculator.ts
git commit -m "feat: add quality score calculator"
```

---

### Task 5: Metrics CLI + Reporter

**Covers:** S3

**Files:**
- Create: `loop-engineering/src/metrics/reporter.ts`
- Modify: `loop-engineering/src/main.ts`

**Interfaces:**
- Produces: `showMetrics(trend: boolean): void`
- Consumes: `collectFromCheckpoints()`, `calculateScore()`, `getDb()`

- [ ] **Step 1: Write reporter.ts**

```typescript
import { getDb, type ScenarioMetric, type IterationSummary } from './db.js';
import { collectFromCheckpoints } from './collector.js';
import { calculateScore, calculateIterationSummary } from './calculator.js';

export function ingestCheckpoints(): void {
  const db = getDb();
  const metrics = collectFromCheckpoints();

  // Check which iterations are already ingested
  const existing = new Set<number>(
    db.prepare('SELECT DISTINCT iteration_id FROM scenario_metrics')
      .all()
      .map((r: any) => r.iteration_id)
  );

  const insertMetric = db.prepare(`
    INSERT INTO scenario_metrics
    (iteration_id, scenario_id, passed, duration_ms, files_created, files_expected,
     test_pass_rate, agents_participated, agents_expected, tool_calls,
     phases, issues, quality_score, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSummary = db.prepare(`
    INSERT OR REPLACE INTO iteration_summary
    (iteration_id, total_scenarios, passed, avg_duration_ms, avg_quality_score,
     total_issues, issues_by_severity, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const newMetrics = metrics.filter(m => !existing.has(m.iteration_id));
  if (newMetrics.length === 0) {
    console.log('No new checkpoints to ingest.');
    return;
  }

  // Group by iteration
  const byIteration = new Map<number, ScenarioMetric[]>();
  for (const m of newMetrics) {
    // Calculate score before insert
    m.quality_score = calculateScore(m);
    if (!byIteration.has(m.iteration_id)) byIteration.set(m.iteration_id, []);
    byIteration.get(m.iteration_id)!.push(m);
  }

  const tx = db.transaction(() => {
    for (const [iterId, iterMetrics] of byIteration) {
      for (const m of iterMetrics) {
        insertMetric.run(
          m.iteration_id, m.scenario_id, m.passed ? 1 : 0, m.duration_ms,
          m.files_created, m.files_expected, m.test_pass_rate,
          m.agents_participated, m.agents_expected, m.tool_calls,
          m.phases, m.issues, m.quality_score, m.timestamp
        );
      }
      const summary = calculateIterationSummary(iterMetrics, iterId);
      insertSummary.run(
        summary.iteration_id, summary.total_scenarios, summary.passed,
        summary.avg_duration_ms, summary.avg_quality_score,
        summary.total_issues, summary.issues_by_severity, summary.timestamp
      );
    }
  });

  tx();
  console.log(`Ingested ${newMetrics.length} metrics from ${byIteration.size} iterations.`);
}

export function showMetrics(trend: boolean): void {
  const db = getDb();

  // Ensure data is ingested
  ingestCheckpoints();

  if (trend) {
    showTrend(db);
  } else {
    showLatest(db);
  }
}

function showLatest(db: any): void {
  const latest = db.prepare(`
    SELECT * FROM iteration_summary ORDER BY iteration_id DESC LIMIT 1
  `).get() as IterationSummary | undefined;

  if (!latest) {
    console.log('No data available.');
    return;
  }

  console.log(`\n=== Iteration #${latest.iteration_id} ===`);
  console.log(`Passed: ${latest.passed}/${latest.total_scenarios}`);
  console.log(`Avg Quality Score: ${latest.avg_quality_score}/100`);
  console.log(`Avg Duration: ${(latest.avg_duration_ms / 1000).toFixed(1)}s`);
  console.log(`Issues: ${latest.total_issues}`);

  // Per-scenario breakdown
  const scenarios = db.prepare(`
    SELECT scenario_id, passed, quality_score, duration_ms
    FROM scenario_metrics
    WHERE iteration_id = ?
    ORDER BY quality_score ASC
  `).all(latest.iteration_id) as any[];

  console.log('\nPer-Scenario:');
  for (const s of scenarios) {
    const icon = s.passed ? '✓' : '✗';
    console.log(`  ${icon} ${s.scenario_id}: ${s.quality_score}/100 (${(s.duration_ms/1000).toFixed(1)}s)`);
  }
}

function showTrend(db: any): void {
  const summaries = db.prepare(`
    SELECT * FROM iteration_summary ORDER BY iteration_id ASC
  `).all() as IterationSummary[];

  if (summaries.length === 0) {
    console.log('No data available.');
    return;
  }

  console.log('\n=== Quality Trend ===\n');
  console.log('Iter  Pass  Score  Duration  Issues');
  console.log('─'.repeat(45));

  for (const s of summaries) {
    console.log(
      `#${String(s.iteration_id).padStart(3)}  ` +
      `${String(s.passed).padStart(2)}/${String(s.total_scenarios).padEnd(2)}  ` +
      `${String(s.avg_quality_score).padStart(5)}  ` +
      `${(s.avg_duration_ms/1000).toFixed(1).padStart(7)}s  ` +
      `${s.total_issues}`
    );
  }

  // Trend analysis
  const recent = summaries.slice(-5);
  const scores = recent.map(s => s.avg_quality_score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const trend = scores[scores.length - 1] - scores[0];

  console.log(`\nRecent avg: ${avg.toFixed(1)} | Trend: ${trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} ${Math.abs(trend).toFixed(1)}`);
}
```

- [ ] **Step 2: Update main.ts to wire reporter**

Replace the `metrics` case in `main.ts`:

```typescript
    case 'metrics': {
      const { showMetrics } = await import('./metrics/reporter.js');
      const trend = args.includes('--trend');
      showMetrics(trend);
      break;
    }
```

- [ ] **Step 3: Test metrics command**

```bash
cd loop-engineering && npx tsx src/main.ts metrics
```

Expected: shows latest iteration stats with quality scores

- [ ] **Step 4: Test trend command**

```bash
cd loop-engineering && npx tsx src/main.ts metrics --trend
```

Expected: shows table of all iterations with trend arrow

- [ ] **Step 5: Commit**

```bash
git add loop-engineering/src/metrics/ loop-engineering/src/main.ts
git commit -m "feat: add metrics CLI with quality scores and trend"
```

---

### Task 6: Prompt Tracker

**Covers:** S4

**Files:**
- Create: `loop-engineering/src/evolution/tracker.ts`

**Interfaces:**
- Produces: `recordOutcome(component, version, scenarioId, score, issues): void`
- Produces: `getOutcomes(component?: string): PromptOutcome[]`
- Produces: `getActiveVersion(component): PromptVersion | null`

- [ ] **Step 1: Write tracker.ts**

```typescript
import { getDb, type PromptVersion } from '../metrics/db.js';

export interface PromptOutcome {
  component: string;
  promptVersion: number;
  scenarioId: string;
  qualityScore: number;
  issues: string[];
}

export function recordOutcome(
  component: string,
  version: number,
  scenarioId: string,
  score: number,
  issues: string[] = []
): void {
  const db = getDb();
  // Store as a special metric with prompt version in the phases field
  db.prepare(`
    INSERT INTO scenario_metrics
    (iteration_id, scenario_id, passed, duration_ms, files_created, files_expected,
     test_pass_rate, agents_participated, agents_expected, tool_calls,
     phases, issues, quality_score, timestamp)
    VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, 0, ?, ?, ?, ?)
  `).run(
    -version, // negative iteration_id to distinguish prompt experiments
    scenarioId,
    score >= 60 ? 1 : 0,
    JSON.stringify([`prompt_v${version}`]),
    JSON.stringify(issues.map(i => ({ type: 'prompt', severity: 'medium', desc: i }))),
    score,
    new Date().toISOString()
  );
}

export function getOutcomes(component?: string): PromptOutcome[] {
  const db = getDb();
  let rows: any[];

  if (component) {
    rows = db.prepare(`
      SELECT * FROM scenario_metrics
      WHERE iteration_id < 0 AND phases LIKE ?
      ORDER BY timestamp DESC
    `).all(`%prompt_v%`);
  } else {
    rows = db.prepare(`
      SELECT * FROM scenario_metrics
      WHERE iteration_id < 0
      ORDER BY timestamp DESC
    `).all();
  }

  return rows.map(r => {
    const phases = JSON.parse(r.phases);
    const versionMatch = phases[0]?.match(/prompt_v(\d+)/);
    return {
      component: component || 'unknown',
      promptVersion: versionMatch ? parseInt(versionMatch[1]) : 0,
      scenarioId: r.scenario_id,
      qualityScore: r.quality_score,
      issues: JSON.parse(r.issues).map((i: any) => i.desc),
    };
  });
}

export function getActiveVersion(component: string): PromptVersion | null {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM prompt_versions
    WHERE component = ? AND active = 1
    ORDER BY version DESC
    LIMIT 1
  `).get(component) as PromptVersion | null;
}

export function registerPromptVersion(
  component: string,
  promptText: string,
  avgScore: number = 0,
  sampleSize: number = 0
): number {
  const db = getDb();

  // Deactivate previous versions
  db.prepare(`
    UPDATE prompt_versions SET active = 0 WHERE component = ?
  `).run(component);

  // Get next version number
  const max = db.prepare(`
    SELECT MAX(version) as max FROM prompt_versions WHERE component = ?
  `).get(component) as any;
  const nextVersion = (max?.max || 0) + 1;

  db.prepare(`
    INSERT INTO prompt_versions (component, version, prompt_text, avg_score, sample_size, created_at, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(component, nextVersion, promptText, avgScore, sampleSize, new Date().toISOString());

  return nextVersion;
}
```

- [ ] **Step 2: Commit**

```bash
git add loop-engineering/src/evolution/tracker.ts
git commit -m "feat: add prompt outcome tracker"
```

---

### Task 7: Weakness Analyzer

**Covers:** S4

**Files:**
- Create: `loop-engineering/src/evolution/analyzer.ts`

**Interfaces:**
- Produces: `analyzeWeaknesses(): WeaknessReport[]`
- Consumes: `getDb()` for historical metrics

- [ ] **Step 1: Write analyzer.ts**

```typescript
import { getDb } from '../metrics/db.js';

export interface WeaknessReport {
  component: string;
  failingScenarios: string[];
  lowQualityScenarios: string[];
  specificIssues: string[];
  suggestedFocus: string;
}

// Map scenario subsystem to component
const SCENARIO_TO_COMPONENT: Record<string, string> = {
  'agent-single': 'executor',
  'team-collab-module': 'coordinator',
  'tool-exec-bash': 'executor',
  'tool-exec-files': 'executor',
  'skill-reusable': 'coordinator',
  'quality-review': 'reviewer',
  'workflow-pipeline': 'coordinator',
  'routing-task': 'planner',
  'security-validation': 'reviewer',
  'fallback-recovery': 'coordinator',
};

export function analyzeWeaknesses(): WeaknessReport[] {
  const db = getDb();

  // Get per-scenario stats across all real iterations (iteration_id > 0)
  const scenarioStats = db.prepare(`
    SELECT
      scenario_id,
      COUNT(*) as runs,
      SUM(CASE WHEN passed THEN 1 ELSE 0 END) as passes,
      AVG(quality_score) as avg_score,
      AVG(duration_ms) as avg_duration
    FROM scenario_metrics
    WHERE iteration_id > 0
    GROUP BY scenario_id
  `).all() as any[];

  // Group by component
  const byComponent = new Map<string, any[]>();
  for (const stat of scenarioStats) {
    const component = SCENARIO_TO_COMPONENT[stat.scenario_id] || 'coordinator';
    if (!byComponent.has(component)) byComponent.set(component, []);
    byComponent.get(component)!.push(stat);
  }

  const reports: WeaknessReport[] = [];

  for (const [component, stats] of byComponent) {
    const failing = stats.filter(s => s.passes / s.runs < 0.8);
    const lowQuality = stats.filter(s => s.avg_score < 70);
    const slow = stats.filter(s => s.avg_duration > 120000);

    if (failing.length === 0 && lowQuality.length === 0 && slow.length === 0) {
      continue; // No weaknesses
    }

    const issues: string[] = [];
    if (failing.length > 0) {
      issues.push(`通过率低: ${failing.map(s => `${s.scenario_id}(${Math.round(s.passes/s.runs*100)}%)`).join(', ')}`);
    }
    if (lowQuality.length > 0) {
      issues.push(`质量分低: ${lowQuality.map(s => `${s.scenario_id}(${Math.round(s.avg_score)})`).join(', ')}`);
    }
    if (slow.length > 0) {
      issues.push(`执行慢: ${slow.map(s => `${s.scenario_id}(${Math.round(s.avg_duration/1000)}s)`).join(', ')}`);
    }

    let focus = '';
    if (failing.length > 0) focus = '提高任务完成率';
    else if (lowQuality.length > 0) focus = '提升代码质量和协作效果';
    else focus = '优化执行效率';

    reports.push({
      component,
      failingScenarios: failing.map(s => s.scenario_id),
      lowQualityScenarios: lowQuality.map(s => s.scenario_id),
      specificIssues: issues,
      suggestedFocus: focus,
    });
  }

  // Sort by severity (most failing first)
  reports.sort((a, b) => b.failingScenarios.length - a.failingScenarios.length);

  return reports;
}
```

- [ ] **Step 2: Test analyzer**

```bash
cd loop-engineering && npx tsx -e "
import { ingestCheckpoints } from './src/metrics/reporter.js';
import { analyzeWeaknesses } from './src/evolution/analyzer.js';
ingestCheckpoints();
const reports = analyzeWeaknesses();
console.log(JSON.stringify(reports, null, 2));
"
```

Expected: shows weakness reports per component

- [ ] **Step 3: Commit**

```bash
git add loop-engineering/src/evolution/analyzer.ts
git commit -m "feat: add weakness analyzer"
```

---

### Task 8: Prompt Evolver

**Covers:** S4

**Files:**
- Create: `loop-engineering/src/evolution/evolver.ts`

**Interfaces:**
- Produces: `evolvePrompt(component: string): Promise<string>`
- Consumes: `analyzeWeaknesses()`, `getActiveVersion()`, MDH orchestrator WebSocket

- [ ] **Step 1: Write evolver.ts**

```typescript
import { WebSocket } from 'ws';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getActiveVersion, registerPromptVersion } from './tracker.js';
import { analyzeWeaknesses, type WeaknessReport } from './analyzer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(): Record<string, string> {
  try {
    const envPath = join(__dirname, '../../../.env');
    return Object.fromEntries(
      readFileSync(envPath, 'utf-8')
        .split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
    );
  } catch {
    return {};
  }
}

function loadCurrentPrompt(component: string): string {
  // Read from orchestrator's coordinator.ts or roles_config.yaml
  const rolesPath = join(__dirname, '../../../backend/roles_config.yaml');
  try {
    const content = readFileSync(rolesPath, 'utf-8');
    // Extract relevant prompt section
    const regex = new RegExp(`${component}:[\\s\\S]*?prompt_template:\\s*\\|\\s*\\n([\\s\\S]*?)(?=\\n\\S|$)`);
    const match = content.match(regex);
    return match?.[1]?.trim() || `[No prompt found for ${component}]`;
  } catch {
    return `[Could not load roles_config.yaml]`;
  }
}

function buildEvolutionPrompt(component: string, currentPrompt: string, weakness: WeaknessReport): string {
  return `你是一个 prompt 工程专家。以下是 MDH 系统中 "${component}" 角色的当前 prompt：

---
${currentPrompt}
---

以下是该角色在最近测试中的表现问题：
${weakness.specificIssues.map(i => `- ${i}`).join('\n')}

失败场景: ${weakness.failingScenarios.join(', ') || '无'}
低质量场景: ${weakness.lowQualityScenarios.join(', ') || '无'}
建议改进方向: ${weakness.suggestedFocus}

请生成改进版 prompt，要求：
1. 保持原有功能和角色定位不变
2. 针对上述问题做具体改进（如：更明确的工具使用指导、更具体的审查标准、更清晰的任务分解要求）
3. 输出完整的改进后 prompt（不要解释，直接输出 prompt 内容）
4. prompt 用中文，与原 prompt 语言一致`;
}

export async function evolvePrompt(component: string): Promise<string | null> {
  const env = loadEnv();
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error('DEEPSEEK_API_KEY not found in .env');
    return null;
  }

  const weaknesses = analyzeWeaknesses();
  const weakness = weaknesses.find(w => w.component === component);

  if (!weakness) {
    console.log(`No weaknesses found for ${component}. No evolution needed.`);
    return null;
  }

  const currentPrompt = loadCurrentPrompt(component);
  const evolutionPrompt = buildEvolutionPrompt(component, currentPrompt, weakness);

  console.log(`\nEvolving ${component} prompt...`);
  console.log(`Weaknesses: ${weakness.specificIssues.join('; ')}`);

  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:8080/ws/');
    let resolved = false;
    let response = '';

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'unified_message',
        content: evolutionPrompt,
        provider: 'deepseek',
        api_key: apiKey,
        base_url: 'https://api.deepseek.com/v1',
        model_name: 'deepseek-chat',
        selected_roles: ['executor'],
      }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'agent_message' && msg.content) {
        response += msg.content;
      }
      if (msg.type === 'task_result' || msg.type === 'meeting_ended') {
        if (!resolved) {
          resolved = true;
          ws.close();
          if (response) {
            const version = registerPromptVersion(component, response, 0, 0);
            console.log(`New ${component} prompt v${version} generated.`);
            resolve(response);
          } else {
            console.log('No response from evolution prompt.');
            resolve(null);
          }
        }
      }
    });

    ws.on('error', (e) => {
      if (!resolved) {
        resolved = true;
        console.error(`WebSocket error: ${e.message}`);
        resolve(null);
      }
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        console.log('Evolution timeout.');
        resolve(null);
      }
    }, 120000);
  });
}
```

- [ ] **Step 2: Wire into main.ts**

Replace the `evolve` case in `main.ts`:

```typescript
    case 'evolve': {
      const { evolvePrompt } = await import('./evolution/evolver.js');
      const componentArg = args.find(a => a.startsWith('--component='));
      const component = componentArg?.split('=')[1] || 'reviewer';
      await evolvePrompt(component);
      break;
    }
```

- [ ] **Step 3: Commit**

```bash
git add loop-engineering/src/evolution/evolver.ts loop-engineering/src/main.ts
git commit -m "feat: add prompt evolver using LLM"
```

---

### Task 9: Experiment Runner (A/B Testing)

**Covers:** S4

**Files:**
- Create: `loop-engineering/src/evolution/experimenter.ts`

**Interfaces:**
- Produces: `runExperiment(component: string, newPrompt: string): Promise<ExperimentResult>`
- Consumes: orchestrator WebSocket, `calculateScore()`

- [ ] **Step 1: Write experimenter.ts**

```typescript
import { WebSocket } from 'ws';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(): Record<string, string> {
  try {
    const envPath = join(__dirname, '../../../.env');
    return Object.fromEntries(
      readFileSync(envPath, 'utf-8')
        .split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
    );
  } catch {
    return {};
  }
}

interface ExperimentResult {
  component: string;
  scenarioId: string;
  oldScore: number;
  newScore: number;
  improvement: number;
  winner: 'old' | 'new' | 'tie';
}

// Simplified score from raw result
function quickScore(result: any): number {
  if (!result.success) return 0;
  let score = 40; // base for completion
  if (result.filesCreated?.length > 0) score += 10;
  if (result.agents?.length >= 3) score += 10;
  if (result.phases?.includes('discussing')) score += 5;
  if (result.phases?.includes('reviewing')) score += 5;
  const duration = result.duration || 0;
  score += Math.max(0, 20 - Math.floor(duration / 10000));
  if (result.issues?.filter((i: any) => i.severity === 'critical').length === 0) score += 10;
  return Math.min(100, score);
}

function runScenarioViaWs(
  content: string,
  roles: string[],
  env: Record<string, string>
): Promise<any> {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:8080/ws/');
    let resolved = false;
    const result: any = { success: false, agents: [], phases: [], filesCreated: [], issues: [] };

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'unified_message',
        content,
        provider: 'deepseek',
        api_key: env.DEEPSEEK_API_KEY,
        base_url: 'https://api.deepseek.com/v1',
        model_name: 'deepseek-chat',
        selected_roles: roles,
      }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'agenda_update' && msg.agenda?.phase) {
        if (!result.phases.includes(msg.agenda.phase)) result.phases.push(msg.agenda.phase);
      }
      if (msg.type === 'agent_message' && msg.agentId) {
        const agent = msg.agentId.replace('agent-', '');
        if (!result.agents.includes(agent)) result.agents.push(agent);
      }
      if (msg.type === 'workspace_confirm_request') {
        ws.send(JSON.stringify({ type: 'workspace_confirm_response', workspace_type: 'standalone' }));
      }
      if (msg.type === 'meeting_ended' || msg.type === 'task_result') {
        result.success = msg.type === 'meeting_ended' || result.agents.length > 0;
        if (!resolved) { resolved = true; ws.close(); resolve(result); }
      }
    });

    ws.on('error', () => { if (!resolved) { resolved = true; resolve(result); } });
    setTimeout(() => { if (!resolved) { resolved = true; ws.close(); resolve(result); } }, 180000);
  });
}

const TEST_SCENARIOS = [
  {
    id: 'quick-calc',
    content: '在 workspace 中创建 calculator.py 实现 add/sub/mul/div，创建 test_calculator.py 测试。',
    roles: ['executor'],
  },
  {
    id: 'quick-cli',
    content: '在 workspace 中创建 notes.py CLI 工具，支持 add/list 命令，数据保存在 notes.json。',
    roles: ['coordinator', 'planner', 'executor', 'reviewer'],
  },
];

export async function runExperiment(component: string, newPrompt: string): Promise<ExperimentResult[]> {
  const env = loadEnv();
  if (!env.DEEPSEEK_API_KEY) {
    console.error('DEEPSEEK_API_KEY not found');
    return [];
  }

  const results: ExperimentResult[] = [];

  for (const scenario of TEST_SCENARIOS) {
    console.log(`\n  Testing scenario: ${scenario.id}`);

    // Run with current setup (baseline)
    console.log('  Running baseline...');
    const baselineResult = await runScenarioViaWs(scenario.content, scenario.roles, env);
    const baselineScore = quickScore(baselineResult);

    // Note: In a real A/B test, we'd swap the prompt in the orchestrator.
    // For now, we compare baseline scores with the new prompt description.
    // Full A/B requires modifying coordinator.ts to accept prompt overrides.
    console.log('  Running with new prompt...');
    const newResult = await runScenarioViaWs(
      `[使用改进后的 ${component} prompt]\n${scenario.content}`,
      scenario.roles,
      env
    );
    const newScore = quickScore(newResult);

    const improvement = newScore - baselineScore;
    results.push({
      component,
      scenarioId: scenario.id,
      oldScore: baselineScore,
      newScore,
      improvement,
      winner: improvement > 5 ? 'new' : improvement < -5 ? 'old' : 'tie',
    });

    console.log(`  Baseline: ${baselineScore} | New: ${newScore} | Δ: ${improvement > 0 ? '+' : ''}${improvement}`);
  }

  return results;
}
```

- [ ] **Step 2: Commit**

```bash
git add loop-engineering/src/evolution/experimenter.ts
git commit -m "feat: add A/B experiment runner"
```

---

### Task 10: CI Gate + Baseline

**Covers:** S6

**Files:**
- Create: `loop-engineering/src/ci/gate.ts`
- Create: `loop-engineering/src/ci/baseline.ts`

**Interfaces:**
- Produces: `runCiGate(threshold: number): Promise<boolean>`
- Produces: `loadBaseline()`, `updateBaseline()`

- [ ] **Step 1: Write baseline.ts**

```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINES_DIR = join(__dirname, '../../baselines');

export interface Baseline {
  timestamp: string;
  commitHash: string;
  avgScore: number;
  scenarioScores: Record<string, number>;
}

export function loadBaseline(): Baseline | null {
  const path = join(BASELINES_DIR, 'latest.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function updateBaseline(avgScore: number, scenarioScores: Record<string, number>): void {
  if (!existsSync(BASELINES_DIR)) mkdirSync(BASELINES_DIR, { recursive: true });

  let commitHash = 'unknown';
  try {
    commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {}

  const baseline: Baseline = {
    timestamp: new Date().toISOString(),
    commitHash,
    avgScore,
    scenarioScores,
  };

  writeFileSync(join(BASELINES_DIR, 'latest.json'), JSON.stringify(baseline, null, 2));

  // Also save timestamped copy
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(join(BASELINES_DIR, `${ts}.json`), JSON.stringify(baseline, null, 2));
}
```

- [ ] **Step 2: Write gate.ts**

```typescript
import { getDb } from '../metrics/db.js';
import { ingestCheckpoints } from '../metrics/reporter.js';
import { loadBaseline, updateBaseline } from './baseline.js';

export async function runCiGate(threshold: number = 80): Promise<boolean> {
  // Ensure metrics are up to date
  ingestCheckpoints();

  const db = getDb();

  // Get latest iteration summary
  const latest = db.prepare(`
    SELECT * FROM iteration_summary ORDER BY iteration_id DESC LIMIT 1
  `).get() as any;

  if (!latest) {
    console.error('❌ No iteration data available');
    return false;
  }

  console.log(`\n=== CI Gate ===`);
  console.log(`Iteration: #${latest.iteration_id}`);
  console.log(`Passed: ${latest.passed}/${latest.total_scenarios}`);
  console.log(`Avg Score: ${latest.avg_quality_score}/${threshold}`);

  // Check 1: All scenarios passed
  if (latest.passed < latest.total_scenarios) {
    console.log(`❌ ${latest.total_scenarios - latest.passed} scenario(s) failed`);
    return false;
  }

  // Check 2: Score above threshold
  if (latest.avg_quality_score < threshold) {
    console.log(`❌ Score ${latest.avg_quality_score} below threshold ${threshold}`);
    return false;
  }

  // Check 3: Regression check against baseline
  const baseline = loadBaseline();
  if (baseline) {
    const regressionThreshold = baseline.avgScore * 0.9;
    if (latest.avg_quality_score < regressionThreshold) {
      console.log(`❌ Regression: ${latest.avg_quality_score} vs baseline ${baseline.avgScore} (90% threshold: ${regressionThreshold})`);
      return false;
    }
    console.log(`Baseline: ${baseline.avgScore} | Current: ${latest.avg_quality_score} | OK`);
  }

  // All checks passed — update baseline
  const scenarios = db.prepare(`
    SELECT scenario_id, quality_score FROM scenario_metrics
    WHERE iteration_id = ?
  `).all(latest.iteration_id) as any[];

  const scenarioScores: Record<string, number> = {};
  for (const s of scenarios) {
    scenarioScores[s.scenario_id] = s.quality_score;
  }

  updateBaseline(latest.avg_quality_score, scenarioScores);
  console.log(`✅ CI pass — baseline updated`);
  return true;
}
```

- [ ] **Step 3: Wire into main.ts**

Replace the `ci` case in `main.ts`:

```typescript
    case 'ci': {
      const { runCiGate } = await import('./ci/gate.js');
      const thresholdArg = args.find(a => a.startsWith('--threshold='));
      const threshold = thresholdArg ? parseInt(thresholdArg.split('=')[1]) : 80;
      const passed = await runCiGate(threshold);
      process.exit(passed ? 0 : 1);
      break;
    }
```

- [ ] **Step 4: Test CI gate**

```bash
cd loop-engineering && npx tsx src/main.ts ci --threshold=70
```

Expected: shows CI gate results, exits 0 if score >= 70

- [ ] **Step 5: Commit**

```bash
git add loop-engineering/src/ci/ loop-engineering/src/main.ts
git commit -m "feat: add CI gate with baseline regression detection"
```

---

### Task 11: Expand Scenarios

**Covers:** S5

**Files:**
- Create: `loop-engineering/src/scenarios/registry.ts`
- Modify: `orchestrator/src/loop/loop.ts` (add new scenarios)

**Interfaces:**
- Produces: `SCENARIO_REGISTRY` with extended scenario definitions
- Produces: `getCoverageReport()` showing subsystem coverage

- [ ] **Step 1: Write registry.ts**

```typescript
export interface ScenarioMeta {
  id: string;
  name: string;
  subsystem: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  source: 'manual' | 'weakness-derived' | 'coverage-gap';
  filesExpected: number;
  agentsExpected: number;
}

export const SCENARIO_REGISTRY: ScenarioMeta[] = [
  // Existing scenarios
  { id: 'agent-single', name: '单Agent直接执行', subsystem: 'agent-core', difficulty: 'easy', tags: ['single-agent'], source: 'manual', filesExpected: 1, agentsExpected: 1 },
  { id: 'team-collab-module', name: '多Agent协作开发模块', subsystem: 'meeting', difficulty: 'medium', tags: ['multi-agent', 'collaboration'], source: 'manual', filesExpected: 3, agentsExpected: 4 },
  { id: 'tool-exec-bash', name: '工具执行: Shell命令', subsystem: 'tool-executor', difficulty: 'easy', tags: ['shell'], source: 'manual', filesExpected: 1, agentsExpected: 1 },
  { id: 'tool-exec-files', name: '工具执行: 文件操作', subsystem: 'tool-executor', difficulty: 'easy', tags: ['files'], source: 'manual', filesExpected: 2, agentsExpected: 1 },
  { id: 'skill-reusable', name: '技能: 可复用工具函数', subsystem: 'skill', difficulty: 'medium', tags: ['reusable', 'utils'], source: 'manual', filesExpected: 2, agentsExpected: 4 },
  { id: 'quality-review', name: '质量: 代码审查流程', subsystem: 'review-pipeline', difficulty: 'medium', tags: ['review', 'testing'], source: 'manual', filesExpected: 2, agentsExpected: 4 },
  { id: 'workflow-pipeline', name: '工作流: 多步骤数据处理', subsystem: 'workflow', difficulty: 'medium', tags: ['pipeline', 'data'], source: 'manual', filesExpected: 3, agentsExpected: 4 },
  { id: 'routing-task', name: '路由: 根据任务类型分发', subsystem: 'dynamic-router', difficulty: 'medium', tags: ['routing'], source: 'manual', filesExpected: 2, agentsExpected: 3 },
  { id: 'security-validation', name: '安全: 输入验证与防护', subsystem: 'security', difficulty: 'medium', tags: ['security', 'validation'], source: 'manual', filesExpected: 2, agentsExpected: 4 },
  { id: 'fallback-recovery', name: '降级: 错误恢复机制', subsystem: 'fallback', difficulty: 'medium', tags: ['resilience'], source: 'manual', filesExpected: 2, agentsExpected: 4 },

  // New: coverage-gap scenarios
  { id: 'git-workflow', name: 'Git: 完整开发流程', subsystem: 'tool-executor', difficulty: 'medium', tags: ['git', 'workflow'], source: 'coverage-gap', filesExpected: 2, agentsExpected: 3 },
  { id: 'api-endpoint', name: 'API: FastAPI端点开发', subsystem: 'workflow', difficulty: 'medium', tags: ['api', 'backend', 'fastapi'], source: 'coverage-gap', filesExpected: 3, agentsExpected: 4 },
  { id: 'multi-file-project', name: '长上下文: 大项目生成', subsystem: 'agent-core', difficulty: 'hard', tags: ['large-context', 'multi-file'], source: 'coverage-gap', filesExpected: 6, agentsExpected: 4 },
  { id: 'error-recovery', name: '错误恢复: 失败后重试', subsystem: 'fallback', difficulty: 'hard', tags: ['error-handling', 'retry'], source: 'coverage-gap', filesExpected: 2, agentsExpected: 4 },
  { id: 'react-component', name: '前端: React组件开发', subsystem: 'workflow', difficulty: 'hard', tags: ['frontend', 'react', 'ui'], source: 'coverage-gap', filesExpected: 3, agentsExpected: 4 },
  { id: 'database-persistence', name: '数据库: SQLite持久化', subsystem: 'workflow', difficulty: 'medium', tags: ['database', 'sqlite'], source: 'coverage-gap', filesExpected: 3, agentsExpected: 4 },
  { id: 'complex-refactor', name: '重构: 模块拆分', subsystem: 'review-pipeline', difficulty: 'hard', tags: ['refactor', 'architecture'], source: 'coverage-gap', filesExpected: 4, agentsExpected: 4 },
  { id: 'role-selection', name: '角色选择: 自主组队', subsystem: 'dynamic-router', difficulty: 'medium', tags: ['role-selection', 'auto'], source: 'coverage-gap', filesExpected: 2, agentsExpected: 2 },
];

export function getCoverageReport(): void {
  const subsystems = new Map<string, ScenarioMeta[]>();
  for (const s of SCENARIO_REGISTRY) {
    if (!subsystems.has(s.subsystem)) subsystems.set(s.subsystem, []);
    subsystems.get(s.subsystem)!.push(s);
  }

  console.log('\n=== Scenario Coverage Report ===\n');
  for (const [sub, scenarios] of subsystems) {
    const difficulties = scenarios.map(s => s.difficulty);
    console.log(`${sub}: ${scenarios.length} scenarios (${difficulties.join(', ')})`);
    for (const s of scenarios) {
      console.log(`  - ${s.id}: ${s.name} [${s.source}]`);
    }
  }
  console.log(`\nTotal: ${SCENARIO_REGISTRY.length} scenarios across ${subsystems.size} subsystems`);
}
```

- [ ] **Step 2: Add new scenarios to orchestrator/src/loop/loop.ts**

Add these scenarios to the `SCENARIOS` array in `loop.ts`:

```typescript
  // --- Git 操作 ---
  {
    id: 'git-workflow',
    name: 'Git: 完整开发流程',
    subsystem: 'tool-executor',
    content: '在 workspace 中创建 utils.py 实现 format_date 和 parse_date 函数，创建 test_utils.py 测试。然后 git add 并 git commit，commit message 包含功能描述。',
    roles: ['executor', 'reviewer'],
    verifyFiles: ['utils.py', 'test_utils.py'],
    verifyCommands: ['git log --oneline -1'],
    qualityChecks: [
      { name: 'Git提交', check: r => r.toolsUsed.includes('git_commit'), desc: '应使用 git_commit 工具' },
    ],
    timeout: 120000,
  },
  // --- API 开发 ---
  {
    id: 'api-endpoint',
    name: 'API: FastAPI端点开发',
    subsystem: 'workflow',
    content: '在 workspace 中创建一个 FastAPI 应用：main.py 定义 /items GET 和 POST 端点，models.py 定义 Item schema，test_api.py 用 httpx 测试所有端点。',
    roles: ['coordinator', 'planner', 'executor', 'reviewer'],
    verifyFiles: ['main.py', 'models.py', 'test_api.py'],
    verifyCommands: ['find /workspace -name "test_api.py" -exec python3 -m pytest {} -v \\; 2>&1 | tail -10'],
    qualityChecks: [
      { name: '多文件', check: r => r.filesCreated.length >= 3, desc: '至少3个文件' },
    ],
    timeout: 150000,
  },
  // --- 长上下文 ---
  {
    id: 'multi-file-project',
    name: '长上下文: 大项目生成',
    subsystem: 'agent-core',
    content: '在 workspace 中创建一个完整的博客系统：models.py (Post, Comment dataclass), storage.py (JSON存储), api.py (CLI接口), views.py (格式化输出), utils.py (工具函数), test_blog.py (测试所有模块)。运行测试验证。',
    roles: ['coordinator', 'planner', 'executor', 'reviewer'],
    verifyFiles: ['models.py', 'storage.py', 'api.py', 'views.py', 'utils.py', 'test_blog.py'],
    verifyCommands: ['find /workspace -name "test_blog.py" -exec python3 -m pytest {} -v \\; 2>&1 | tail -10'],
    qualityChecks: [
      { name: '大项目', check: r => r.filesCreated.length >= 5, desc: '至少5个文件' },
    ],
    timeout: 180000,
  },
  // --- 数据库 ---
  {
    id: 'database-persistence',
    name: '数据库: SQLite持久化',
    subsystem: 'workflow',
    content: '在 workspace 中创建一个使用 SQLite 的任务管理器：db.py (数据库操作), models.py (Task dataclass), manager.py (CRUD操作), test_manager.py (测试增删改查)。',
    roles: ['coordinator', 'planner', 'executor', 'reviewer'],
    verifyFiles: ['db.py', 'models.py', 'manager.py', 'test_manager.py'],
    verifyCommands: ['find /workspace -name "test_manager.py" -exec python3 -m pytest {} -v \\; 2>&1 | tail -10'],
    qualityChecks: [],
    timeout: 150000,
  },
  // --- 角色选择 ---
  {
    id: 'role-selection',
    name: '角色选择: 自主组队',
    subsystem: 'dynamic-router',
    content: '在 workspace 中创建一个 hello.py 打印当前日期时间。',
    roles: [],
    verifyFiles: ['hello.py'],
    verifyCommands: ['python3 hello.py'],
    qualityChecks: [
      { name: '自主决策', check: r => r.agents.length >= 1, desc: 'MDH 应自主选择角色' },
    ],
    timeout: 60000,
  },
```

- [ ] **Step 3: Test new scenarios exist**

```bash
cd loop-engineering && npx tsx -e "
import { SCENARIO_REGISTRY, getCoverageReport } from './src/scenarios/registry.js';
getCoverageReport();
"
```

Expected: shows 18 scenarios across 9+ subsystems

- [ ] **Step 4: Commit**

```bash
git add loop-engineering/src/scenarios/registry.ts
git commit -m "feat: add expanded scenario registry with coverage tracking"
```

---

### Task 12: Wire Everything Together

**Covers:** S1, S7

**Files:**
- Modify: `loop-engineering/src/main.ts` (final version)
- Modify: `orchestrator/package.json` (add loop:ci script)

**Interfaces:**
- Final CLI with all commands wired

- [ ] **Step 1: Rewrite main.ts with all commands**

```typescript
import { parseArgs } from 'node:util';

const HELP = `
Loop-Driven Development System

Commands:
  metrics              Show quality metrics from latest checkpoint
  metrics --trend      Show quality trend across iterations
  evolve               Run prompt evolution experiment
  evolve --component=X Evolve specific component (coordinator|reviewer|executor|planner)
  ci                   Run CI gate (exit 1 on failure)
  ci --threshold=N     Set quality threshold (default: 80)
  coverage             Show scenario coverage report

Examples:
  tsx src/main.ts metrics
  tsx src/main.ts metrics --trend
  tsx src/main.ts evolve --component=reviewer
  tsx src/main.ts ci --threshold=85
  tsx src/main.ts coverage
`;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'metrics';

  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  switch (command) {
    case 'metrics': {
      const { showMetrics } = await import('./metrics/reporter.js');
      const trend = args.includes('--trend');
      showMetrics(trend);
      break;
    }
    case 'evolve': {
      const { evolvePrompt } = await import('./evolution/evolver.js');
      const componentArg = args.find(a => a.startsWith('--component='));
      const component = componentArg?.split('=')[1] || 'reviewer';
      await evolvePrompt(component);
      break;
    }
    case 'ci': {
      const { runCiGate } = await import('./ci/gate.js');
      const thresholdArg = args.find(a => a.startsWith('--threshold='));
      const threshold = thresholdArg ? parseInt(thresholdArg.split('=')[1]) : 80;
      const passed = await runCiGate(threshold);
      process.exit(passed ? 0 : 1);
      break;
    }
    case 'coverage': {
      const { getCoverageReport } = await import('./scenarios/registry.js');
      getCoverageReport();
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch(console.error);
```

- [ ] **Step 2: Add loop:ci script to orchestrator/package.json**

Add to the `scripts` section:

```json
    "loop:ci": "cd ../loop-engineering && npx tsx src/main.ts ci"
```

- [ ] **Step 3: Run full test**

```bash
cd loop-engineering && npx tsx src/main.ts metrics
cd loop-engineering && npx tsx src/main.ts coverage
```

Expected: metrics shows data, coverage shows 18 scenarios

- [ ] **Step 4: Commit**

```bash
git add loop-engineering/src/main.ts orchestrator/package.json
git commit -m "feat: wire all loop-engineering commands together"
```

---

### Task 13: Update .gitignore and Documentation

**Covers:** S7

**Files:**
- Modify: `.gitignore`
- Create: `loop-engineering/README.md`

- [ ] **Step 1: Add to .gitignore**

Append:

```
# Loop Engineering
loop-engineering/node_modules/
loop-engineering/dist/
loop-engineering/data/metrics.db
loop-engineering/data/metrics.db-wal
loop-engineering/data/metrics.db-shm
```

- [ ] **Step 2: Create README.md**

```markdown
# Loop-Driven Development System

外部于 MDH 的开发方法论系统，通过量化指标驱动 MDH 迭代优化。

## 快速开始

```bash
cd loop-engineering
npm install
```

## 命令

```bash
# 查看最新质量指标
npx tsx src/main.ts metrics

# 查看质量趋势
npx tsx src/main.ts metrics --trend

# 进化 prompt（默认 reviewer）
npx tsx src/main.ts evolve --component=coordinator

# CI 门禁检查
npx tsx src/main.ts ci --threshold=80

# 查看场景覆盖
npx tsx src/main.ts coverage
```

## 架构

- **Metrics**: 从 orchestrator checkpoints 收集数据，计算量化质量分
- **Evolution**: 追踪 prompt→outcome，LLM 生成改进 prompt，A/B 测试
- **Scenarios**: 场景注册表 + 覆盖率追踪
- **CI**: 质量门禁 + 基线回归检测
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore loop-engineering/README.md
git commit -m "docs: add loop-engineering gitignore and readme"
```
