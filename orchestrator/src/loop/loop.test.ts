/**
 * Task 4 — keyless 快照记录（snapshot.ts 纯函数测试）
 *
 * 覆盖：buildScenarioSnapshot（文件 sha256 hash / verifyCommands exitCode+stdoutHash /
 * qualityChecks passed）与 runKeylessChecks（文件存在性 + readFile 非空 + verifyCommands
 * 执行 + qualityChecks），以及"非确定性输出不入快照"的归一化约束。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, symlinkSync, chmodSync, readFileSync } from 'fs';
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

/** 探测一个装有 pytest 的 python 解释器（真实 pytest 失败场景用例；无则跳过该用例） */
function findPytestPython(): string | null {
  // 不硬编码机器专属路径：优先 PYTEST_PYTHON 环境变量，其次运行时探测——PATH 上的
  // python3/python 解释器，以及 `pytest` 命令（如 pipx 安装）的宿主解释器（读 shebang）
  const candidates = [process.env.PYTEST_PYTHON];
  for (const name of ['python3', 'python']) {
    try {
      const resolved = execSync(`command -v ${name}`, { encoding: 'utf-8' }).trim();
      if (resolved) candidates.push(resolved);
    } catch {
      /* 该解释器不在 PATH 上 */
    }
  }
  try {
    const pytestBin = execSync('command -v pytest', { encoding: 'utf-8' }).trim();
    const shebang = readFileSync(pytestBin, 'utf-8').split('\n')[0];
    if (shebang.startsWith('#!')) {
      const interp = shebang.slice(2).split(' ')[0].trim();
      if (interp) candidates.push(interp);
    }
  } catch {
    /* 无 pytest 命令 */
  }
  for (const p of candidates) {
    if (!p) continue;
    try {
      execSync(`"${p}" -m pytest --version`, { stdio: 'ignore' });
      return p;
    } catch {
      /* 下一个候选 */
    }
  }
  return null;
}
const PYTEST_PY = findPytestPython();

