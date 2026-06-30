import { getDb, initDb, ScenarioMetric, IterationSummary } from "../metrics/db.js";
import { ingestCheckpoints } from "../metrics/reporter.js";
import { loadBaseline, updateBaseline } from "./baseline.js";

export async function runCiGate(threshold: number): Promise<boolean> {
  ingestCheckpoints();

  const db = getDb();
  initDb(db);

  const latest = db
    .prepare("SELECT * FROM iteration_summaries ORDER BY CAST(iteration_id AS INTEGER) DESC LIMIT 1")
    .get() as IterationSummary | undefined;

  if (!latest) {
    console.error("[ci] No iteration data found after ingestion.");
    return false;
  }

  const scenarios = db
    .prepare("SELECT * FROM scenario_metrics WHERE iteration_id = ?")
    .all(latest.iteration_id) as ScenarioMetric[];

  console.log(`\n[ci] Checking iteration ${latest.iteration_id} (${scenarios.length} scenarios)`);

  // Hard gate: no critical issues
  const allIssues = scenarios.flatMap((s) => {
    try {
      return JSON.parse(s.issues) as { severity?: string }[];
    } catch {
      return [];
    }
  });
  const criticalCount = allIssues.filter((i) => i.severity === "critical").length;
  if (criticalCount > 0) {
    console.error(`[ci] FAIL — ${criticalCount} critical issue(s) found`);
    return false;
  }
  console.log("[ci] Hard gate: no critical issues ✓");

  // Soft gate: score >= threshold
  if (latest.avg_quality_score < threshold) {
    console.error(`[ci] FAIL — score ${latest.avg_quality_score} < threshold ${threshold}`);
    return false;
  }
  console.log(`[ci] Soft gate: score ${latest.avg_quality_score} >= ${threshold} ✓`);

  // Regression gate: >= 90% of baseline
  const baseline = loadBaseline();
  if (baseline) {
    const regressionThreshold = baseline.avgScore * 0.9;
    if (latest.avg_quality_score < regressionThreshold) {
      console.error(
        `[ci] FAIL — regression: ${latest.avg_quality_score} < 90% of baseline ${baseline.avgScore} (${regressionThreshold.toFixed(1)})`
      );
      return false;
    }
    console.log(`[ci] Regression gate: ${latest.avg_quality_score} >= ${regressionThreshold.toFixed(1)} ✓`);
  } else {
    console.log("[ci] Regression gate: no baseline (first run) — skipped");
  }

  // All scenarios must pass
  const failedScenarios = scenarios.filter((s) => !s.passed);
  if (failedScenarios.length > 0) {
    console.error(
      `[ci] FAIL — ${failedScenarios.length} scenario(s) failed: ${failedScenarios.map((s) => s.scenario_id).join(", ")}`
    );
    return false;
  }
  console.log("[ci] All scenarios passed ✓");

  // Update baseline on pass
  const scenarioScores: Record<string, number> = {};
  for (const s of scenarios) {
    scenarioScores[s.scenario_id] = s.quality_score;
  }
  updateBaseline(latest.avg_quality_score, scenarioScores);
  console.log("[ci] Baseline updated ✓");

  console.log("\n[ci] PASSED — all gates cleared");
  return true;
}
