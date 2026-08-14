/**
 * Replay — 快照回放（keyless 无 key 回放比对，dsh 门禁理念）
 *
 * P3-T5：把 Task 4 记录的确定性快照（Snapshot）与"当前工作区重跑 keyless 校验"的
 * 结果逐字段比对，diff 非空即 FAIL。整个流程无 key（不调 LLM），完全确定性。
 *
 * 跨包复用 orchestrator 的 runKeylessChecks（P3-T4 snapshot.ts）作为唯一确定性校验
 * 生产者：重放与记录使用同一套语义（sha256 归一化 hash / bash -o pipefail exitCode /
 * chars 判空），保证快照可比。改动面最小：仅相对路径 import，不复制逻辑。
 *
 * diffSnapshot 比对维度：
 * - files            → exists / hash / chars（size 为字节元数据，snapshot.ts 注明
 *                      "仅作参考"，判空比较用 chars 而非 size——CJK 5 字 = 15 字节，
 *                      但按字符 length=5 判空，与 LLM 路径一致；hash+chars 一致时
 *                      size 必一致，冗余字段不入 diff）
 * - verifyCommands   → exitCode / stdoutHash / passed；记录为 -1（未执行/未知）的命令
 *                      无信号可比，作为通配跳过（历史未跑成功，重放出的真实码不构成漂移）
 * - qualityChecks    → passed 逐字段 diff（纯函数能力；replayScenario 不使用——check
 *                      闭包在 orchestrator loop.ts SCENARIOS 里，replay 层拿不到，
 *                      keyless 重跑无法重新评估，只比确定性维度 files + verifyCommands）
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { runKeylessChecks } from "../../../orchestrator/src/loop/snapshot.js";
import type { Snapshot, KeylessScenario } from "../../../orchestrator/src/loop/snapshot.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** orchestrator 检查点目录（与 metrics/collector.ts 一致；.gitignore 已覆盖） */
export const DEFAULT_CHECKPOINTS_DIR = join(__dirname, "../../../orchestrator/checkpoints");

/** 合法退出码集合：0 成功 / 1 普通失败 / -1 未执行（通配）/ 123 xargs 合法失败 */
export const LEGAL_EXIT_CODES = [0, 1, -1, 123];

export interface Diff {
  kind: "file" | "verifyCommand" | "qualityCheck";
  /** 定位字段，如 files['a.txt'].hash / verifyCommands[0].exitCode */
  field: string;
  expected: unknown;
  actual: unknown;
}

/**
 * 纯函数：快照与重跑结果逐字段比对。
 * files 比 exists/hash/chars（size 元数据不比）；verifyCommands 比 exitCode/stdoutHash/
 * passed（记录 -1 通配跳过）；qualityChecks 比 passed。任一 diff 非空即 fail。
 */
export function diffSnapshot(snapshot: Snapshot, actual: Snapshot): Diff[] {
  const diffs: Diff[] = [];
  const snapFiles = snapshot.files || {};
  const actFiles = actual.files || {};

  for (const [path, sf] of Object.entries(snapFiles)) {
    const af = actFiles[path];
    if (!af) {
      diffs.push({ kind: "file", field: `files['${path}']`, expected: "exists", actual: "(missing)" });
      continue;
    }
    for (const field of ["exists", "hash", "chars"] as const) {
      if (sf[field] !== af[field]) {
        diffs.push({ kind: "file", field: `files['${path}'].${field}`, expected: sf[field], actual: af[field] });
      }
    }
  }

  const snapCmds = snapshot.verifyCommands || [];
  const actCmds = actual.verifyCommands || [];
  for (let i = 0; i < snapCmds.length; i++) {
    const sc = snapCmds[i];
    const ac = actCmds[i];
    if (!ac) {
      diffs.push({ kind: "verifyCommand", field: `verifyCommands[${i}]`, expected: sc.command, actual: "(missing)" });
      continue;
    }
    if (sc.exitCode === -1) continue; // 记录为未执行/未知 → 无信号可比，通配跳过
    for (const field of ["exitCode", "stdoutHash", "passed"] as const) {
      if (sc[field] !== ac[field]) {
        diffs.push({ kind: "verifyCommand", field: `verifyCommands[${i}].${field}`, expected: sc[field], actual: ac[field] });
      }
    }
  }

  const snapQ = snapshot.qualityChecks || [];
  const actQ = actual.qualityChecks || [];
  for (let i = 0; i < snapQ.length; i++) {
    const sq = snapQ[i];
    const actualPassed = actQ[i] ? actQ[i].passed : undefined;
    if (sq.passed !== actualPassed) {
      diffs.push({ kind: "qualityCheck", field: `qualityChecks[${i}].passed`, expected: sq.passed, actual: actualPassed });
    }
  }

  return diffs;
}

