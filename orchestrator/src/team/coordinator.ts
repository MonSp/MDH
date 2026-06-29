import { LLMConfig, Message, ToolDefinition, ToolCall } from '../llm/types.js';
import { chatStream } from '../llm/openai.js';
import { ExecutorClient } from '../executor/client.js';
import { getTemplate, formatPrompt } from './templates.js';
import { Team, TeamMember, ToolResult } from './types.js';

export interface CoordinatorConfig {
  llm: LLMConfig;
  executor: ExecutorClient;
  workspace: string;
  onWorkspaceConfirm?: (request: WorkspaceConfirmRequest) => Promise<WorkspaceConfirmResponse>;
}

export interface WorkspaceConfirmRequest {
  taskDescription: string;
  suggestedType: 'standalone' | 'git_worktree';
  options: {
    workspace_types: Array<{ id: string; name: string; desc: string }>;
  };
}

export interface WorkspaceConfirmResponse {
  workspace_type: 'standalone' | 'git_worktree';
  repo_path?: string;
  branch_name?: string;
}

export type EventHandler = (event: Record<string, unknown>) => void;

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description: '执行 Shell 命令',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的命令' },
          timeout: { type: 'number', description: '超时秒数', default: 30 },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取文件内容',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: '文件路径' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '写入文件',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '文件内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: '编辑文件（替换指定内容）',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          old_string: { type: 'string', description: '要替换的原文' },
          new_string: { type: 'string', description: '替换后的内容' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: '列出目录内容',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', default: '.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep_content',
      description: '搜索文件内容',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: '搜索模式' },
          path: { type: 'string', default: '.' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: '查看 git 状态',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: '查看 git diff',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_commit',
      description: '提交代码',
      parameters: {
        type: 'object',
        properties: { message: { type: 'string', description: '提交信息' } },
        required: ['message'],
      },
    },
  },
];

export class TeamCoordinator {
  private config: CoordinatorConfig;
  private team: Team | null = null;

  constructor(config: CoordinatorConfig) {
    this.config = config;
  }

