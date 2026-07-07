export interface RoleTemplate {
  name: string;
  description: string;
  team_role: 'Coordinator' | 'Planner' | 'Executor' | 'Reviewer' | 'Monitor';
  tools: string[];
  dangerous_tools: string[];
  skills: string[];
  prompt_template?: string;
  custom_prompt?: string;
  base_role?: string;
}

export interface TeamMemberRuntime {
  type: 'local' | 'remote';
  workspace: string;
  executorUrl?: string;
  executorToken?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  template: RoleTemplate;
  status: 'idle' | 'working' | 'speaking' | 'done';
  location: 'local' | 'remote';
  runtime: TeamMemberRuntime;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  members: TeamMember[];
  leader: TeamMember;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  call_id: string;
  tool_name: string;
  result: unknown;
  error?: string;
}
