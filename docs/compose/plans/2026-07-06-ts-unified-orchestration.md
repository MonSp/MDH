# TS Unified Orchestration Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the TS Orchestrator into a unified orchestration layer where CEO, Team assembly, Skill loading, and Toolkit routing are all in TypeScript, with Python as a pure executor.

**Architecture:** Extract responsibilities from the monolithic `coordinator.ts` (676 lines) into focused modules: `ceo.ts`, `assembler.ts`, `meeting.ts`, `toolkit/router.ts`, `skill/loader.ts`. The coordinator becomes a thin message router. `roles.json` becomes the single source of truth.

**Tech Stack:** TypeScript, Node.js, ws, vitest

## Global Constraints

- All existing WebSocket message types must remain unchanged (frontend compatibility)
- `roles.json` structure must remain compatible with existing `loadRoleTemplates()`
- Python Executor HTTP protocol (`POST /execute`) must remain unchanged
- `npx mdh` entry point must remain unchanged
- Each module must be independently testable

---

### Task 1: Team + SkillPack Types

**Covers:** S4 (TeamAssembler, TeamMember, TeamRuntime interfaces)

**Files:**
- Create: `orchestrator/src/team/team.ts`
- Create: `orchestrator/src/team/team.test.ts`

**Interfaces:**
- Produces: `Team`, `TeamMember`, `TeamRuntime`, `SkillPack`, `Dag`, `SubTask` types

- [ ] **Step 1: Write failing tests**

```typescript
// orchestrator/src/team/team.test.ts
import { describe, it, expect } from 'vitest';
import { createTeam, addMember, setLeader, getMemberByTeamRole, TeamStatus } from './team.js';
import type { TeamMember, TeamRuntime } from './team.js';

const mockRuntime: TeamRuntime = {
  type: 'local',
  workspace: '/tmp/test-workspace',
};

const mockMember: TeamMember = {
  id: 'agent-1',
  roleName: 'executor',
  teamRole: 'Executor',
  tools: ['read_file', 'write_file'],
  dangerousTools: ['bash'],
  skillPackId: 'frontend_dev',
  status: 'idle',
};

describe('Team', () => {
  it('creates a team with correct defaults', () => {
    const team = createTeam('proj-1', mockRuntime);
    expect(team.id).toMatch(/^team-/);
    expect(team.projectId).toBe('proj-1');
    expect(team.runtime).toBe(mockRuntime);
    expect(team.members).toEqual([]);
    expect(team.leader).toBeNull();
    expect(team.status).toBe(TeamStatus.CREATED);
  });

  it('adds a member', () => {
    const team = createTeam('proj-1', mockRuntime);
    addMember(team, mockMember);
    expect(team.members).toHaveLength(1);
    expect(team.members[0].id).toBe('agent-1');
  });

  it('sets leader by id', () => {
    const team = createTeam('proj-1', mockRuntime);
    const leader: TeamMember = { ...mockMember, id: 'leader-1', teamRole: 'Coordinator' };
    addMember(team, leader);
    addMember(team, mockMember);
    setLeader(team, 'leader-1');
    expect(team.leader?.id).toBe('leader-1');
  });

  it('throws when setting nonexistent leader', () => {
    const team = createTeam('proj-1', mockRuntime);
    expect(() => setLeader(team, 'nonexistent')).toThrow('成员不存在');
  });

  it('gets member by team role', () => {
    const team = createTeam('proj-1', mockRuntime);
    addMember(team, mockMember);
    const found = getMemberByTeamRole(team, 'Executor');
    expect(found?.id).toBe('agent-1');
    expect(getMemberByTeamRole(team, 'Reviewer')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/test/MDH/orchestrator && npx vitest run src/team/team.test.ts`
Expected: FAIL with "Cannot find module './team.js'"

- [ ] **Step 3: Implement Team types**

