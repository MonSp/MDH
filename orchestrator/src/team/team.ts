export enum TeamStatus {
  CREATED = 'CREATED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  DISSOLVED = 'DISSOLVED',
}

export interface TeamRuntime {
  type: 'local' | 'remote';
  workspace: string;
  executorUrl?: string;
}

export interface SkillPack {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  requiredTools: string[];
  systemPrompt: string;
  knowledgeDir?: string;
  rulesDir?: string;
}

export interface TeamMember {
  id: string;
  roleName: string;
  teamRole: 'Coordinator' | 'Planner' | 'Executor' | 'Reviewer' | 'Monitor';
  tools: string[];
  dangerousTools: string[];
  skillPackId?: string;
  status: 'idle' | 'working' | 'speaking' | 'done';
}

export interface Team {
  id: string;
  projectId: string;
  runtime: TeamRuntime;
  members: TeamMember[];
  leader?: TeamMember;
  status: TeamStatus;
}

export interface DagTask {
  taskId: string;
  name: string;
  requiredSkills: string[];
  description?: string;
}

export interface Dag {
  tasks: DagTask[];
}

export function createTeam(id: string, projectId: string, runtime: TeamRuntime): Team {
  return {
    id,
    projectId,
    runtime,
    members: [],
    leader: undefined,
    status: TeamStatus.CREATED,
  };
}

export function addMember(team: Team, member: TeamMember): Team {
  return {
    ...team,
    members: [...team.members, member],
  };
}

export function setLeader(team: Team, memberId: string): Team {
  const member = team.members.find((m) => m.id === memberId);
  if (!member) {
    throw new Error(`Member ${memberId} not found`);
  }
  return {
    ...team,
    leader: member,
  };
}

export function getMemberByTeamRole(
  team: Team,
  teamRole: TeamMember['teamRole'],
): TeamMember | undefined {
  return team.members.find((m) => m.teamRole === teamRole);
}

export function getMemberById(team: Team, id: string): TeamMember | undefined {
  return team.members.find((m) => m.id === id);
}