  async execute(
    userMessage: string,
    selectedRoles: string[],
    onEvent?: EventHandler,
  ): Promise<string> {
    // ====== 阶段 0: CEO 分析复杂度 ======
    onEvent?.({ type: 'phase', phase: 'analyzing' });
    onEvent?.({ type: 'assistant_message', agentId: 'agent-ceo', content: `收到任务：${userMessage}\n\n正在分析任务复杂度...` });

    const complexity = await this.analyzeComplexity(userMessage);
    onEvent?.({ type: 'assistant_message', agentId: 'agent-ceo', content: `任务分析完成：复杂度=${complexity.level}，${complexity.reason}` });

    // ====== 阶段 0.5: 工作区确认 ======
    onEvent?.({ type: 'phase', phase: 'planning' });

    let workspace = this.config.workspace;
    if (this.config.onWorkspaceConfirm) {
      onEvent?.({ type: 'assistant_message', agentId: 'agent-ceo', content: '任务分析完成，正在创建工作区...' });

      const confirmRequest: WorkspaceConfirmRequest = {
        taskDescription: userMessage.substring(0, 200),
        suggestedType: 'standalone',
        options: {
          workspace_types: [
            { id: 'standalone', name: '新建独立工作区', desc: '创建全新空目录，适合新项目' },
            { id: 'git_worktree', name: 'Git Worktree', desc: '从已有仓库创建隔离分支，适合已有项目开发' },
          ],
        },
      };

      const confirmResponse = await this.config.onWorkspaceConfirm(confirmRequest);

      if (confirmResponse.workspace_type === 'git_worktree' && confirmResponse.repo_path) {
        // 创建 git worktree
        const branch = confirmResponse.branch_name || `agent/task-${Date.now().toString(36)}`;
        const worktreePath = `/workspace/worktrees/${branch.replace('/', '-')}`;

        await this.config.executor.execute({
          tool_name: 'bash',
          arguments: { command: `mkdir -p /workspace/worktrees && git -C ${confirmResponse.repo_path} worktree add -b ${branch} ${worktreePath} 2>&1 || echo "worktree created"` },
          call_id: 'ws-create',
          workspace: '/workspace',
        });

        workspace = worktreePath;
        onEvent?.({ type: 'assistant_message', agentId: 'agent-ceo', content: `已创建 Git Worktree：${worktreePath}（分支：${branch}）` });
      } else {
        // 独立工作区 — 在 /workspace 下创建项目目录
        const projectDir = `/workspace/project-${Date.now().toString(36)}`;
        await this.config.executor.execute({
          tool_name: 'bash',
          arguments: { command: `mkdir -p ${projectDir}` },
          call_id: 'ws-create',
          workspace: '/workspace',
        });
        workspace = projectDir;
        onEvent?.({ type: 'assistant_message', agentId: 'agent-ceo', content: `已创建工作区：${projectDir}` });
      }
    }

    // 更新 config 的 workspace
    this.config = { ...this.config, workspace };

    // ====== 阶段 1: 创建项目 & 组建团队 ======

    const DEFAULT_ROLES = ['coordinator', 'planner', 'executor', 'reviewer'];
    const effectiveRoles = selectedRoles.length > 0 ? selectedRoles : DEFAULT_ROLES;

    const rolesToUse = complexity.level === 'simple'
      ? ['executor']
      : effectiveRoles;

    this.team = this.createTeam(rolesToUse, userMessage);
    onEvent?.({
      type: 'meeting_started',
      meetingId: this.team.id,
      agents: this.team.members.map(m => ({
        id: `agent-${m.role}`,
        name: m.name,
        role: m.role,
        status: 'meeting',
        capabilities: m.template.skills,
      })),
    });

    onEvent?.({ type: 'assistant_message', agentId: 'agent-ceo', content: `团队已组建：${this.team.members.map(m => m.name).join('、')}` });

    // ====== 阶段 2: 项目经理协调讨论 ======
    if (complexity.level !== 'simple' && rolesToUse.length > 1) {
      onEvent?.({ type: 'phase', phase: 'discussing' });

      const coordinatorRole = rolesToUse.find(r => r === 'coordinator') || rolesToUse[0];
      const discussion = await this.runDiscussion(userMessage, rolesToUse, coordinatorRole, onEvent);

      // ====== 阶段 3: 任务分配 ======
      onEvent?.({ type: 'phase', phase: 'assigning' });
      onEvent?.({ type: 'assistant_message', agentId: `agent-${coordinatorRole}`, content: `根据讨论结果，分配任务给团队成员...` });
    }

    // ====== 阶段 4: 执行（带审查循环）=====
    onEvent?.({ type: 'phase', phase: 'executing' });

    const executorRole = rolesToUse.find(r => {
      const t = getTemplate(r);
      return t?.team_role === 'Executor';
    }) || rolesToUse[rolesToUse.length - 1];

    const reviewerRole = rolesToUse.find(r => {
      const t = getTemplate(r);
      return t?.team_role === 'Reviewer';
    });

    const maxReviewRounds = reviewerRole ? 2 : 1;
    let finalResult = '';

    for (let round = 0; round < maxReviewRounds; round++) {
      if (round > 0) {
        onEvent?.({ type: 'assistant_message', agentId: `agent-${reviewerRole}`, content: `审查发现问题，要求修改。第 ${round + 1} 轮执行...` });
      }

      // 执行任务
      const executorResult = await this.runAgentTask(
        executorRole,
        userMessage,
        round === 0 ? '请执行以下任务' : '请根据审查反馈修改代码',
        onEvent,
      );

      // 审查
      if (reviewerRole && round < maxReviewRounds - 1) {
        onEvent?.({ type: 'phase', phase: 'reviewing' });
        const review = await this.runReview(reviewerRole, executorResult, userMessage, onEvent);

        if (review.approved) {
          onEvent?.({ type: 'assistant_message', agentId: `agent-${reviewerRole}`, content: `审查通过！代码质量良好。` });
          finalResult = executorResult;
          break;
        }
        // 不通过，继续下一轮
      } else {
        finalResult = executorResult;
      }
    }

    // ====== 阶段 5: 汇报结果 ======
    onEvent?.({ type: 'phase', phase: 'summarizing' });

    const summaryPrompt = `请根据以下执行结果，生成一份简洁的项目总结报告。\n\n任务：${userMessage}\n\n执行结果：\n${finalResult.substring(0, 2000)}`;
    const summary = await this.callLLMOnce([
      { role: 'system', content: '你是一位技术项目经理，请用简洁的中文总结项目执行结果。使用 Markdown 表格格式。' },
      { role: 'user', content: summaryPrompt },
    ]);

    onEvent?.({ type: 'assistant_message', agentId: 'agent-coordinator', content: summary });
    onEvent?.({ type: 'task_complete', result: summary });
    onEvent?.({ type: 'meeting_ended' });

    return summary;
  }

