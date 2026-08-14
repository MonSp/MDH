/**
 * Snapshot — 确定性快照（keyless 评测门禁基础）
 *
 * 把"可重放"的确定性校验结果记录为快照（checkpoint 补存 / 无 key 重放）：
 * - verifyFiles      → sha256 hash + size + exists
 * - verifyCommands   → exitCode + stdoutHash + passed
 * - qualityChecks    → passed 布尔
 *
 * 归一化原则：非确定性输出（时间戳、时长、LLM 文本）不入快照，
 * 只存 hash / exitCode / passed 等确定性字段，保证无 key 可重放比对。
 *
 * 使用 node 内置 crypto 计算 sha256，无新增依赖。
 */
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'fs';
import { basename, join } from 'path';

// ====== 快照类型 ======

export interface FileSnapshot {
  path: string;       // 相对工作区的路径（以 scenario.verifyFiles 声明为准）
  hash: string;       // 内容 sha256 hex（文件不存在时为空串）
  size: number;       // 内容字节数（文件不存在时为 0）
  exists: boolean;
}

export interface CommandSnapshot {
  command: string;    // 原始校验命令（scenario 声明）
  exitCode: number;   // 0 成功；非 0 失败；-1 未执行/未知
  stdoutHash: string; // 标准输出 sha256 hex
  passed: boolean;    // exitCode === 0
}

export interface QualityCheckSnapshot {
  name: string;
  passed: boolean;
  desc: string;
}

export interface Snapshot {
  scenarioId: string;
  files: Record<string, FileSnapshot>;      // key = verifyFiles 声明路径
  verifyCommands: CommandSnapshot[];
  qualityChecks: QualityCheckSnapshot[];
}

// ====== 输入类型（loop.ts Scenario 的结构子集，避免反向依赖脚本入口） ======

export interface CommandRunResult {
  exitCode: number;
  stdout: string;
}

export interface ScenarioRunResults {
  files?: Record<string, string>;              // 文件路径 -> 内容（LLM 路径从 read_file 收集）
  commands?: Record<string, CommandRunResult>; // 命令 -> 执行结果
  qualityChecks?: Record<string, boolean>;     // 校验名 -> 通过与否
}

export interface KeylessScenario {
  id: string;
  verifyFiles: string[];
  verifyCommands: string[];
  qualityChecks: { name: string; desc: string; check?: (r: any) => boolean }[];
}

// ====== 工具函数 ======

export function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * 文件视为"空"的字节阈值——与 LLM 路径一致（loop.ts 中 read_file 内容 ≤10 字符即判
 * "文件为空"高严重度 FAIL）。keyless 路径用同一 helper，保证两生产者阈值对齐。
 */
export const EMPTY_FILE_THRESHOLD = 10;

export function isFileEmpty(size: number): boolean {
  return size < EMPTY_FILE_THRESHOLD;
}

/**
 * stdout 归一化——共享 helper，供 buildScenarioSnapshot（LLM 路径）与
 * runKeylessChecks（keyless 路径）两个生产者对 stdout 先归一化再 sha256，
 * 使 stdoutHash 跨生产者 / 跨运行可比：
 * - workspace 绝对路径替换为常量 `<WS>`（容器 /workspace ↔ 本地 workspace 路径可比）
 * - 剥离 pytest 时序片段（`in 0.02s` / `in 12.3s` 等，随运行时长漂移）
 * - `\r\n` / `\r` 归一为 `\n`
 */
export function normalizeStdout(text: string, workspace?: string): string {
  let out = String(text || '');
  out = out.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (workspace) out = out.split(workspace).join('<WS>');
  out = out.replace(/\bin\s+\d+(?:\.\d+)?s\b/g, '');
  return out;
}

/**
 * 执行校验命令。统一用 `bash -o pipefail -c <command>` 包裹（execSync 默认走 /bin/sh）：
 * 场景命令形如 `find /workspace -name ... | tail -10`，管道尾命令退出码恒 0 会遮蔽
 * 上游失败（管道遮蔽 exit code，passed 恒真）；pipefail 使管道中任一环节失败即整体非零。
 * 命令以 JSON 字符串字面量作为单个 bash 参数传递（正确处理引号/反斜杠转义）。
 */
function runCommand(cmd: string, cwd: string): CommandRunResult {
  const wrapped = `bash -o pipefail -c ${JSON.stringify(cmd)}`;
  try {
    const stdout = execSync(wrapped, {
      cwd,
      timeout: 30000,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout: String(stdout) };
  } catch (e: any) {
    return {
      exitCode: typeof e.status === 'number' ? e.status : 1,
      stdout: String(e.stdout || ''),
    };
  }
}

/** findFile 递归下钻的最大深度，防止深目录 / ELOOP 造成不可终止 */
const MAX_DEPTH = 8;

/**
 * 在工作区中查找 verifyFile：先按声明相对路径直查，再递归按 basename 查找
 * （模拟 LLM 路径的 `find /workspace -name <file>` 语义，结果确定）。
 * 用 lstatSync：符号链接一律跳过（GNU find 默认不沿 symlink 下钻），
 * 深度上限 MAX_DEPTH 防 ELOOP/深目录爆炸。
 */
function findFile(workspace: string, relPath: string): string | null {
  const direct = join(workspace, relPath);
  try {
    if (lstatSync(direct).isFile()) return direct;
  } catch {
    /* 路径不存在、是符号链接或不是文件 → 走递归查找 */
  }

  const target = basename(relPath);
  const queue: { dir: string; depth: number }[] = [{ dir: workspace, depth: 0 }];
  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;
    if (depth >= MAX_DEPTH) continue;
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let st;
      try {
        st = lstatSync(full);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) continue; // 不沿 symlink 穿越（find 默认行为）
      if (st.isFile() && entry === target) return full;
      if (st.isDirectory() && !entry.startsWith('.')) queue.push({ dir: full, depth: depth + 1 });
    }
  }
  return null;
}