```typescript
// orchestrator/src/team/team.ts
import { randomBytes } from 'crypto';

export enum TeamStatus {
  CREATED = 'created',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DISSOLVED = 'dissolved',
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
  knowledgeDir: string;
  rulesDir: string;
}

export interface TeamMember {
  id: string;
  roleName: string;
  teamRole: 'Coordinator' | 'Planner' | 'Executor' | 'Reviewer' | 'Monitor';
  tools: string[];
  dangerousTools: string[];
  skillPackId: string;
  status: 'idle' | 'working' | 'done' | 'failed';
}

export interface Team {
  id: string;
  projectId: string;
  runtime: TeamRuntime;
  members: TeamMember[];
  leader: TeamMember | null;
  status: TeamStatus;
}

export interface DagTask {
  taskId: string;
  name: string;
  requiredSkills: string[];
  description: string;
}

export interface Dag {
  tasks: DagTask[];
}

export function createTeam(projectId: string, runtime: TeamRuntime): Team {
  return {
    id: `team-${randomBytes(4).toString('hex')}`,
    projectId,
    runtime,
    members: [],
    leader: null,
    status: TeamStatus.CREATED,
  };
}

export function addMember(team: Team, member: TeamMember): void {
  team.members.push(member);
}

export function setLeader(team: Team, agentId: string): void {
  const member = team.members.find(m => m.id === agentId);
  if (!member) throw new Error(`成员不存在: ${agentId}`);
  team.leader = member;
}

export function getMemberByTeamRole(team: Team, teamRole: string): TeamMember | null {
  return team.members.find(m => m.teamRole === teamRole) ?? null;
}

export function getMemberById(team: Team, id: string): TeamMember | null {
  return team.members.find(m => m.id === id) ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/test/MDH/orchestrator && npx vitest run src/team/team.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /home/test/MDH && git add orchestrator/src/team/team.ts orchestrator/src/team/team.test.ts
git commit -m "feat(orchestrator): add Team, TeamMember, SkillPack types"
```

---

### Task 2: SkillPack Loader

**Covers:** S3 (技能包流), S4 (ISkillLoader)

**Files:**
- Create: `orchestrator/src/skill/loader.ts`
- Create: `orchestrator/src/skill/loader.test.ts`

**Interfaces:**
- Consumes: `SkillPack` type from Task 1
- Produces: `loadSkillPacks(dir: string) -> Map<string, SkillPack>`, `getSkillPack(id: string) -> SkillPack | null`

- [ ] **Step 1: Write failing tests**

```typescript
// orchestrator/src/skill/loader.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { loadSkillPacks, getSkillPack, resetCache } from './loader.js';

const TEST_DIR = join('/tmp', `skill-packs-test-${Date.now()}`);

beforeEach(() => {
  resetCache();
  mkdirSync(join(TEST_DIR, 'frontend_dev'), { recursive: true });
  writeFileSync(join(TEST_DIR, 'frontend_dev', 'manifest.yaml'), `
name: frontend_dev
version: "1.0.0"
description: 前端开发
category: dev
required_tools:
  - read_file
  - write_file
  - bash
`);
  writeFileSync(join(TEST_DIR, 'frontend_dev', 'system_prompt.md'), '# Frontend Dev');
  mkdirSync(join(TEST_DIR, 'backend_dev'), { recursive: true });
  writeFileSync(join(TEST_DIR, 'backend_dev', 'manifest.yaml'), `
name: backend_dev
version: "1.0.0"
description: 后端开发
category: dev
required_tools:
  - read_file
  - write_file
`);
  writeFileSync(join(TEST_DIR, 'backend_dev', 'system_prompt.md'), '# Backend Dev');
});

afterEach(() => {
  resetCache();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('SkillPack Loader', () => {
  it('loads skill packs from directory', () => {
    const packs = loadSkillPacks(TEST_DIR);
    expect(packs.size).toBe(2);
    expect(packs.has('frontend_dev')).toBe(true);
    expect(packs.has('backend_dev')).toBe(true);
  });

  it('parses manifest correctly', () => {
    const packs = loadSkillPacks(TEST_DIR);
    const frontend = packs.get('frontend_dev')!;
    expect(frontend.name).toBe('frontend_dev');
    expect(frontend.version).toBe('1.0.0');
    expect(frontend.description).toBe('前端开发');
    expect(frontend.requiredTools).toEqual(['read_file', 'write_file', 'bash']);
  });

  it('gets skill pack by id', () => {
    loadSkillPacks(TEST_DIR);
    const pack = getSkillPack('frontend_dev');
    expect(pack).not.toBeNull();
    expect(pack?.name).toBe('frontend_dev');
  });

  it('returns null for unknown skill', () => {
    loadSkillPacks(TEST_DIR);
    expect(getSkillPack('nonexistent')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/test/MDH/orchestrator && npx vitest run src/skill/loader.test.ts`
