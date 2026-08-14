import { LLMConfig, Message } from '../llm/types.js';
import { chatStream } from '../llm/openai.js';
import type { IToolkitRouter } from '../toolkit/router.js';
import { RouterFactory } from '../toolkit/router.js';
import type { ExecutionProfile } from '../toolkit/hybrid.js';
import { getTemplate, getPromptTemplate } from './templates.js';
import { Team, TeamMember } from './types.js';
import { RoleAgent, buildSystemPrompt, getToolsForRole } from '../agent/index.js';
import type { ExecutionSummary } from '../agent/role-agent.js';

export interface CoordinatorConfig {
  llm: LLMConfig;
  routerFactory: RouterFactory;
  defaultRouter: IToolkitRouter;  // 用于协调器级别的操作（创建工作区等）
  workspace: string;
  /** 默认远端 executor 地址/Token（未显式传 defaultRuntime 时 remote 成员的兜底值） */
  executorUrl?: string;
  executorToken?: string;
  /** per-agent hybrid 执行配置（role → ExecutionProfile）。createTeam 时为匹配的角色写入 runtime.hybrid。 */
  hybridProfiles?: Record<string, ExecutionProfile>;
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
    roleLocations?: Record<string, 'local' | 'remote'>,
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

        await this.config.defaultRouter.execute({
          id: 'ws-create',
          type: 'function',
          function: { name: 'bash', arguments: JSON.stringify({ command: `mkdir -p /workspace/worktrees && git -C ${confirmResponse.repo_path} worktree add -b ${branch} ${worktreePath} 2>&1 || echo "worktree created"` }) },
        }, '/workspace');

