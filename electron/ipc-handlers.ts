import { app, ipcMain, BrowserWindow, dialog, safeStorage } from 'electron';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';

// Orchestrator 模块通过动态 import 加载（ESM/CJS 兼容）
type LLMConfig = {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
};

type WorkspaceConfirmRequest = {
  taskDescription: string;
  suggestedType: 'standalone' | 'git_worktree';
  options: {
    workspace_types: Array<{ id: string; name: string; desc: string }>;
  };
};

// 延迟加载的 orchestrator 模块
let resolveConfig: ((config: Partial<LLMConfig>) => LLMConfig) | null = null;
let RouterFactory: any = null;
let LocalToolkitRouter: any = null;
let TeamCoordinator: any = null;
let getAvailableRoles: (() => any[]) | null = null;

async function loadOrchestratorModules() {
  if (resolveConfig) return; // 已加载

  try {
    const openai = await import('../orchestrator/src/llm/openai.js');
    resolveConfig = openai.resolveConfig;

    const router = await import('../orchestrator/src/toolkit/router.js');
    RouterFactory = router.RouterFactory;

    const local = await import('../orchestrator/src/toolkit/local.js');
    LocalToolkitRouter = local.LocalToolkitRouter;

    const coordinator = await import('../orchestrator/src/team/coordinator.js');
    TeamCoordinator = coordinator.TeamCoordinator;

    const templates = await import('../orchestrator/src/team/templates.js');
    getAvailableRoles = templates.getAvailableRoles;
  } catch (e) {
    console.error('Failed to load orchestrator modules:', e);
  }
}

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
  coordinator: any;
  routerFactory: any;
  localRouter: any;
  remoteRouter: any;
  lastUsedRoles: string[];
}

const state: AppState = {
  llmConfig: { provider: 'deepseek', apiKey: '', baseUrl: '', model: '' },
  workspace: '',
  coordinator: null,
  routerFactory: null,
  localRouter: null,
  remoteRouter: null,
  lastUsedRoles: ['coordinator', 'planner', 'executor', 'reviewer'],
};

