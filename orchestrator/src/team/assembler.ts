import {
  createTeam,
  addMember,
  setLeader,
  Team,
  TeamMember,
  TeamRuntime,
  Dag,
} from './team.js';
import { loadRoleTemplates } from './templates.js';
import { RoleTemplate } from './types.js';

/**
 * Maps skill names to the team role that should handle them.
 */
export const SKILL_TO_TEAM_ROLE: Record<string, TeamMember['teamRole']> = {
  // Executor skills
  frontend_dev: 'Executor',
  backend_dev: 'Executor',
  fullstack_dev: 'Executor',
  database: 'Executor',
  api_design: 'Executor',
  // Reviewer skills
  testing: 'Reviewer',
  code_review: 'Reviewer',
  security_audit: 'Reviewer',
  // Planner skills
  architecture: 'Planner',
  // Coordinator skills
  task_decomposition: 'Coordinator',
  progress_tracking: 'Coordinator',
  risk_management: 'Coordinator',
};

function resolveTeamRoles(dag: Dag): Set<TeamMember['teamRole']> {
  const roles = new Set<TeamMember['teamRole']>();

  for (const task of dag.tasks) {
    for (const skill of task.requiredSkills) {
      const teamRole = SKILL_TO_TEAM_ROLE[skill];
      if (teamRole) {
        roles.add(teamRole);
      }
    }
  }

  // Ensure at least one Executor exists
  if (roles.size === 0) {
    roles.add('Executor');
  }

  return roles;
}

function pickTemplateForRole(
  templates: Map<string, RoleTemplate>,
  teamRole: TeamMember['teamRole'],
): { roleId: string; template: RoleTemplate } | undefined {
  for (const [roleId, template] of templates) {
    if (template.team_role === teamRole) {
      return { roleId, template };
    }
  }
  return undefined;
}

/**
 * Assembles a Team from a DAG by mapping required skills to team roles
 * and assigning tools from the role configuration.
 */
export function assembleTeam(
  dag: Dag,
  projectId: string,
  runtime: TeamRuntime,
  rolesConfigPath?: string,
): Team {
  const templates = loadRoleTemplates();
  const neededRoles = resolveTeamRoles(dag);

  let team = createTeam(`team-${Date.now()}`, projectId, runtime);
  let coordinatorId: string | undefined;

  for (const teamRole of neededRoles) {
    const picked = pickTemplateForRole(templates, teamRole);
    if (!picked) continue;

    const { roleId, template } = picked;
    const memberId = `member-${roleId}`;

    const member: TeamMember = {
      id: memberId,
      roleName: template.name,
      teamRole: template.team_role as TeamMember['teamRole'],
      tools: [...template.tools],
      dangerousTools: [...template.dangerous_tools],
      skillPackId: roleId,
      status: 'idle',
    };

    team = addMember(team, member);

    if (teamRole === 'Coordinator' && !coordinatorId) {
      coordinatorId = memberId;
    }
  }

  // Set the Coordinator as leader if present, otherwise the first member
  const leaderId = coordinatorId || team.members[0]?.id;
  if (leaderId) {
    team = setLeader(team, leaderId);
  }

  return team;
}
