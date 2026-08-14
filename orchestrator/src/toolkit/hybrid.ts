import type { IToolkitRouter } from './router.js';
import type { ToolCall, ToolResult } from '../team/types.js';
import { LocalToolkitRouter } from './local.js';
import { RemoteToolkitRouter, type RemoteToolkitRouterConfig } from './remote.js';

export type ExecutionProfile = 'local-full' | 'remote-full' | 'remote-brain-local-hands' | 'custom';

export interface ExecutionConfig {
  /** LLM推理位置 */
  llm: 'local' | 'remote';
  /** Agent实例位置 */
  agents: 'local' | 'remote';
  /** 文件操作位置 */
  files: 'local' | 'remote';
  /** 命令执行位置 */
  commands: 'local' | 'remote';
  /** 远端连接配置 */
  remote?: RemoteToolkitRouterConfig;
  /** 本地工作目录 */
  localWorkspace: string;
}

const FILE_TOOLS = new Set(['read_file', 'write_file', 'edit_file', 'list_directory']);
const CMD_TOOLS = new Set(['bash', 'run_tests', 'run_linter']);
const GIT_TOOLS = new Set(['git_status', 'git_commit', 'git_push', 'git_branch', 'git_diff', 'git_log']);

const PROFILES: Record<Exclude<ExecutionProfile, 'custom'>, Omit<ExecutionConfig, 'localWorkspace' | 'remote'>> = {
  'local-full':            { llm: 'local', agents: 'local', files: 'local', commands: 'local' },
  'remote-full':           { llm: 'remote', agents: 'remote', files: 'remote', commands: 'remote' },
  'remote-brain-local-hands': { llm: 'remote', agents: 'remote', files: 'local', commands: 'local' },
};

const PRESET_PROFILES = new Set<string>(Object.keys(PROFILES));

export function createExecutionConfig(
  profile: ExecutionProfile,
  options: { localWorkspace: string; remote?: RemoteToolkitRouterConfig; overrides?: Partial<ExecutionConfig> },
): ExecutionConfig {
  if (profile !== 'custom' && !PRESET_PROFILES.has(profile)) {
    throw new Error(`unknown ExecutionProfile: ${profile}`);
  }
  const base = profile === 'custom'
    ? { llm: 'remote' as const, agents: 'remote' as const, files: 'local' as const, commands: 'local' as const }
    : PROFILES[profile];
  return { ...base, ...options.overrides, localWorkspace: options.localWorkspace, remote: options.remote };
}

export class HybridToolkitRouter implements IToolkitRouter {
  private local: LocalToolkitRouter;
  private remote: RemoteToolkitRouter | null;
  private config: ExecutionConfig;

  constructor(config: ExecutionConfig) {
    this.config = config;
    this.local = new LocalToolkitRouter();
    this.remote = config.remote ? new RemoteToolkitRouter(config.remote) : null;
  }

  async execute(toolCall: ToolCall, workspace: string): Promise<ToolResult> {
    const toolName = toolCall.function.name;
    const router = this.resolveRouter(toolName);
    // 本地文件工具使用 localWorkspace，远端工具使用传入的 workspace
    const targetWorkspace = this.isLocalTool(toolName) ? this.config.localWorkspace : workspace;
    return router.execute(toolCall, targetWorkspace);
  }

  private resolveRouter(toolName: string): IToolkitRouter {
    if (FILE_TOOLS.has(toolName)) {
      return this.config.files === 'local' || !this.remote ? this.local : this.remote;
    }
    if (CMD_TOOLS.has(toolName) || GIT_TOOLS.has(toolName)) {
      return this.config.commands === 'local' || !this.remote ? this.local : this.remote;
    }
    return this.remote ?? this.local;
  }

  private isLocalTool(toolName: string): boolean {
    if (FILE_TOOLS.has(toolName)) return this.config.files === 'local';
    if (CMD_TOOLS.has(toolName) || GIT_TOOLS.has(toolName)) return this.config.commands === 'local';
    return false;
  }
}
