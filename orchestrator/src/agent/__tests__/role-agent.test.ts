import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoleAgent } from '../role-agent.js';
import type { AgentConfig } from '../role-agent.js';
import type { LLMConfig } from '../../llm/types.js';

// Mock LLM — 每次调用返回固定文本，无工具调用
vi.mock('../../llm/openai.js', () => ({
  chatStream: vi.fn(async function* () {
    yield { delta: 'test response', tool_calls: [], finish_reason: 'stop' };
  }),
}));

// Mock router
const mockRouter = {
  execute: vi.fn(async () => ({
    call_id: 'test',
    tool_name: 'read_file',
    result: 'file content',
  })),
};

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

describe('RoleAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constructor 初始化独立的 system message', () => {
    const agent = new RoleAgent(makeConfig());
    expect(agent.id).toBe('agent-test');
    expect(agent.roleId).toBe('executor');
    expect(agent.roleName).toBe('测试角色');
    expect(agent.messageCount).toBe(1); // 只有 system message
  });

  it('chat() 追加 user 和 assistant 消息', async () => {
    const agent = new RoleAgent(makeConfig());
    const response = await agent.chat('hello');
    expect(response).toBe('test response');
    expect(agent.messageCount).toBe(3); // system + user + assistant
  });

  it('两个 agent 的上下文独立', async () => {
    const agent1 = new RoleAgent(makeConfig({ id: 'a1', roleId: 'executor' }));
    const agent2 = new RoleAgent(makeConfig({ id: 'a2', roleId: 'reviewer', systemPrompt: '你是审查角色。' }));

    await agent1.chat('task 1');
    await agent2.chat('task 2');

    expect(agent1.messageCount).toBe(3);
    expect(agent2.messageCount).toBe(3);
    // 各自 system prompt 独立
    expect(agent1.systemPrompt).not.toBe(agent2.systemPrompt);
    // agent1 的上下文不包含 agent2 的输入
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
    expect(agent.messageCount).toBe(2); // system + injected context
  });

  it('chatWithTools 无工具调用时直接返回内容', async () => {
    const agent = new RoleAgent(makeConfig());
    const result = await agent.chatWithTools('do something');
    expect(result).toBe('test response');
  });
});
