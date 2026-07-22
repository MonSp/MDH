import { ipcMain, BrowserWindow, dialog } from 'electron';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync } from 'fs';
import type { LLMConfig } from '../orchestrator/src/llm/types.js';
import { resolveConfig } from '../orchestrator/src/llm/openai.js';
import { RouterFactory } from '../orchestrator/src/toolkit/router.js';
import { LocalToolkitRouter } from '../orchestrator/src/toolkit/local.js';
import { RemoteToolkitRouter } from '../orchestrator/src/toolkit/remote.js';
import { TeamCoordinator, type WorkspaceConfirmRequest } from '../orchestrator/src/team/coordinator.js';
import { getAvailableRoles } from '../orchestrator/src/team/templates.js';

// ─── 状态 ───
interface AppState {
  llmConfig: LLMConfig;
  workspace: string;
  coordinator: TeamCoordinator | null;
  routerFactory: RouterFactory;
  localRouter: LocalToolkitRouter;
  remoteRouter: RemoteToolkitRouter | null;
}

const state: AppState = {
  llmConfig: { provider: 'deepseek', apiKey: '', baseUrl: '', model: '' },
  workspace: '',
  coordinator: null,
  routerFactory: new RouterFactory(),
  localRouter: new LocalToolkitRouter(),
  remoteRouter: null,
};

// ─── 初始化 ───
export function registerIpcHandlers(llmConfig: Partial<LLMConfig>) {
  state.llmConfig = resolveConfig(llmConfig);
  state.workspace = getDefaultWorkspace();

  // 确保工作区目录存在
  if (!existsSync(state.workspace)) {
    mkdirSync(state.workspace, { recursive: true });
  }

  // 创建 Coordinator 实例
  state.coordinator = createCoordinator();

  // ─── 注册所有 IPC 处理器 ───
  registerMeetingHandlers();
  registerConfigHandlers();
  registerWorkspaceHandlers();
  registerRoleHandlers();
}

function createCoordinator(): TeamCoordinator {
  return new TeamCoordinator({
    llm: state.llmConfig,
    routerFactory: state.routerFactory,
    defaultRouter: state.localRouter,
    workspace: state.workspace,
    onWorkspaceConfirm: handleWorkspaceConfirm,
  });
}

// ─── 工作区确认（弹对话框让用户选择）───
async function handleWorkspaceConfirm(request: WorkspaceConfirmRequest) {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    return { workspace_type: 'standalone' as const };
  }

  // 通知前端弹出确认对话框
  notifyRenderer('mdh:onWorkspaceConfirm', request);

  // 等待前端响应（通过 IPC 返回）
  return new Promise((resolve) => {
    ipcMain.once('mdh:workspaceConfirmResponse', (_event, response) => {
      resolve(response);
    });
  });
}

// ─── 会议控制 ───
function registerMeetingHandlers() {
  // 启动会议
  ipcMain.handle('mdh:startMeeting', async (_event, data: {
    task: string;
    roles: string[];
    roleLocations?: Record<string, 'local' | 'remote'>;
  }) => {
    if (!state.coordinator) {
      return { error: 'Coordinator 未初始化' };
    }

    const { task, roles, roleLocations } = data;

    // 异步执行（不阻塞 IPC 返回）
    state.coordinator.execute(task, roles, (event) => {
      // 将 Orchestrator 事件推送到前端
      notifyRenderer('mdh:onAgentMessage', event);
    }).then((result) => {
      notifyRenderer('mdh:onAgentMessage', {
        type: 'meeting_ended',
        result,
      });
    }).catch((err) => {
      notifyRenderer('mdh:onError', {
        type: 'error',
        message: String(err),
      });
    });

    return { status: 'started', meetingId: `meeting-${Date.now().toString(36)}` };
  });

  // 发送用户消息（追加到当前会议）
  ipcMain.handle('mdh:sendMessage', async (_event, data: {
    content: string;
    roles?: string[];
  }) => {
    if (!state.coordinator) {
      return { error: 'Coordinator 未初始化' };
    }

    // 如果有活跃会议，追加消息；否则启动新会议
    const { content, roles } = data;
    const selectedRoles = roles || ['coordinator', 'planner', 'executor', 'reviewer'];

    state.coordinator.execute(content, selectedRoles, (event) => {
      notifyRenderer('mdh:onAgentMessage', event);
    }).then((result) => {
      notifyRenderer('mdh:onAgentMessage', {
        type: 'meeting_ended',
        result,
      });
    }).catch((err) => {
      notifyRenderer('mdh:onError', {
        type: 'error',
        message: String(err),
      });
    });

    return { status: 'sent' };
  });

  // 投票
  ipcMain.handle('mdh:castVote', async (_event, data: {
    proposalId: string;
    approve: boolean;
    reason?: string;
  }) => {
    // TODO: 集成协商引擎
    notifyRenderer('mdh:onAgentMessage', {
      type: 'vote_cast',
      ...data,
    });
    return { status: 'voted' };
  });

  // 审批响应
  ipcMain.handle('mdh:approval', async (_event, data: {
    requestId: string;
    approved: boolean;
    reason?: string;
  }) => {
    notifyRenderer('mdh:onAgentMessage', {
      type: 'approval_response',
      ...data,
    });
    return { status: 'processed' };
  });

  // 停止当前会议
  ipcMain.handle('mdh:stopMeeting', async () => {
    // 重建 Coordinator（停止当前执行）
    state.coordinator = createCoordinator();
    notifyRenderer('mdh:onStatusChange', { type: 'meeting_stopped' });
    return { status: 'stopped' };
  });
}

