import { ipcMain, BrowserWindow, dialog, safeStorage } from 'electron';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import type { LLMConfig } from '../orchestrator/src/llm/types.js';
import { resolveConfig } from '../orchestrator/src/llm/openai.js';
import { RouterFactory } from '../orchestrator/src/toolkit/router.js';
import { LocalToolkitRouter } from '../orchestrator/src/toolkit/local.js';
import { RemoteToolkitRouter } from '../orchestrator/src/toolkit/remote.js';
import { TeamCoordinator, type WorkspaceConfirmRequest } from '../orchestrator/src/team/coordinator.js';
import { getAvailableRoles } from '../orchestrator/src/team/templates.js';

// ─── 安全存储 ───
// 使用 Electron safeStorage + 文件存储 API Key
// 比 electron-store 更轻量，无需额外依赖

interface SecureConfig {
  apiKey: string;
  provider: string;
  baseUrl: string;
  model: string;
  workspace: string;
  lastUsedRoles: string[];
}

const CONFIG_DIR = join(homedir(), '.mdh');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const ENCRYPTED_FILE = join(CONFIG_DIR, 'credentials.enc');

function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadSecureConfig(): Partial<SecureConfig> {
  ensureConfigDir();
  const result: Partial<SecureConfig> = {};

  // 加载非敏感配置
  if (existsSync(CONFIG_FILE)) {
    try {
      const raw = readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      result.provider = parsed.provider;
      result.baseUrl = parsed.baseUrl;
      result.model = parsed.model;
      result.workspace = parsed.workspace;
      result.lastUsedRoles = parsed.lastUsedRoles;
    } catch {}
  }

  // 加载加密的 API Key
  if (existsSync(ENCRYPTED_FILE) && safeStorage.isEncryptionAvailable()) {
    try {
      const encrypted = readFileSync(ENCRYPTED_FILE);
      result.apiKey = safeStorage.decryptString(encrypted);
    } catch {}
  }

  return result;
}

function saveSecureConfig(config: Partial<SecureConfig>) {
  ensureConfigDir();

  // 保存非敏感配置
  const existing = loadSecureConfig();
  const merged = { ...existing, ...config };

  const { apiKey, ...nonSensitive } = merged;
  writeFileSync(CONFIG_FILE, JSON.stringify(nonSensitive, null, 2));

  // 加密保存 API Key
  if (apiKey !== undefined && safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(apiKey);
    writeFileSync(ENCRYPTED_FILE, encrypted);
  }
}

// ─── 状态 ───
interface AppState {
  llmConfig: LLMConfig;
  workspace: string;
  coordinator: TeamCoordinator | null;
  routerFactory: RouterFactory;
  localRouter: LocalToolkitRouter;
  remoteRouter: RemoteToolkitRouter | null;
  lastUsedRoles: string[];
}

const state: AppState = {
  llmConfig: { provider: 'deepseek', apiKey: '', baseUrl: '', model: '' },
  workspace: '',
  coordinator: null,
  routerFactory: new RouterFactory(),
  localRouter: new LocalToolkitRouter(),
  remoteRouter: null,
  lastUsedRoles: ['coordinator', 'planner', 'executor', 'reviewer'],
};

// ─── 初始化 ───
export function registerIpcHandlers(llmConfig: Partial<LLMConfig>) {
  // 从安全存储加载配置
  const savedConfig = loadSecureConfig();

  // 合并：环境变量 > 保存的配置 > 传入的默认值
  state.llmConfig = resolveConfig({
    provider: llmConfig.provider || savedConfig.provider || 'deepseek',
    apiKey: llmConfig.apiKey || savedConfig.apiKey || '',
    baseUrl: llmConfig.baseUrl || savedConfig.baseUrl || '',
    model: llmConfig.model || savedConfig.model || '',
  });

  state.workspace = savedConfig.workspace || getDefaultWorkspace();
  state.lastUsedRoles = savedConfig.lastUsedRoles || state.lastUsedRoles;

  // 确保工作区目录存在
  if (!existsSync(state.workspace)) {
    mkdirSync(state.workspace, { recursive: true });
  }

  // 创建 Coordinator 实例
  state.coordinator = createCoordinator();

  // 注册所有 IPC 处理器
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

// ─── 工作区确认 ───
async function handleWorkspaceConfirm(request: WorkspaceConfirmRequest) {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    return { workspace_type: 'standalone' as const };
  }

  notifyRenderer('mdh:onWorkspaceConfirm', request);

  return new Promise((resolve) => {
    ipcMain.once('mdh:workspaceConfirmResponse', (_event, response) => {
      resolve(response);
    });
  });
}

