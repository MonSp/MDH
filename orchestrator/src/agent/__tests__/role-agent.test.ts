import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoleAgent } from '../role-agent.js';
import type { AgentConfig, ExecutionSummary } from '../role-agent.js';
import type { LLMConfig } from '../../llm/types.js';

// ─── Mock LLM ───

// 默认：纯文本回复，无工具调用
let mockResponses: Array<{ content: string; tool_calls: any[] }> = [
  { content: 'test response', tool_calls: [] },
];
let responseIndex = 0;

vi.mock('../../llm/openai.js', () => ({
  chatStream: vi.fn(async function* () {
    const resp = mockResponses[responseIndex++ % mockResponses.length];
    yield { delta: resp.content || '', tool_calls: resp.tool_calls || [], finish_reason: 'stop' };
  }),
}));

// ─── Mock Router ───

const mockRouter = {
  execute: vi.fn(async (call: any) => {
    const name = call.function?.name;
    if (name === 'write_file') {
      return { call_id: call.id, tool_name: name, result: 'written' };
    }
    if (name === 'read_file') {
      return { call_id: call.id, tool_name: name, result: 'file content' };
    }
    if (name === 'bash') {
      return { call_id: call.id, tool_name: name, result: 'command output' };
    }
    if (name === 'edit_file') {
      return { call_id: call.id, tool_name: name, result: 'edited' };
    }
    return { call_id: call.id, tool_name: name, result: 'ok' };
  }),
};

// ─── Helpers ───

function makeConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  const llm: LLMConfig = {
    provider: 'deepseek',
    apiKey: 'test',
    baseUrl: 'http://localhost',
    model: 'test',
  };
  return {
    id: 'agent-test',
    roleId: 'executor',
    roleName: '测试角色',
    systemPrompt: '你是测试角色。',
    tools: [],
    router: mockRouter as any,
    workspace: '/tmp/test',
    llm,
    ...overrides,
  };
}

/** 设置 LLM 返回带工具调用的响应序列 */
function setMockToolSequence(responses: Array<{ content: string; tool_calls: any[] }>) {
  mockResponses = responses;
  responseIndex = 0;
}

function makeToolCall(name: string, args: Record<string, any>, id?: string) {
  return {
    id: id || `call_${name}_${Date.now()}`,
    type: 'function' as const,
    function: { name, arguments: JSON.stringify(args) },
  };
}

// ─── Tests ───

describe('RoleAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResponses = [{ content: 'test response', tool_calls: [] }];
    responseIndex = 0;
  });

  it('constructor 初始化独立的 system message', () => {
    const agent = new RoleAgent(makeConfig());
    expect(agent.id).toBe('agent-test');
    expect(agent.roleId).toBe('executor');
    expect(agent.roleName).toBe('测试角色');
    expect(agent.messageCount).toBe(1);
  });

  it('chat() 追加 user 和 assistant 消息', async () => {
    const agent = new RoleAgent(makeConfig());
    const response = await agent.chat('hello');
    expect(response).toBe('test response');
    expect(agent.messageCount).toBe(3);
  });

  it('两个 agent 的上下文独立', async () => {
    const agent1 = new RoleAgent(makeConfig({ id: 'a1', roleId: 'executor' }));
    const agent2 = new RoleAgent(makeConfig({ id: 'a2', roleId: 'reviewer', systemPrompt: '你是审查角色。' }));

    await agent1.chat('task 1');
    await agent2.chat('task 2');

    expect(agent1.messageCount).toBe(3);
    expect(agent2.messageCount).toBe(3);
    expect(agent1.systemPrompt).not.toBe(agent2.systemPrompt);
    expect(agent1.getContextSummary()).not.toContain('task 2');
  });

  it('getContextSummary 返回 assistant 消息', async () => {
    const agent = new RoleAgent(makeConfig());
    await agent.chat('hello');
    const summary = agent.getContextSummary();
    expect(summary).toContain('test response');
  });

  it('injectContext 追加团队上下文消息', () => {
    const agent = new RoleAgent(makeConfig());
    agent.injectContext('other agent says hi');
    expect(agent.messageCount).toBe(2);
  });
});

