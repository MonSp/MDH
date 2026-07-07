import type { ToolCall, ToolResult } from '../team/types.js';
import type { TeamMember, TeamRuntime } from '../team/team.js';
import { LocalToolkitRouter } from './local.js';
import { RemoteToolkitRouter } from './remote.js';

export interface IToolkitRouter {
  execute(toolCall: ToolCall, workspace: string): Promise<ToolResult>;
}

/**
 * RouterFactory — 为每个 TeamMember 创建对应的 ToolkitRouter
 *
 * 根据 member.location 决定：
 * - 'local'  → LocalToolkitRouter (本地文件系统)
 * - 'remote' → RemoteToolkitRouter (HTTP → Python Executor)
 */
export class RouterFactory {
  private localRouter = new LocalToolkitRouter();
  private remoteRouters = new Map<string, RemoteToolkitRouter>();

  getRouterForMember(member: TeamMember): IToolkitRouter {
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
