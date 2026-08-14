/**
 * P3-T5 — replay 层测试：diffSnapshot 纯函数 + replayScenario 重跑比对 + runReplay 遍历。
 * 跨包复用 orchestrator runKeylessChecks 生成基准快照（与记录端同一语义，可比）。
 */
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { diffSnapshot, replayScenario, runReplay } from "./replay.js";
import { runKeylessChecks } from "../../../orchestrator/src/loop/snapshot.js";
import type { Snapshot, KeylessScenario } from "../../../orchestrator/src/loop/snapshot.js";

const tmpDirs: string[] = [];
function makeTmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "replay-test-"));
  tmpDirs.push(dir);
  return dir;
}

function snap(partial: Partial<Snapshot>): Snapshot {
  return { scenarioId: "s", files: {}, verifyCommands: [], qualityChecks: [], ...partial } as Snapshot;
}

afterEach(() => {
  while (tmpDirs.length > 0) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("replay diffSnapshot", () => {
  it("empty diff when snapshot matches", () => {
    const s = snap({ files: { "a.txt": { path: "a.txt", hash: "h1", size: 2, chars: 2, exists: true } } });
    expect(diffSnapshot(s, structuredClone(s))).toEqual([]);
  });

  it("reports file hash mismatch", () => {
    const s = snap({ files: { "a.txt": { path: "a.txt", hash: "h1", size: 2, chars: 2, exists: true } } });
    const a = snap({ files: { "a.txt": { path: "a.txt", hash: "h2", size: 3, chars: 3, exists: true } } });
    const diffs = diffSnapshot(s, a);
    expect(diffs.length).toBe(2); // hash + chars 均漂移
    expect(diffs.some((d) => d.field === "files['a.txt'].hash")).toBe(true);
  });

  it("ignores size — 判空比较用 chars 非 size（size 为字节元数据）", () => {
    // hash/chars/exists 一致时，size 变化（字节数 vs 字符数口径差异）不算 diff
    const s = snap({ files: { "a.txt": { path: "a.txt", hash: "h", size: 100, chars: 20, exists: true } } });
    const a = snap({ files: { "a.txt": { path: "a.txt", hash: "h", size: 200, chars: 20, exists: true } } });
    expect(diffSnapshot(s, a)).toEqual([]);
  });

  it("reports missing file", () => {
    const s = snap({ files: { "a.txt": { path: "a.txt", hash: "h", size: 2, chars: 2, exists: true } } });
    const a = snap({ files: {} });
    expect(diffSnapshot(s, a)).toHaveLength(1);
  });

  it("reports verifyCommands exitCode/stdoutHash/passed drift", () => {
    const cmd = (exitCode: number, stdoutHash: string, passed: boolean) => ({ command: "pytest", exitCode, stdoutHash, passed });
    const s = snap({ verifyCommands: [cmd(0, "h1", true)] });
    const a = snap({ verifyCommands: [cmd(0, "h1", false)] });
    expect(diffSnapshot(s, a)).toHaveLength(1); // passed 翻转
  });

  it("treats recorded exitCode -1（未执行/未知）as wildcard — 无信号可比", () => {
    const s = snap({ verifyCommands: [{ command: "cmd", exitCode: -1, stdoutHash: "", passed: false }] });
    const a = snap({ verifyCommands: [{ command: "cmd", exitCode: 0, stdoutHash: "abc", passed: true }] });
    expect(diffSnapshot(s, a)).toEqual([]);
  });

  it("accepts xargs exit code 123（合法失败）— 相同 123 不算 drift", () => {
    const s = snap({ verifyCommands: [{ command: "cmd", exitCode: 123, stdoutHash: "h", passed: false }] });
    const a = snap({ verifyCommands: [{ command: "cmd", exitCode: 123, stdoutHash: "h", passed: false }] });
    expect(diffSnapshot(s, a)).toEqual([]);
  });

  it("reports qualityChecks passed drift field-by-field", () => {
    const s = snap({ qualityChecks: [{ name: "qc", passed: true, desc: "" }] });
    const a = snap({ qualityChecks: [{ name: "qc", passed: false, desc: "" }] });
    const diffs = diffSnapshot(s, a);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].field).toBe("qualityChecks[0].passed");
  });
});

