/**
 * Agent Factory — 子 Agent 执行器
 * 
 * 调用 MDH 编排器的多智能体团队来修复问题。
 * 不同任务类型使用不同的角色组合和 prompt。
 */
import { WebSocket } from 'ws';
import type { Task } from './scheduler.js';
import type { FixAttempt } from './persistence.js';

const ORCHESTRATOR_URL = 'ws://localhost:8080/ws/';

interface AgentConfig {
  roles: string[];
  systemPrompt: string;
  maxIterations: number;
}

// ====== Agent 类型配置 ======
const AGENT_CONFIGS: Record<string, AgentConfig> = {
  bugfix: {
    roles: ['planner', 'executor', 'reviewer'],
    systemPrompt: '你是一个 Bug 修复团队。先分析 bug 根因，再修复，最后验证修复不会引入新问题。',
    maxIterations: 3,
  },
  security: {
    roles: ['planner', 'executor', 'reviewer'],
    systemPrompt: '你是一个安全修复团队。修复安全漏洞，确保不引入新的安全问题，遵循最小权限原则。',
    maxIterations: 3,
  },
  'test-generator': {
    roles: ['planner', 'executor'],
    systemPrompt: '你是一个测试生成团队。为代码编写全面的单元测试，覆盖正常路径、边界情况和错误处理。',
    maxIterations: 2,
  },
  optimizer: {
    roles: ['planner', 'executor', 'reviewer'],
    systemPrompt: '你是一个性能优化团队。分析性能瓶颈，实施优化，验证优化效果且不改变功能。',
    maxIterations: 3,
  },
  refactor: {
    roles: ['planner', 'executor'],
    systemPrompt: '你是一个代码重构团队。改进代码结构和可读性，保持功能不变，确保所有测试仍然通过。',
    maxIterations: 2,
  },
  general: {
    roles: ['coordinator', 'planner', 'executor', 'reviewer'],
    systemPrompt: '你是一个通用开发团队。分析问题，制定方案，实施修复，验证结果。',
    maxIterations: 3,
  },
};

// ====== 构建修复 Prompt ======

function buildFixPrompt(task: Task): string {
  const lines: string[] = [];

  lines.push(`## 任务`);
  lines.push(`${task.title}`);
  lines.push('');
  lines.push(`## 问题详情`);
  lines.push(task.description);
  lines.push('');
  lines.push(`## 涉及文件`);
  for (const file of task.files) {
    lines.push(`- ${file}`);
  }
  lines.push('');
  lines.push(`## 要求`);
  lines.push(`1. 先阅读相关文件，理解上下文`);
  lines.push(`2. 分析问题根因`);
  lines.push(`3. 实施最小化修复（不要引入不相关的改动）`);
  lines.push(`4. 修复后运行相关测试验证`);
  lines.push(`5. 如果是代码模式问题，只修改最严重的问题，低优先级的跳过`);

  return lines.join('\n');
}

// ====== 通过编排器执行修复 ======

export async function executeFix(task: Task): Promise<FixAttempt> {
  const config = AGENT_CONFIGS[task.agentType] || AGENT_CONFIGS.general;
  const prompt = buildFixPrompt(task);

  return new Promise((resolve) => {
    const start = Date.now();
    const filesChanged: string[] = [];
    let tokenUsage = 0;

    const ws = new WebSocket(ORCHESTRATOR_URL);
    let resolved = false;

    const finish = (diff: string) => {
      if (resolved) return;
      resolved = true;
      ws.close();
      resolve({
        issueId: task.issueIds[0],
        agent: task.agentType,
        filesChanged,
        diff,
        timestamp: new Date().toISOString(),
        tokenUsage,
      });
    };

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'unified_message',
        content: prompt,
        provider: 'deepseek',
        api_key: process.env.DEEPSEEK_API_KEY || '',
        base_url: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
        model_name: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        selected_roles: config.roles,
      }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case 'tool_result':
          if (msg.tool_name === 'write_file' || msg.tool_name === 'edit_file') {
            const path = msg.arguments?.path;
            if (path && !filesChanged.includes(path)) filesChanged.push(path);
          }
          break;

        case 'task_result':
          finish(msg.content || '');
          break;

        case 'error':
          if (!msg.message?.includes('workspace_confirm_response')) {
            finish(`Error: ${msg.message}`);
          }
          break;

        case 'workspace_confirm_request':
          ws.send(JSON.stringify({ type: 'workspace_confirm_response', workspace_type: 'standalone' }));
          break;
      }
    });

    ws.on('error', (e) => finish(`WebSocket error: ${e.message}`));
    setTimeout(() => finish('Timeout'), 300000); // 5 分钟超时
  });
}
