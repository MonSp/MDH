import { ScenarioMetric, IterationSummary } from "./db.js";

interface Issue {
  type?: string;
  severity?: string;
  desc?: string;
}

function parseIssues(issuesJson: string): Issue[] {
  try {
    return JSON.parse(issuesJson) as Issue[];
  } catch {
    return [];
  }
}

function parsePhases(phasesJson: string): string[] {
  try {
    return JSON.parse(phasesJson) as string[];
  } catch {
    return [];
  }
}

export function calculateScore(
  metric: Omit<ScenarioMetric, "quality_score">
): number {
  const fileRate =
    metric.files_expected > 0
      ? metric.files_created / metric.files_expected
      : 0;
  const completion = fileRate * 20 + metric.test_pass_rate * 20;

  const efficiency = Math.max(0, 20 - Math.floor(metric.duration_ms / 10000));

  const agentRate =
    metric.agents_expected > 0
      ? metric.agents_participated / metric.agents_expected
      : 0;
  const phases = parsePhases(metric.phases);
  const hasDiscussion = phases.includes("discussing") ? 5 : 0;
  const hasReview = phases.includes("reviewing") ? 5 : 0;
  const collaboration = agentRate * 10 + hasDiscussion + hasReview;

  const issues = parseIssues(metric.issues);
  const hasNoCritical = issues.some((i) => i.severity === "critical") ? 0 : 10;
  const hasNoHigh = issues.some((i) => i.severity === "high") ? 0 : 10;
  const codeQuality = hasNoCritical + hasNoHigh;

  const total = completion + efficiency + collaboration + codeQuality;
  return Math.min(100, Math.max(0, Math.round(total)));
}

export function calculateIterationSummary(
  metrics: ScenarioMetric[],
  iterationId: string
): IterationSummary {
  const avgQuality =
    metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.quality_score, 0) / metrics.length
      : 0;
  const avgDuration =
    metrics.length > 0
      ? metrics.reduce((sum, m) => sum + m.duration_ms, 0) / metrics.length
      : 0;

  const allIssues = metrics.flatMap((m) => parseIssues(m.issues));
  const issuesBySeverity: Record<string, number> = {};
  for (const issue of allIssues) {
    const sev = issue.severity ?? "unknown";
    issuesBySeverity[sev] = (issuesBySeverity[sev] ?? 0) + 1;
  }

  const passed = metrics.filter((m) => m.passed).length;

  return {
    iteration_id: iterationId,
    total_scenarios: metrics.length,
    passed,
    avg_duration_ms: Math.round(avgDuration),
    avg_quality_score: Math.round(avgQuality * 100) / 100,
    total_issues: allIssues.length,
    issues_by_severity: JSON.stringify(issuesBySeverity),
    timestamp: new Date().toISOString(),
  };
}