describe('RoleAgent.chatWithTools — ExecutionSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResponses = [{ content: 'test response', tool_calls: [] }];
    responseIndex = 0;
  });

  it('无工具调用时返回空 summary', async () => {
    const agent = new RoleAgent(makeConfig());
    const { result, summary } = await agent.chatWithTools('do something');
    expect(result).toBe('test response');
    expect(summary.filesCreated).toEqual([]);
    expect(summary.filesModified).toEqual([]);
    expect(summary.toolCalls).toEqual([]);
    expect(summary.errors).toEqual([]);
    expect(summary.finalMessage).toBe('test response');
  });

  it('write_file 工具调用被记录到 filesCreated', async () => {
    setMockToolSequence([
      { content: '创建文件', tool_calls: [makeToolCall('write_file', { path: 'app.js', content: 'console.log("hi")' })] },
      { content: '任务完成', tool_calls: [] },
    ]);

    const agent = new RoleAgent(makeConfig());
    const { result, summary } = await agent.chatWithTools('创建一个文件');

    expect(summary.filesCreated).toEqual(['app.js']);
    expect(summary.toolCalls).toHaveLength(1);
    expect(summary.toolCalls[0]).toMatchObject({ tool: 'write_file', success: true });
    expect(summary.toolCalls[0].args).toContain('app.js');
    expect(summary.errors).toEqual([]);
  });

  it('多个文件创建全部被追踪', async () => {
    setMockToolSequence([
      {
        content: '创建文件',
        tool_calls: [
          makeToolCall('write_file', { path: 'index.html', content: '<html/>' }),
          makeToolCall('write_file', { path: 'style.css', content: 'body{}' }),
          makeToolCall('write_file', { path: 'app.js', content: 'console.log()' }),
        ],
      },
      { content: '完成', tool_calls: [] },
    ]);

    const agent = new RoleAgent(makeConfig());
    const { summary } = await agent.chatWithTools('创建三个文件');

    expect(summary.filesCreated).toEqual(['index.html', 'style.css', 'app.js']);
    expect(summary.toolCalls).toHaveLength(3);
    expect(summary.toolCalls.every(t => t.success)).toBe(true);
  });

  it('edit_file 被记录到 filesModified', async () => {
    setMockToolSequence([
      { content: '修改文件', tool_calls: [makeToolCall('edit_file', { path: 'config.json', old_string: 'a', new_string: 'b' })] },
      { content: '完成', tool_calls: [] },
    ]);

    const agent = new RoleAgent(makeConfig());
    const { summary } = await agent.chatWithTools('修改配置');

    expect(summary.filesModified).toEqual(['config.json']);
    expect(summary.filesCreated).toEqual([]);
  });

  it('bash 工具调用记录命令摘要', async () => {
    setMockToolSequence([
      { content: '运行命令', tool_calls: [makeToolCall('bash', { command: 'npm install express' })] },
      { content: '完成', tool_calls: [] },
    ]);

    const agent = new RoleAgent(makeConfig());
    const { summary } = await agent.chatWithTools('安装依赖');

    expect(summary.toolCalls[0]).toMatchObject({
      tool: 'bash',
      args: 'npm install express',
      success: true,
    });
  });

  it('工具执行失败记录到 errors', async () => {
    mockRouter.execute.mockResolvedValueOnce({
      call_id: 'fail-1',
      tool_name: 'write_file',
      result: null,
      error: 'Permission denied',
    });

    setMockToolSequence([
      { content: '写入文件', tool_calls: [makeToolCall('write_file', { path: '/root/secret', content: 'x' })] },
      { content: '失败了', tool_calls: [] },
    ]);

    const agent = new RoleAgent(makeConfig());
    const { summary } = await agent.chatWithTools('写入受保护文件');

    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toContain('Permission denied');
    expect(summary.toolCalls[0].success).toBe(false);
    expect(summary.filesCreated).toEqual([]); // 失败的不算
  });

  it('多轮工具调用累积所有记录', async () => {
    setMockToolSequence([
      { content: '第一步', tool_calls: [makeToolCall('write_file', { path: 'a.js', content: 'a' })] },
      { content: '第二步', tool_calls: [makeToolCall('bash', { command: 'node a.js' })] },
      { content: '第三步', tool_calls: [makeToolCall('edit_file', { path: 'a.js', old_string: 'a', new_string: 'b' })] },
      { content: '完成', tool_calls: [] },
    ]);

    const agent = new RoleAgent(makeConfig());
    const { summary } = await agent.chatWithTools('多步任务');

    expect(summary.filesCreated).toEqual(['a.js']);
    expect(summary.filesModified).toEqual(['a.js']);
    expect(summary.toolCalls).toHaveLength(3);
    expect(summary.toolCalls.map(t => t.tool)).toEqual(['write_file', 'bash', 'edit_file']);
  });

  it('超长 bash 命令被截断到 60 字符', async () => {
    const longCmd = 'echo ' + 'x'.repeat(200);
    setMockToolSequence([
      { content: '运行', tool_calls: [makeToolCall('bash', { command: longCmd })] },
      { content: '完成', tool_calls: [] },
    ]);

    const agent = new RoleAgent(makeConfig());
    const { summary } = await agent.chatWithTools('运行长命令');

    expect(summary.toolCalls[0].args.length).toBeLessThanOrEqual(60);
  });
});