Expected: FAIL with "Cannot find module './loader.js'"

- [ ] **Step 3: Implement SkillPack loader**

```typescript
// orchestrator/src/skill/loader.ts
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { SkillPack } from '../team/team.js';

let _cache: Map<string, SkillPack> | null = null;

export function resetCache(): void {
  _cache = null;
}

export function loadSkillPacks(dir: string): Map<string, SkillPack> {
  if (_cache) return _cache;
  _cache = new Map();

  if (!existsSync(dir)) return _cache;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(dir, entry.name, 'manifest.yaml');
    if (!existsSync(manifestPath)) continue;

    try {
      const content = readFileSync(manifestPath, 'utf-8');
      const manifest = parseYaml(content);
      const promptPath = join(dir, entry.name, 'system_prompt.md');
      const systemPrompt = existsSync(promptPath) ? readFileSync(promptPath, 'utf-8') : '';

      const pack: SkillPack = {
        id: manifest.name || entry.name,
        name: manifest.name || entry.name,
        version: manifest.version || '1.0.0',
        description: manifest.description || '',
        category: manifest.category || '',
        requiredTools: manifest.required_tools || [],
        systemPrompt,
        knowledgeDir: join(dir, entry.name, 'knowledge'),
        rulesDir: join(dir, entry.name, 'rules'),
      };
      _cache.set(pack.id, pack);
    } catch (e) {
      console.warn(`Failed to load skill pack ${entry.name}:`, e);
    }
  }

  return _cache;
}

export function getSkillPack(id: string): SkillPack | null {
  return _cache?.get(id) ?? null;
}

function parseYaml(content: string): Record<string, any> {
  // Minimal YAML parser for manifest files (key: value + lists)
  const result: Record<string, any> = {};
  let currentKey = '';
  let currentList: string[] | null = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('- ')) {
      if (currentList) currentList.push(trimmed.slice(2).replace(/^["']|["']$/g, ''));
      continue;
    }

    if (currentList) {
      result[currentKey] = currentList;
      currentList = null;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();

    if (!value) {
      currentKey = key;
      currentList = [];
    } else {
      result[key] = value.replace(/^["']|["']$/g, '');
    }
  }

  if (currentList && currentKey) result[currentKey] = currentList;
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/test/MDH/orchestrator && npx vitest run src/skill/loader.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /home/test/MDH && git add orchestrator/src/skill/loader.ts orchestrator/src/skill/loader.test.ts
git commit -m "feat(orchestrator): add SkillPack loader from skill_packs/ directory"
```

---

### Task 3: TeamAssembler

**Covers:** S4 (ITeamAssembler)

**Files:**
- Create: `orchestrator/src/team/assembler.ts`
- Create: `orchestrator/src/team/assembler.test.ts`

**Interfaces:**
- Consumes: `Team`, `TeamMember`, `TeamRuntime`, `Dag` from Task 1
- Consumes: `loadSkillPacks`, `getSkillPack` from Task 2
- Consumes: `loadRoleTemplates` from existing `templates.ts`
- Produces: `assembleTeam(dag, projectId, runtime, rolesConfigPath?) -> Team`

- [ ] **Step 1: Write failing tests**

