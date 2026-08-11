import { app, ipcMain, BrowserWindow, dialog, safeStorage } from 'electron';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync, renameSync } from 'fs';
import { execSync } from 'child_process';
import { buildPptx } from '../src/services/pptxBuilder.js';
import { buildDocx } from '../src/services/docxBuilder.js';
import { isBlockedBashCommand, BLOCKED_COMMAND_MESSAGE } from '../src/services/bashGuard.js';

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

// ─── 工具执行器 ───
// 在本地工作区执行文件操作和 shell 命令

async function executeTool(toolName: string, args: Record<string, any>, workspace: string): Promise<{ success: boolean; output: string }> {
  try {
    switch (toolName) {
      case 'write_file': {
        const filePath = join(workspace, args.path);
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, args.content || '', 'utf-8');
        return { success: true, output: `已写入 ${args.path}` };
      }
      case 'read_file': {
        const filePath = join(workspace, args.path);
        if (!existsSync(filePath)) return { success: false, output: `文件不存在: ${args.path}` };
        return { success: true, output: readFileSync(filePath, 'utf-8') };
      }
      case 'edit_file': {
        const filePath = join(workspace, args.path);
        if (!existsSync(filePath)) return { success: false, output: `文件不存在: ${args.path}` };
        const content = readFileSync(filePath, 'utf-8');
        const newContent = content.replace(args.old_string, args.new_string);
        writeFileSync(filePath, newContent, 'utf-8');
        return { success: true, output: `已编辑 ${args.path}` };
      }
      case 'list_directory': {
        const dirPath = join(workspace, args.path || '.');
        if (!existsSync(dirPath)) return { success: false, output: `目录不存在: ${args.path}` };
        const entries = readdirSync(dirPath, { withFileTypes: true });
        const listing = entries.map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`).join('\n');
        return { success: true, output: listing };
      }
      case 'bash': {
        const command = args.command || '';
        // 纯 Node 离线模式：拦截 python/pip/conda 命令
        if (isBlockedBashCommand(command)) {
          return { success: false, output: BLOCKED_COMMAND_MESSAGE };
        }
        const result = execSync(command, {
          cwd: workspace,
          timeout: (args.timeout || 30) * 1000,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return { success: true, output: result };
      }
      case 'grep_content': {
        const pattern = args.pattern;
        const searchPath = join(workspace, args.path || '.');
        try {
          const result = execSync(`grep -r "${pattern}" "${searchPath}" --include="*" 2>/dev/null || echo "无匹配结果"`, {
            cwd: workspace,
            timeout: 10000,
            encoding: 'utf-8',
          });
          return { success: true, output: result };
        } catch {
          return { success: true, output: '无匹配结果' };
        }
      }
      case 'git_status': {
        try {
          const result = execSync('git status --short', { cwd: workspace, encoding: 'utf-8', timeout: 10000 });
          return { success: true, output: result || '(无变更)' };
        } catch {
          return { success: false, output: '不是 git 仓库' };
        }
      }
      case 'git_commit': {
        try {
          execSync('git add -A', { cwd: workspace, encoding: 'utf-8', timeout: 10000 });
          const result = execSync(`git commit -m "${args.message || 'auto commit'}"`, { cwd: workspace, encoding: 'utf-8', timeout: 10000 });
          return { success: true, output: result };
        } catch (e: any) {
          return { success: false, output: `git commit 失败: ${e.message}` };
        }
      }
      case 'create_slide': {
        try {
          const outPath = await buildPptx(workspace, args);
          return { success: true, output: `已生成 PPT: ${outPath}（${Array.isArray(args.slides) ? args.slides.length : 1} 页）` };
        } catch (e: any) {
          return { success: false, output: `PPT 生成失败: ${e.message}` };
        }
      }
      case 'create_document': {
        try {
          const outPath = await buildDocx(workspace, args);
          return { success: true, output: `已生成 Word 文档: ${outPath}` };
        } catch (e: any) {
          return { success: false, output: `Word 文档生成失败: ${e.message}` };
        }
      }
      default:
        return { success: false, output: `未知工具: ${toolName}` };
    }
  } catch (e: any) {
    return { success: false, output: `执行失败: ${e.message}` };
  }
}

// ─── 解析 LLM 回复中的代码块和工具调用 ───
function extractCodeBlocks(text: string): Array<{ filename: string; content: string }> {
  const blocks: Array<{ filename: string; content: string }> = [];
  const regex = /```(\S+\.\w+)\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks.push({ filename: match[1], content: match[2].trim() });
  }
  return blocks;
}

function extractToolCalls(text: string): Array<{ tool: string; args: Record<string, any> }> {
  const calls: Array<{ tool: string; args: Record<string, any> }> = [];
  const regex = /```tool_call\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      calls.push(JSON.parse(match[1].trim()));
    } catch {}
  }
  return calls;
}

// ─── 内联 RoleAgent（Electron 独立上下文，CJS 无法 import orchestrator ESM）───
// 每个角色一个实例，拥有独立消息上下文，讨论阶段可并发执行

class ElectronRoleAgent {
  readonly id: string;
  readonly roleId: string;
  readonly roleName: string;

  private llm: LLMConfig;
  private workspace: string;
  private messages: Array<{ role: string; content: string }>;

  constructor(cfg: { id: string; roleId: string; roleName: string; systemPrompt: string; llm: LLMConfig; workspace: string }) {
    this.id = cfg.id;
    this.roleId = cfg.roleId;
    this.roleName = cfg.roleName;
    this.llm = cfg.llm;
    this.workspace = cfg.workspace;
    this.messages = [{ role: 'system', content: cfg.systemPrompt }];
  }

  /** 纯文本对话（讨论阶段），独立上下文 */
  async chat(userMessage: string): Promise<string> {
    this.messages.push({ role: 'user', content: userMessage });
    const reply = await chatCompletion(this.llm, this.messages);
    this.messages.push({ role: 'assistant', content: reply });
    return reply;
  }

  /** 注入团队上下文（如其他角色的讨论结果） */
  injectContext(context: string): void {
    this.messages.push({ role: 'user', content: `[团队上下文]\n${context}` });
  }

  /** 带工具循环的执行（代码块写入 + tool_call 解析），返回结构化执行摘要 */
  async chatWithTools(
    userMessage: string,
    onEvent?: EventHandler,
    maxRounds = 8,
  ): Promise<{ result: string; filesWritten: number; summary: ExecutionSummary }> {
    this.messages.push({ role: 'user', content: userMessage });
    let totalFilesWritten = 0;
    const filesCreated: string[] = [];
    const filesModified: string[] = [];
    const toolCallsLog: Array<{ tool: string; args: string; success: boolean }> = [];
    const errors: string[] = [];

    for (let round = 0; round < maxRounds; round++) {
      const response = await chatCompletion(this.llm, this.messages);
      onEvent?.({ type: 'assistant_message', agentId: this.id, content: response });

      const codeBlocks = extractCodeBlocks(response);
      const toolCalls = extractToolCalls(response);
      const toolResults: string[] = [];

      for (const block of codeBlocks) {
        const result = await executeTool('write_file', { path: block.filename, content: block.content }, this.workspace);
        if (result.success) {
          totalFilesWritten++;
          filesCreated.push(block.filename);
          onEvent?.({ type: 'assistant_message', agentId: this.id, content: `✅ 已写入 ${block.filename}` });
        } else {
          errors.push(`写入 ${block.filename}: ${result.output}`);
          onEvent?.({ type: 'assistant_message', agentId: this.id, content: `❌ 写入失败 ${block.filename}: ${result.output}` });
        }
        toolResults.push(`[write_file ${block.filename}] ${result.output}`);
      }

      for (const call of toolCalls) {
        const result = await executeTool(call.tool, call.args || {}, this.workspace);
        const argSummary = call.tool === 'bash' ? (call.args?.command || '').substring(0, 60) : JSON.stringify(call.args || {}).substring(0, 60);
        toolCallsLog.push({ tool: call.tool, args: argSummary, success: result.success });
        if (!result.success) errors.push(`${call.tool}: ${result.output.substring(0, 100)}`);
        if (call.tool === 'edit_file' && result.success) filesModified.push(call.args?.path || '');
        onEvent?.({ type: 'assistant_message', agentId: this.id, content: `[${call.tool}] ${result.output.substring(0, 500)}` });
        toolResults.push(`[${call.tool}] ${result.output}`);
      }

      if (codeBlocks.length === 0 && toolCalls.length === 0) {
        return {
          result: response,
          filesWritten: totalFilesWritten,
          summary: { filesCreated, filesModified, toolCalls: toolCallsLog, errors, finalMessage: response },
        };
      }

      if (toolResults.length > 0) {
        this.messages.push({ role: 'assistant', content: response });
        this.messages.push({ role: 'user', content: `工具执行结果：\n${toolResults.join('\n')}\n\n请继续执行任务。如果没有更多文件需要创建，回复"任务完成"。` });
      }
    }

    return {
      result: '',
      filesWritten: totalFilesWritten,
      summary: { filesCreated, filesModified, toolCalls: toolCallsLog, errors, finalMessage: '' },
    };
  }
}

// ─── 内联 TeamCoordinator ───
// 支持工具执行、多轮对话、代码块解析

type EventHandler = (event: Record<string, unknown>) => void;

/** 执行阶段的结构化摘要 — 供 coordinator 总结和 reviewer 审查使用 */
interface ExecutionSummary {
  filesCreated: string[];
  filesModified: string[];
  toolCalls: Array<{ tool: string; args: string; success: boolean }>;
  errors: string[];
  finalMessage: string;
}

/** 将讨论意见提炼为可注入 executor 的执行约束 */
function buildDiscussionConstraints(opinions: string[]): string {
  const constraints: string[] = [];
  for (const opinion of opinions) {
    // 提取 STANCE 和关键建议
    const stanceMatch = opinion.match(/\[STANCE:(\w+)\]/i);
    const stance = stanceMatch?.[1]?.toLowerCase() || 'neutral';

    // 提取建议内容（去掉 STANCE/CONFIDENCE 标签）
    const cleaned = opinion
      .replace(/\[STANCE:\w+\]/gi, '')
      .replace(/\[CONFIDENCE:[\d.]+\]/gi, '')
      .trim();
    if (cleaned.length <= 10) continue;

    // oppose 意见转为"避免"约束，信息不丢失
    if (stance === 'oppose') {
      constraints.push(`避免：${cleaned}`);
    } else {
      constraints.push(cleaned);
    }
  }
  return constraints.length > 0
    ? `## 团队讨论结论（执行时必须遵循）\n${constraints.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
    : '';
}

/** 将 ExecutionSummary 格式化为 coordinator 可消费的结构化报告 */
function formatSummaryForCoordinator(summary: ExecutionSummary, workspace: string): string {
  const parts: string[] = [`工作区：${workspace}`];
  if (summary.filesCreated.length > 0) parts.push(`创建文件：${summary.filesCreated.join(', ')}`);
  if (summary.filesModified.length > 0) parts.push(`修改文件：${summary.filesModified.join(', ')}`);
  const failedTools = summary.toolCalls.filter(t => !t.success);
  if (failedTools.length > 0) parts.push(`失败操作：${failedTools.map(t => `${t.tool}(${t.args})`).join(', ')}`);
  if (summary.errors.length > 0) parts.push(`错误：${summary.errors.join('; ')}`);
  parts.push(`执行工具调用次数：${summary.toolCalls.length}`);
  if (summary.finalMessage) parts.push(`最终回复：${summary.finalMessage.substring(0, 500)}`);
  return parts.join('\n');
}

/** 将 ExecutionSummary 格式化为 reviewer 可消费的变更清单 */
function formatSummaryForReviewer(summary: ExecutionSummary, workspace: string): string {
  const parts: string[] = [`工作区：${workspace}`];
  if (summary.filesCreated.length > 0) {
    parts.push(`新增文件 (${summary.filesCreated.length})：`);
    for (const f of summary.filesCreated) parts.push(`  + ${f}`);
  }
  if (summary.filesModified.length > 0) {
    parts.push(`修改文件 (${summary.filesModified.length})：`);
    for (const f of summary.filesModified) parts.push(`  ~ ${f}`);
  }
  const failedTools = summary.toolCalls.filter(t => !t.success);
  if (failedTools.length > 0) parts.push(`执行失败 (${failedTools.length})：${failedTools.map(t => t.tool).join(', ')}`);
  return parts.join('\n');
}

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
    // 使用最新的 LLM 配置（用户可能在设置中更新了 API Key）
    const currentLlm = state.llmConfig;
    if (!currentLlm.apiKey) {
      onEvent?.({ type: 'error', message: '未配置 API Key，请在设置中配置' });
      return '未配置 API Key';
    }

    // 阶段 0: 分析（复杂度 + 角色推荐）
    onEvent?.({ type: 'phase', phase: 'analyzing' });
    onEvent?.({ type: 'assistant_message', agentId: 'agent-ceo', content: `收到任务：${userMessage}\n\n正在分析任务并组建团队...` });

    // 动态加载所有可用角色
    const allRoles = getAllRoleDescriptions();

    let complexity: { level: string; reason: string; suggested_roles?: string[] };
    try {
      const analysisPrompt = `分析以下任务，返回JSON：
{
  "level": "simple 或 complex",
  "reason": "原因",
  "suggested_roles": ["从可用角色中选择最适合的"]
}

可用角色：
${allRoles}

选择规则：
- 简单任务只需 1 个执行者
- 复杂任务需要多角色协作
- 根据任务类型选择专业角色（如PPT选ppt_lead、content_architect、animation_engineer）
- 每个任务必须有至少1个executor角色来执行

任务：${userMessage}`;
      const analysisText = await chatCompletion(currentLlm, [{ role: 'user', content: analysisPrompt }]);
      const jsonMatch = analysisText.match(/\{[^{}]*\}/);
      complexity = jsonMatch ? JSON.parse(jsonMatch[0]) : { level: 'complex', reason: '默认复杂', suggested_roles: selectedRoles };
    } catch (e) {
      complexity = { level: 'complex', reason: `分析失败: ${e}`, suggested_roles: selectedRoles };
    }

    // 使用推荐角色（如果用户未指定）
    const roles = selectedRoles.length > 0 ? selectedRoles : (complexity.suggested_roles?.length ? complexity.suggested_roles : ['executor']);

    onEvent?.({ type: 'assistant_message', agentId: 'agent-ceo', content: `任务分析完成：复杂度=${complexity.level}，${complexity.reason}\n推荐团队：${roles.map(r => getRoleName(r)).join('、')}` });

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

        // 使用用户选择的目录，或默认创建子目录
        if (resp?.output_dir) {
          workspace = resp.output_dir;
        } else if (resp?.workspace_type === 'git_worktree' && resp.repo_path) {
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

    // 阶段 1: 组建团队 — 每个角色创建独立 ElectronRoleAgent（独立上下文 + system prompt）
    const meetingId = `meeting-${Date.now().toString(36)}`;
    const agentsMeta = roles.map(r => ({
      id: `agent-${r}`,
      name: getRoleName(r),
      role: r,
      status: 'meeting' as const,
      capabilities: [],
    }));
    onEvent?.({ type: 'meeting_started', meetingId, agents: agentsMeta });
    onEvent?.({ type: 'assistant_message', agentId: 'agent-ceo', content: `团队已组建：${agentsMeta.map(a => a.name).join('、')}` });

    const roleAgents = roles.map(r => new ElectronRoleAgent({
      id: `agent-${r}`,
      roleId: r,
      roleName: getRoleName(r),
      systemPrompt: buildElectronSystemPrompt(r, workspace),
      llm: currentLlm,
      workspace,
    }));

    // 阶段 2: 讨论（复杂任务，多角色，并发执行）
    let discussionConstraints = '';
    if (complexity.level !== 'simple' && roles.length > 1) {
      onEvent?.({ type: 'phase', phase: 'discussing' });
      const discussAgents = roleAgents.filter(a => a.roleId !== 'ceo');
      const opinions = await Promise.all(discussAgents.map(async (agent) => {
        try {
          const reply = await agent.chat(
            `任务：${userMessage}\n\n请从你的专业角度给出具体建议（2-3句话）。用 [STANCE:support/oppose/modify/neutral] 和 [CONFIDENCE:0.0-1.0] 标注立场。`,
          );
          onEvent?.({ type: 'assistant_message', agentId: agent.id, content: reply });
          return reply;
        } catch (e) {
          const err = `[${agent.roleId}] 讨论发言失败: ${e}`;
          onEvent?.({ type: 'assistant_message', agentId: agent.id, content: err });
          return err;
        }
      }));

      // 讨论结果注入 coordinator 上下文（完整记录）
      const coordAgent = roleAgents.find(a => a.roleId === 'coordinator');
      if (coordAgent && opinions.length > 0) {
        coordAgent.injectContext(`团队讨论记录：\n${opinions.join('\n---\n')}`);
      }

      // 提炼讨论结论为执行约束，注入 executor 上下文
      discussionConstraints = buildDiscussionConstraints(opinions);
    }

    // 阶段 3: 执行（executor RoleAgent 带工具循环）
    onEvent?.({ type: 'phase', phase: 'executing' });
    const executorRole = roles.find(r => r === 'executor') || roles[roles.length - 1];
    const executorAgent = roleAgents.find(a => a.roleId === executorRole) || roleAgents[roleAgents.length - 1];

    let totalFilesWritten = 0;
    let execSummary: ExecutionSummary = { filesCreated: [], filesModified: [], toolCalls: [], errors: [], finalMessage: '' };
    try {
      // 注入讨论结论作为执行约束
      const execPrompt = discussionConstraints
        ? `请执行以下任务：\n${userMessage}\n\n${discussionConstraints}`
        : `请执行以下任务：\n${userMessage}`;
      const execResult = await executorAgent.chatWithTools(execPrompt, onEvent, 8);
      totalFilesWritten = execResult.filesWritten;
      execSummary = execResult.summary;
    } catch (e) {
      onEvent?.({ type: 'error', message: `执行失败: ${e}` });
      execSummary.errors.push(String(e));
    }

    const createdCount = execSummary.filesCreated.length;
    const modifiedCount = execSummary.filesModified.length;
    const errCount = execSummary.errors.length;
    onEvent?.({ type: 'assistant_message', agentId: executorAgent.id,
      content: `执行完成 — 创建 ${createdCount} 个文件，修改 ${modifiedCount} 个文件${errCount > 0 ? `，${errCount} 个错误` : ''}，工作区：${workspace}` });

    // 阶段 4: 总结（coordinator 收到结构化摘要，而非截断全文）
    onEvent?.({ type: 'phase', phase: 'summarizing' });
    const coordinatorAgent = roleAgents.find(a => a.roleId === 'coordinator');
    let summaryReport = `任务执行完成。\n${formatSummaryForCoordinator(execSummary, workspace)}`;
    if (coordinatorAgent) {
      try {
        const structuredReport = formatSummaryForCoordinator(execSummary, workspace);
        summaryReport = await coordinatorAgent.chat(
          `任务：${userMessage}\n\n执行摘要：\n${structuredReport}\n\n请生成一份简洁的项目总结报告。重点说明创建了哪些文件、解决了什么问题、是否有未完成的部分。`);
      } catch (e) {
        summaryReport = `任务执行完成。\n${formatSummaryForCoordinator(execSummary, workspace)}\n(总结失败: ${e})`;
      }
    }
    onEvent?.({ type: 'assistant_message', agentId: 'agent-coordinator', content: summaryReport });

    return `任务完成，工作区：${workspace}，文件数：${totalFilesWritten}`;
  }
}

