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
import { readFileSync, readdirSync, statSync } from 'fs';
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

function runCommand(cmd: string, cwd: string): CommandRunResult {
  try {
    const stdout = execSync(cmd, {
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

/**
 * 在工作区中查找 verifyFile：先按声明相对路径直查，再递归按 basename 查找
 * （模拟 LLM 路径的 `find /workspace -name <file>` 语义，结果确定）。
 */
function findFile(workspace: string, relPath: string): string | null {
  const direct = join(workspace, relPath);
  try {
    if (statSync(direct).isFile()) return direct;
  } catch {
    /* 路径不存在或不是文件 → 走递归查找 */
  }

  const target = basename(relPath);
  const queue: string[] = [workspace];
  while (queue.length > 0) {
    const dir = queue.shift()!;
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
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isFile() && entry === target) return full;
      if (st.isDirectory() && !entry.startsWith('.')) queue.push(full);
    }
  }
  return null;
}

// ====== 快照构建 ======

/**
 * 由一次运行（LLM 全链或 keyless 校验）的确定性校验结果构建快照。
 * runResults.files 为 路径->内容（read_file 收集），commands 为 命令->{exitCode,stdout}。
 */
export function buildScenarioSnapshot(scenario: KeylessScenario, runResults: ScenarioRunResults): Snapshot {
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
    return { command, exitCode: r.exitCode, stdoutHash: sha256(r.stdout), passed: r.exitCode === 0 };
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
    return { command, exitCode: r.exitCode, stdoutHash: sha256(r.stdout), passed: r.exitCode === 0 };
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