```typescript
// orchestrator/src/team/assembler.test.ts
import { describe, it, expect } from 'vitest';
import { assembleTeam, SKILL_TO_TEAM_ROLE } from './assembler.js';
import type { Dag, TeamRuntime } from './team.js';

const runtime: TeamRuntime = { type: 'local', workspace: '/tmp/test' };

describe('TeamAssembler', () => {
  it('assembles team from DAG with 3 tasks', () => {
    const dag: Dag = {
      tasks: [
        { taskId: 'task-coordinator', name: '需求分析', requiredSkills: ['task_decomposition'], description: '分析需求' },
        { taskId: 'task-executor', name: '前端开发', requiredSkills: ['frontend_dev'], description: '开发前端' },
        { taskId: 'task-reviewer', name: '代码审查', requiredSkills: ['code_review'], description: '审查代码' },
      ],
    };
    const team = assembleTeam(dag, 'proj-1', runtime);
    expect(team.members.length).toBeGreaterThanOrEqual(3);
    expect(team.leader).not.toBeNull();
    expect(team.leader!.teamRole).toBe('Coordinator');
  });

  it('maps skills to correct team roles', () => {
    expect(SKILL_TO_TEAM_ROLE['frontend_dev']).toBe('Executor');
    expect(SKILL_TO_TEAM_ROLE['task_decomposition']).toBe('Coordinator');
    expect(SKILL_TO_TEAM_ROLE['code_review']).toBe('Reviewer');
    expect(SKILL_TO_TEAM_ROLE['architecture']).toBe('Planner');
  });

  it('assigns tools from role config', () => {
    const dag: Dag = {
      tasks: [{ taskId: 't1', name: '开发', requiredSkills: ['frontend_dev'], description: '' }],
    };
    const team = assembleTeam(dag, 'proj-1', runtime);
    const executor = team.members.find(m => m.teamRole === 'Executor');
    expect(executor).toBeDefined();
    expect(executor!.tools.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/test/MDH/orchestrator && npx vitest run src/team/assembler.test.ts`
Expected: FAIL with "Cannot find module './assembler.js'"

- [ ] **Step 3: Implement TeamAssembler**

```typescript
// orchestrator/src/team/assembler.ts
import { randomBytes } from 'crypto';
import { createTeam, addMember, setLeader, TeamStatus } from './team.js';
import { loadRoleTemplates } from './templates.js';
import type { Team, TeamMember, TeamRuntime, Dag } from './team.js';

export const SKILL_TO_TEAM_ROLE: Record<string, TeamMember['teamRole']> = {
  frontend_dev: 'Executor',
  backend_dev: 'Executor',
  fullstack_dev: 'Executor',
  database: 'Executor',
  api_design: 'Executor',
  testing: 'Reviewer',
  code_review: 'Reviewer',
  security_audit: 'Reviewer',
  architecture: 'Planner',
  task_decomposition: 'Coordinator',
  progress_tracking: 'Coordinator',
  risk_management: 'Coordinator',
};

export function assembleTeam(
  dag: Dag,
  projectId: string,
  runtime: TeamRuntime,
  rolesConfigPath?: string,
): Team {
  const team = createTeam(projectId, runtime);
  const templates = loadRoleTemplates();

  // Determine needed team roles from DAG
  const neededRoles = new Set<TeamMember['teamRole']>();
  neededRoles.add('Coordinator'); // Always need a coordinator

  for (const task of dag.tasks) {
    for (const skill of task.requiredSkills) {
      const teamRole = SKILL_TO_TEAM_ROLE[skill] || 'Executor';
      neededRoles.add(teamRole);
    }
  }

  // Select roles from config
  const selectedRoles: Array<[string, TeamMember['teamRole']]> = [];
  for (const [roleId, template] of templates) {
    const teamRole = template.team_role as TeamMember['teamRole'];
    if (neededRoles.has(teamRole)) {
      selectedRoles.push([roleId, teamRole]);
      neededRoles.delete(teamRole);
    }
  }

  // Create team members
  for (const [roleId, teamRole] of selectedRoles) {
    const template = templates.get(roleId);
    if (!template) continue;

    const member: TeamMember = {
      id: `agent-${roleId}-${randomBytes(3).toString('hex')}`,
      roleName: roleId,
      teamRole,
      tools: template.tools || [],
      dangerousTools: template.dangerous_tools || [],
      skillPackId: (template.skills || [])[0] || '',
      status: 'idle',
    };
    addMember(team, member);

    if (teamRole === 'Coordinator' && !team.leader) {
      setLeader(team, member.id);
    }
  }

  return team;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/test/MDH/orchestrator && npx vitest run src/team/assembler.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /home/test/MDH && git add orchestrator/src/team/assembler.ts orchestrator/src/team/assembler.test.ts
git commit -m "feat(orchestrator): add TeamAssembler for DAG-based team assembly"
```

---

### Task 4: ToolkitRouter Interface + Remote Implementation

**Covers:** S4 (IToolkitRouter), S3 (工具执行流)

**Files:**
- Create: `orchestrator/src/toolkit/router.ts`
- Create: `orchestrator/src/toolkit/remote.ts`
- Create: `orchestrator/src/toolkit/router.test.ts`