        workspace = worktreePath;
        onEvent?.({ type: 'assistant_message', agentId: 'agent-ceo', content: `已创建 Git Worktree：${worktreePath}（分支：${branch}）` });
      } else {
        // 独立工作区 — 使用配置的 workspace 目录
        // 如果是本地模式，直接使用本地目录；如果是远端模式，在远端创建
        const baseWorkspace = this.config.workspace;
        const projectDir = `${baseWorkspace}/project-${Date.now().toString(36)}`;

        // 尝试创建工作区目录（本地 or 远端，由 router 决定）
        try {
          await this.config.defaultRouter.execute({
            id: 'ws-create',
            type: 'function',
            function: { name: 'bash', arguments: JSON.stringify({ command: `mkdir -p ${projectDir}` }) },
          }, baseWorkspace);
        } catch {
          // 如果远端创建失败，尝试本地创建
          const { mkdirSync } = await import('node:fs');
          try { mkdirSync(projectDir, { recursive: true }); } catch {}
        }

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

    this.team = this.createTeam(rolesToUse, userMessage, roleLocations);
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

    // 为每个角色创建独立 RoleAgent 实例（独立上下文 + system prompt + 工具集）
    const agents = await this.createAgents(rolesToUse, workspace);

    // ====== 阶段 2: 项目经理协调讨论 ======
    if ((complexity.level !== 'simple' || forceComplex) && rolesToUse.length > 1) {
      onEvent?.({ type: 'phase', phase: 'discussing' });

      const coordinatorRole = rolesToUse.find(r => r === 'coordinator') || rolesToUse[0];
      const discussion = await this.runDiscussion(userMessage, agents, coordinatorRole, onEvent);

      // ====== 阶段 3: 任务分配 ======
      onEvent?.({ type: 'phase', phase: 'assigning' });
      onEvent?.({ type: 'assistant_message', agentId: `agent-${coordinatorRole}`, content: `根据讨论结果，分配任务给团队成员...` });
    }

    // ====== 阶段 4: 执行（带审查循环）=====
    onEvent?.({ type: 'phase', phase: 'executing' });

    const executorAgent = agents.find(a => {
      const t = getTemplate(a.roleId);
      return t?.team_role === 'Executor';
    }) || agents[agents.length - 1];

    const reviewerAgent = agents.find(a => {
      const t = getTemplate(a.roleId);
      return t?.team_role === 'Reviewer';
    });

    const maxReviewRounds = reviewerAgent ? 2 : 1;
    let finalResult = '';
    let execSummary: ExecutionSummary = { filesCreated: [], filesModified: [], toolCalls: [], errors: [], finalMessage: '' };

    for (let round = 0; round < maxReviewRounds; round++) {
      if (round > 0) {
        onEvent?.({ type: 'assistant_message', agentId: reviewerAgent!.id, content: `审查发现问题，要求修改。第 ${round + 1} 轮执行...` });
      }

      // 执行任务 — RoleAgent 带独立上下文和工具循环
      const execOutput = await executorAgent.chatWithTools(
        round === 0 ? `请执行以下任务：\n${userMessage}` : `请根据审查反馈修改代码：\n${userMessage}`,
        onEvent,
      );
      finalResult = execOutput.result;
      execSummary = execOutput.summary;

      // 审查
      if (reviewerAgent && round < maxReviewRounds - 1) {
        onEvent?.({ type: 'phase', phase: 'reviewing' });
        const review = await this.runReview(reviewerAgent, execSummary, userMessage, onEvent);

        if (review.approved) {
          onEvent?.({ type: 'assistant_message', agentId: reviewerAgent.id, content: `审查通过！代码质量良好。` });
          break;
        }
        // 不通过，继续下一轮
      }
    }

    // ====== 阶段 5: 汇报结果（结构化摘要，非截断全文）=====
    onEvent?.({ type: 'phase', phase: 'summarizing' });

    const summarySystem = getPromptTemplate('summary') || '你是一位技术项目经理，请用简洁的中文总结项目执行结果。使用 Markdown 表格格式。';
    const structuredReport = this.formatExecSummary(execSummary, workspace);
    const summaryPrompt = `请根据以下执行摘要，生成一份简洁的项目总结报告。重点说明创建了哪些文件、解决了什么问题、是否有未完成的部分。\n\n任务：${userMessage}\n\n${structuredReport}`;
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

  // ====== 团队讨论（并发，使用 RoleAgent 独立上下文）=====
  private async runDiscussion(
    task: string,
    agents: RoleAgent[],
    coordinatorRole: string,
    onEvent?: EventHandler,
  ): Promise<string> {
    const discussions: string[] = [];

    // 每个角色发表意见（排除 coordinator，它是主持人），并行执行
    const discussAgents = agents.filter(a => a.roleId !== coordinatorRole).slice(0, 2);

    const opinions = await Promise.all(discussAgents.map(async (agent) => {
      onEvent?.({ type: 'agent_status_update', agentId: agent.id, status: 'speaking' });

      const opinion = await agent.chat(
        `任务：${task.substring(0, 200)}\n\n请从你的专业角度发表意见：1)应该怎么实现 2)有什么风险 3)建议什么技术方案。用2-3句话回答。`,
      );

      onEvent?.({ type: 'agent_message', agentId: agent.id, content: opinion, timestamp: Date.now() });
      onEvent?.({ type: 'agent_status_update', agentId: agent.id, status: 'meeting' });

      return { name: agent.roleName, opinion };
    }));

    for (const op of opinions) {
      if (op) discussions.push(`${op.name}：${op.opinion}`);
    }

    // coordinator 总结讨论（注入团队讨论上下文）
    const coordAgent = agents.find(a => a.roleId === coordinatorRole);
    if (!coordAgent) return discussions.join('\n');

    coordAgent.injectContext(`团队讨论记录：\n${discussions.join('\n').substring(0, 800)}`);
    const coordSummary = await coordAgent.chat(
      `任务：${task.substring(0, 200)}\n\n请给出明确的执行方案：1)具体分工 2)技术方案选择 3)验收标准。简洁明了。`,
    );

    onEvent?.({ type: 'agent_message', agentId: coordAgent.id, content: coordSummary, timestamp: Date.now() });

    // 将讨论结论注入 executor 上下文作为执行约束
    const executorAgent = agents.find(a => {
      const t = getTemplate(a.roleId);
      return t?.team_role === 'Executor';
    });
    if (executorAgent && discussions.length > 0) {
      const constraints: string[] = [];
      for (const d of discussions) {
        const stanceMatch = d.match(/\[STANCE:(\w+)\]/i);
        const stance = stanceMatch?.[1]?.toLowerCase() || 'neutral';
        const cleaned = d.replace(/\[STANCE:\w+\]/gi, '').replace(/\[CONFIDENCE:[\d.]+\]/gi, '').trim();
        if (cleaned.length <= 10) continue;
        // oppose 意见转为"避免"约束
        if (stance === 'oppose') {
          constraints.push(`避免：${cleaned}`);
        } else {
          constraints.push(cleaned);
        }
      }
      if (constraints.length > 0) {
        executorAgent.injectContext(
          `## 团队讨论结论（执行时必须遵循）\n${constraints.map((c, i) => `${i + 1}. ${c}`).join('\n')}`,
        );
      }
    }

    return coordSummary;
  }

  /** 将 ExecutionSummary 格式化为结构化报告 */
  private formatExecSummary(summary: ExecutionSummary, workspace: string): string {
    const parts: string[] = [`工作区：${workspace}`];
    if (summary.filesCreated.length > 0) parts.push(`创建文件 (${summary.filesCreated.length})：${summary.filesCreated.join(', ')}`);
    if (summary.filesModified.length > 0) parts.push(`修改文件 (${summary.filesModified.length})：${summary.filesModified.join(', ')}`);
    const failedTools = summary.toolCalls.filter(t => !t.success);
    if (failedTools.length > 0) parts.push(`失败操作：${failedTools.map(t => `${t.tool}(${t.args})`).join(', ')}`);
    if (summary.errors.length > 0) parts.push(`错误：${summary.errors.join('; ')}`);
    parts.push(`工具调用次数：${summary.toolCalls.length}`);
    if (summary.finalMessage) parts.push(`最终回复：${summary.finalMessage.substring(0, 500)}`);
    return parts.join('\n');
  }

  // ====== 审查（reviewer 收到结构化变更清单，无需自行读文件）=====
  private async runReview(
    reviewerAgent: RoleAgent,
    execSummary: ExecutionSummary,
    task: string,
    onEvent?: EventHandler,
  ): Promise<{ approved: boolean; feedback: string }> {
    const reviewerRole = reviewerAgent.roleId;
    const tmpl = getTemplate(reviewerRole);
    if (!tmpl) return { approved: true, feedback: '' };

    onEvent?.({ type: 'agent_status_update', agentId: reviewerAgent.id, status: 'working' });

    const reviewTmpl = getPromptTemplate('review') || '{prompt}\n\n你正在审查代码质量。检查以下几点：\n1. 功能完整性\n2. 错误处理\n3. 代码结构\n4. 命名规范\n\n返回JSON：{"approved": true/false, "feedback": "审查意见"}';

    // 从 ExecutionSummary 构建变更清单（无需 reviewer 自己读文件）
    const changeList: string[] = [];
    if (execSummary.filesCreated.length > 0) {
      changeList.push(`新增文件 (${execSummary.filesCreated.length})：`);
      for (const f of execSummary.filesCreated) changeList.push(`  + ${f}`);
    }
    if (execSummary.filesModified.length > 0) {
      changeList.push(`修改文件 (${execSummary.filesModified.length})：`);
      for (const f of execSummary.filesModified) changeList.push(`  ~ ${f}`);
    }
    const failedTools = execSummary.toolCalls.filter(t => !t.success);
    if (failedTools.length > 0) {
      changeList.push(`执行失败 (${failedTools.length})：${failedTools.map(t => `${t.tool}(${t.args})`).join(', ')}`);
    }
    if (execSummary.errors.length > 0) {
      changeList.push(`错误详情：${execSummary.errors.join('; ')}`);
    }

    const reviewContent = `任务：${task}\n\n执行变更清单：\n${changeList.join('\n')}\n\n最终回复：\n${execSummary.finalMessage.substring(0, 1000)}`;
    const reviewResult = await reviewerAgent.chat(`${reviewTmpl}\n\n${reviewContent}`);

    // 将审查结果发给前端
    try {
      const match = reviewResult.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        const feedback = parsed.feedback || '审查完成';
        onEvent?.({ type: 'agent_message', agentId: reviewerAgent.id, content: feedback, timestamp: Date.now() });
        onEvent?.({ type: 'agent_status_update', agentId: reviewerAgent.id, status: 'meeting' });

        if (parsed.details) {
          const detailsStr = Object.entries(parsed.details)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
          onEvent?.({
            type: 'agent_message',
            agentId: reviewerAgent.id,
            content: `评分详情：${detailsStr}，总分：${parsed.score || 'N/A'}`,
            timestamp: Date.now()
          });
        }

        return { approved: parsed.approved !== false, feedback };
      }
    } catch (e) {
      console.error('[review] Failed to parse review result:', e);
    }

    onEvent?.({ type: 'agent_message', agentId: `agent-${reviewerRole}`, content: reviewResult.substring(0, 500), timestamp: Date.now() });
    onEvent?.({ type: 'agent_status_update', agentId: `agent-${reviewerRole}`, status: 'meeting' });
    return { approved: false, feedback: reviewResult };
  }

  // ====== LLM 纯文本调用（CEO 分析和总结使用）=====
  private async callLLMOnce(messages: Message[]): Promise<string> {
    let content = '';
    for await (const chunk of chatStream(this.config.llm, messages)) {
      content += chunk.delta;
    }
    return content;
  }

  // ====== 团队创建（保留 meeting_started 事件和路由信息）======
  // roleLocations 按角色指定执行位置（local/remote），未指定则默认 local。
  // member.location 决定 RouterFactory 返回 local 还是 remote router（见 toolkit/router.ts）；
  // 但若 hybridProfiles[roleId] 存在，runtime.hybrid.profile 优先于 location —— router.ts
  // 的 getRouterForMember 先查 runtime.hybrid（local/remote 分支均支持混合路由）。
  private createTeam(
    roleIds: string[],
    task: string,
    roleLocations: Record<string, 'local' | 'remote'> = {},
    defaultRuntime?: { workspace: string; executorUrl?: string; executorToken?: string },
    hybridProfiles: Record<string, ExecutionProfile> = this.config.hybridProfiles ?? {},
  ): Team {
    const members: TeamMember[] = roleIds.map((roleId, i) => {
      const template = getTemplate(roleId);
      if (!template) throw new Error(`Unknown role: ${roleId}`);
      const location: 'local' | 'remote' = roleLocations[roleId] || 'local';
      const hybrid = hybridProfiles[roleId] ? { hybrid: { profile: hybridProfiles[roleId] } } : {};
      const runtime =
        location === 'remote'
          ? {
              type: 'remote' as const,
              workspace: defaultRuntime?.workspace ?? this.config.workspace,
              executorUrl: defaultRuntime?.executorUrl ?? this.config.executorUrl ?? '',
              executorToken: defaultRuntime?.executorToken ?? this.config.executorToken ?? '',
              ...hybrid,
            }
          : defaultRuntime
            ? { type: 'local' as const, workspace: defaultRuntime.workspace, executorUrl: defaultRuntime.executorUrl, executorToken: defaultRuntime.executorToken, ...hybrid }
            : { type: 'local' as const, workspace: this.config.workspace, ...hybrid };
      return {
        id: `member-${i}`,
        name: template.name,
        role: roleId,
        template,
        status: 'idle',
        location,
        runtime,
      };
    });
    return { id: `team-${Date.now()}`, name: `task-${Date.now().toString(36)}`, description: task, members, leader: members[0] };
  }

  // ====== 为每个角色创建独立 RoleAgent 实例 ======
  private async createAgents(roleIds: string[], workspace: string): Promise<RoleAgent[]> {
    return Promise.all(roleIds.map(async roleId => {
      const template = getTemplate(roleId);
      // 从 team 中查找该角色的 member（含 location/runtime 信息），找不到则默认 local
      const member = this.team?.members.find(m => m.role === roleId);
      const router = this.config.routerFactory.getRouterForMember({
        id: member?.id || `member-${roleId}`,
        roleName: template?.name || roleId,
        teamRole: (template?.team_role || 'Executor') as 'Coordinator' | 'Planner' | 'Executor' | 'Reviewer' | 'Monitor',
        location: member?.location || 'local',
        runtime: member?.runtime || { type: 'local', workspace },
        tools: template?.tools || [],
        dangerousTools: template?.dangerous_tools || [],
        status: 'idle',
      });

      return new RoleAgent({
        id: `agent-${roleId}`,
        roleId,
        roleName: template?.name || roleId,
        systemPrompt: await buildSystemPrompt(roleId),
        tools: getToolsForRole(roleId),
        router,
        workspace,
        llm: this.config.llm,
      });
    }));
  }
}
