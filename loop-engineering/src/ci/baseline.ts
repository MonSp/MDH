import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINES_DIR = join(__dirname, "../../baselines");
const LATEST_PATH = join(BASELINES_DIR, "latest.json");

export interface Baseline {
  timestamp: string;
  commitHash: string;
  avgScore: number;
  scenarioScores: Record<string, number>;
}

export function loadBaseline(): Baseline | null {
  if (!existsSync(LATEST_PATH)) return null;
  try {
    return JSON.parse(readFileSync(LATEST_PATH, "utf-8")) as Baseline;
  } catch {
    return null;
  }
}

export function updateBaseline(avgScore: number, scenarioScores: Record<string, number>): void {
  mkdirSync(BASELINES_DIR, { recursive: true });

  const commitHash = getCommitHash();
  const timestamp = new Date().toISOString();
  const baseline: Baseline = { timestamp, commitHash, avgScore, scenarioScores };

  writeFileSync(LATEST_PATH, JSON.stringify(baseline, null, 2) + "\n");

  const tsFile = join(BASELINES_DIR, `${timestamp.replace(/[:.]/g, "-")}.json`);
  writeFileSync(tsFile, JSON.stringify(baseline, null, 2) + "\n");
}

function getCommitHash(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}
