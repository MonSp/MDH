/**
 * Task 4 — keyless 快照记录（snapshot.ts 纯函数测试）
 *
 * 覆盖：buildScenarioSnapshot（文件 sha256 hash / verifyCommands exitCode+stdoutHash /
 * qualityChecks passed）与 runKeylessChecks（文件存在性 + readFile 非空 + verifyCommands
 * 执行 + qualityChecks），以及"非确定性输出不入快照"的归一化约束。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildScenarioSnapshot, runKeylessChecks, sha256, normalizeStdout, isFileEmpty } from './snapshot.js';
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

  // ====== I1: pipefail —— 管道遮蔽 exit code 修复 ======

  it('runKeylessChecks fails a pipeline whose head fails (no tail masking under pipefail)', () => {
    const dir = makeTmpDir();
    const scenario: KeylessScenario = {
      id: 'pipefail',
      verifyFiles: [],
      verifyCommands: ['python3 -c "import sys; sys.exit(3)" 2>&1 | tail -5'],
      qualityChecks: [],
    };
    const snapshot = runKeylessChecks(scenario, dir);
    expect(snapshot.verifyCommands[0].exitCode).not.toBe(0);
    expect(snapshot.verifyCommands[0].passed).toBe(false);
  });

  it('runKeylessChecks still passes a successful pipeline', () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, 'app.py'), 'print(1)\n');
    const scenario: KeylessScenario = {
      id: 'pipefail-ok',
      verifyFiles: [],
      verifyCommands: ['python3 -m py_compile app.py 2>&1 | tail -5'],
      qualityChecks: [],
    };
    const snapshot = runKeylessChecks(scenario, dir);
    expect(snapshot.verifyCommands[0].passed).toBe(true);
    expect(snapshot.verifyCommands[0].exitCode).toBe(0);
  });

  // ====== I2: stdoutHash 跨生产者/运行可比 ======

  it('normalizeStdout makes timing/path-bearing stdout comparable', () => {
    const a = sha256(normalizeStdout('=== 1 passed in 0.02s ===\n/workspace/src/app.py .\n', '/workspace'));
    const b = sha256(normalizeStdout('=== 1 passed in 12.34s ===\n/workspace/src/app.py .\n', '/workspace'));
    // 不同 workspace 路径归一后 hash 相等
    const c = sha256(normalizeStdout('=== 1 passed in 0.02s ===\n/home/user/ws/src/app.py .\n', '/home/user/ws'));
    expect(a).toBe(b);
    expect(a).toBe(c);
    // \r / \r\n 归一
    expect(normalizeStdout('a\r\nb\r', '/workspace')).toBe('a\nb\n');
  });

  it('runKeylessChecks stdoutHash is stable across runs with varying timing', () => {
    const dir = makeTmpDir();
    const cmd = `python3 -c "import time;time.sleep(0.01);print('=== 1 passed in %.2fs ===' % (time.perf_counter()-time.perf_counter()))"`;
    const scenario: KeylessScenario = {
      id: 'hash-stable',
      verifyFiles: [],
      verifyCommands: [cmd],
      qualityChecks: [],
    };
    const s1 = runKeylessChecks(scenario, dir);
    const s2 = runKeylessChecks(scenario, dir);
    expect(s1.verifyCommands[0].passed).toBe(true);
    expect(s1.verifyCommands[0].stdoutHash).toBe(s2.verifyCommands[0].stdoutHash);
  });

  it('buildScenarioSnapshot and runKeylessChecks produce the same stdoutHash for the same logical output', () => {
    // LLM 路径输出带容器 /workspace 路径；keyless 输出带本地路径——归一后 hash 一致
    const dir = makeTmpDir();
    const llmSnapshot = buildScenarioSnapshot(
      { id: 'cross', verifyFiles: [], verifyCommands: ['pytest -q'], qualityChecks: [] },
      { commands: { 'pytest -q': { exitCode: 0, stdout: '=== 1 passed in 0.02s ===\n/workspace/src/app.py .\n' } } },
    );
    const keylessSnapshot = runKeylessChecks(
      { id: 'cross', verifyFiles: [], verifyCommands: ['printf "=== 1 passed in 0.02s ===\\n/workspace/src/app.py .\\n"'], qualityChecks: [] },
      dir,
    );
    expect(llmSnapshot.verifyCommands[0].stdoutHash).toBe(keylessSnapshot.verifyCommands[0].stdoutHash);
  });

  // ====== I3: keyless workspace 存在性守卫 ======

  it('runKeylessChecks throws when workspace does not exist', () => {
    const missing = join(tmpdir(), 'definitely-missing-ws-' + Date.now());
    const scenario: KeylessScenario = { id: 'guard', verifyFiles: [], verifyCommands: [], qualityChecks: [] };
    expect(() => runKeylessChecks(scenario, missing)).toThrow(/workspace 不存在/);
  });

  // ====== I4: findFile 符号链接穿越 + 深度上限 ======

  it('runKeylessChecks does not traverse self-referencing symlinks (no ELOOP, no hang)', () => {
    const dir = makeTmpDir();
    mkdirSync(join(dir, 'sub'), { recursive: true });
    writeFileSync(join(dir, 'sub', 'config.json'), '{"a":1}\n');
    try {
      symlinkSync(dir, join(dir, 'selfloop')); // 自引用 symlink
    } catch {
      /* 平台 symlink 权限受限则跳过 */
    }
    const scenario: KeylessScenario = {
      id: 'symlink-safe',
      verifyFiles: ['config.json'],
      verifyCommands: [],
      qualityChecks: [],
    };
    const snapshot = runKeylessChecks(scenario, dir);
    expect(snapshot.files['config.json'].exists).toBe(true);
  });

  it('runKeylessChecks skips a symlinked file in recursive find (find -name default)', () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, 'real.txt'), 'real\n');
    mkdirSync(join(dir, 'sub'), { recursive: true });
    try {
      symlinkSync(join(dir, 'real.txt'), join(dir, 'sub', 'real.txt'));
    } catch {
      /* 平台限制则跳过 */
    }
    const scenario: KeylessScenario = {
      id: 'symlink-file',
      verifyFiles: ['real.txt'],
      verifyCommands: [],
      qualityChecks: [],
    };
    const snapshot = runKeylessChecks(scenario, dir);
    expect(snapshot.files['real.txt'].exists).toBe(true); // 真实文件直接命中，symlink 不影响
  });

  // ====== I5: 空文件阈值与 LLM 路径对齐（size < 10） ======

  it('empty-file threshold aligned with LLM path (size < 10 counts as empty)', () => {
    expect(isFileEmpty(0)).toBe(true);
    expect(isFileEmpty(9)).toBe(true);
    expect(isFileEmpty(10)).toBe(false);
    expect(isFileEmpty(1024)).toBe(false);
  });

  it('runKeylessChecks records tiny file size so keyless empty check can apply <10 threshold', () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, 'tiny.txt'), 'abc'); // size 3 < EMPTY_FILE_THRESHOLD
    const scenario: KeylessScenario = {
      id: 'tiny',
      verifyFiles: ['tiny.txt'],
      verifyCommands: [],
      qualityChecks: [],
    };
    const snapshot = runKeylessChecks(scenario, dir);
    expect(snapshot.files['tiny.txt'].exists).toBe(true);
    expect(snapshot.files['tiny.txt'].size).toBe(3);
  });
});
