import type { ToolCall, ToolResult } from '../team/types.js';
import type { TeamMember, TeamRuntime } from '../team/team.js';
import { LocalToolkitRouter } from './local.js';
import { RemoteToolkitRouter } from './remote.js';
import { HybridToolkitRouter, createExecutionConfig, type ExecutionProfile } from './hybrid.js';

export interface IToolkitRouter {
  execute(toolCall: ToolCall, workspace: string): Promise<ToolResult>;
}

/** TeamRuntime 上可选的 per-agent hybrid 配置 */
interface HybridRuntime {
  hybrid?: { profile?: ExecutionProfile };
}

/**
 * RouterFactory — 为每个 TeamMember 创建对应的 ToolkitRouter
 *
 * 根据 member.runtime / member.location 决定：
 * - runtime.hybrid.profile  → HybridToolkitRouter (per-agent 混合路由)
 * - 'local'  → LocalToolkitRouter (本地文件系统)
 * - 'remote' → RemoteToolkitRouter (HTTP → Python Executor)
 */
export class RouterFactory {
  private localRouter = new LocalToolkitRouter();
  private remoteRouters = new Map<string, RemoteToolkitRouter>();

  getRouterForMember(member: TeamMember): IToolkitRouter {
    // Per-agent hybrid：runtime 携带 hybrid.profile 时返回混合路由
    const hybridRuntime = member.runtime as TeamRuntime & HybridRuntime;
    const hybrid = hybridRuntime.hybrid;
    if (hybrid?.profile) {
      const remote = member.runtime.executorUrl
        ? { executorUrl: member.runtime.executorUrl, token: member.runtime.executorToken }
        : undefined;
      return new HybridToolkitRouter(createExecutionConfig(hybrid.profile, {
        localWorkspace: this.getWorkspaceForMember(member),
        remote,
      }));
    }

    if (member.location === 'local') {
      return this.localRouter;
    }

    // Remote: 缓存 RemoteToolkitRouter per executor URL
    const url = member.runtime.executorUrl || '';
    if (!this.remoteRouters.has(url)) {
      this.remoteRouters.set(url, new RemoteToolkitRouter({
        executorUrl: url,
        token: member.runtime.executorToken,
      }));
    }
    return this.remoteRouters.get(url)!;
  }

  getWorkspaceForMember(member: TeamMember): string {
    return member.runtime.workspace;
  }
}
