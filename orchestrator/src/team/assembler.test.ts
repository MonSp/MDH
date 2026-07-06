import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assembleTeam, SKILL_TO_TEAM_ROLE } from './assembler.js';
import { Dag, TeamRuntime } from './team.js';
import { RoleTemplate } from './types.js';

const runtime: TeamRuntime = { type: 'local', workspace: '/tmp/test' };

const mockTemplates = new Map<string, RoleTemplate>([
  ['coordinator', {
    name: 'Coordinator',
    description: 'Coordinates team',
    team_role: 'Coordinator',
    tools: ['task_assign', 'status_check'],
    dangerous_tools: [],
    skills: ['task_decomposition', 'progress_tracking'],
  }],
  ['planner', {
    name: 'Planner',
    description: 'Plans architecture',
    team_role: 'Planner',
    tools: ['diagram', 'design'],
    dangerous_tools: [],
    skills: ['architecture'],
  }],
  ['executor', {
    name: 'Executor',
    description: 'Executes tasks',
    team_role: 'Executor',
    tools: ['bash', 'write_file', 'edit_file'],
    dangerous_tools: ['bash'],
    skills: ['frontend_dev', 'backend_dev', 'fullstack_dev'],
  }],
  ['reviewer', {
    name: 'Reviewer',
    description: 'Reviews code',
    team_role: 'Reviewer',
    tools: ['read_file', 'grep_content'],
    dangerous_tools: [],
    skills: ['testing', 'code_review'],
  }],
]);

vi.mock('./templates.js', () => ({
  loadRoleTemplates: () => mockTemplates,
}));

describe('assembleTeam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assembles a team with all four roles from a multi-skill DAG', () => {
    const dag: Dag = {
      tasks: [
        { taskId: 't1', name: 'Build UI', requiredSkills: ['frontend_dev'] },
        { taskId: 't2', name: 'Build API', requiredSkills: ['backend_dev'] },
        { taskId: 't3', name: 'Design system', requiredSkills: ['architecture'] },
        { taskId: 't4', name: 'Test it', requiredSkills: ['testing'] },
        { taskId: 't5', name: 'Track progress', requiredSkills: ['progress_tracking'] },
      ],
    };

    const team = assembleTeam(dag, 'proj-1', runtime);

    expect(team.projectId).toBe('proj-1');
    expect(team.members).toHaveLength(4);
    expect(team.members.map(m => m.teamRole).sort()).toEqual(
      ['Coordinator', 'Executor', 'Planner', 'Reviewer'].sort(),
    );
    // Coordinator should be the leader
    expect(team.leader?.teamRole).toBe('Coordinator');
    // Each member should have tools from the template
    const executor = team.members.find(m => m.teamRole === 'Executor')!;
    expect(executor.tools).toEqual(['bash', 'write_file', 'edit_file']);
    expect(executor.dangerousTools).toEqual(['bash']);
  });

  it('assembles a minimal team with only Executor for simple DAG', () => {
    const dag: Dag = {
      tasks: [
        { taskId: 't1', name: 'Hello world', requiredSkills: ['frontend_dev'] },
      ],
    };

    const team = assembleTeam(dag, 'proj-simple', runtime);

    expect(team.members).toHaveLength(1);
    expect(team.members[0].teamRole).toBe('Executor');
    expect(team.leader?.id).toBe(team.members[0].id);
  });

  it('defaults to Executor when DAG has no recognized skills', () => {
    const dag: Dag = {
      tasks: [
        { taskId: 't1', name: 'Mystery task', requiredSkills: ['unknown_skill'] },
      ],
    };

    const team = assembleTeam(dag, 'proj-empty', runtime);

    expect(team.members).toHaveLength(1);
    expect(team.members[0].teamRole).toBe('Executor');
  });
});

describe('SKILL_TO_TEAM_ROLE', () => {
  it('maps expected skills to correct roles', () => {
    expect(SKILL_TO_TEAM_ROLE['frontend_dev']).toBe('Executor');
    expect(SKILL_TO_TEAM_ROLE['testing']).toBe('Reviewer');
    expect(SKILL_TO_TEAM_ROLE['architecture']).toBe('Planner');
    expect(SKILL_TO_TEAM_ROLE['task_decomposition']).toBe('Coordinator');
  });
});
