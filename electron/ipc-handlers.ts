import { app, ipcMain, BrowserWindow, dialog, safeStorage } from 'electron';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';

// ─── 内联 LLM 调用（不依赖 orchestrator ESM 模块）───
const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-20250514' },
  ollama: { baseUrl: 'http://localhost:11434/v1', model: 'qwen3:14b' },
  custom: { baseUrl: '', model: '' },
};

type LLMConfig = { provider: string; apiKey: string; baseUrl: string; model: string };

function resolveConfig(config: Partial<LLMConfig>): LLMConfig {
  const defaults = PROVIDER_DEFAULTS[config.provider || 'deepseek'];
  return {
    provider: config.provider || 'deepseek',
    apiKey: config.apiKey || '',
    baseUrl: config.baseUrl || defaults?.baseUrl || '',
    model: config.model || defaults?.model || '',
  };
}

async function chatCompletion(config: LLMConfig, messages: Array<{role: string; content: string}>, tools?: any[]): Promise<string> {
  const url = `${config.baseUrl}/chat/completions`;
  const body: any = { model: config.model, messages, stream: false };
  if (tools?.length) { body.tools = tools; body.tool_choice = 'auto'; }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!resp.ok) throw new Error(`LLM API error: ${resp.status} ${resp.statusText}`);
  const data = await resp.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

// ─── 内联 TeamCoordinator ───
// 简化版：分析 → 讨论 → 执行，不依赖 orchestrator ESM 模块

type EventHandler = (event: Record<string, unknown>) => void;

interface WorkspaceConfirmRequest {
  taskDescription: string;
  suggestedType: 'standalone' | 'git_worktree';
  options: { workspace_types: Array<{ id: string; name: string; desc: string }> };
}

class SimpleTeamCoordinator {
  private config: { llm: LLMConfig; workspace: string; onWorkspaceConfirm?: (req: WorkspaceConfirmRequest) => Promise<any> };

  constructor(config: { llm: LLMConfig; workspace: string; onWorkspaceConfirm?: (req: WorkspaceConfirmRequest) => Promise<any> }) {
    this.config = config;
  }

