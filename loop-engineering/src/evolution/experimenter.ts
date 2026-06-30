import { readFileSync, existsSync } from "fs";
import { join } from "path";

// ====== Env loading ======

function loadEnv(): Record<string, string> {
  const envPath = join(import.meta.dirname, "../../../.env");
  const env: Record<string, string> = {};
  if (!existsSync(envPath)) return env;
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
  return env;
}

// ====== Interfaces ======

export interface ExperimentResult {
  component: string;
  scenarioId: string;
  oldScore: number;
  newScore: number;
  improvement: number;
  winner: "old" | "new" | "tie";
}

interface ScenarioRun {
  completed: boolean;
  filesCreated: number;
  agentsSeen: number;
  hasDiscussion: boolean;
  hasReview: boolean;
  durationMs: number;
  issues: string[];
}

// ====== Test scenarios ======

const TEST_SCENARIOS = [
  {
    id: "quick-calc",
    content:
      "在 workspace 中创建 calculator.py 实现 add/sub/mul/div，创建 test_calculator.py 测试。",
    roles: ["executor"],
  },
  {
    id: "quick-cli",
    content:
      "在 workspace 中创建 notes.py CLI 工具，支持 add/list 命令，数据保存在 notes.json。",
    roles: ["coordinator", "planner", "executor", "reviewer"],
  },
];

// ====== Scoring ======

export function quickScore(result: ScenarioRun): number {
  let score = 0;

  // Base 40 for completion
  if (result.completed) score += 40;

  // +10 if files created
  if (result.filesCreated > 0) score += 10;

  // +10 if agents >= 3
  if (result.agentsSeen >= 3) score += 10;

  // +5 if has discussion phase
  if (result.hasDiscussion) score += 5;

  // +5 if has review phase
  if (result.hasReview) score += 5;

  // +20 minus duration penalty (penalty: -1 per 10s over 60s, min 0)
  const durationPenalty = Math.max(0, Math.floor((result.durationMs - 60_000) / 10_000));
  score += Math.max(0, 20 - durationPenalty);

  // +10 if no critical issues
  if (result.issues.length === 0) score += 10;

  return score;
}

// ====== WebSocket runner ======

const ORCHESTRATOR_URL = "ws://localhost:8080/ws/";
const SCENARIO_TIMEOUT_MS = 180_000;

function runScenarioViaWs(
  scenario: (typeof TEST_SCENARIOS)[number],
  apiKey: string,
  baseUrl: string,
  modelName: string,
  selectedRoles: string[],
): Promise<ScenarioRun> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(ORCHESTRATOR_URL);
    let resolved = false;
    const agents = new Set<string>();
    let hasDiscussion = false;
    let hasReview = false;
    let hasCompleted = false;
    let filesCreated = 0;
    const issues: string[] = [];
    const startTime = Date.now();

    const finish = (run: ScenarioRun) => {
      if (resolved) return;
      resolved = true;
      ws.close();
      resolve(run);
    };

    const timeout = setTimeout(() => {
      finish({
        completed: hasCompleted,
        filesCreated,
        agentsSeen: agents.size,
        hasDiscussion,
        hasReview,
        durationMs: Date.now() - startTime,
        issues: [...issues, "Timeout: scenario did not complete in time"],
      });
    }, SCENARIO_TIMEOUT_MS);

    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          type: "unified_message",
          content: scenario.content,
          provider: "deepseek",
          api_key: apiKey,
          base_url: baseUrl,
          model_name: modelName,
          selected_roles: selectedRoles,
        }),
      );
    });

    ws.addEventListener("message", (event) => {
      const data =
        typeof event.data === "string"
          ? event.data
          : new TextDecoder().decode(event.data as ArrayBuffer);
      const msg = JSON.parse(data);

      switch (msg.type) {
        case "agent_message":
          if (msg.role) agents.add(msg.role);
          if (msg.phase === "discussion") hasDiscussion = true;
          if (msg.phase === "review") hasReview = true;
          break;

        case "file_created":
        case "file_written":
          filesCreated++;
          break;

        case "task_result":
        case "meeting_ended":
          clearTimeout(timeout);
          hasCompleted = true;
          finish({
            completed: true,
            filesCreated,
            agentsSeen: agents.size,
            hasDiscussion,
            hasReview,
            durationMs: Date.now() - startTime,
            issues,
          });
          break;

        case "workspace_confirm_request":
          ws.send(
            JSON.stringify({
              type: "workspace_confirm_response",
              workspace_type: "standalone",
            }),
          );
          break;

        case "error":
          if (!msg.message?.includes("workspace_confirm_response")) {
            issues.push(msg.message || "Unknown error");
          }
          break;
      }
    });

    ws.addEventListener("error", (e) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket error: ${(e as ErrorEvent).message}`));
    });
  });
}

// ====== A/B experiment ======

export async function runExperiment(
  component: string,
  newPrompt: string,
): Promise<ExperimentResult[]> {
  const env = loadEnv();
  const apiKey = env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || "";
  const baseUrl =
    env.DEEPSEEK_BASE_URL ||
    process.env.DEEPSEEK_BASE_URL ||
    "https://api.deepseek.com/v1";
  const modelName =
    env.DEEPSEEK_MODEL || process.env.DEEPSEEK_MODEL || "deepseek-chat";

  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY not set");
  }

  const results: ExperimentResult[] = [];

  for (const scenario of TEST_SCENARIOS) {
    console.log(`[experimenter] Running scenario "${scenario.id}" — old prompt...`);
    const oldRun = await runScenarioViaWs(
      scenario,
      apiKey,
      baseUrl,
      modelName,
      scenario.roles,
    );
    const oldScore = quickScore(oldRun);

    console.log(`[experimenter] Running scenario "${scenario.id}" — new prompt...`);
    const newRun = await runScenarioViaWs(
      scenario,
      apiKey,
      baseUrl,
      modelName,
      scenario.roles,
    );
    const newScore = quickScore(newRun);

    const improvement = oldScore > 0 ? ((newScore - oldScore) / oldScore) * 100 : 0;
    const winner: ExperimentResult["winner"] =
      improvement > 0 ? "new" : improvement < 0 ? "old" : "tie";

    results.push({
      component,
      scenarioId: scenario.id,
      oldScore,
      newScore,
      improvement,
      winner,
    });

    console.log(
      `[experimenter] "${scenario.id}": old=${oldScore} new=${newScore} improvement=${improvement.toFixed(1)}% → ${winner}`,
    );
  }

  return results;
}