**Interfaces:**
- Consumes: `ToolCall`, `ToolResult` from existing `team/types.ts`
- Produces: `IToolkitRouter` interface, `RemoteToolkitRouter` class

- [ ] **Step 1: Write failing tests**

```typescript
// orchestrator/src/toolkit/router.test.ts
import { describe, it, expect } from 'vitest';
import { RemoteToolkitRouter } from './remote.js';
import type { IToolkitRouter } from './router.js';

describe('IToolkitRouter interface', () => {
  it('RemoteToolkitRouter implements IToolkitRouter', () => {
    const router = new RemoteToolkitRouter('http://localhost:8767');
    expect(typeof router.execute).toBe('function');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/test/MDH/orchestrator && npx vitest run src/toolkit/router.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement ToolkitRouter interface and RemoteToolkitRouter**

```typescript
// orchestrator/src/toolkit/router.ts
import type { ToolCall, ToolResult } from '../team/types.js';

export interface IToolkitRouter {
  execute(toolCall: ToolCall, workspace: string): Promise<ToolResult>;
}
```

```typescript
// orchestrator/src/toolkit/remote.ts
import type { IToolkitRouter } from './router.js';
import type { ToolCall, ToolResult } from '../team/types.js';

export class RemoteToolkitRouter implements IToolkitRouter {
  constructor(
    private executorUrl: string,
    private token?: string,
  ) {}

