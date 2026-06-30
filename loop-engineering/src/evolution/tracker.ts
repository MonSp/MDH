import { getDb, PromptVersion } from "../metrics/db.js";

export interface PromptOutcome {
  component: string;
  promptVersion: string;
  scenarioId: string;
  qualityScore: number;
  issues: string[];
}

/**
 * Record a prompt experiment outcome in scenario_metrics using a negative iteration_id
 * to distinguish it from real loop iterations.
 */
export function recordOutcome(
  component: string,
  version: string,
  scenarioId: string,
  score: number,
  issues: string[],
): void {
  const db = getDb();
  const versionRow = db
    .prepare(
      "SELECT id FROM prompt_versions WHERE component = ? AND version = ?",
    )
    .get(component, version) as { id: number } | undefined;

  if (!versionRow) {
    throw new Error(
      `No prompt version found for component="${component}" version="${version}"`,
    );
  }

  // Negative iteration_id encodes the prompt version id
  const iterationId = String(-versionRow.id);

  db.prepare(
    `INSERT INTO scenario_metrics
       (iteration_id, scenario_id, passed, duration_ms, files_created, files_expected,
        test_pass_rate, agents_participated, agents_expected, tool_calls,
        phases, issues, quality_score, timestamp)
     VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, '[]', ?, ?, ?)`,
  ).run(iterationId, scenarioId, JSON.stringify(issues), score, new Date().toISOString());
}

/**
 * Retrieve prompt outcomes. Filters by component when provided.
 * Only returns rows whose iteration_id is negative (prompt experiments).
 */
export function getOutcomes(component?: string): PromptOutcome[] {
  const db = getDb();

  let rows: {
    iteration_id: string;
    scenario_id: string;
    quality_score: number;
    issues: string;
    component: string;
    version: string;
  }[];

  if (component) {
    rows = db
      .prepare(
        `SELECT sm.iteration_id, sm.scenario_id, sm.quality_score, sm.issues,
                pv.component, pv.version
         FROM scenario_metrics sm
         JOIN prompt_versions pv ON pv.id = -CAST(sm.iteration_id AS INTEGER)
         WHERE sm.iteration_id < '0' AND pv.component = ?`,
      )
      .all(component) as typeof rows;
  } else {
    rows = db
      .prepare(
        `SELECT sm.iteration_id, sm.scenario_id, sm.quality_score, sm.issues,
                pv.component, pv.version
         FROM scenario_metrics sm
         JOIN prompt_versions pv ON pv.id = -CAST(sm.iteration_id AS INTEGER)
         WHERE sm.iteration_id < '0'`,
      )
      .all() as typeof rows;
  }

  return rows.map((r) => ({
    component: r.component,
    promptVersion: r.version,
    scenarioId: r.scenario_id,
    qualityScore: r.quality_score,
    issues: JSON.parse(r.issues) as string[],
  }));
}

/**
 * Get the currently active prompt version for a component, or null if none.
 */
export function getActiveVersion(component: string): PromptVersion | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT * FROM prompt_versions WHERE component = ? AND active = 1 LIMIT 1",
    )
    .get(component) as PromptVersion | undefined;
  return row ?? null;
}

/**
 * Register a new prompt version for a component.
 * Deactivates the current active version and returns the new version number.
 */
export function registerPromptVersion(
  component: string,
  promptText: string,
  avgScore: number = 0,
  sampleSize: number = 0,
): number {
  const db = getDb();

  // Determine next version number
  const maxRow = db
    .prepare(
      "SELECT MAX(CAST(version AS INTEGER)) AS max_ver FROM prompt_versions WHERE component = ?",
    )
    .get(component) as { max_ver: number | null };
  const nextVersion = (maxRow.max_ver ?? 0) + 1;

  // Deactivate current active version
  db.prepare(
    "UPDATE prompt_versions SET active = 0 WHERE component = ? AND active = 1",
  ).run(component);

  // Insert new active version
  db.prepare(
    `INSERT INTO prompt_versions (component, version, prompt_text, avg_score, sample_size, created_at, active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
  ).run(component, String(nextVersion), promptText, avgScore, sampleSize, new Date().toISOString());

  return nextVersion;
}
