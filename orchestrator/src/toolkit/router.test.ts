import { describe, it, expect } from 'vitest';
import { RouterFactory } from './router.js';
import type { TeamMember } from '../team/team.js';

function makeMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: 'm1',
    roleName: '成员',
    teamRole: 'Executor',
    tools: [],
    dangerousTools: [],
    status: 'idle',
    location: 'remote',
    runtime: { type: 'remote', workspace: '/tmp/ws', executorUrl: 'http://e:8767' },
    ...overrides,
  };
}

describe('RouterFactory hybrid', () => {
  it('returns HybridToolkitRouter when member runtime carries hybrid config', () => {
    const factory = new RouterFactory();
    const router = factory.getRouterForMember(makeMember({
      runtime: { type: 'remote', workspace: '/tmp/ws', executorUrl: 'http://e:8767', hybrid: { profile: 'remote-brain-local-hands' } } as any,
    }));
    expect(router.constructor.name).toBe('HybridToolkitRouter');
  });

  it('returns HybridToolkitRouter for local hybrid member carrying executor connection', () => {
    // R1 回归防护：local 成员 + hybrid profile + executorUrl（coordinator 生产路径产物）
    // → getRouterForMember 必须返回 HybridToolkitRouter 且 hybrid 远端腿配置到位。
    const factory = new RouterFactory();
    const router = factory.getRouterForMember(makeMember({
      location: 'local',
      runtime: {
        type: 'local',
        workspace: '/tmp/ws',
        executorUrl: 'http://e:8767',
        executorToken: 'tok',
        hybrid: { profile: 'remote-full' },
      } as any,
    }));
    expect(router.constructor.name).toBe('HybridToolkitRouter');
    // hybrid 远端腿必须真实挂载（executorUrl 有值），否则 remote-full 会静默回落全本地
    expect((router as any).remote).not.toBeNull();
  });

  it('returns RemoteToolkitRouter for remote member without hybrid config', () => {
    const factory = new RouterFactory();
    const router = factory.getRouterForMember(makeMember());
    expect(router.constructor.name).toBe('RemoteToolkitRouter');
  });
});
