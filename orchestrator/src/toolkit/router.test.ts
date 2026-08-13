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

  it('returns RemoteToolkitRouter for remote member without hybrid config', () => {
    const factory = new RouterFactory();
    const router = factory.getRouterForMember(makeMember());
    expect(router.constructor.name).toBe('RemoteToolkitRouter');
  });
});
