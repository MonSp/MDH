import { getDb } from "../metrics/db.js";

export interface WeaknessReport {
  component: string;
  failingScenarios: string[];
  lowQualityScenarios: string[];
  slowScenarios: string[];
  specificIssues: string[];
  suggestedFocus: string;
}

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

interface ScenarioStats {
  scenarioId: string;
  component: string;
  passRate: number;
  avgScore: number;
  avgDurationMs: number;
  totalRuns: number;
}

export function analyzeWeaknesses(): WeaknessReport[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT
      scenario_id,
      COUNT(*) as total_runs,
      AVG(CAST(passed AS REAL)) as pass_rate,
      AVG(quality_score) as avg_score,
      AVG(duration_ms) as avg_duration_ms
    FROM scenario_metrics
    WHERE CAST(iteration_id AS INTEGER) > 0
    GROUP BY scenario_id
  `).all() as {
    scenario_id: string;
    total_runs: number;
    pass_rate: number;
    avg_score: number;
    avg_duration_ms: number;
  }[];

  const stats: ScenarioStats[] = rows.map(r => ({
    scenarioId: r.scenario_id,
    component: SCENARIO_TO_COMPONENT[r.scenario_id] ?? 'unknown',
    passRate: r.pass_rate,
    avgScore: r.avg_score,
    avgDurationMs: r.avg_duration_ms,
    totalRuns: r.total_runs,
  }));

  const byComponent = new Map<string, ScenarioStats[]>();
  for (const s of stats) {
    if (!byComponent.has(s.component)) byComponent.set(s.component, []);
    byComponent.get(s.component)!.push(s);
  }

  const reports: WeaknessReport[] = [];

  for (const [component, scenarios] of byComponent) {
    const failingScenarios: string[] = [];
    const lowQualityScenarios: string[] = [];
    const slowScenarios: string[] = [];
    const specificIssues: string[] = [];

    for (const s of scenarios) {
      if (s.passRate < 0.8) {
        failingScenarios.push(s.scenarioId);
        specificIssues.push(`${s.scenarioId}: pass rate ${(s.passRate * 100).toFixed(0)}%`);
      }
      if (s.avgScore < 70) {
        lowQualityScenarios.push(s.scenarioId);
        specificIssues.push(`${s.scenarioId}: avg quality ${s.avgScore.toFixed(1)}`);
      }
      if (s.avgDurationMs > 120000) {
        slowScenarios.push(s.scenarioId);
        specificIssues.push(`${s.scenarioId}: avg duration ${(s.avgDurationMs / 1000).toFixed(0)}s`);
      }
    }

    if (failingScenarios.length === 0 && lowQualityScenarios.length === 0 && slowScenarios.length === 0) {
      continue;
    }

    const focusAreas: string[] = [];
    if (failingScenarios.length > 0) focusAreas.push('reliability');
    if (lowQualityScenarios.length > 0) focusAreas.push('quality');
    if (slowScenarios.length > 0) focusAreas.push('performance');

    reports.push({
      component,
      failingScenarios,
      lowQualityScenarios,
      slowScenarios,
      specificIssues,
      suggestedFocus: focusAreas.join(', '),
    });
  }

  return reports;
}