  async execute(userMessage: string, selectedRoles: string[], onEvent?: EventHandler): Promise<string> {
    const roles = selectedRoles.length > 0 ? selectedRoles : ['coordinator', 'planner', 'executor', 'reviewer'];

    // 阶段 0: 分析
    onEvent?.({ type: 'phase', phase: 'analyzing' });
    onEvent?.({ type: 'assistant_message', agentId: 'agent-ceo', content: `收到任务：${userMessage}\n\n正在分析任务复杂度...` });

    let complexity: { level: string; reason: string };
    try {
      const analysisPrompt = `分析以下任务复杂度，返回JSON: {"level":"simple"或"complex","reason":"原因"}\n\n任务：${userMessage}`;
      const analysisText = await chatCompletion(this.config.llm, [{ role: 'user', content: analysisPrompt }]);
      const jsonMatch = analysisText.match(/\{[^{}]*\}/);
      complexity = jsonMatch ? JSON.parse(jsonMatch[0]) : { level: 'complex', reason: '默认复杂' };
    } catch (e) {
      complexity = { level: 'complex', reason: `分析失败: ${e}` };
    }
    onEvent?.({ type: 'assistant_message', agentId: 'agent-ceo', content: `任务分析完成：复杂度=${complexity.level}，${complexity.reason}` });

    // 阶段 0.5: 工作区确认
    onEvent?.({ type: 'phase', phase: 'planning' });
    let workspace = this.config.workspace;

    if (this.config.onWorkspaceConfirm) {
      onEvent?.({ type: 'assistant_message', agentId: 'agent-ceo', content: '正在创建工作区...' });
      try {
        const confirmReq: WorkspaceConfirmRequest = {
          taskDescription: userMessage.substring(0, 200),
          suggestedType: 'standalone',
          options: {
            workspace_types: [
              { id: 'standalone', name: '新建独立工作区', desc: '创建全新空目录' },
              { id: 'git_worktree', name: 'Git Worktree', desc: '从已有仓库创建隔离分支' },
            ],
          },
        };
        const resp = await this.config.onWorkspaceConfirm(confirmReq);
        if (resp?.workspace_type === 'git_worktree' && resp.repo_path) {
          const branch = resp.branch_name || `agent/task-${Date.now().toString(36)}`;
          workspace = `${this.config.workspace}/worktrees/${branch.replace('/', '-')}`;
        } else {
          workspace = `${this.config.workspace}/project-${Date.now().toString(36)}`;
        }
        mkdirSync(workspace, { recursive: true });
        onEvent?.({ type: 'assistant_message', agentId: 'agent-ceo', content: `已创建工作区：${workspace}` });
      } catch (e) {
        onEvent?.({ type: 'assistant_message', agentId: 'agent-ceo', content: `工作区创建失败，使用默认目录` });
      }
    }

    // 阶段 1: 组建团队
    const meetingId = `meeting-${Date.now().toString(36)}`;
    const agents = roles.map(r => ({
      id: `agent-${r}`,
      name: getRoleName(r),
      role: r,
      status: 'meeting',
      capabilities: [],
    }));
    onEvent?.({ type: 'meeting_started', meetingId, agents });
    onEvent?.({ type: 'assistant_message', agentId: 'agent-ceo', content: `团队已组建：${agents.map(a => a.name).join('、')}` });

    // 阶段 2: 讨论（复杂任务）
    if (complexity.level !== 'simple' && roles.length > 1) {
      onEvent?.({ type: 'phase', phase: 'discussing' });
      for (const role of roles) {
        if (role === 'ceo') continue;
        try {
          const prompt = `你是${getRoleName(role)}。任务：${userMessage}\n\n请从你的专业角度给出2-3句话的建议。用 [STANCE:support/oppose/modify/neutral] 和 [CONFIDENCE:0.0-1.0] 标注立场。`;
          const reply = await chatCompletion(this.config.llm, [{ role: 'user', content: prompt }]);
          onEvent?.({ type: 'assistant_message', agentId: `agent-${role}`, content: reply });
        } catch (e) {
          onEvent?.({ type: 'assistant_message', agentId: `agent-${role}`, content: `[${role}] 讨论发言失败: ${e}` });
        }
      }
    }

    // 阶段 3: 执行
    onEvent?.({ type: 'phase', phase: 'executing' });
    const executorRole = roles.find(r => r === 'executor') || roles[roles.length - 1];
    try {
      const execPrompt = `你是${getRoleName(executorRole)}。请执行以下任务：\n${userMessage}\n\n工作区：${workspace}\n\n请直接输出执行结果。`;
      const result = await chatCompletion(this.config.llm, [{ role: 'user', content: execPrompt }]);
      onEvent?.({ type: 'assistant_message', agentId: `agent-${executorRole}`, content: result });
    } catch (e) {
      onEvent?.({ type: 'error', message: `执行失败: ${e}` });
    }

    // 阶段 4: 总结
    onEvent?.({ type: 'phase', phase: 'summarizing' });
    onEvent?.({ type: 'assistant_message', agentId: 'agent-coordinator', content: `任务执行完成。工作区：${workspace}` });

    return `任务完成，工作区：${workspace}`;
  }
}

function getRoleName(role: string): string {
  const names: Record<string, string> = {
    coordinator: '项目经理', planner: '架构师', executor: '全栈开发',
    reviewer: 'QA工程师', monitor: 'DevOps', ceo: 'CTO',
  };
  return names[role] || role;
}

// ─── 安全存储 ───
interface SecureConfig {
  apiKey: string; provider: string; baseUrl: string; model: string;
  workspace: string; lastUsedRoles: string[];
}

const CONFIG_DIR = join(homedir(), '.mdh');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const ENCRYPTED_FILE = join(CONFIG_DIR, 'credentials.enc');

function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

function loadSecureConfig(): Partial<SecureConfig> {
  ensureConfigDir();
  const result: Partial<SecureConfig> = {};
  if (existsSync(CONFIG_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      result.provider = parsed.provider;
      result.baseUrl = parsed.baseUrl;
      result.model = parsed.model;
      result.workspace = parsed.workspace;
      result.lastUsedRoles = parsed.lastUsedRoles;
    } catch {}
  }
  if (existsSync(ENCRYPTED_FILE) && safeStorage.isEncryptionAvailable()) {
    try { result.apiKey = safeStorage.decryptString(readFileSync(ENCRYPTED_FILE)); } catch {}
  }
  return result;
}