describe('ExecutionSummary 格式化', () => {
  // 测试 formatExecSummary 的逻辑（从 coordinator 提取出来独立测试）
  function formatExecSummary(summary: ExecutionSummary, workspace: string): string {
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

  it('空 summary 格式化正确', () => {
    const summary: ExecutionSummary = { filesCreated: [], filesModified: [], toolCalls: [], errors: [], finalMessage: '' };
    const report = formatExecSummary(summary, '/tmp/test');
    expect(report).toContain('工作区：/tmp/test');
    expect(report).toContain('工具调用次数：0');
    expect(report).not.toContain('创建文件');
    expect(report).not.toContain('错误');
  });

  it('完整 summary 包含所有字段', () => {
    const summary: ExecutionSummary = {
      filesCreated: ['index.html', 'style.css'],
      filesModified: ['config.json'],
      toolCalls: [
        { tool: 'write_file', args: 'index.html', success: true },
        { tool: 'bash', args: 'npm install', success: true },
        { tool: 'write_file', args: '/root/x', success: false },
      ],
      errors: ['write_file: Permission denied'],
      finalMessage: '任务完成',
    };
    const report = formatExecSummary(summary, '/workspace');
    expect(report).toContain('创建文件 (2)：index.html, style.css');
    expect(report).toContain('修改文件 (1)：config.json');
    expect(report).toContain('失败操作：write_file(/root/x)');
    expect(report).toContain('错误：write_file: Permission denied');
    expect(report).toContain('工具调用次数：3');
    expect(report).toContain('最终回复：任务完成');
  });
});

describe('讨论约束提炼', () => {
  function buildDiscussionConstraints(opinions: string[]): string {
    const constraints: string[] = [];
    for (const opinion of opinions) {
      const stanceMatch = opinion.match(/\[STANCE:(\w+)\]/i);
      const stance = stanceMatch?.[1]?.toLowerCase() || 'neutral';
      if (stance === 'oppose') continue;
      const cleaned = opinion
        .replace(/\[STANCE:\w+\]/gi, '')
        .replace(/\[CONFIDENCE:[\d.]+\]/gi, '')
        .trim();
      if (cleaned.length > 10) constraints.push(cleaned);
    }
    return constraints.length > 0
      ? `## 团队讨论结论（执行时必须遵循）\n${constraints.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
      : '';
  }

  it('support 意见被提取为约束', () => {
    const result = buildDiscussionConstraints([
      '建议用 React 框架 [STANCE:support] [CONFIDENCE:0.9]',
    ]);
    expect(result).toContain('React');
    expect(result).toContain('## 团队讨论结论');
  });

  it('oppose 意见被过滤', () => {
    const result = buildDiscussionConstraints([
      '不建议用 jQuery [STANCE:oppose] [CONFIDENCE:0.8]',
    ]);
    expect(result).toBe('');
  });

  it('STANCE/CONFIDENCE 标签被清除', () => {
    const result = buildDiscussionConstraints([
      '建议用 TypeScript [STANCE:modify] [CONFIDENCE:0.7]',
    ]);
    expect(result).not.toContain('[STANCE');
    expect(result).not.toContain('[CONFIDENCE');
    expect(result).toContain('TypeScript');
  });

  it('混合意见只保留非反对', () => {
    const result = buildDiscussionConstraints([
      '建议用 React 框架来构建前端界面 [STANCE:support] [CONFIDENCE:0.9]',
      '反对使用 jQuery 这种老旧框架 [STANCE:oppose] [CONFIDENCE:0.8]',
      '建议添加完整的单元测试覆盖 [STANCE:modify] [CONFIDENCE:0.6]',
    ]);
    expect(result).toContain('React');
    expect(result).not.toContain('jQuery');
    expect(result).toContain('单元测试');
  });

  it('空意见列表返回空字符串', () => {
    expect(buildDiscussionConstraints([])).toBe('');
  });
});
