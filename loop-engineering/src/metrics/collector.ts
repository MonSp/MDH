import { readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { ScenarioMetric } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHECKPOINTS_DIR = join(__dirname, "../../../orchestrator/checkpoints");

const SCENARIO_META: Record<string, { filesExpected: number; agentsExpected: number }> = {
  "agent-single": { filesExpected: 1, agentsExpected: 1 },
  "team-collab-module": { filesExpected: 3, agentsExpected: 4 },
  "tool-exec-bash": { filesExpected: 1, agentsExpected: 1 },
  "tool-exec-files": { filesExpected: 2, agentsExpected: 1 },
  "skill-reusable": { filesExpected: 2, agentsExpected: 4 },
  "quality-review": { filesExpected: 2, agentsExpected: 4 },
  "workflow-pipeline": { filesExpected: 3, agentsExpected: 4 },
  "routing-task": { filesExpected: 2, agentsExpected: 3 },
  "security-validation": { filesExpected: 2, agentsExpected: 4 },
  "fallback-recovery": { filesExpected: 2, agentsExpected: 4 },
  "git-workflow": { filesExpected: 2, agentsExpected: 1 },
  "api-endpoint": { filesExpected: 3, agentsExpected: 4 },
  "multi-file-project": { filesExpected: 6, agentsExpected: 4 },
  "database-persistence": { filesExpected: 3, agentsExpected: 4 },
  "role-selection": { filesExpected: 2, agentsExpected: 2 },
  "error-handling-complex": { filesExpected: 2, agentsExpected: 4 },
  "multi-module-integration": { filesExpected: 4, agentsExpected: 4 },
  "performance-optimization": { filesExpected: 3, agentsExpected: 4 },
  "security-audit": { filesExpected: 3, agentsExpected: 4 },
  "frontend-react": { filesExpected: 4, agentsExpected: 4 },
  "database-sqlite": { filesExpected: 4, agentsExpected: 4 },
  "api-rest": { filesExpected: 3, agentsExpected: 4 },
  "refactor-complex": { filesExpected: 3, agentsExpected: 4 },
};

interface CheckpointResult {
  scenarioId: string;
  success: boolean;
  duration: number;
  phases: string[];
  agents: string[];
  toolsUsed?: string[];
  filesCreated?: string[];
  testOutput?: string;
  issues?: string[];
}

interface CheckpointFile {
  iterationId: number;
  timestamp: string;
  passed: number;
  total: number;
  issues: unknown[];
  results: CheckpointResult[];
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

export function collectFromCheckpoints(): ScenarioMetric[] {
  const files = readdirSync(CHECKPOINTS_DIR)
    .filter((f) => /^iteration-\d+\.json$/.test(f))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)![0], 10);
      const numB = parseInt(b.match(/\d+/)![0], 10);
      return numA - numB;
    });

  const metrics: ScenarioMetric[] = [];

  for (const file of files) {
    const checkpoint = readJsonFile<CheckpointFile>(join(CHECKPOINTS_DIR, file));

    for (const result of checkpoint.results) {
      const meta = SCENARIO_META[result.scenarioId] ?? { filesExpected: 0, agentsExpected: 0 };

      metrics.push({
        iteration_id: String(checkpoint.iterationId),
        scenario_id: result.scenarioId,
        passed: result.success,
        duration_ms: result.duration,
        files_created: result.filesCreated?.length ?? 0,
        files_expected: meta.filesExpected,
        test_pass_rate: result.success ? 1.0 : 0.0,
        agents_participated: result.agents.length,
        agents_expected: meta.agentsExpected,
        tool_calls: result.toolsUsed?.length ?? 0,
        phases: JSON.stringify(result.phases),
        issues: JSON.stringify(result.issues ?? []),
        quality_score: 0,
        timestamp: checkpoint.timestamp,
      });
    }
  }

  return metrics;
}

export function getLatestCheckpoint(): CheckpointFile {
  return readJsonFile<CheckpointFile>(join(CHECKPOINTS_DIR, "latest.json"));
}
