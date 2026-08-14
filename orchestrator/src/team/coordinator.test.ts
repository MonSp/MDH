import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TeamCoordinator } from './coordinator.js';
import { RoleAgent } from '../agent/index.js';
import type { LLMConfig } from '../llm/types.js';

// 说明：本测试刻意不 mock LLM 模块（vi.mock('../../llm/openai.js') 在 src/team/
// 目录下是可以生效的，见同目录 assembler.test.ts），而是直接 stub coordinator
// 实例方法（analyzeComplexity/createAgents/callLLMOnce）或 RoleAgent 实例方法
// （chat/chatWithTools），把隔离面控制在最小，让 roleLocations → createTeam →
// member.location/runtime 以及真实 createAgents 中的路由选择接线跑通。

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

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('routes remote member through getRouterForMember with remote location', async () => {
    // 真实 createAgents 会实例化 RoleAgent —— 仅 stub 其 LLM 交互方法，避免真实 API 调用
    const chatSpy = vi.spyOn(RoleAgent.prototype, 'chat')
      .mockResolvedValue('{"approved": true, "feedback": "ok"}');
    const chatWithToolsSpy = vi.spyOn(RoleAgent.prototype, 'chatWithTools')
      .mockResolvedValue({
        result: 'done',
        summary: { filesCreated: [], filesModified: [], toolCalls: [], errors: [], finalMessage: 'done' },
      });

    const getRouterForMember = vi.fn(() => ({ execute: vi.fn() }));
    const coordinator = makeCoordinator({
      executorUrl: 'http://executor:8767',
      routerFactory: {
        getRouterForMember,
        getWorkspaceForMember: vi.fn(() => '/tmp/ws'),
      },
    });
    // 仅 stub LLM 纯文本路径，保留真实 createTeam + createAgents 走完执行链路
    (coordinator as any).analyzeComplexity = vi.fn(async () => ({ level: 'complex', reason: 'test' }));
    (coordinator as any).callLLMOnce = vi.fn(async () => 'summary');

    await coordinator.execute(
      '开发前端页面',
      ['executor', 'reviewer'],
      undefined,
      { executor: 'remote', reviewer: 'local' },
    );

    // createAgents 对每个成员调用 getRouterForMember：
    // executor 应为 remote 且 runtime 携带配置的 executorUrl（R1 贯通验证）
    expect(getRouterForMember).toHaveBeenCalledWith(
      expect.objectContaining({
        location: 'remote',
        runtime: expect.objectContaining({
          type: 'remote',
          executorUrl: 'http://executor:8767',
        }),
      }),
    );

    // 真实 Agent 实例的 LLM 交互确实被调用过（说明 createAgents 未被 stub 掉）
    expect(chatSpy).toHaveBeenCalled();
    expect(chatWithToolsSpy).toHaveBeenCalled();
  });

  it('applies config hybridProfiles to member runtime.hybrid', async () => {
    const coordinator = makeCoordinator({ hybridProfiles: { executor: 'remote-brain-local-hands' } });
    stubLlmPaths(coordinator, makeFakeAgents());

    await coordinator.execute(
      '任务',
      ['executor', 'reviewer'],
      undefined,
      { executor: 'remote', reviewer: 'local' },
    );

    const execMember = coordinator['team']!.members.find((m) => m.role === 'executor')!;
    expect((execMember.runtime as any).hybrid).toEqual({ profile: 'remote-brain-local-hands' });
  });

  it('applies config hybridProfiles to local member runtime.hybrid', async () => {
    const coordinator = makeCoordinator({ hybridProfiles: { reviewer: 'remote-brain-local-hands' } });
    stubLlmPaths(coordinator, makeFakeAgents());

    await coordinator.execute(
      '任务',
      ['executor', 'reviewer'],
      undefined,
      { executor: 'remote', reviewer: 'local' },
    );

    const revMember = coordinator['team']!.members.find((m) => m.role === 'reviewer')!;
    expect(revMember?.location).toBe('local');
    expect((revMember!.runtime as any).hybrid).toEqual({ profile: 'remote-brain-local-hands' });
  });

  it('createTeam applies hybridProfiles from config by default', () => {
    const coordinator = makeCoordinator({ hybridProfiles: { executor: 'local-full' } });
    const team = (coordinator as any).createTeam(['executor', 'reviewer'], '任务');
    expect((team.members.find((m: any) => m.role === 'executor')!.runtime as any).hybrid)
      .toEqual({ profile: 'local-full' });
    // 未配置 profile 的角色不注入 hybrid
    expect((team.members.find((m: any) => m.role === 'reviewer')!.runtime as any).hybrid)
      .toBeUndefined();
  });

  it('carries executor connection for local hybrid members via execute (production signature, no defaultRuntime)', async () => {
    // 回归防护：R1 —— 生产默认路径（createTeam 无 defaultRuntime）下，local 成员配置了
    // hybrid profile 时必须携带 executorUrl/executorToken，否则 hybrid 远端腿静默失效。
    const coordinator = makeCoordinator({
      executorUrl: 'http://executor:8767',
      executorToken: 'tok-secret',
      hybridProfiles: { reviewer: 'remote-full' },
    });
    stubLlmPaths(coordinator, makeFakeAgents());

    await coordinator.execute(
      '任务',
      ['executor', 'reviewer'],
      undefined,
      { reviewer: 'local' },
    );

    const revMember = coordinator['team']!.members.find((m) => m.role === 'reviewer')!;
    expect(revMember.location).toBe('local');
    expect(revMember.runtime.type).toBe('local');
    // hybrid 远端腿所需的 executor 连接已随 runtime 携带
    expect(revMember.runtime.executorUrl).toBe('http://executor:8767');
    expect((revMember.runtime as any).executorToken).toBe('tok-secret');
    expect((revMember.runtime as any).hybrid).toEqual({ profile: 'remote-full' });
  });

  it('omits executor fields for local members without hybrid profile', async () => {
    const coordinator = makeCoordinator({
      executorUrl: 'http://executor:8767',
      hybridProfiles: { reviewer: 'remote-full' },
    });
    stubLlmPaths(coordinator, makeFakeAgents());

    await coordinator.execute(
      '任务',
      ['executor', 'reviewer'],
      undefined,
      { reviewer: 'local' },
    );

    // executor（无 hybrid profile）是纯 local 成员，不应携带 executor 连接
    const execMember = coordinator['team']!.members.find((m) => m.role === 'executor')!;
    expect(execMember.location).toBe('local');
    expect((execMember.runtime as any).hybrid).toBeUndefined();
    expect((execMember.runtime as any).executorUrl).toBeUndefined();
  });
});