  async execute(toolCall: ToolCall, workspace: string): Promise<ToolResult> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const resp = await fetch(`${this.executorUrl}/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tool_name: toolCall.function.name,
        arguments: JSON.parse(toolCall.function.arguments),
        call_id: toolCall.id,
        workspace,
      }),
    });

    if (!resp.ok) {
      return { tool_call_id: toolCall.id, output: '', error: `HTTP ${resp.status}` };
    }

    const data = await resp.json() as any;
    return {
      tool_call_id: data.call_id || toolCall.id,
      output: data.result || '',
      error: data.error || undefined,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/test/MDH/orchestrator && npx vitest run src/toolkit/router.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd /home/test/MDH && git add orchestrator/src/toolkit/ orchestrator/src/toolkit/router.test.ts
git commit -m "feat(orchestrator): add ToolkitRouter interface + RemoteToolkitRouter"
```

---

### Task 5: LocalToolkitRouter

**Covers:** S3 (本地模式工具执行)

**Files:**
- Create: `orchestrator/src/toolkit/local.ts`
- Create: `orchestrator/src/toolkit/local.test.ts`

**Interfaces:**
- Consumes: `IToolkitRouter` from Task 4
- Produces: `LocalToolkitRouter` class (Node.js fs + child_process)

- [ ] **Step 1: Write failing tests**

```typescript
// orchestrator/src/toolkit/local.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { LocalToolkitRouter } from './local.js';

const TEST_DIR = join('/tmp', `local-toolkit-test-${Date.now()}`);

beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }));
afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }));

describe('LocalToolkitRouter', () => {
  it('writes a file', async () => {
    const router = new LocalToolkitRouter();
    const result = await router.execute(
      { id: 'c1', function: { name: 'write_file', arguments: JSON.stringify({ path: 'hello.txt', content: 'world' }) } },
      TEST_DIR,
    );
    expect(result.error).toBeUndefined();
    expect(readFileSync(join(TEST_DIR, 'hello.txt'), 'utf-8')).toBe('world');
  });

  it('reads a file', async () => {
    writeFileSync(join(TEST_DIR, 'test.txt'), 'hello');
    const router = new LocalToolkitRouter();
    const result = await router.execute(
      { id: 'c2', function: { name: 'read_file', arguments: JSON.stringify({ path: 'test.txt' }) } },
      TEST_DIR,
    );
    expect(result.output).toBe('hello');
  });

  it('lists directory', async () => {
    writeFileSync(join(TEST_DIR, 'a.txt'), '');
    writeFileSync(join(TEST_DIR, 'b.txt'), '');
    const router = new LocalToolkitRouter();
    const result = await router.execute(
      { id: 'c3', function: { name: 'list_directory', arguments: JSON.stringify({ path: '.' }) } },
      TEST_DIR,
    );
    expect(result.output).toContain('a.txt');
    expect(result.output).toContain('b.txt');
  });

  it('returns error for nonexistent file', async () => {
    const router = new LocalToolkitRouter();
    const result = await router.execute(
      { id: 'c4', function: { name: 'read_file', arguments: JSON.stringify({ path: 'nope.txt' }) } },
      TEST_DIR,
    );
    expect(result.error).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/test/MDH/orchestrator && npx vitest run src/toolkit/local.test.ts`
Expected: FAIL with "Cannot find module './local.js'"

- [ ] **Step 3: Implement LocalToolkitRouter**

```typescript
// orchestrator/src/toolkit/local.ts
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';
import type { IToolkitRouter } from './router.js';
import type { ToolCall, ToolResult } from '../team/types.js';

export class LocalToolkitRouter implements IToolkitRouter {
  async execute(toolCall: ToolCall, workspace: string): Promise<ToolResult> {
    const args = JSON.parse(toolCall.function.arguments);
    const name = toolCall.function.name;

    try {
      switch (name) {
        case 'read_file':
          return this.readFile(args.path, workspace, toolCall.id);
        case 'write_file':
          return this.writeFile(args.path, args.content, workspace, toolCall.id);
        case 'edit_file':
          return this.editFile(args.path, args.old_string, args.new_string, workspace, toolCall.id);
        case 'list_directory':
          return this.listDirectory(args.path || '.', workspace, toolCall.id);
        case 'bash':
          return this.bash(args.command, workspace, toolCall.id, args.timeout);
        default:
          return { tool_call_id: toolCall.id, output: '', error: `Unknown tool: ${name}` };
      }
    } catch (e: any) {
      return { tool_call_id: toolCall.id, output: '', error: e.message };
    }
  }

  private resolvePath(path: string, workspace: string): string {
    const resolved = resolve(workspace, path);
    if (!resolved.startsWith(resolve(workspace))) {
      throw new Error('Path traversal blocked');
    }
    return resolved;
  }

  private readFile(path: string, workspace: string, callId: string): ToolResult {
    const full = this.resolvePath(path, workspace);
    if (!existsSync(full)) return { tool_call_id: callId, output: '', error: `File not found: ${path}` };
    return { tool_call_id: callId, output: readFileSync(full, 'utf-8') };
  }

  private writeFile(path: string, content: string, workspace: string, callId: string): ToolResult {
    const full = this.resolvePath(path, workspace);
    writeFileSync(full, content, 'utf-8');
    return { tool_call_id: callId, output: `Written: ${path}` };
  }

  private editFile(path: string, oldStr: string, newStr: string, workspace: string, callId: string): ToolResult {
    const full = this.resolvePath(path, workspace);
    if (!existsSync(full)) return { tool_call_id: callId, output: '', error: `File not found: ${path}` };
    const content = readFileSync(full, 'utf-8');
    if (!content.includes(oldStr)) return { tool_call_id: callId, output: '', error: 'old_string not found' };
    writeFileSync(full, content.replace(oldStr, newStr), 'utf-8');
    return { tool_call_id: callId, output: `Edited: ${path}` };
  }

  private listDirectory(path: string, workspace: string, callId: string): ToolResult {
    const full = this.resolvePath(path, workspace);
    if (!existsSync(full)) return { tool_call_id: callId, output: '', error: `Directory not found: ${path}` };
    const entries = readdirSync(full).map(e => {
      const isDir = statSync(join(full, e)).isDirectory();
      return `${e}${isDir ? '/' : ''}`;
    });
    return { tool_call_id: callId, output: entries.join('\n') };
  }

  private bash(command: string, workspace: string, callId: string, timeout = 30): ToolResult {
    try {
      const output = execSync(command, { cwd: workspace, timeout: timeout * 1000, encoding: 'utf-8' });
      return { tool_call_id: callId, output };
    } catch (e: any) {
      return { tool_call_id: callId, output: e.stdout || '', error: e.stderr || e.message };
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/test/MDH/orchestrator && npx vitest run src/toolkit/local.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /home/test/MDH && git add orchestrator/src/toolkit/local.ts orchestrator/src/toolkit/local.test.ts
git commit -m "feat(orchestrator): add LocalToolkitRouter for local file system execution"
```

---

### Task 6: Wire ToolkitRouter into Coordinator

**Covers:** S3 (工具执行流切换)

**Files:**
- Modify: `orchestrator/src/team/coordinator.ts`
- Modify: `orchestrator/src/cli.ts`

**Interfaces:**
- Consumes: `IToolkitRouter`, `LocalToolkitRouter`, `RemoteToolkitRouter` from Tasks 4-5
- Changes: `executeToolCall()` uses ToolkitRouter instead of direct ExecutorClient

- [ ] **Step 1: Update coordinator.ts to accept ToolkitRouter**

In `coordinator.ts`, replace the direct `ExecutorClient` usage with `IToolkitRouter`:

```typescript
// At top of coordinator.ts, add import:
import type { IToolkitRouter } from '../toolkit/router.js';

// In CoordinatorConfig, replace executor with toolkitRouter:
export interface CoordinatorConfig {
  llm: LLMConfig;
  toolkitRouter: IToolkitRouter;  // was: executor: ExecutorClient
  workspace: string;
  onWorkspaceConfirm?: (request: WorkspaceConfirmRequest) => Promise<WorkspaceConfirmResponse>;
}

// In executeToolCall(), replace ExecutorClient call:
async executeToolCall(toolCall: ToolCall, workspace: string): Promise<ToolResult> {
  return this.config.toolkitRouter.execute(toolCall, workspace);
}
```

- [ ] **Step 2: Update cli.ts to create ToolkitRouter**

In `cli.ts`, create the appropriate router based on `--executor` flag:

```typescript
// Add import:
import { RemoteToolkitRouter } from './toolkit/remote.js';
import { LocalToolkitRouter } from './toolkit/local.js';

// Replace ExecutorClient creation:
const toolkitRouter = executorUrl
  ? new RemoteToolkitRouter(executorUrl, executorToken)
  : new LocalToolkitRouter();

// Pass to server:
startServer({ llm: llmConfig, toolkitRouter, workspace });
```

- [ ] **Step 3: Verify existing behavior preserved**

Run: `cd /home/test/MDH/orchestrator && npx vitest run`
Expected: All existing tests PASS

- [ ] **Step 4: Commit**

```bash
cd /home/test/MDH && git add orchestrator/src/team/coordinator.ts orchestrator/src/cli.ts
git commit -m "refactor(orchestrator): wire ToolkitRouter into coordinator, support local/remote switch"
```

---

### Task 7: Simplify templates.ts — Remove API Fetch

**Covers:** S3 (角色配置流), S6 (Phase 4)

**Files:**
- Modify: `orchestrator/src/team/templates.ts`

**Interfaces:**
- Removes: `loadRoles()` API fetch logic
- Keeps: `loadRoleTemplates()` reading from local `roles.json`

- [ ] **Step 1: Remove loadRoles() API fetch function**

In `templates.ts`, remove the `loadRoles()` async function and `_cachedRoles` variable. Keep only the synchronous `loadConfig()` and `loadRoleTemplates()` functions that read from local `roles.json`.

- [ ] **Step 2: Verify existing behavior preserved**

Run: `cd /home/test/MDH/orchestrator && npx vitest run`
Expected: All tests PASS (templates.ts tests use local JSON)

- [ ] **Step 3: Commit**

```bash
cd /home/test/MDH && git add orchestrator/src/team/templates.ts
git commit -m "refactor(orchestrator): remove API fetch from templates.ts, roles.json is single source"
```

---

### Task 8: Add vitest Config + Full Test Suite

**Covers:** S6 (Phase 5)

**Files:**
- Create: `orchestrator/vitest.config.ts`
- Modify: `orchestrator/package.json` (add test script)

**Interfaces:**
- Produces: `npx vitest run` runs all tests

- [ ] **Step 1: Create vitest config**

```typescript
// orchestrator/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 2: Add vitest dependency**

```bash
cd /home/test/MDH/orchestrator && npm install --save-dev vitest
```

- [ ] **Step 3: Add test script to package.json**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 4: Run full test suite**

Run: `cd /home/test/MDH/orchestrator && npx vitest run`
Expected: All tests PASS (team.test, assembler.test, loader.test, router.test, local.test)

- [ ] **Step 5: Commit**

```bash
cd /home/test/MDH && git add orchestrator/vitest.config.ts orchestrator/package.json orchestrator/package-lock.json
git commit -m "chore(orchestrator): add vitest config and test script"
```