/**
 * 回放单个快照：从快照重建 KeylessScenario（verifyFiles=快照 files 键，
 * verifyCommands=快照命令，qualityChecks 仅携带 name/desc 无 check 闭包），
 * 调 runKeylessChecks 对 workspacePath 重跑确定性校验 → diffSnapshot。
 * qualityChecks 的 passed 不比（check 闭包无法在 replay 层重新评估，重跑恒为 false，
 * 比较会产生伪失败）；files + verifyCommands 是 keyless 可重放的确定性维度。
 */
export function replayScenario(snapshot: Snapshot, workspacePath: string): Diff[] {
  const scenario: KeylessScenario = {
    id: snapshot.scenarioId,
    verifyFiles: Object.keys(snapshot.files || {}),
    verifyCommands: (snapshot.verifyCommands || []).map((c) => c.command),
    qualityChecks: (snapshot.qualityChecks || []).map((qc) => ({ name: qc.name, desc: qc.desc })),
  };
  const actual = runKeylessChecks(scenario, workspacePath);
  return diffSnapshot(snapshot, actual).filter((d) => d.kind !== "qualityCheck");
}

interface CheckpointResult {
  scenarioId: string;
  snapshot?: Snapshot;
}

interface CheckpointFile {
  iterationId: number;
  results: CheckpointResult[];
}

/**
 * 遍历检查点目录回放所有含 snapshot 的 result（按 iterationId:scenarioId 去重，
 * latest.json 与 iteration-*.json 重复的同一轮只回放一次），汇总：
 * - 无检查点目录 / 无 json / 无含 snapshot 的 result → 无事可做，pass（exit 0）
 * - 有 snapshot 但未提供 workspace → 无法回放，fail（提示 --workspace=<dir>）
 * - 任一 snapshot 回放 diff 非空或回放异常 → fail（exit 1）
 *
 * 范围契约：replay 覆盖**全部已记录快照**（保守 fail-safe），区别于 runCiGate 其余
 * 门禁只评估最新迭代——因此回放工作区必须恢复到各迭代记录时的状态。容器流程每场景
 * 清空工作区（无跨迭代漂移）；宿主持久工作区需注意旧快照漂移会触发假阳性 diff。
 */
export function runReplay(workspacePath: string, checkpointsDir: string = DEFAULT_CHECKPOINTS_DIR): boolean {
  if (!existsSync(checkpointsDir)) {
    console.log("[replay] 检查点目录不存在 — 无可回放（exit 0）");
    return true;
  }
  const files = readdirSync(checkpointsDir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.log("[replay] 无检查点文件 — 无可回放（exit 0）");
    return true;
  }

  const replayed = new Set<string>();
  let snapshotCount = 0;
  let okCount = 0;
  let failCount = 0;

  for (const file of files) {
    let checkpoint: CheckpointFile;
    try {
      checkpoint = JSON.parse(readFileSync(join(checkpointsDir, file), "utf-8")) as CheckpointFile;
    } catch (e) {
      console.warn(`[replay] 跳过不可读检查点 ${file}: ${(e as Error).message}`);
      continue;
    }
    const iterationId = checkpoint?.iterationId;
    for (const result of checkpoint?.results || []) {
      const snap = result?.snapshot;
      if (!snap) continue;
      const key = `${iterationId}:${result.scenarioId}`;
      if (replayed.has(key)) continue;
      replayed.add(key);
      snapshotCount++;

      if (!workspacePath) {
        failCount++;
        console.error(`    [replay] ${result.scenarioId}: 缺少回放工作区，请传 --workspace=<dir>`);
        continue;
      }
      let diffs: Diff[];
      try {
        diffs = replayScenario(snap, workspacePath);
      } catch (e) {
        failCount++;
        console.error(`    [replay] ${result.scenarioId}: 回放异常 ${(e as Error).message}`);
        continue;
      }
      if (diffs.length > 0) {
        failCount++;
        console.error(`    [replay] ${result.scenarioId}: ${diffs.length} diff(s)`);
        for (const d of diffs.slice(0, 5)) {
          console.error(`      [diff] ${d.field} expected=${JSON.stringify(d.expected)} actual=${JSON.stringify(d.actual)}`);
        }
      } else {
        okCount++;
        console.log(`    [replay] ${result.scenarioId}: ✓ 无 diff`);
      }
    }
  }

  if (snapshotCount === 0) {
    console.log("[replay] 检查点中无 snapshot — 无可回放（exit 0）");
    return true;
  }
  if (failCount > 0) {
    console.error(`[replay] FAIL — ${failCount}/${snapshotCount} snapshot 回放失败（${okCount} 通过）`);
    return false;
  }
  console.log(`[replay] PASSED — ${okCount}/${snapshotCount} snapshot 回放，0 diff`);
  return true;
}
