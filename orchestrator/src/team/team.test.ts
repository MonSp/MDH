import { describe, it, expect } from 'vitest';
import {
  TeamStatus,
  createTeam,
  addMember,
  setLeader,
  getMemberByTeamRole,
  getMemberById,
  Team,
  TeamMember,
} from './team.js';

const runtime = { type: 'local' as const, workspace: '/tmp/test' };

function makeMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: 'm1',
    roleName: 'Engineer',
    teamRole: 'Executor',
    location: 'local',
    runtime,
    tools: ['bash'],
    dangerousTools: [],
    status: 'idle',
    ...overrides,
  };
}

describe('team', () => {
  it('creates a team with correct defaults', () => {
    const team = createTeam('t1', 'proj-1', runtime);
    expect(team.id).toBe('t1');
    expect(team.projectId).toBe('proj-1');
    expect(team.runtime).toBe(runtime);
    expect(team.members).toEqual([]);
    expect(team.leader).toBeUndefined();
    expect(team.status).toBe(TeamStatus.CREATED);
  });

  it('adds a member', () => {
    const team = createTeam('t1', 'proj-1', runtime);
    const member = makeMember();
    const updated = addMember(team, member);
    expect(updated.members).toHaveLength(1);
    expect(updated.members[0]).toBe(member);
  });

  it('sets leader by id', () => {
    const team = createTeam('t1', 'proj-1', runtime);
    const withMember = addMember(team, makeMember({ id: 'm1' }));
    const withLeader = setLeader(withMember, 'm1');
    expect(withLeader.leader?.id).toBe('m1');
  });

  it('throws when setting nonexistent leader', () => {
    const team = createTeam('t1', 'proj-1', runtime);
    expect(() => setLeader(team, 'ghost')).toThrow('Member ghost not found');
  });

  it('gets member by team role', () => {
    const team = createTeam('t1', 'proj-1', runtime);
    const withMembers = addMember(
      addMember(team, makeMember({ id: 'm1', teamRole: 'Executor' })),
      makeMember({ id: 'm2', teamRole: 'Reviewer' }),
    );
    expect(getMemberByTeamRole(withMembers, 'Reviewer')?.id).toBe('m2');
    expect(getMemberByTeamRole(withMembers, 'Coordinator')).toBeUndefined();
  });
});
