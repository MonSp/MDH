import { getDb, initDb, ScenarioMetric, IterationSummary } from "./db.js";
import { collectFromCheckpoints } from "./collector.js";
import { calculateScore, calculateIterationSummary } from "./calculator.js";

export function ingestCheckpoints(): void {
  const db = getDb();
  initDb(db);

  const existing = new Set<string>(
    db
      .prepare("SELECT DISTINCT iteration_id FROM scenario_metrics")
      .all()
      .map((row: any) => row.iteration_id)
  );

  const metrics = collectFromCheckpoints();

  const insertScenario = db.prepare(`
    INSERT INTO scenario_metrics
      (iteration_id, scenario_id, passed, duration_ms, files_created, files_expected,
       test_pass_rate, agents_participated, agents_expected, tool_calls, phases, issues,
       quality_score, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSummary = db.prepare(`
    INSERT OR IGNORE INTO iteration_summaries
      (iteration_id, total_scenarios, passed, avg_duration_ms, avg_quality_score,
       total_issues, issues_by_severity, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const byIteration = new Map<string, ScenarioMetric[]>();
  for (const m of metrics) {
    if (!byIteration.has(m.iteration_id)) byIteration.set(m.iteration_id, []);
    byIteration.get(m.iteration_id)!.push(m);
  }

  for (const [iterationId, iterMetrics] of byIteration) {
    if (existing.has(iterationId)) continue;

    const scored = iterMetrics.map((m) => ({
      ...m,
      quality_score: calculateScore(m),
    }));

    const summary = calculateIterationSummary(scored, iterationId);

    const tx = db.transaction(() => {
      for (const m of scored) {
        insertScenario.run(
          m.iteration_id, m.scenario_id, m.passed ? 1 : 0, m.duration_ms,
          m.files_created, m.files_expected, m.test_pass_rate,
          m.agents_participated, m.agents_expected, m.tool_calls,
          m.phases, m.issues, m.quality_score, m.timestamp
        );
      }
      insertSummary.run(
        summary.iteration_id, summary.total_scenarios, summary.passed,
        summary.avg_duration_ms, summary.avg_quality_score,
        summary.total_issues, summary.issues_by_severity, summary.timestamp
      );
    });
    tx();
  }
}

function showLatest(db: ReturnType<typeof getDb>): void {
  const latest = db
    .prepare("SELECT * FROM iteration_summaries ORDER BY CAST(iteration_id AS INTEGER) DESC LIMIT 1")
    .get() as IterationSummary | undefined;

  if (!latest) {
    console.log("No metrics data found.");
    return;
  }

  console.log(`\nIteration ${latest.iteration_id} — Latest Stats`);
  console.log("─".repeat(50));
  console.log(`Passed:          ${latest.passed}/${latest.total_scenarios}`);
  console.log(`Avg Quality:     ${latest.avg_quality_score}`);
  console.log(`Avg Duration:    ${latest.avg_duration_ms}ms`);
  console.log(`Total Issues:    ${latest.total_issues}`);

  const sev = JSON.parse(latest.issues_by_severity) as Record<string, number>;
  if (Object.keys(sev).length > 0) {
    console.log(`Issues by Sev:   ${Object.entries(sev).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }

  const scenarios = db
    .prepare("SELECT * FROM scenario_metrics WHERE iteration_id = ?")
    .all(latest.iteration_id) as ScenarioMetric[];

  if (scenarios.length > 0) {
    console.log(`\nPer-Scenario Breakdown:`);
    console.log("─".repeat(70));
    console.log(
      "Scenario".padEnd(28) +
      "Pass".padEnd(6) +
      "Score".padEnd(8) +
      "Duration".padEnd(12) +
      "Files".padEnd(8) +
      "Agents"
    );
    console.log("─".repeat(70));
    for (const s of scenarios) {
      console.log(
        s.scenario_id.padEnd(28) +
        (s.passed ? "✓" : "✗").padEnd(6) +
        String(s.quality_score).padEnd(8) +
        `${s.duration_ms}ms`.padEnd(12) +
        `${s.files_created}/${s.files_expected}`.padEnd(8) +
        `${s.agents_participated}/${s.agents_expected}`
      );
    }
  }
}

function showTrend(db: ReturnType<typeof getDb>): void {
  const summaries = db
    .prepare("SELECT * FROM iteration_summaries ORDER BY CAST(iteration_id AS INTEGER)")
    .all() as IterationSummary[];

  if (summaries.length === 0) {
    console.log("No metrics data found.");
    return;
  }

  console.log("\nQuality Trend");
  console.log("─".repeat(70));
  console.log(
    "Iter".padEnd(8) +
    "Passed".padEnd(10) +
    "Avg Score".padEnd(12) +
    "Avg Dur".padEnd(14) +
    "Issues".padEnd(10) +
    "Trend"
  );
  console.log("─".repeat(70));

  let prevScore: number | null = null;
  for (const s of summaries) {
    let arrow = "→";
    if (prevScore !== null) {
      if (s.avg_quality_score > prevScore) arrow = "↑";
      else if (s.avg_quality_score < prevScore) arrow = "↓";
    }

    console.log(
      s.iteration_id.padEnd(8) +
      `${s.passed}/${s.total_scenarios}`.padEnd(10) +
      String(s.avg_quality_score).padEnd(12) +
      `${s.avg_duration_ms}ms`.padEnd(14) +
      String(s.total_issues).padEnd(10) +
      arrow
    );
    prevScore = s.avg_quality_score;
  }
}

export function showMetrics(trend: boolean): void {
  ingestCheckpoints();
  const db = getDb();

  if (trend) {
    showTrend(db);
  } else {
    showLatest(db);
  }
}
