import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamCoordinator } from './coordinator.js';
import type { LLMConfig } from '../llm/types.js';

// 注意：本仓库环境（vitest 3.2.4 从主仓库 node_modules 加载）下，vi.mock 对
// '../../llm/openai.js' 的拦截仅当测试文件位于 src/agent/__tests__/ 时生效，
// 其它目录（含 src/team/）不生效。因此这里不 mock LLM 模块，而是直接
// stub coordinator 内部触碰 LLM 的私有方法（analyzeComplexity/createAgents/
// callLLMOnce），让 execute 全链路跑通——真正验证的是
// roleLocations → createTeam → member.location/runtime 的接线。

function makeCoordinator(overrides: Record<string, unknown> = {}) {
  const config = {
    llm: { provider: 'deepseek', model: 'deepseek-chat', apiKey: 'test', baseUrl: '' } as LLMConfig,
    workspace: '/tmp/ws',
    routerFactory: {
      getRouterForMember: vi.fn(() => ({ execute: vi.fn() })),
      getWorkspaceForMember: vi.fn(() => '/tmp/ws'),
    },
    defaultRouter: { execute: vi.fn(async () => ({ call_id: 'x', tool_name: 'bash', result: 'ok' })) },
    ...overrides,
  };
  return new TeamCoordinator(config as any);
}

/** 构造假 RoleAgent：仅承担 coordinator 流程所需的 chat/chatWithTools 接口 */
function makeFakeAgents() {
  return [
    {
      id: 'agent-executor',
      roleId: 'executor',
      roleName: 'Executor',
      chatWithTools: vi.fn(async () => ({
        result: 'done',
        summary: { filesCreated: [], filesModified: [], toolCalls: [], errors: [], finalMessage: 'done' },
      })),
      chat: vi.fn(async () => 'ok'),
      injectContext: vi.fn(),
    },
    {
      id: 'agent-reviewer',
      roleId: 'reviewer',
      roleName: 'Reviewer',
      chatWithTools: vi.fn(async () => ({
        result: 'done',
        summary: { filesCreated: [], filesModified: [], toolCalls: [], errors: [], finalMessage: 'done' },
      })),
      chat: vi.fn(async () => '{"approved": true, "feedback": "ok"}'),
      injectContext: vi.fn(),
    },
  ];
}

/** 让 execute 全链路跑通：替换所有会真实调用 LLM 的私有方法 */
function stubLlmPaths(coordinator: TeamCoordinator, fakeAgents: unknown[]) {
  (coordinator as any).analyzeComplexity = vi.fn(async () => ({ level: 'complex', reason: 'test' }));
  (coordinator as any).createAgents = vi.fn(async () => fakeAgents);
  (coordinator as any).callLLMOnce = vi.fn(async () => 'summary');
}

describe('TeamCoordinator roleLocations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies roleLocations to member.location and remote runtime via execute', async () => {
    const coordinator = makeCoordinator();
    stubLlmPaths(coordinator, makeFakeAgents());

    await coordinator.execute(
      '开发前端页面',
      ['executor', 'reviewer'],
      undefined,
      { executor: 'remote', reviewer: 'local' },
    );

    const members = coordinator['team']!.members;
    const execMember = members.find((m) => m.role === 'executor');
    const revMember = members.find((m) => m.role === 'reviewer');
    expect(execMember?.location).toBe('remote');
    expect(execMember?.runtime.type).toBe('remote');
    expect(revMember?.location).toBe('local');
    expect(revMember?.runtime.type).toBe('local');
  });

  it('defaults to local when roleLocations omitted via execute', async () => {
    const coordinator = makeCoordinator();
    stubLlmPaths(coordinator, makeFakeAgents());

    await coordinator.execute('简单任务', ['executor']);

    const execMember = coordinator['team']!.members.find((m) => m.role === 'executor');
    expect(execMember?.location).toBe('local');
    expect(execMember?.runtime.type).toBe('local');
    expect(execMember?.runtime.workspace).toBe('/tmp/ws');
  });

  it('createTeam maps roleLocations directly (private method)', () => {
    const coordinator = makeCoordinator();
    const team = (coordinator as any).createTeam(
      ['executor', 'reviewer'],
      '任务',
      { executor: 'remote' },
    );
    expect(team.members.find((m: any) => m.role === 'executor')).toMatchObject({
      location: 'remote',
      runtime: { type: 'remote', workspace: '/tmp/ws' },
    });
    expect(team.members.find((m: any) => m.role === 'reviewer')).toMatchObject({
      location: 'local',
      runtime: { type: 'local', workspace: '/tmp/ws' },
    });
  });

  it('createTeam honors defaultRuntime for remote executor fields', () => {
    const coordinator = makeCoordinator();
    const team = (coordinator as any).createTeam(
      ['executor'],
      '任务',
      { executor: 'remote' },
      { workspace: '/tmp/ws2', executorUrl: 'http://executor:8767', executorToken: 'tok' },
    );
    const member = team.members[0];
    expect(member.location).toBe('remote');
    expect(member.runtime).toMatchObject({
      type: 'remote',
      workspace: '/tmp/ws2',
      executorUrl: 'http://executor:8767',
      executorToken: 'tok',
    });
  });

  it('createTeam rejects unknown role', () => {
    const coordinator = makeCoordinator();
    expect(() => (coordinator as any).createTeam(['nonexistent-role'], '任务', {})).toThrow('Unknown role');
  });
});
