import { LLMConfig, Message, ToolDefinition, ToolCall } from '../llm/types.js';
import { chatStream } from '../llm/openai.js';
import { ExecutorClient } from '../executor/client.js';
import { getTemplate, formatPrompt, getPromptTemplate } from './templates.js';
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
      name: 'write_file',
      description: '创建或覆盖文件。用这个工具创建代码文件，不要用bash的echo/cat/heredoc。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径（相对于workspace）' },
          content: { type: 'string', description: '完整的文件内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取文件内容。修改文件前必须先读取。',
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
      name: 'edit_file',
      description: '编辑文件的特定部分。用 old_string 定位，new_string 替换。',
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
      description: '列出目录内容。开始任务前先用这个了解环境。',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: '目录路径', default: '.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bash',
      description: '执行Shell命令。只用于运行测试、安装依赖、git操作等，不要用来创建文件。',
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
      description: '查看 git 状态。提交前必须先检查。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: '查看代码变更',
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

    // 如果用户明确选了多角色，强制走 complex 路径（不看 LLM 判断）
    const forceComplex = effectiveRoles.length > 1;
    const rolesToUse = (complexity.level === 'simple' && !forceComplex)
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
    if ((complexity.level !== 'simple' || forceComplex) && rolesToUse.length > 1) {
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

    const summarySystem = getPromptTemplate('summary') || '你是一位技术项目经理，请用简洁的中文总结项目执行结果。使用 Markdown 表格格式。';
    const summaryPrompt = `请根据以下执行结果，生成一份简洁的项目总结报告。\n\n任务：${userMessage}\n\n执行结果：\n${finalResult.substring(0, 2000)}`;
    const summary = await this.callLLMOnce([
      { role: 'system', content: summarySystem },
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
      const ceoAnalysisPrompt = getPromptTemplate('ceo_analysis') || '你是技术CEO。分析任务复杂度，返回JSON格式：{"level": "simple" 或 "complex", "reason": "原因"}';
      response = await this.callLLMOnce([
        { role: 'system', content: ceoAnalysisPrompt },
        { role: 'user', content: task },
      ]);
      console.log('[CEO] complexity:', response.substring(0, 200));
      const match = response.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        // 兜底：如果用户选择了多角色但被判为 simple，检查是否真的需要团队
        // 只有当任务涉及多个独立模块时才强制升级
        if (parsed.level === 'simple' && task.length > 150) {
          console.log('[CEO] overriding simple -> complex (long task)');
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

    // 每个角色发表意见（排除 coordinator，它是主持人），最多 2 个，并行执行
    const discussRoles = roles.filter(r => r !== coordinatorRole).slice(0, 2);

    const discussionTmpl = getPromptTemplate('discussion') || '你是{name}。{member_description}\n\n你正在参加团队会议讨论一个技术任务。从你的专业角度给出具体建议，包括：1)你认为应该怎么实现 2)需要注意什么风险 3)你建议用什么技术方案。用2-3句话回答。';

    const opinions = await Promise.all(discussRoles.map(async (role) => {
      const tmpl = getTemplate(role);
      if (!tmpl) return null;

      onEvent?.({ type: 'agent_status_update', agentId: `agent-${role}`, status: 'speaking' });

      const discussionSystem = formatPrompt(
        { ...tmpl, custom_prompt: discussionTmpl },
        { name: tmpl.name, description: tmpl.description },
      );

      const opinion = await this.callLLMOnce([
        { role: 'system', content: discussionSystem },
        { role: 'user', content: `任务：${task}\n\n请从你的专业角度发表意见。` },
      ]);

      onEvent?.({ type: 'agent_message', agentId: `agent-${role}`, content: opinion, timestamp: Date.now() });
      onEvent?.({ type: 'agent_status_update', agentId: `agent-${role}`, status: 'meeting' });

      return { name: tmpl.name, opinion };
    }));

    for (const op of opinions) {
      if (op) discussions.push(`${op.name}：${op.opinion}`);
    }

    // coordinator 总结讨论
    const coordTmpl = getTemplate(coordinatorRole);
    const coordSummaryTmpl = getPromptTemplate('coordinator_summary') || '你是{name}。根据团队讨论，给出明确的执行方案：1)具体分工 2)技术方案选择 3)验收标准。简洁明了。';
    const coordSummarySystem = coordTmpl
      ? formatPrompt({ ...coordTmpl, custom_prompt: coordSummaryTmpl }, { name: coordTmpl.name, description: coordTmpl.description })
      : '项目经理。根据团队讨论，给出明确的执行方案。';

    const coordSummary = await this.callLLMOnce([
      { role: 'system', content: coordSummarySystem },
      { role: 'user', content: `任务：${task}\n\n讨论记录：\n${discussions.join('\n')}\n\n请给出执行方案。` },
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
    const toolGuide = `工具：write_file(path,content) | edit_file(path,old,new) | read_file(path) | list_directory(path) | bash(command) | grep_content(pattern) | git_status() | git_diff() | git_commit(msg)

流程：1.list_directory 2.write_file创建文件 3.bash运行测试 4.git_commit提交。不要用bash创建文件。`;

    const messages: Message[] = [
      { role: 'system', content: `${systemPrompt}\n\n${toolGuide}\n\n${instruction}` },
      { role: 'user', content: task },
    ];

    let result = '';
    const maxIter = 10;
    const MAX_CONTEXT_TOKENS = 800000; // 保守上限，留 buffer

    for (let i = 0; i < maxIter; i++) {
      // 截断过长的上下文
      this.truncateMessages(messages, MAX_CONTEXT_TOKENS);

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

    const reviewTmpl = getPromptTemplate('review') || '{prompt}\n\n你正在审查代码质量。检查以下几点：\n1. 功能完整性\n2. 错误处理\n3. 代码结构\n4. 命名规范\n\n返回JSON：{"approved": true/false, "feedback": "审查意见"}';
    const reviewSystem = reviewTmpl.replace(/\{prompt\}/g, prompt);

    const reviewResult = await this.callLLMOnce([
      { role: 'system', content: reviewSystem },
      { role: 'user', content: `任务：${task}\n\n执行结果：\n${executionResult.substring(0, 1200)}` },
    ]);

    // 将审查结果发给前端
    try {
      const match = reviewResult.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        onEvent?.({ type: 'agent_message', agentId: `agent-${reviewerRole}`, content: parsed.feedback || '审查完成', timestamp: Date.now() });
        onEvent?.({ type: 'agent_status_update', agentId: `agent-${reviewerRole}`, status: 'meeting' });
        return parsed;
      }
    } catch {}

    onEvent?.({ type: 'agent_message', agentId: `agent-${reviewerRole}`, content: reviewResult.substring(0, 300), timestamp: Date.now() });
    onEvent?.({ type: 'agent_status_update', agentId: `agent-${reviewerRole}`, status: 'meeting' });
    return { approved: true, feedback: reviewResult };
  }

  // ====== 上下文截断 ======
  private truncateMessages(messages: Message[], maxChars: number): void {
    let totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    if (totalChars <= maxChars) return;

    // 保留 system prompt (index 0) 和最近的消息，截断中间的工具结果
    for (let i = 1; i < messages.length - 2 && totalChars > maxChars; i++) {
      const msg = messages[i];
      if (msg.role === 'tool' && msg.content && msg.content.length > 500) {
        const truncated = msg.content.substring(0, 500) + '\n... [截断]';
        totalChars -= (msg.content.length - truncated.length);
        messages[i] = { ...msg, content: truncated };
      }
    }
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