function saveSecureConfig(config: Partial<SecureConfig>) {
  ensureConfigDir();
  const existing = loadSecureConfig();
  const merged = { ...existing, ...config };
  const { apiKey, ...nonSensitive } = merged;
  writeFileSync(CONFIG_FILE, JSON.stringify(nonSensitive, null, 2));
  if (apiKey !== undefined && safeStorage.isEncryptionAvailable()) {
    writeFileSync(ENCRYPTED_FILE, safeStorage.encryptString(apiKey));
  }
}

// ─── 状态 ───
interface AppState {
  llmConfig: LLMConfig;
  workspace: string;
  coordinator: SimpleTeamCoordinator | null;
  lastUsedRoles: string[];
}

const state: AppState = {
  llmConfig: { provider: 'deepseek', apiKey: '', baseUrl: '', model: '' },
  workspace: '',
  coordinator: null,
  lastUsedRoles: ['coordinator', 'planner', 'executor', 'reviewer'],
};

// ─── 初始化 ───
export async function registerIpcHandlers(llmConfig: Partial<LLMConfig>) {
  const savedConfig = loadSecureConfig();

  const rawConfig = {
    provider: llmConfig.provider || savedConfig.provider || 'deepseek',
    apiKey: llmConfig.apiKey || savedConfig.apiKey || '',
    baseUrl: llmConfig.baseUrl || savedConfig.baseUrl || '',
    model: llmConfig.model || savedConfig.model || '',
  };

  state.llmConfig = resolveConfig(rawConfig);
  state.workspace = savedConfig.workspace || getDefaultWorkspace();
  state.lastUsedRoles = savedConfig.lastUsedRoles || state.lastUsedRoles;

  if (!existsSync(state.workspace)) mkdirSync(state.workspace, { recursive: true });

  state.coordinator = new SimpleTeamCoordinator({
    llm: state.llmConfig,
    workspace: state.workspace,
    onWorkspaceConfirm: handleWorkspaceConfirm,
  });

  console.log('[MDH] Coordinator initialized, workspace:', state.workspace);

  registerMeetingHandlers();
  registerConfigHandlers();
  registerWorkspaceHandlers();
  registerRoleHandlers();
}

function recreateCoordinator() {
  state.coordinator = new SimpleTeamCoordinator({
    llm: state.llmConfig,
    workspace: state.workspace,
    onWorkspaceConfirm: handleWorkspaceConfirm,
  });
}

// ─── 工作区确认 ───
async function handleWorkspaceConfirm(request: WorkspaceConfirmRequest) {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return { workspace_type: 'standalone' as const };

  notifyRenderer('mdh:onWorkspaceConfirm', request);

  return new Promise<any>((resolve) => {
    ipcMain.once('mdh:workspaceConfirmResponse', (_event, response) => {
      resolve(response);
    });
    // 超时 30 秒自动选择 standalone
    setTimeout(() => resolve({ workspace_type: 'standalone' }), 30000);
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
      console.error('[MDH] Coordinator not initialized');
      return { error: 'Coordinator 未初始化' };
    }

    if (!state.llmConfig.apiKey) {
      return { error: '未配置 API Key，请在设置中配置' };
    }

    const { task, roles } = data;
    state.lastUsedRoles = roles;
    saveSecureConfig({ lastUsedRoles: roles });

    // 异步执行
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
    recreateCoordinator();
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
    saveSecureConfig({
      apiKey: state.llmConfig.apiKey,
      provider: state.llmConfig.provider,
      baseUrl: state.llmConfig.baseUrl,
      model: state.llmConfig.model,
    });
    recreateCoordinator();
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
    if (!existsSync(state.workspace)) mkdirSync(state.workspace, { recursive: true });
    saveSecureConfig({ workspace: state.workspace });
    recreateCoordinator();
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
      recreateCoordinator();
      return { canceled: false, path: state.workspace };
    }
    return { canceled: true };
  });
}