// ─── 内联 system prompt 组装（Electron 侧，对应 orchestrator 的 buildSystemPrompt）───
function buildElectronSystemPrompt(roleId: string, workspace: string): string {
  const roleNames: Record<string, { name: string; desc: string }> = {
    coordinator: { name: '项目经理', desc: '协调各方、跟踪进度、管理风险' },
    planner: { name: '架构师', desc: '分析技术任务、设计系统架构、分解子任务' },
    executor: { name: '全栈开发', desc: '代码编写和功能实现' },
    reviewer: { name: 'QA工程师', desc: '代码审查、测试、质量保证' },
    monitor: { name: 'DevOps', desc: '部署、监控、运维' },
    ceo: { name: 'CTO', desc: '技术决策、团队协调' },
    ppt_lead: { name: '演示项目负责人', desc: '需求沟通、内容梳理、演示效果把控' },
    slide_designer: { name: '视觉设计师', desc: '版式/配色/图表设计' },
    content_architect: { name: '内容架构师', desc: '逻辑结构设计、故事线规划' },
  };
  const role = roleNames[roleId] || { name: roleId, desc: '' };

  const parts: string[] = [`你是${role.name}。${role.desc}。你的工作区是：${workspace}`];

  if (roleId === 'executor') {
    parts.push(`可用工具（用代码块格式调用）：
- 创建/写入文件：\`\`\`path/to/file.ext\\n内容\\n\`\`\`
- 执行命令：\`\`\`tool_call\\n{"tool":"bash","args":{"command":"..."}}\\n\`\`\`
- 读取文件：\`\`\`tool_call\\n{"tool":"read_file","args":{"path":"..."}}\\n\`\`\`

重要规则：
1. 创建代码文件时，用 \`\`\`文件路径\`\`\` 格式（如 \`\`\`app.js\`\`\`）
2. 文件路径相对于工作区根目录
3. 每次创建一个文件
4. 创建完文件后运行测试验证
5. 本环境无 Python，禁止使用 python/pip/conda 命令；验证脚本用 node 命令`);
  }

  // PPT 相关角色：注入 create_slide 工具说明，确保 LLM 知道生成 .pptx 的正确方式
  const pptRoles = new Set(['ppt_lead', 'slide_designer', 'content_architect']);
  if (pptRoles.has(roleId)) {
    parts.push(`可用工具（用代码块格式调用）：
- 生成 PPT：\`\`\`tool_call
{"tool":"create_slide","args":{"path":"xxx.pptx","title":"标题","slides":[{"title":"封面","subtitle":"副标题","layout":"cover"},{"title":"要点页","bullets":["要点1","要点2"],"layout":"bullets"},{"title":"数据页","layout":"chart","chart":{"type":"bar","labels":["A","B"],"values":[30,70]}}]}}
\`\`\`
- 创建/写入文件：\`\`\`path/to/file.ext\\n内容\\n\`\`\`
- 执行命令：\`\`\`tool_call\\n{"tool":"bash","args":{"command":"..."}}\\n\`\`\`

重要规则：
1. 制作 PPT 必须调用 create_slide 工具生成 .pptx 文件（支持 cover/bullets/chart 三种布局）
2. 不要用 HTML/JS 手写演示文稿替代 .pptx
3. 文件路径相对于工作区根目录
4. 本环境无 Python，禁止使用 python/pip/conda 命令`);
  }

  // 文档相关角色：注入 create_document 工具说明，确保 LLM 用该工具生成真正的 .docx
  const docRoles = new Set([
    'content_director', 'coordinator', 'ppt_lead', 'brand_guardian', 'deal_strategist',
    'financial_analyst', 'product_manager', 'sales_strategist', 'technical_writer',
    'ui_designer', 'ux_researcher',
  ]);
  if (docRoles.has(roleId)) {
    parts.push(`可用工具（用代码块格式调用）：
- 生成 Word 文档：\`\`\`tool_call
{"tool":"create_document","args":{"path":"报告.docx","title":"报告标题","sections":[{"heading":"第一章","paragraphs":["正文段落"]},{"heading":"第二章","bullets":["要点一","要点二"]},{"table":{"headers":["列1","列2"],"rows":[["A","1"]]}}]}}
\`\`\`
- 创建/写入文件：\`\`\`path/to/file.ext\\n内容\\n\`\`\`
- 执行命令：\`\`\`tool_call\\n{"tool":"bash","args":{"command":"..."}}\\n\`\`\`

重要规则：
1. 制作 Word 文档必须调用 create_document 工具生成 .docx 文件（支持段落/要点/编号/标题/表格）
2. 不要用 Markdown/纯文本文件替代 .docx
3. 文件路径相对于工作区根目录
4. 本环境无 Python，禁止使用 python/pip/conda 命令`);
  }

  // 尝试从 skill_packs 加载角色主技能的 system_prompt
  try {
    const skillMap: Record<string, string> = {
      coordinator: 'task_decomposition', planner: 'architecture', executor: 'frontend_dev',
      reviewer: 'code_review', monitor: 'devops',
      ppt_lead: 'ppt_design', slide_designer: 'ppt_design', content_architect: 'ppt_design',
    };
    const skillName = skillMap[roleId];
    if (skillName) {
      const promptPath = join(__dirname, '../skill_packs', skillName, 'system_prompt.md');
      if (existsSync(promptPath)) {
        const skillPrompt = readFileSync(promptPath, 'utf-8');
        parts.push(`## 专业技能\n\n${skillPrompt}`);
      }
    }
  } catch {}

  return parts.join('\n\n');
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
  registerProjectHandlers();
}