// ─── 会议控制 ───
function registerMeetingHandlers() {
  ipcMain.handle('mdh:startMeeting', async (_event, data: {
    task: string;
    roles: string[];
    roleLocations?: Record<string, 'local' | 'remote'>;
  }) => {
    if (!state.coordinator) {
      return { error: 'Coordinator 未初始化' };
    }

    if (!state.llmConfig.apiKey) {
      return { error: '未配置 API Key，请在设置中配置' };
    }

    const { task, roles } = data;
    state.lastUsedRoles = roles;
    saveSecureConfig({ lastUsedRoles: roles });

    state.coordinator.execute(task, roles, (event) => {
      notifyRenderer('mdh:onAgentMessage', event);
    }).then((result) => {
      notifyRenderer('mdh:onAgentMessage', { type: 'meeting_ended', result });
    }).catch((err) => {
      notifyRenderer('mdh:onError', { type: 'error', message: String(err) });
    });

    return { status: 'started', meetingId: `meeting-${Date.now().toString(36)}` };
  });

  ipcMain.handle('mdh:sendMessage', async (_event, data: {
    content: string;
    roles?: string[];
  }) => {
    if (!state.coordinator) return { error: 'Coordinator 未初始化' };
    if (!state.llmConfig.apiKey) return { error: '未配置 API Key' };

    const { content, roles } = data;
    const selectedRoles = roles || state.lastUsedRoles;

    state.coordinator.execute(content, selectedRoles, (event) => {
      notifyRenderer('mdh:onAgentMessage', event);
    }).then((result) => {
      notifyRenderer('mdh:onAgentMessage', { type: 'meeting_ended', result });
    }).catch((err) => {
      notifyRenderer('mdh:onError', { type: 'error', message: String(err) });
    });

    return { status: 'sent' };
  });

  ipcMain.handle('mdh:castVote', async (_event, data: {
    proposalId: string;
    approve: boolean;
    reason?: string;
  }) => {
    notifyRenderer('mdh:onAgentMessage', { type: 'vote_cast', ...data });
    return { status: 'voted' };
  });

  ipcMain.handle('mdh:approval', async (_event, data: {
    requestId: string;
    approved: boolean;
    reason?: string;
  }) => {
    notifyRenderer('mdh:onAgentMessage', { type: 'approval_response', ...data });
    return { status: 'processed' };
  });

  ipcMain.handle('mdh:stopMeeting', async () => {
    state.coordinator = createCoordinator();
    notifyRenderer('mdh:onStatusChange', { type: 'meeting_stopped' });
    return { status: 'stopped' };
  });
}

// ─── 配置管理（集成安全存储）───
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

    // 持久化到安全存储
    saveSecureConfig({
      apiKey: state.llmConfig.apiKey,
      provider: state.llmConfig.provider,
      baseUrl: state.llmConfig.baseUrl,
      model: state.llmConfig.model,
    });

    // 重建 Coordinator
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
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
    };
  });

  // 获取完整配置（含解密的 API Key，仅供设置页面显示）
  ipcMain.handle('mdh:getFullConfig', async () => {
    return {
      provider: state.llmConfig.provider,
      apiKey: state.llmConfig.apiKey,
      baseUrl: state.llmConfig.baseUrl,
      model: state.llmConfig.model,
      workspace: state.workspace,
      lastUsedRoles: state.lastUsedRoles,
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
    saveSecureConfig({ workspace: state.workspace });
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
      saveSecureConfig({ workspace: state.workspace });
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

// ─── 自动更新 ───
// 注意：更新相关 IPC 由 main.ts 中的 autoUpdater 直接处理
// 这里注册应用版本查询
ipcMain.handle('mdh:getAppVersion', async () => {
  return {
    version: app.getVersion(),
    name: app.getName(),
  };
});

// ─── 向渲染进程推送消息 ───
export function notifyRenderer(channel: string, data: unknown) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data);
  }
}

// ─── 默认工作区 ───
function getDefaultWorkspace(): string {
  return join(homedir(), '.mdh-workspaces', 'default');
}