// ─── 角色管理 ───
function registerRoleHandlers() {
  ipcMain.handle('mdh:getRoles', async () => {
    return getDefaultRoles();
  });

  ipcMain.handle('mdh:getTeamPresets', async () => {
    return [
      { id: 'full', name: '完整团队', description: '架构师 + 开发 + QA + DevOps + 项目经理', roles: ['planner', 'executor', 'reviewer', 'monitor', 'coordinator'] },
      { id: 'dev', name: '开发团队', description: '架构师 + 开发 + QA', roles: ['planner', 'executor', 'reviewer'] },
      { id: 'solo', name: '单人助理', description: '仅执行者，适合简单任务', roles: ['executor'] },
      { id: 'custom', name: '自定义', description: '手动选择角色和位置', roles: [] },
    ];
  });

  // ─── 角色配置完整数据（替代 /api/roles/config）───
  ipcMain.handle('mdh:getRolesConfig', async () => {
    try {
      const result: any = { base_roles: {}, custom_roles: {}, prompt_templates: {}, tools: {}, skills: {} };

      const jsonPath = join(__dirname, '../orchestrator/templates/roles.json');
      if (existsSync(jsonPath)) {
        const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
        result.base_roles = data.base_roles || {};
        result.custom_roles = data.custom_roles || {};
        result.prompt_templates = data.prompt_templates || {};
        console.log('[IPC] Loaded roles.json:', Object.keys(result.base_roles).length, 'base roles');
      }

      const yamlPath = join(__dirname, '../backend/roles_config.yaml');
      if (existsSync(yamlPath)) {
        const yamlContent = readFileSync(yamlPath, 'utf-8');
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
  ipcMain.handle('mdh:getSkillsList', async () => {
    try {
      const skillsDir = join(__dirname, '../skill_packs');
      if (!existsSync(skillsDir)) return { success: true, data: { skills: [] }, error: null };
      const skills = [];
      for (const name of readdirSync(skillsDir)) {
        const skillDir = join(skillsDir, name);
        if (!statSync(skillDir).isDirectory()) continue;
        const manifestPath = join(skillDir, 'manifest.yaml');
        if (existsSync(manifestPath)) {
          const content = readFileSync(manifestPath, 'utf-8');
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
      return { success: true, data: { skills }, error: null };
    } catch (e) {
      console.error('[IPC] Failed to load skills list:', e);
      return { success: false, data: null, error: String(e) };
    }
  });
}

// ─── YAML 简单解析 ───
function parseYamlSection(yamlContent: string, sectionName: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yamlContent.split('\n');
  let inSection = false;
  let currentKey = '';
  let currentBlock: string[] = [];

  for (const line of lines) {
    if (line.match(new RegExp(`^${sectionName}:\\s*$`))) { inSection = true; continue; }
    if (inSection && line.match(/^[a-zA-Z_]/) && !line.startsWith(' ')) {
      if (currentKey && currentBlock.length) result[currentKey] = parseYamlBlock(currentBlock);
      break;
    }
    if (!inSection) continue;

    const keyMatch = line.match(/^  ([a-zA-Z_][a-zA-Z0-9_]*):/);
    if (keyMatch) {
      if (currentKey && currentBlock.length) result[currentKey] = parseYamlBlock(currentBlock);
      currentKey = keyMatch[1];
      currentBlock = [];
      const inlineMatch = line.match(/^  [a-zA-Z_][a-zA-Z0-9_]*:\s*(.+)$/);
      if (inlineMatch) currentBlock.push(inlineMatch[1]);
      continue;
    }
    if (inSection && currentKey && line.match(/^    /)) currentBlock.push(line.trim());
  }
  if (currentKey && currentBlock.length) result[currentKey] = parseYamlBlock(currentBlock);
  return result;
}

function parseYamlBlock(lines: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.+)$/);
    if (m) obj[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return obj;
}

// ─── 自动更新 ───
ipcMain.handle('mdh:getAppVersion', async () => {
  return { version: app.getVersion(), name: app.getName() };
});

// ─── 向渲染进程推送消息 ───
export function notifyRenderer(channel: string, data: unknown) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
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
