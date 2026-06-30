import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "../../data/metrics.db");

export interface ScenarioMetric {
  id?: number;
  iteration_id: string;
  scenario_id: string;
  passed: boolean;
  duration_ms: number;
  files_created: number;
  files_expected: number;
  test_pass_rate: number;
  agents_participated: number;
  agents_expected: number;
  tool_calls: number;
  phases: string; // JSON string
  issues: string; // JSON string
  tools_used: string; // JSON string array
  quality_score: number;
  timestamp: string;
}

export interface IterationSummary {
  id?: number;
  iteration_id: string;
  total_scenarios: number;
  passed: number;
  avg_duration_ms: number;
  avg_quality_score: number;
  total_issues: number;
  issues_by_severity: string; // JSON string
  timestamp: string;
}

export interface PromptVersion {
  id?: number;
  component: string;
  version: string;
  prompt_text: string;
  avg_score: number;
  sample_size: number;
  created_at: string;
  active: boolean;
}

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!dbInstance) {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    dbInstance = new Database(DB_PATH);
    dbInstance.pragma("journal_mode = WAL");
  }
  return dbInstance;
}

export function initDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scenario_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      iteration_id TEXT NOT NULL,
      scenario_id TEXT NOT NULL,
      passed INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      files_created INTEGER NOT NULL,
      files_expected INTEGER NOT NULL,
      test_pass_rate REAL NOT NULL,
      agents_participated INTEGER NOT NULL,
      agents_expected INTEGER NOT NULL,
      tool_calls INTEGER NOT NULL,
      phases TEXT NOT NULL,
      issues TEXT NOT NULL,
      tools_used TEXT NOT NULL DEFAULT '[]',
      quality_score REAL NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_scenario_metrics_iteration
      ON scenario_metrics(iteration_id);
    CREATE INDEX IF NOT EXISTS idx_scenario_metrics_scenario
      ON scenario_metrics(scenario_id);
    CREATE INDEX IF NOT EXISTS idx_scenario_metrics_timestamp
      ON scenario_metrics(timestamp);

    CREATE TABLE IF NOT EXISTS iteration_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      iteration_id TEXT NOT NULL UNIQUE,
      total_scenarios INTEGER NOT NULL,
      passed INTEGER NOT NULL,
      avg_duration_ms REAL NOT NULL,
      avg_quality_score REAL NOT NULL,
      total_issues INTEGER NOT NULL,
      issues_by_severity TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_iteration_summaries_timestamp
      ON iteration_summaries(timestamp);

    CREATE TABLE IF NOT EXISTS prompt_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      component TEXT NOT NULL,
      version TEXT NOT NULL,
      prompt_text TEXT NOT NULL,
      avg_score REAL NOT NULL DEFAULT 0,
      sample_size INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_prompt_versions_component
      ON prompt_versions(component);
    CREATE INDEX IF NOT EXISTS idx_prompt_versions_active
      ON prompt_versions(active);
  `);
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
