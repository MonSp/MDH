/**
 * Task 4 — keyless 快照记录（snapshot.ts 纯函数测试）
 *
 * 覆盖：buildScenarioSnapshot（文件 sha256 hash / verifyCommands exitCode+stdoutHash /
 * qualityChecks passed）与 runKeylessChecks（文件存在性 + readFile 非空 + verifyCommands
 * 执行 + qualityChecks），以及"非确定性输出不入快照"的归一化约束。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildScenarioSnapshot, runKeylessChecks, sha256 } from './snapshot.js';
import type { Snapshot, KeylessScenario } from './snapshot.js';

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'snapshot-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('scenario snapshot', () => {
  it('builds deterministic snapshot with sha256 file hashes', () => {
    const snapshot = buildScenarioSnapshot(
      { verifyFiles: ['src/app.py'], verifyCommands: ['python -m py_compile src/app.py'], qualityChecks: [] } as any,
      { files: { 'src/app.py': 'print(1)' } },
    );
    expect(snapshot.files['src/app.py'].hash).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.files['src/app.py'].exists).toBe(true);
    expect(snapshot.files['src/app.py'].size).toBe('print(1)'.length);
  });

  it('records verifyCommands exitCode/stdoutHash/passed', () => {
    const cmd = 'pytest -q';
    const snapshot = buildScenarioSnapshot(
      { id: 't', verifyFiles: [], verifyCommands: [cmd], qualityChecks: [] },
      { commands: { [cmd]: { exitCode: 0, stdout: '1 passed' } } },
    );
    expect(snapshot.verifyCommands).toEqual([
      { command: cmd, exitCode: 0, stdoutHash: sha256('1 passed'), passed: true },
    ]);

    const failed = buildScenarioSnapshot(
      { id: 't', verifyFiles: [], verifyCommands: [cmd], qualityChecks: [] },
      { commands: { [cmd]: { exitCode: 1, stdout: 'FAILED' } } },
    );
    expect(failed.verifyCommands[0].passed).toBe(false);
    expect(failed.verifyCommands[0].exitCode).toBe(1);
  });

  it('records qualityChecks passed from runResults', () => {
    const scenario: KeylessScenario = {
      id: 't',
      verifyFiles: [],
      verifyCommands: [],
      qualityChecks: [
        { name: '多文件', desc: '至少3个文件' },
        { name: '审查参与', desc: 'reviewer 参与' },
      ],
    };
    const snapshot = buildScenarioSnapshot(scenario, {
      qualityChecks: { 多文件: true, 审查参与: false },
    });
    expect(snapshot.qualityChecks).toEqual([
      { name: '多文件', passed: true, desc: '至少3个文件' },
      { name: '审查参与', passed: false, desc: 'reviewer 参与' },
    ]);
  });

  it('marks missing files as not existing', () => {
    const snapshot = buildScenarioSnapshot(
      { id: 't', verifyFiles: ['a.py'], verifyCommands: [], qualityChecks: [] },
      { files: {} },
    );
    expect(snapshot.files['a.py']).toEqual({ path: 'a.py', hash: '', size: 0, exists: false });
  });

  it('is deterministic and free of non-deterministic fields (timestamp/duration/LLM text)', () => {
    const scenario = {
      id: 't',
      verifyFiles: ['app.py'],
      verifyCommands: ['pytest -q'],
      qualityChecks: [{ name: 'qc', desc: 'd' }],
    };
    const runResults = {
      files: { 'app.py': 'x = 1\n' },
      commands: { 'pytest -q': { exitCode: 0, stdout: 'ok' } },
      qualityChecks: { qc: true },
    };
    const a = buildScenarioSnapshot(scenario, runResults);
    const b = buildScenarioSnapshot(scenario, runResults);
    expect(a).toEqual(b);
    const json = JSON.stringify(a);
    expect(json).not.toContain('timestamp');
    expect(json).not.toContain('duration');
    expect(Object.keys(a).sort()).toEqual(['files', 'qualityChecks', 'scenarioId', 'verifyCommands']);
  });

  it('runKeylessChecks passes with real files and commands in tmp dir', () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, 'app.py'), 'print(1)\n');
    const scenario: KeylessScenario = {
      id: 'keyless-ok',
      verifyFiles: ['app.py'],
      verifyCommands: ['python3 -m py_compile app.py'],
      qualityChecks: [],
    };
    const snapshot = runKeylessChecks(scenario, dir);
    expect(snapshot.files['app.py'].exists).toBe(true);
    expect(snapshot.files['app.py'].hash).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.files['app.py'].size).toBe('print(1)\n'.length);
    expect(snapshot.verifyCommands).toHaveLength(1);
    expect(snapshot.verifyCommands[0].passed).toBe(true);
    expect(snapshot.verifyCommands[0].exitCode).toBe(0);
  });

  it('runKeylessChecks reports missing files and failed commands', () => {
    const dir = makeTmpDir();
    const scenario: KeylessScenario = {
      id: 'keyless-fail',
      verifyFiles: ['missing.py'],
      verifyCommands: ['test -f missing.py'],
      qualityChecks: [],
    };
    const snapshot = runKeylessChecks(scenario, dir);
    expect(snapshot.files['missing.py'].exists).toBe(false);
    expect(snapshot.files['missing.py'].hash).toBe('');
    expect(snapshot.verifyCommands[0].passed).toBe(false);
    expect(snapshot.verifyCommands[0].exitCode).not.toBe(0);
  });

  it('runKeylessChecks substitutes /workspace path in commands', () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, 'data.txt'), 'hello\n');
    const scenario: KeylessScenario = {
      id: 'keyless-subst',
      verifyFiles: ['data.txt'],
      verifyCommands: ['cat /workspace/data.txt'],
      qualityChecks: [],
    };
    const snapshot = runKeylessChecks(scenario, dir);
    expect(snapshot.verifyCommands[0].passed).toBe(true);
    expect(snapshot.verifyCommands[0].stdoutHash).toBe(sha256('hello\n'));
  });

  it('runKeylessChecks finds nested files by basename like find -name', () => {
    const dir = makeTmpDir();
    mkdirSync(join(dir, 'sub'), { recursive: true });
    writeFileSync(join(dir, 'sub', 'config.json'), '{"a":1}\n');
    const scenario: KeylessScenario = {
      id: 'keyless-nested',
      verifyFiles: ['config.json'],
      verifyCommands: [],
      qualityChecks: [],
    };
    const snapshot = runKeylessChecks(scenario, dir);
    expect(snapshot.files['config.json'].exists).toBe(true);
  });

  it('runKeylessChecks evaluates file-based qualityChecks, agent-based checks fail keyless', () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, 'a.py'), 'x=1\n');
    writeFileSync(join(dir, 'b.py'), 'y=2\n');
    writeFileSync(join(dir, 'c.py'), 'z=3\n');
    const scenario: KeylessScenario = {
      id: 'keyless-qc',
      verifyFiles: ['a.py', 'b.py', 'c.py'],
      verifyCommands: [],
      qualityChecks: [
        { name: '多文件', desc: '至少3个文件', check: r => (r as any).filesCreated.length >= 3 },
        { name: '审查参与', desc: 'reviewer 参与', check: r => (r as any).agents.includes('reviewer') },
      ],
    };
    const snapshot = runKeylessChecks(scenario, dir);
    const byName = Object.fromEntries(snapshot.qualityChecks.map(q => [q.name, q.passed]));
    expect(byName['多文件']).toBe(true);
    expect(byName['审查参与']).toBe(false); // keyless 无 agents
  });

  it('builds a complete snapshot for an LLM-path style run', () => {
    const scenario: KeylessScenario = {
      id: 'full',
      verifyFiles: ['app.py'],
      verifyCommands: ['python3 app.py'],
      qualityChecks: [{ name: 'qc', desc: 'd', check: () => true }],
    };
    const snapshot: Snapshot = buildScenarioSnapshot(scenario, {
      files: { 'app.py': 'print("hi")' },
      commands: { 'python3 app.py': { exitCode: 0, stdout: 'hi\n' } },
      qualityChecks: { qc: true },
    });
    expect(snapshot.scenarioId).toBe('full');
    expect(snapshot.files['app.py'].hash).toBe(sha256('print("hi")'));
    expect(snapshot.verifyCommands[0].stdoutHash).toBe(sha256('hi\n'));
    expect(snapshot.qualityChecks[0].passed).toBe(true);
  });
});