// ====== 快照构建 ======

/**
 * 由一次运行（LLM 全链或 keyless 校验）的确定性校验结果构建快照。
 * runResults.files 为 路径->内容（read_file 收集），commands 为 命令->{exitCode,stdout}。
 * workspace 为命令实际执行的工作区（LLM 路径默认容器 /workspace；keyless 传入本地路径），
 * stdout 先 normalizeStdout 再 sha256，保证两个生产者的 stdoutHash 可比。
 */
export function buildScenarioSnapshot(
  scenario: KeylessScenario,
  runResults: ScenarioRunResults,
  workspace = '/workspace',
): Snapshot {
  const files: Record<string, FileSnapshot> = {};
  for (const relPath of scenario.verifyFiles || []) {
    const content = (runResults.files || {})[relPath];
    if (content === undefined) {
      files[relPath] = { path: relPath, hash: '', size: 0, exists: false };
    } else {
      files[relPath] = {
        path: relPath,
        hash: sha256(content),
        size: Buffer.byteLength(content, 'utf-8'),
        exists: true,
      };
    }
  }

  const verifyCommands: CommandSnapshot[] = (scenario.verifyCommands || []).map((command) => {
    const r = (runResults.commands || {})[command];
    if (!r) return { command, exitCode: -1, stdoutHash: '', passed: false };
    return {
      command,
      exitCode: r.exitCode,
      stdoutHash: sha256(normalizeStdout(r.stdout, workspace)),
      passed: r.exitCode === 0,
    };
  });

  const qualityChecks: QualityCheckSnapshot[] = (scenario.qualityChecks || []).map((qc) => {
    const passed = (runResults.qualityChecks || {})[qc.name];
    return { name: qc.name, passed: passed === true, desc: qc.desc };
  });

  return { scenarioId: scenario.id, files, verifyCommands, qualityChecks };
}

/**
 * keyless 确定性校验：不调 LLM，直接对本地 workspace 目录做：
 * 文件存在性 + readFile 非空（sha256 hash）+ verifyCommands 执行 + qualityChecks。
 * 校验命令中的 /workspace 路径替换为实际 workspace，保证场景命令可本地重放。
 */
export function runKeylessChecks(scenario: KeylessScenario, workspace: string): Snapshot {
  if (!existsSync(workspace)) {
    throw new Error(`keyless workspace 不存在: ${workspace}（默认 /workspace 仅存在于 executor 容器，请用 --workspace=<dir>）`);
  }
  const files: Record<string, FileSnapshot> = {};
  for (const relPath of scenario.verifyFiles || []) {
    const found = findFile(workspace, relPath);
    if (found) {
      const content = readFileSync(found, 'utf-8');
      files[relPath] = {
        path: relPath,
        hash: sha256(content),
        size: Buffer.byteLength(content, 'utf-8'),
        exists: true,
      };
    } else {
      files[relPath] = { path: relPath, hash: '', size: 0, exists: false };
    }
  }

  const verifyCommands: CommandSnapshot[] = (scenario.verifyCommands || []).map((command) => {
    const effective = command.split('/workspace').join(workspace);
    const r = runCommand(effective, workspace);
    return {
      command,
      exitCode: r.exitCode,
      stdoutHash: sha256(normalizeStdout(r.stdout, workspace)),
      passed: r.exitCode === 0,
    };
  });

  const qualityChecks: QualityCheckSnapshot[] = (scenario.qualityChecks || []).map((qc) => {
    let passed = false;
    if (qc.check) {
      try {
        passed = qc.check(buildKeylessResult(files) as any);
      } catch {
        passed = false;
      }
    }
    return { name: qc.name, passed, desc: qc.desc };
  });

  return { scenarioId: scenario.id, files, verifyCommands, qualityChecks };
}

/** keyless 模式下构造的合成 Result（无 agents/phases/tools，文件数来自快照） */
function buildKeylessResult(files: Record<string, FileSnapshot>): Record<string, unknown> {
  return {
    scenarioId: '',
    success: Object.values(files).length > 0 && Object.values(files).every(f => f.exists),
    duration: 0,
    phases: [],
    agents: [],
    toolsUsed: [],
    filesCreated: Object.values(files).filter(f => f.exists).map(f => f.path),
    testOutput: '',
    issues: [],
  };
}