// ─── 初始化 ───
export async function registerIpcHandlers(llmConfig: Partial<LLMConfig>) {
  // 加载 orchestrator 模块
  await loadOrchestratorModules();

  // 初始化 orchestrator 组件
  if (RouterFactory) state.routerFactory = new RouterFactory();
  if (LocalToolkitRouter) state.localRouter = new LocalToolkitRouter();

  // 从安全存储加载配置
  const savedConfig = loadSecureConfig();

  // 合并：环境变量 > 保存的配置 > 传入的默认值
  const rawConfig = {
    provider: llmConfig.provider || savedConfig.provider || 'deepseek',
    apiKey: llmConfig.apiKey || savedConfig.apiKey || '',
    baseUrl: llmConfig.baseUrl || savedConfig.baseUrl || '',
    model: llmConfig.model || savedConfig.model || '',
  };

  state.llmConfig = resolveConfig ? resolveConfig(rawConfig) : rawConfig as LLMConfig;

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

function createCoordinator(): any {
  if (!TeamCoordinator) {
    console.warn('TeamCoordinator not loaded');
    return null;
  }
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

// ─── YAML 简单解析工具 ───
// 只解析顶级 key-value 和二级缩进块，足够提取 tools/skills 定义
function parseYamlSection(yamlContent: string, sectionName: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yamlContent.split('\n');
  let inSection = false;
  let currentKey = '';
  let currentBlock: string[] = [];

  for (const line of lines) {
    // 检测顶级 section 开始（如 "tools:" 或 "skills:"）
    if (line.match(new RegExp(`^${sectionName}:\\s*$`))) {
      inSection = true;
      continue;
    }
    // 遇到下一个顶级 key，结束
    if (inSection && line.match(/^[a-zA-Z_]/) && !line.startsWith(' ')) {
      if (currentKey && currentBlock.length) {
        result[currentKey] = parseYamlBlock(currentBlock);
      }
      break;
    }
    if (!inSection) continue;

    // 二级 key（如 "bash:"）
    const keyMatch = line.match(/^  ([a-zA-Z_][a-zA-Z0-9_]*):/);
    if (keyMatch) {
      if (currentKey && currentBlock.length) {
        result[currentKey] = parseYamlBlock(currentBlock);
      }
      currentKey = keyMatch[1];
      currentBlock = [];
      // 检查是否有同行值
      const inlineMatch = line.match(/^  [a-zA-Z_][a-zA-Z0-9_]*:\s*(.+)$/);
      if (inlineMatch) {
        currentBlock.push(inlineMatch[1]);
      }
      continue;
    }
    // 三级缩进内容追加到当前 block
    if (inSection && currentKey && line.match(/^    /)) {
      currentBlock.push(line.trim());
    }
  }
  // 处理最后一个
  if (currentKey && currentBlock.length) {
    result[currentKey] = parseYamlBlock(currentBlock);
  }
  return result;
}

function parseYamlBlock(lines: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.+)$/);
    if (m) {
      obj[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  }
  return obj;
}

// ─── 角色管理 ───
function registerRoleHandlers() {
  ipcMain.handle('mdh:getRoles', async () => {
    if (getAvailableRoles) {
      return getAvailableRoles();
    }
    return getDefaultRoles();
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

  // ─── 角色配置完整数据（替代 /api/roles/config）───
  // 返回格式与 Python 后端一致：{ success: true, data: { base_roles, custom_roles, prompt_templates, tools, skills } }
  ipcMain.handle('mdh:getRolesConfig', async () => {
    try {
      const result: any = { base_roles: {}, custom_roles: {}, prompt_templates: {}, tools: {}, skills: {} };

      // 1. 加载 orchestrator 的 roles.json（角色和提示词模板）
      const jsonPath = join(__dirname, '../orchestrator/templates/roles.json');
      if (existsSync(jsonPath)) {
        const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
        result.base_roles = data.base_roles || {};
        result.custom_roles = data.custom_roles || {};
        result.prompt_templates = data.prompt_templates || {};
        console.log('[IPC] Loaded roles.json:', Object.keys(result.base_roles).length, 'base roles');
      }

      // 2. 加载 backend/roles_config.yaml（工具和技能定义）
      const yamlPath = join(__dirname, '../backend/roles_config.yaml');
      if (existsSync(yamlPath)) {
        const yamlContent = readFileSync(yamlPath, 'utf-8');
        // 简单解析 YAML 的 tools 和 skills 顶级段
        result.tools = parseYamlSection(yamlContent, 'tools');
        result.skills = parseYamlSection(yamlContent, 'skills');
        console.log('[IPC] Loaded tools:', Object.keys(result.tools).length, 'skills:', Object.keys(result.skills).length);
      }

      return { success: true, data: result, error: null };
    } catch (e) {
      console.error('[IPC] Failed to load roles config:', e);
      return { success: false, data: null, error: String(e) };
    }
  });

  // ─── 技能包列表（替代 /api/skills/list）───
  // 返回格式：{ success: true, data: { skills: [...] } }
  ipcMain.handle('mdh:getSkillsList', async () => {
    try {
      const skillsDir = join(__dirname, '../skill_packs');
      if (!existsSync(skillsDir)) {
        console.warn('[IPC] skill_packs dir not found at:', skillsDir);
        return { success: true, data: { skills: [] }, error: null };
      }
      const skills = [];
      for (const name of readdirSync(skillsDir)) {
        const skillDir = join(skillsDir, name);
        if (!statSync(skillDir).isDirectory()) continue;
        const manifestPath = join(skillDir, 'manifest.yaml');
        if (existsSync(manifestPath)) {
          const content = readFileSync(manifestPath, 'utf-8');
          // 简单解析 YAML 的 name 和 description 字段
          const nameMatch = content.match(/^name:\s*(.+)$/m);
          const descMatch = content.match(/^description:\s*(.+)$/m);
          skills.push({
            name: nameMatch?.[1]?.trim() || name,
            description: descMatch?.[1]?.trim() || '',
            dir: name,
          });
        }
      }
      console.log('[IPC] Loaded', skills.length, 'skill packs');
      // 包装成与 Python 后端一致的格式
      return { success: true, data: { skills }, error: null };
    } catch (e) {
      console.error('[IPC] Failed to load skills list:', e);
      return { success: false, data: null, error: String(e) };
    }
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

// ─── 默认角色 ───
function getDefaultRoles() {
  return [
    { id: 'planner', name: '架构师', team_role: 'Planner', description: '分析技术任务、设计系统架构、分解子任务' },
    { id: 'executor', name: '全栈开发', team_role: 'Executor', description: '代码编写和功能实现' },
    { id: 'reviewer', name: 'QA工程师', team_role: 'Reviewer', description: '代码审查、测试、质量保证' },
    { id: 'monitor', name: 'DevOps', team_role: 'Monitor', description: '部署、监控、运维' },
    { id: 'coordinator', name: '项目经理', team_role: 'Coordinator', description: '协调各方、跟踪进度、管理风险' },
  ];
}