describe("replay replayScenario", () => {
  it("empty diffs when workspace matches snapshot (keyless 确定性可比)", () => {
    const dir = makeTmp();
    writeFileSync(join(dir, "app.py"), "print(1)\n");
    const scenario: KeylessScenario = { id: "s", verifyFiles: ["app.py"], verifyCommands: [], qualityChecks: [] };
    const snapshot = runKeylessChecks(scenario, dir);
    expect(replayScenario(snapshot, dir)).toEqual([]);
  });

  it("reports diffs when workspace drifted (file content changed)", () => {
    const dir = makeTmp();
    writeFileSync(join(dir, "app.py"), "print(1)\n");
    const scenario: KeylessScenario = { id: "s", verifyFiles: ["app.py"], verifyCommands: [], qualityChecks: [] };
    const snapshot = runKeylessChecks(scenario, dir);
    writeFileSync(join(dir, "app.py"), "print(2)\n");
    expect(replayScenario(snapshot, dir).length).toBeGreaterThan(0);
  });

  it("detects drift not absolute pass/fail — 确定性失败命令重放无 diff", () => {
    const dir = makeTmp();
    const failing: KeylessScenario = { id: "s", verifyFiles: [], verifyCommands: ['python3 -c "import nonexistent_module_xyz"'], qualityChecks: [] };
    const snapshot = runKeylessChecks(failing, dir);
    expect(replayScenario(snapshot, dir)).toEqual([]); // 每次都失败 → 无漂移
  });

  it("ignores qualityChecks — check 闭包无法在 replay 层重新评估", () => {
    const dir = makeTmp();
    writeFileSync(join(dir, "app.py"), "x");
    const scenario: KeylessScenario = {
      id: "s",
      verifyFiles: ["app.py"],
      verifyCommands: [],
      qualityChecks: [{ name: "q", desc: "", check: () => true }],
    };
    const snapshot = runKeylessChecks(scenario, dir); // 记录 passed=true
    expect(snapshot.qualityChecks[0].passed).toBe(true);
    // replay 层无 check 闭包 → keyless 重跑得 passed=false，但不构成 replay diff
    expect(replayScenario(snapshot, dir)).toEqual([]);
  });
});

describe("replay runReplay", () => {
  function writeCheckpoint(dir: string, file: string, results: { scenarioId: string; snapshot: Snapshot }[]): void {
    writeFileSync(
      join(dir, file),
      JSON.stringify({
        iterationId: 1,
        timestamp: "2026-08-13T00:00:00.000Z",
        passed: results.length,
        total: results.length,
        issues: [],
        results,
      }),
    );
  }

  it("passes on missing / empty checkpoints dir (exit 0)", () => {
    expect(runReplay("", join(makeTmp(), "nope"))).toBe(true); // 目录不存在
    expect(runReplay("", makeTmp())).toBe(true); // 目录存在但无 json
    const cp = makeTmp();
    writeFileSync(join(cp, "latest.json"), JSON.stringify({ iterationId: 1, results: [] }));
    expect(runReplay("", cp)).toBe(true); // 有 json 但无 snapshot
  });

  it("fails when a snapshot replay produces diffs and passes after restore", () => {
    const ws = makeTmp();
    writeFileSync(join(ws, "app.py"), "print(1)\n");
    const scenario: KeylessScenario = { id: "s", verifyFiles: ["app.py"], verifyCommands: [], qualityChecks: [] };
    const snapshot = runKeylessChecks(scenario, ws);

    const cp = makeTmp();
    writeCheckpoint(cp, "iteration-1.json", [{ scenarioId: "s", snapshot }]);
    writeCheckpoint(cp, "latest.json", [{ scenarioId: "s", snapshot }]); // latest 与 iteration 重复 → 去重只回放一次

    writeFileSync(join(ws, "app.py"), "print(2)\n"); // drift
    expect(runReplay(ws, cp)).toBe(false);

    writeFileSync(join(ws, "app.py"), "print(1)\n"); // 恢复 → 通过
    expect(runReplay(ws, cp)).toBe(true);
  });

  it("requires workspace when snapshots exist", () => {
    const ws = makeTmp();
    writeFileSync(join(ws, "app.py"), "x");
    const snapshot = runKeylessChecks({ id: "s", verifyFiles: ["app.py"], verifyCommands: [], qualityChecks: [] }, ws);
    const cp = makeTmp();
    writeCheckpoint(cp, "iteration-1.json", [{ scenarioId: "s", snapshot }]);
    expect(runReplay("", cp)).toBe(false);
  });

  it("skips results without snapshot (旧检查点向后兼容)", () => {
    const cp = makeTmp();
    writeFileSync(
      join(cp, "iteration-1.json"),
      JSON.stringify({
        iterationId: 1,
        timestamp: "",
        passed: 0,
        total: 1,
        issues: [],
        results: [{ scenarioId: "legacy-no-snapshot", success: false, duration: 0, phases: [], agents: [] }],
      }),
    );
    expect(runReplay("", cp)).toBe(true);
  });
});