// ─── 配置管理 ───
function registerConfigHandlers() {
  ipcMain.handle('mdh:getLlmConfig', async () => {
    return {
      provider: state.llmConfig.provider,
      baseUrl: state.llmConfig.baseUrl,
      model: state.llmConfig.model,
      hasApiKey: !!state.llmConfig.apiKey,
    };
  });

  ipcMain.handle('mdh:setLlmConfig', async (_event, config: Partial<LLMConfig>) => {
    state.llmConfig = resolveConfig({ ...state.llmConfig, ...config });
    // 重建 Coordinator 以使用新配置
    state.coordinator = createCoordinator();
    notifyRenderer('mdh:onStatusChange', { type: 'config_updated' });
    return { status: 'updated' };
  });

  ipcMain.handle('mdh:getHealth', async () => {
    return {
      status: 'ok',
      uptime: process.uptime(),
      hasApiKey: !!state.llmConfig.apiKey,
      workspace: state.workspace,
      platform: process.platform,
    };
  });
}

// ─── 工作区管理 ───
function registerWorkspaceHandlers() {
  ipcMain.handle('mdh:getWorkspace', async () => {
    return { path: state.workspace };
  });

  ipcMain.handle('mdh:setWorkspace', async (_event, data: { path: string }) => {
    state.workspace = data.path;
    if (!existsSync(state.workspace)) {
      mkdirSync(state.workspace, { recursive: true });
    }
    // 重建 Coordinator
    state.coordinator = createCoordinator();
    return { status: 'updated', path: state.workspace };
  });

  ipcMain.handle('mdh:selectWorkspace', async () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return { canceled: true };

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择工作区目录',
      defaultPath: state.workspace,
    });

    if (!result.canceled && result.filePaths.length > 0) {
      state.workspace = result.filePaths[0];
      state.coordinator = createCoordinator();
      return { canceled: false, path: state.workspace };
    }
    return { canceled: true };
  });
}

// ─── 角色管理 ───
function registerRoleHandlers() {
  ipcMain.handle('mdh:getRoles', async () => {
    return getAvailableRoles();
  });

  ipcMain.handle('mdh:getTeamPresets', async () => {
    return [
      {
        id: 'full',
        name: '完整团队',
        description: '架构师 + 开发 + QA + DevOps + 项目经理',
        roles: ['planner', 'executor', 'reviewer', 'monitor', 'coordinator'],
      },
      {
        id: 'dev',
        name: '开发团队',
        description: '架构师 + 开发 + QA',
        roles: ['planner', 'executor', 'reviewer'],
      },
      {
        id: 'solo',
        name: '单人助理',
        description: '仅执行者，适合简单任务',
        roles: ['executor'],
      },
      {
        id: 'custom',
        name: '自定义',
        description: '手动选择角色和位置',
        roles: [],
      },
    ];
  });
}

// ─── 向渲染进程推送消息 ───
function notifyRenderer(channel: string, data: unknown) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data);
  }
}

// ─── 默认工作区 ───
function getDefaultWorkspace(): string {
  return join(homedir(), '.mdh-workspaces', 'default');
}