function recreateCoordinator() {
  state.coordinator = new SimpleTeamCoordinator({
    llm: state.llmConfig,
    workspace: state.workspace,
    onWorkspaceConfirm: handleWorkspaceConfirm,
  });
}

// ─── 工作区确认 ───
// 用于存储待确认的 Promise resolve 函数
let workspaceConfirmResolver: ((value: any) => void) | null = null;

async function handleWorkspaceConfirm(request: WorkspaceConfirmRequest) {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return { workspace_type: 'standalone' as const };

  notifyRenderer('mdh:onWorkspaceConfirm', request);

  // 必须等用户确认，无超时
  return new Promise<any>((resolve) => {
    workspaceConfirmResolver = resolve;
  });
}

// ─── 会议控制 ───
function registerMeetingHandlers() {
  // 工作区确认响应（前端 invoke 此通道）
  ipcMain.handle('mdh:workspaceConfirmResponse', async (_event, response: any) => {
    if (workspaceConfirmResolver) {
      workspaceConfirmResolver(response);
      workspaceConfirmResolver = null;
    }
    return { status: 'ok' };
  });

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
        const yamlContent = readFileSync(yamlPath, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
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
  // 合并 roles_config.yaml 的完整技能列表 + skill_packs/*/manifest.yaml 的详细信息
  ipcMain.handle('mdh:getSkillsList', async () => {
    try {
      const skillsMap: Record<string, any> = {};

      // 1. 从 roles_config.yaml 加载完整技能列表
      const yamlPath = join(__dirname, '../backend/roles_config.yaml');
      if (existsSync(yamlPath)) {
        const yamlContent = readFileSync(yamlPath, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const yamlSkills = parseYamlSection(yamlContent, 'skills');
        for (const [name, info] of Object.entries(yamlSkills)) {
          skillsMap[name] = {
            name,
            description: typeof info === 'object' && info !== null ? (info as any).description || '' : String(info || ''),
            version: '',
            category: '',
            methodology: '',
            tools: [],
          };
        }
      }

      // 2. 从 skill_packs/*/manifest.yaml 补充详细信息
      const skillsDir = join(__dirname, '../skill_packs');
      if (existsSync(skillsDir)) {
        for (const name of readdirSync(skillsDir)) {
          const skillDir = join(skillsDir, name);
          if (!statSync(skillDir).isDirectory()) continue;
          const manifestPath = join(skillDir, 'manifest.yaml');
          if (!existsSync(manifestPath)) continue;
          const content = readFileSync(manifestPath, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          const descMatch = content.match(/^description:\s*(.+)$/m);
          const versionMatch = content.match(/^version:\s*(.+)$/m);
          const categoryMatch = content.match(/^category:\s*(.+)$/m);
          const methodologyMatch = content.match(/^methodology:\s*(.+)$/m);
          const toolsMatch = content.match(/^required_tools:\s*\n((?:\s+-\s+.+\n?)*)/m);
          const tools = toolsMatch
            ? toolsMatch[1].split('\n').map(l => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean)
            : [];
          // 覆盖或新增
          skillsMap[name] = {
            name,
            description: descMatch?.[1]?.trim() || skillsMap[name]?.description || '',
            version: versionMatch?.[1]?.trim() || '',
            category: categoryMatch?.[1]?.trim() || '',
            methodology: methodologyMatch?.[1]?.trim() || '',
            tools,
          };
        }
      }

      const skills = Object.values(skillsMap);
      console.log('[IPC] Loaded', skills.length, 'skills');
      return { success: true, data: { skills }, error: null };
    } catch (e) {
      console.error('[IPC] Failed to load skills list:', e);
      return { success: false, data: null, error: String(e) };
    }
  });
}

// ─── 项目持久化存储 ───
// 项目数据以 JSON 数组形式存储在 userData/projects.json

function getProjectsFilePath(): string {
  return join(app.getPath('userData'), 'projects.json');
}

function readProjectsFile(): any[] {
  const filePath = getProjectsFilePath();
  if (!existsSync(filePath)) return [];
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('[IPC] Failed to read projects.json:', e);
    return [];
  }
}

function writeProjectsFile(projects: any[]): boolean {
  const filePath = getProjectsFilePath();
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    // 原子写入：先写临时文件，再重命名替换正式文件，避免写入中断损坏数据
    const tmpPath = `${filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(projects, null, 2), 'utf-8');
    renameSync(tmpPath, filePath);
    return true;
  } catch (e) {
    console.error('[IPC] Failed to write projects.json:', e);
    return false;
  }
}

function registerProjectHandlers() {
  ipcMain.handle('mdh:projectList', async () => {
    return { success: true, data: readProjectsFile(), error: null };
  });

  ipcMain.handle('mdh:projectSave', async (_event, data: { project: any }) => {
    const project = data?.project;
    if (!project || typeof project.project_id !== 'string') {
      return { success: false, data: null, error: '无效的项目数据' };
    }
    const projects = readProjectsFile();
    const idx = projects.findIndex(p => p?.project_id === project.project_id);
    if (idx >= 0) {
      projects[idx] = project;
    } else {
      projects.push(project);
    }
    const ok = writeProjectsFile(projects);
    return { success: ok, data: null, error: ok ? null : '写入失败' };
  });

  ipcMain.handle('mdh:projectDelete', async (_event, data: { projectId: string }) => {
    const projectId = data?.projectId;
    if (!projectId) return { success: false, data: null, error: '缺少 projectId' };
    const projects = readProjectsFile().filter(p => p?.project_id !== projectId);
    const ok = writeProjectsFile(projects);
    return { success: ok, data: null, error: ok ? null : '写入失败' };
  });

  ipcMain.handle('mdh:projectGet', async (_event, data: { projectId: string }) => {
    const projectId = data?.projectId;
    const projects = readProjectsFile();
    const project = projects.find(p => p?.project_id === projectId) || null;
    return { success: true, data: project, error: null };
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

// ─── 获取所有角色描述（供 CEO 分析用）───
function getAllRoleDescriptions(): string {
  const lines: string[] = [];

  // 从 roles_config.yaml 解析 base_roles
  try {
    const yamlPath = join(__dirname, '../backend/roles_config.yaml');
    if (existsSync(yamlPath)) {
      // 统一换行符，去掉 \r
      const content = readFileSync(yamlPath, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      // 简单逐行解析：找 "  xxx:" 开头的角色名，和 "    description:" 的值
      let inBaseRoles = false;
      let currentRole = '';
      let currentDesc = '';

      for (const line of content.split('\n')) {
        const trimmed = line.trimEnd();

        // 检测 base_roles 段开始
        if (trimmed === 'base_roles:') { inBaseRoles = true; continue; }
        // 检测其他顶级段结束
        if (inBaseRoles && /^[a-z_]+:$/.test(trimmed)) break;

        if (!inBaseRoles) continue;

        // 匹配角色名（2空格缩进）
        const roleMatch = trimmed.match(/^  ([a-z_][a-z0-9_]*):$/);
        if (roleMatch) {
          if (currentRole && currentDesc) lines.push(`- ${currentRole}: ${currentDesc}`);
          currentRole = roleMatch[1];
          currentDesc = '';
          continue;
        }

        // 匹配 description（4空格缩进）
        const descMatch = trimmed.match(/^    description:\s*(.+)$/);
        if (descMatch) currentDesc = descMatch[1].trim();
      }
      if (currentRole && currentDesc) lines.push(`- ${currentRole}: ${currentDesc}`);
    }
  } catch {}

  // 回退：如果解析失败，用默认角色
  if (lines.length === 0) {
    return `- coordinator(项目经理): 协调各方、跟踪进度、管理风险
- planner(架构师): 分析技术任务、设计系统架构、分解子任务
- executor(全栈开发): 代码编写和功能实现
- reviewer(QA工程师): 代码审查、测试、质量保证
- monitor(DevOps): 部署、监控、运维`;
  }

  return lines.join('\n');
}