  // ====== CEO 复杂度分析 ======
  private async analyzeComplexity(task: string): Promise<{ level: string; reason: string }> {
    let response = '';
    try {
      response = await this.callLLMOnce([
        { role: 'system', content: `你是技术CEO。分析任务复杂度，返回JSON格式：{"level": "simple" 或 "complex", "reason": "原因"}

判断标准：
- simple: 真正的单步操作，如"查看某个文件"、"运行一条命令"
- complex: 需要创建/修改多个文件、需要设计、需要测试、涉及前后端、需要团队协作

注意：只要涉及"创建项目"、"开发应用"、"编写测试"、"多个文件"等关键词，一律判为 complex。` },
        { role: 'user', content: task },
      ]);
      console.log('[CEO] complexity:', response.substring(0, 200));
      const match = response.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        // 兜底：如果用户选择了多角色但被判为 simple，强制改为 complex
        if (parsed.level === 'simple' && task.length > 50) {
          console.log('[CEO] overriding simple -> complex (task too long for simple)');
          return { level: 'complex', reason: '任务描述较长，按复杂任务处理' };
        }
        return parsed;
      }
    } catch (e) {
      console.error('[CEO] parse error:', e, response.substring(0, 200));
    }
    return { level: 'complex', reason: '无法判断，默认按复杂任务处理' };
  }

  // ====== 团队讨论 ======
  private async runDiscussion(
    task: string,
    roles: string[],
    coordinatorRole: string,
    onEvent?: EventHandler,
  ): Promise<string> {
    const discussions: string[] = [];

    // 每个角色发表意见（排除 coordinator，它是主持人）
    const discussRoles = roles.filter(r => r !== coordinatorRole).slice(0, 3);

    for (const role of discussRoles) {
      const tmpl = getTemplate(role);
      if (!tmpl) continue;

      onEvent?.({ type: 'agent_status_update', agentId: `agent-${role}`, status: 'speaking' });

      const prompt = formatPrompt(tmpl, {
        name: tmpl.name,
        description: tmpl.description,
      });

      const opinion = await this.callLLMOnce([
        { role: 'system', content: `${prompt}\n\n你正在参加团队会议讨论以下任务。请用2-3句话发表你的专业意见，包含具体的建议。` },
        { role: 'user', content: `任务：${task}\n\n请发表你的看法。` },
      ]);

      onEvent?.({ type: 'agent_message', agentId: `agent-${role}`, content: opinion, timestamp: Date.now() });
      onEvent?.({ type: 'agent_status_update', agentId: `agent-${role}`, status: 'meeting' });

      discussions.push(`${tmpl.name}：${opinion}`);
    }

    // coordinator 总结讨论
    const coordTmpl = getTemplate(coordinatorRole);
    const summaryPrompt = `团队讨论记录：\n\n${discussions.join('\n\n')}\n\n请作为项目经理，总结讨论要点，明确分工和执行方案。`;

    const coordSummary = await this.callLLMOnce([
      { role: 'system', content: `${coordTmpl ? formatPrompt(coordTmpl, { name: coordTmpl.name, description: coordTmpl.description }) : '你是项目经理'}\n\n你正在主持团队会议，请总结讨论结果并明确分工。` },
      { role: 'user', content: summaryPrompt },
    ]);

    onEvent?.({ type: 'agent_message', agentId: `agent-${coordinatorRole}`, content: coordSummary, timestamp: Date.now() });

    return coordSummary;
  }

  // ====== 单角色执行任务 ======
  private async runAgentTask(
    role: string,
    task: string,
    instruction: string,
    onEvent?: EventHandler,
  ): Promise<string> {
    const tmpl = getTemplate(role);
    if (!tmpl) throw new Error(`Unknown role: ${role}`);

    onEvent?.({ type: 'agent_status_update', agentId: `agent-${role}`, status: 'working' });

    const systemPrompt = formatPrompt(tmpl, { name: tmpl.name, description: tmpl.description });
    const messages: Message[] = [
      { role: 'system', content: `${systemPrompt}\n\n${instruction}` },
      { role: 'user', content: task },
    ];

    let result = '';
    const maxIter = 10;

    for (let i = 0; i < maxIter; i++) {
      const response = await this.callLLMWithTools(messages);

      if (response.content) {
        onEvent?.({ type: 'agent_message', agentId: `agent-${role}`, content: response.content, timestamp: Date.now() });
      }

      if (response.tool_calls.length === 0) {
        result = response.content || '';
        break;
      }

      messages.push({ role: 'assistant', content: response.content || '', tool_calls: response.tool_calls });

      for (const tc of response.tool_calls) {
        onEvent?.({ type: 'tool_call', id: tc.id, tool: tc.function.name, args: tc.function.arguments });

        const toolResult = await this.executeToolCall(tc);
        const resultStr = toolResult.error
          ? `Error: ${toolResult.error}`
          : typeof toolResult.result === 'string' ? toolResult.result : JSON.stringify(toolResult.result);

        onEvent?.({
          type: 'tool_result',
          id: tc.id,
          tool_name: tc.function.name,
          tool: tc.function.name,
          result: resultStr,
          success: !toolResult.error,
          output: resultStr,
          timestamp: new Date().toISOString(),
        });
        messages.push({ role: 'tool', content: resultStr, tool_call_id: tc.id });
      }
    }

    onEvent?.({ type: 'agent_status_update', agentId: `agent-${role}`, status: 'meeting' });
    return result;
  }

  // ====== 审查 ======
  private async runReview(
    reviewerRole: string,
    executionResult: string,
    task: string,
    onEvent?: EventHandler,
  ): Promise<{ approved: boolean; feedback: string }> {
    const tmpl = getTemplate(reviewerRole);
    if (!tmpl) return { approved: true, feedback: '' };

    onEvent?.({ type: 'agent_status_update', agentId: `agent-${reviewerRole}`, status: 'working' });

    const prompt = formatPrompt(tmpl, { name: tmpl.name, description: tmpl.description });

    const reviewResult = await this.callLLMOnce([
      { role: 'system', content: `${prompt}\n\n你正在审查代码质量。如果代码基本功能正确、结构合理，返回 approved: true。只在有严重问题时才返回 false。

返回JSON：{"approved": true/false, "feedback": "审查意见"}` },
      { role: 'user', content: `原始任务：${task}\n\n执行结果：\n${executionResult.substring(0, 3000)}` },
    ]);

    onEvent?.({ type: 'agent_status_update', agentId: `agent-${reviewerRole}`, status: 'meeting' });

    try {
      const match = reviewResult.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch {}
    return { approved: true, feedback: reviewResult };
  }

  // ====== LLM 调用工具版本 ======
  private async callLLMWithTools(messages: Message[]): Promise<{ content: string | null; tool_calls: ToolCall[] }> {
    const contentParts: string[] = [];
    const toolCalls: ToolCall[] = [];

    for await (const chunk of chatStream(this.config.llm, messages, TOOL_DEFINITIONS)) {
      if (chunk.delta) contentParts.push(chunk.delta);
      for (const tc of chunk.tool_calls) {
        if (tc.id) {
          toolCalls.push({ id: tc.id, type: 'function', function: { name: tc.function!.name, arguments: tc.function!.arguments || '' } });
        } else if (toolCalls.length > 0) {
          toolCalls[toolCalls.length - 1].function.arguments += tc.function?.arguments || '';
        }
      }
    }

    return { content: contentParts.join('') || null, tool_calls: toolCalls };
  }

  // ====== LLM 纯文本调用 ======
  private async callLLMOnce(messages: Message[]): Promise<string> {
    let content = '';
    for await (const chunk of chatStream(this.config.llm, messages)) {
      content += chunk.delta;
    }
    return content;
  }

  // ====== 工具执行 ======
  private async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
    let args: Record<string, unknown>;
    try { args = JSON.parse(toolCall.function.arguments); }
    catch { return { call_id: toolCall.id, tool_name: toolCall.function.name, result: null, error: 'Invalid JSON' }; }

    const response = await this.config.executor.execute({
      tool_name: toolCall.function.name,
      arguments: args,
      call_id: toolCall.id,
      workspace: this.config.workspace,
    });

    return { call_id: response.call_id, tool_name: response.tool_name, result: response.result, error: response.error || undefined };
  }

  // ====== 团队创建 ======
  private createTeam(roleIds: string[], task: string): Team {
    const members: TeamMember[] = roleIds.map((roleId, i) => {
      const template = getTemplate(roleId);
      if (!template) throw new Error(`Unknown role: ${roleId}`);
      return { id: `member-${i}`, name: template.name, role: roleId, template, status: 'idle' };
    });
    return { id: `team-${Date.now()}`, name: `task-${Date.now().toString(36)}`, description: task, members, leader: members[0] };
  }
}