describe('scenario snapshot', () => {
  it('builds deterministic snapshot with sha256 file hashes', () => {
    const snapshot = buildScenarioSnapshot(
      { verifyFiles: ['src/app.py'], verifyCommands: ['python -m py_compile src/app.py'], qualityChecks: [] } as any,
      { files: { 'src/app.py': 'print(1)' } },
    );
    expect(snapshot.files['src/app.py'].hash).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.files['src/app.py'].exists).toBe(true);
    expect(snapshot.files['src/app.py'].size).toBe('print(1)'.length);
    expect(snapshot.files['src/app.py'].chars).toBe('print(1)'.length);
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
    expect(snapshot.files['a.py']).toEqual({ path: 'a.py', hash: '', size: 0, chars: 0, exists: false });
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

  // ====== I5: 空文件阈值与 LLM 路径对齐（size <= 10，按字符数） ======

  it('empty-file threshold aligned with LLM path (size <= 10 counts as empty)', () => {
    expect(isFileEmpty(0)).toBe(true);
    expect(isFileEmpty(9)).toBe(true);
    expect(isFileEmpty(10)).toBe(true); // 边界对齐：LLM 路径 read_file 内容长度 ≤10 判空
    expect(isFileEmpty(11)).toBe(false);
    expect(isFileEmpty(1024)).toBe(false);
  });

  it('runKeylessChecks records tiny file size so keyless empty check can apply <=10 threshold', () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, 'tiny.txt'), 'abc'); // size 3 <= EMPTY_FILE_THRESHOLD
    const scenario: KeylessScenario = {
      id: 'tiny',
      verifyFiles: ['tiny.txt'],
      verifyCommands: [],
      qualityChecks: [],
    };
    const snapshot = runKeylessChecks(scenario, dir);
    expect(snapshot.files['tiny.txt'].exists).toBe(true);
    expect(snapshot.files['tiny.txt'].size).toBe(3);
    expect(snapshot.files['tiny.txt'].chars).toBe(3);
    expect(isFileEmpty(snapshot.files['tiny.txt'].chars)).toBe(true);
  });

  it('keyless empty judgment uses char count, not byte size (CJK: 5 chars = 15 bytes)', () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, 'cjk.txt'), '你好世界！'); // 5 个 CJK 字符 = 15 UTF-8 字节
    const scenario: KeylessScenario = {
      id: 'cjk',
      verifyFiles: ['cjk.txt'],
      verifyCommands: [],
      qualityChecks: [],
    };
    const snapshot = runKeylessChecks(scenario, dir);
    const f = snapshot.files['cjk.txt'];
    expect(f.exists).toBe(true);
    expect(f.size).toBe(15); // 快照仍记录字节 size（元数据）
    expect(f.chars).toBe(5); // 空判定用字符数（readFileSync 后 content.length）
    expect(isFileEmpty(f.chars)).toBe(true); // 5 <= 10 → 判空，与 LLM 路径按字符一致
    expect(isFileEmpty(f.size)).toBe(false); // 若误用字节 size（15 > 10）则判空不一致
  });

  // ====== I1: find -exec → xargs 迁移 —— 退出码传播 ======

  it('xargs-ified verifyCommands propagate command failure (find -exec masks exit code)', () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, 'fail.sh'), '#!/bin/sh\necho failing\nexit 3\n');
    // find -exec 旧形态：被执行的命令退出码不传播（find 恒 0）、无匹配也返回 0 → 遮蔽失败
    const oldForm = runKeylessChecks(
      { id: 'exec-form', verifyFiles: [], verifyCommands: ['find /workspace -name "fail.sh" -exec sh {} \\; 2>&1 | tail -5'], qualityChecks: [] },
      dir,
    );
    expect(oldForm.verifyCommands[0].exitCode).toBe(0);
    expect(oldForm.verifyCommands[0].passed).toBe(true);
    // xargs 新形态：任一被调用命令失败 → xargs 返回 123 → pipefail 传播为非零
    // （find 侧 `{ ... || true; }`：权限拒绝等遍历错误不因 find 自身退出码误伤，见 I1 回归测试）
    const newForm = runKeylessChecks(
      { id: 'xargs-form', verifyFiles: [], verifyCommands: ['{ find /workspace -name "fail.sh" -type f -print0 2>/dev/null || true; } | xargs -0 -r sh 2>&1 | tail -5'], qualityChecks: [] },
      dir,
    );
    expect(newForm.verifyCommands[0].exitCode).not.toBe(0);
    expect(newForm.verifyCommands[0].passed).toBe(false);
  });

  it.skipIf(!PYTEST_PY)('xargs-ified pytest verifyCommand exits non-zero on test failure (find -exec returns 0)', () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, 'test_fail.py'), 'def test_fail():\n    assert False\n');
    // find -exec 旧形态：pytest 失败被 find 吞掉，管道在 pipefail 下仍返回 0
    const oldForm = runKeylessChecks(
      {
        id: 'pytest-exec',
        verifyFiles: [],
        verifyCommands: [`find /workspace -name "test_fail.py" -exec ${PYTEST_PY} -m pytest {} -v \\; 2>&1 | tail -5`],
        qualityChecks: [],
      },
      dir,
    );
    expect(oldForm.verifyCommands[0].exitCode).toBe(0);
    // xargs 新形态：pytest 失败 → xargs 123 → pipefail 传播为非零
    const newForm = runKeylessChecks(
      {
        id: 'pytest-xargs',
        verifyFiles: [],
        verifyCommands: [`{ find /workspace -name "test_fail.py" -type f -print0 2>/dev/null || true; } | xargs -0 -r ${PYTEST_PY} -m pytest -q 2>&1 | tail -5`],
        qualityChecks: [],
      },
      dir,
    );
    expect(newForm.verifyCommands[0].exitCode).not.toBe(0);
    expect(newForm.verifyCommands[0].passed).toBe(false);
  });

  // ====== Minor: workspace 路径边界替换 + 时序剥离收窄 ======

  it('normalizeStdout does not replace sibling paths sharing the workspace prefix', () => {
    const out = normalizeStdout('/workspace/a.py\n/workspace2/b.py\nworkspace-file.txt\n/workspace', '/workspace');
    expect(out).toBe('<WS>/a.py\n/workspace2/b.py\nworkspace-file.txt\n<WS>');
  });

  it('timing strip only applies to pytest summary context (passed/failed/errors)', () => {
    expect(normalizeStdout('=== 1 passed in 0.02s ===', '/workspace')).toBe('=== 1 passed ===');
    expect(normalizeStdout('=== 1 failed, 2 passed in 12.34s ===', '/workspace')).toBe('=== 1 failed, 2 passed ===');
    expect(normalizeStdout('=== 1 error in 0.10s ===', '/workspace')).toBe('=== 1 error ===');
    // 非 pytest 汇总上下文中的 `in Xs` 保留（旧正则 `\bin ... s` 会误删）
    expect(normalizeStdout('elapsed in 3s and in 5s elsewhere', '/workspace')).toBe('elapsed in 3s and in 5s elsewhere');
  });

  // ====== I2: 时序剥离关键词集扩展（skipped/xfailed/xpassed/deselected/warnings/no tests ran） ======

  it('timing strip covers skipped/xfailed/xpassed/deselected/warnings/no-tests-ran endings', () => {
    expect(normalizeStdout('=== 1 skipped in 0.03s ===', '/workspace')).toBe('=== 1 skipped ===');
    expect(normalizeStdout('=== no tests ran in 0.01s ===', '/workspace')).toBe('=== no tests ran ===');
    expect(normalizeStdout('=== 2 passed, 1 skipped in 0.41s ===', '/workspace')).toBe('=== 2 passed, 1 skipped ===');
    expect(normalizeStdout('=== 1 xfailed in 0.02s ===', '/workspace')).toBe('=== 1 xfailed ===');
    expect(normalizeStdout('=== 1 xpassed, 1 deselected in 0.3s ===', '/workspace')).toBe('=== 1 xpassed, 1 deselected ===');
    expect(normalizeStdout('=== 2 warnings in 0.20s ===', '/workspace')).toBe('=== 2 warnings ===');
    expect(normalizeStdout('=== 1 warning in 0.2s ===', '/workspace')).toBe('=== 1 warning ===');
    // 非 pytest 汇总上下文（无关键词紧跟 `in <dur>s`）不受影响
    expect(normalizeStdout('deployed in 5s and verified later', '/workspace'))
      .toBe('deployed in 5s and verified later');
  });

  it('timing-strip hash is stable for skipped and no-tests-ran summaries', () => {
    expect(sha256(normalizeStdout('=== 1 skipped in 0.03s ===', '/workspace')))
      .toBe(sha256(normalizeStdout('=== 1 skipped in 8.41s ===', '/workspace')));
    expect(sha256(normalizeStdout('=== no tests ran in 0.01s ===', '/workspace')))
      .toBe(sha256(normalizeStdout('=== no tests ran in 12.3s ===', '/workspace')));
    expect(sha256(normalizeStdout('=== 2 passed, 1 skipped in 0.41s ===', '/workspace')))
      .toBe(sha256(normalizeStdout('=== 2 passed, 1 skipped in 9.02s ===', '/workspace')));
  });

  // ====== I1: find stderr 不灌入 xargs 输入流（权限拒绝子目录不虚假失败） ======

  it.skipIf(!PYTEST_PY)('xargs verifyCommand does not feed find stderr to xargs input (permission-denied subdir)', () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, 'test_ok.py'), 'def test_ok():\n    assert True\n');
    const noperm = join(dir, 'noperm');
    mkdirSync(noperm);
    chmodSync(noperm, 0o000);
    try {
      // 修复前形态：`-print0 2>&1` 把 find 的 stderr（Permission denied）混入 NUL 分隔流，
      // xargs 把它当参数传给 pytest → 被测文件存在也虚假失败
      const oldForm = runKeylessChecks(
        {
          id: 'stderr-into-xargs-old',
          verifyFiles: [],
          verifyCommands: [`find /workspace -name "test_ok.py" -type f -print0 2>&1 | xargs -0 -r ${PYTEST_PY} -m pytest -q 2>&1 | tail -5`],
          qualityChecks: [],
        },
        dir,
      );
      expect(oldForm.verifyCommands[0].passed).toBe(false);
      // 修复后形态：find stderr 丢弃（2>/dev/null），且 `{ ... || true; }` 中和 find 自身因
      // 遍历权限拒绝产生的非零退出码（pipefail 下 find 退出码会误伤整条管道）——
      // 只有 NUL 分隔的文件列表进 xargs，被测文件存在时不再虚假失败
      const newForm = runKeylessChecks(
        {
          id: 'stderr-into-xargs-new',
          verifyFiles: [],
          verifyCommands: [`{ find /workspace -name "test_ok.py" -type f -print0 2>/dev/null || true; } | xargs -0 -r ${PYTEST_PY} -m pytest -q 2>&1 | tail -5`],
          qualityChecks: [],
        },
        dir,
      );
      expect(newForm.verifyCommands[0].exitCode).toBe(0);
      expect(newForm.verifyCommands[0].passed).toBe(true);
    } finally {
      chmodSync(noperm, 0o755); // 恢复权限，保证 afterEach 临时目录清理
    }
  });
});
