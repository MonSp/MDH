# MDH API Reference

> **Base URL**: `http://localhost:8765`  
> **OpenAPI Docs**: `http://localhost:8765/docs` (Swagger UI)  
> **OpenAPI JSON**: `http://localhost:8765/openapi.json`  
> **API Version**: v1 (prefix `/api/v1/` or `/api/`)  
> **Authentication**: Bearer token via `Authorization` header

---

## 目录

1. [Projects](#projects)
2. [Roles](#roles)
3. [Experience & Rules](#experience--rules)
4. [A2A (Agent-to-Agent)](#a2a-agent-to-agent)
5. [Agents & Careers](#agents--careers)
6. [Assets](#assets)
7. [Evolution](#evolution)
8. [Feedback](#feedback)
9. [Workflow](#workflow)
10. [Skills](#skills)
11. [Memory](#memory)
12. [Documents & Workspace](#documents--workspace)
13. [Delivery & Monitoring](#delivery--monitoring)
14. [Team Synergy](#team-synergy)
15. [Marketplace](#marketplace)
16. [MCP Configuration](#mcp-configuration)
17. [Browser Automation](#browser-automation)
18. [Admin & Operations](#admin--operations)
19. [Models](#models)
20. [Webhooks](#webhooks)
21. [Tenants](#tenants)
22. [Session & History](#session--history)
23. [System](#system)

---

## Response Format

All REST endpoints return JSON with the following envelope:

```json
{
  "success": true,
  "data": { ... },
  "code": "OK"
}
```

Error responses:

```json
{
  "success": false,
  "error": "Description of the error",
  "code": "ERROR_CODE"
}
```

---

## Projects

Manage projects, tasks, and classifications.

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `GET` | `/api/projects` | List all projects | — |
| `POST` | `/api/projects` | Create a project | `name`, `description` (body) |
| `GET` | `/api/projects/categories` | List project categories | — |
| `POST` | `/api/projects/classify-all` | Classify all unclassified projects | — |
| `GET` | `/api/projects/{project_id}` | Get project details | `project_id` (path) |
| `DELETE` | `/api/projects/{project_id}` | Delete a project | `project_id` (path) |
| `PATCH` | `/api/projects/{project_id}` | Update a project | `project_id` (path), body fields |
| `GET` | `/api/projects/{project_id}/status` | Get project status | `project_id` (path) |
| `POST` | `/api/projects/{project_id}/instantiate` | Instantiate a project runtime | `project_id` (path) |
| `POST` | `/api/projects/{project_id}/category` | Set project category | `project_id` (path), `category` (body) |
| `POST` | `/api/projects/{project_id}/classify` | Classify a single project | `project_id` (path) |
| `GET` | `/api/projects/{project_id}/tasks` | List project tasks | `project_id` (path) |
| `POST` | `/api/projects/{project_id}/tasks` | Create a task | `project_id` (path), `name`, `description` (body) |
| `POST` | `/api/projects/{project_id}/tasks/{task_id}/subtasks` | Create subtasks | `project_id`, `task_id` (path) |
| `PATCH` | `/api/projects/{project_id}/tasks/{task_id}/subtasks/{subtask_id}` | Update a subtask | All IDs (path), body fields |
| `DELETE` | `/api/projects/{project_id}/tasks/{task_id}` | Delete a task | `project_id`, `task_id` (path) |
| `POST` | `/api/projects/{project_id}/archive` | Archive a project | `project_id` (path) |

---

## Roles

Manage agent roles, tools, and skill configurations.

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `GET` | `/api/roles/config` | Get full role configuration | — |
| `GET` | `/api/roles/{role_id}` | Get a single role | `role_id` (path) |
| `POST` | `/api/roles/{role_id}` | Create a custom role | `role_id` (path), `name`, `base_role`, `extra_tools`, `extra_skills` (body) |
| `PUT` | `/api/roles/{role_id}` | Update a role | `role_id` (path), body fields |
| `DELETE` | `/api/roles/{role_id}` | Delete a custom role | `role_id` (path) |
| `GET` | `/api/roles/tools/list` | List all available tools | — |
| `POST` | `/api/roles/tools/{tool_id}` | Add a new tool | `tool_id` (path), `name`, `description`, `category` (body) |
| `DELETE` | `/api/roles/tools/{tool_id}` | Delete a tool | `tool_id` (path) |
| `GET` | `/api/roles/skills/list` | List all available skills | — |
| `POST` | `/api/roles/skills/generate` | AI-generate a skill from description | `description` (body) |
| `POST` | `/api/roles/skills/{skill_id}` | Add a new skill | `skill_id` (path), `name`, `description` (body) |
| `DELETE` | `/api/roles/skills/{skill_id}` | Delete a skill | `skill_id` (path) |

---

## Experience & Rules

Experience rule management, effectiveness tracking, and approval.

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `GET` | `/api/experience/rules` | List all experience rules | — |
| `GET` | `/api/experience/rules/pending` | List rules pending review | — |
| `GET` | `/api/experience/rules/{rule_id}/chain` | Get evolution chain for a rule | `rule_id` (path) |
| `POST` | `/api/experience/rules/{rule_id}/approve` | Approve a rule | `rule_id` (path) |
| `POST` | `/api/experience/rules/{rule_id}/reject` | Reject a rule | `rule_id` (path) |
| `PUT` | `/api/experience/rules/{rule_id}` | Update a rule | `rule_id` (path), body fields |
| `GET` | `/api/experience/rules/effectiveness` | Rule effectiveness leaderboard | — |
| `GET` | `/api/experience/rules/demotion-log` | View demotion log | — |
| `GET` | `/api/experience/rules/demotion-stats` | Demotion statistics (by type/team/time) | — |
| `GET` | `/api/experience/rules/demotion-export` | Export demotion report | `format` (query): `json` or `csv` |

---

## A2A (Agent-to-Agent)

External execution node management via the A2A protocol.

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `POST` | `/api/a2a/register` | Register an execution node | `agent_id`, `name`, `url`, `skills` (body) |
| `POST` | `/api/a2a/unregister/{agent_id}` | Unregister a node | `agent_id` (path) |
| `POST` | `/api/a2a/heartbeat/{agent_id}` | Send heartbeat | `agent_id` (path) |
| `GET` | `/api/a2a/agents` | List registered nodes | — |
| `GET` | `/api/a2a/route` | Query routing decision | `task_type`, `required_skills` (query) |
| `POST` | `/api/a2a/dispatch` | Dispatch a task to a node | `agent_id`, `task` (body) |

**Response example** (`GET /api/a2a/agents`):
```json
{
  "success": true,
  "data": [
    {
      "agent_id": "orchestrator-1",
      "name": "TS Orchestrator",
      "url": "http://localhost:9090",
      "skills": ["frontend_dev", "backend_dev"],
      "status": "healthy",
      "task_count": 42,
      "success_count": 40
    }
  ]
}
```

---

## Agents & Careers

Agent profiles, XP system, promotion, and career paths.

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `GET` | `/api/agents/{agent_id}/profile` | Get agent profile | `agent_id` (path) |
| `POST` | `/api/agents/{agent_id}/grant-xp` | Grant XP to an agent | `agent_id` (path), `amount`, `reason` (body) |
| `GET` | `/api/agents/{agent_id}/promotion` | Check promotion eligibility | `agent_id` (path) |
| `GET` | `/api/agents/{agent_id}/career-path` | Get department career path | `agent_id` (path) |
| `GET` | `/api/agents/{agent_id}/optimize` | Agent self-optimization analysis | `agent_id` (path) |
| `GET` | `/api/agents/optimize/all` | Summary for all agents | — |
| `GET` | `/api/agents/knowledge-flow` | Knowledge flow visualization | — |
| `GET` | `/api/skills/tree` | Full skill tree (42 skills, 5 categories) | — |
| `GET` | `/api/careers/departments` | All department career paths | — |

**Response example** (`GET /api/agents/{agent_id}/profile`):
```json
{
  "success": true,
  "data": {
    "agent_id": "executor-1",
    "department": "dept-backend",
    "total_xp": 1250,
    "career_stage": "senior",
    "skill_progress": {
      "backend_dev": { "level": "advanced", "xp": 800 },
      "testing": { "level": "intermediate", "xp": 300 }
    }
  }
}
```

---

## Assets

Asset management: artifacts, templates, search, and reuse metrics.

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `GET` | `/api/assets` | List assets (per team) | `team_id`, `status` (query) |
| `PUT` | `/api/assets/{asset_id}` | Update asset content | `asset_id` (path), `content`, `editor` (body) |
| `POST` | `/api/assets/artifacts` | Store an artifact | `team_id`, `title`, `content` (body) |
| `POST` | `/api/assets/templates` | Submit a template (evaluation + approval) | `team_id`, `title`, `content`, `approver` (body) |
| `GET` | `/api/assets/search` | Search across all asset types | `team_id`, `q`, `type`, `task_type`, `keywords` (query) |
| `POST` | `/api/assets/experience` | Evolve skill from feedback | `team_id`, `task_type`, `transcript`, `feedback` (body) |
| `GET` | `/api/assets/reuse-metrics` | Asset reuse statistics | — |

---

## Evolution

Evolution timeline, A/B statistics, capability boundaries, and introspection.

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `GET` | `/api/evolution/timeline` | Evolution event timeline | — |
| `GET` | `/api/evolution/timeline/summary` | Timeline summary | — |
| `GET` | `/api/evolution/ab-stats` | A/B experiment statistics | — |
| `GET` | `/api/knowledge/network-stats` | Knowledge network statistics | — |
| `GET` | `/api/reflection/priority-queue` | Reflection priority queue | — |
| `GET` | `/api/federation/stats` | Multi-team federation statistics | — |
| `GET` | `/api/federation/feed` | Federation event feed | — |
| `GET` | `/api/capability/boundary` | Capability boundary map | — |
| `GET` | `/api/capability/confidence-map` | Confidence map (high/medium/low) | — |
| `GET` | `/api/capability/detect` | Detect unknown domains | — |
| `GET` | `/api/introspection/features` | Feature utilization | — |
| `GET` | `/api/introspection/health` | Module health scores | — |
| `GET` | `/api/introspection/proposals` | System improvement proposals | — |

---

## Feedback

Human-in-the-loop feedback system.

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `POST` | `/api/feedback/submit` | Submit structured feedback | `agent_id`, `content`, `rating` (body) |
| `GET` | `/api/feedback/summary` | Get feedback summary | — |
| `GET` | `/api/feedback/guidance/{agent_id}` | Get skill direction guidance | `agent_id` (path) |

---

## Workflow

DAG workflow engine — create, execute, pause/resume, cancel.

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `POST` | `/api/workflow/create` | Create a workflow definition | `name`, `nodes`, `edges`, `strategy` (body) |
| `GET` | `/api/workflow/executions` | List all workflow executions | — |
| `POST` | `/api/workflow/execute/{execution_id}` | Execute a workflow | `execution_id` (path) |
| `POST` | `/api/workflow/pause/{execution_id}` | Pause execution | `execution_id` (path) |
| `POST` | `/api/workflow/resume/{execution_id}` | Resume execution | `execution_id` (path) |
| `POST` | `/api/workflow/cancel/{execution_id}` | Cancel execution | `execution_id` (path) |
| `POST` | `/api/workflow/retry/{execution_id}/{node_id}` | Retry a failed node | `execution_id`, `node_id` (path) |
| `GET` | `/api/workflow/status/{execution_id}` | Get execution status | `execution_id` (path) |
| `GET` | `/api/workflow/visualization/{execution_id}` | DAG visualization data | `execution_id` (path) |

**Execution strategies**: `sequential` (Kahn topological sort), `parallel` (BFS level + asyncio.gather), `mixed` (unconditional parallel + conditional sequential).

---

## Skills

Skill pack management, packaging, and evolution.

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `GET` | `/api/skills` | List all skill packs | — |
| `POST` | `/api/skills` | Register a new skill pack | `name`, `description` (body) |
| `POST` | `/api/skills/{skill_id}/clone` | Clone a skill pack | `skill_id` (path) |
| `GET` | `/api/skills/{skill_id}/versions` | Get version history | `skill_id` (path) |
| `GET` | `/api/skills/{skill_id}` | Get skill pack details | `skill_id` (path) |
| `POST` | `/api/skills/package` | Package a skill pack | `skill_id`, `include_increment` (body) |
| `GET` | `/api/skills/package/preview` | Preview before packaging | `skill_id` (query) |
| `POST` | `/api/skills/evolve` | Evolve a skill from feedback | `skill_id`, `feedback`, `task_type` (body) |

---

## Memory

Agent persistent memory — cross-project knowledge retention.

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `GET` | `/api/memory/{agent_id}` | Get agent memory | `agent_id` (path) |
| `POST` | `/api/memory/{agent_id}/add` | Add a memory entry | `agent_id` (path), `content`, `tags` (body) |
| `GET` | `/api/memory/{agent_id}/recall` | Recall relevant memories | `agent_id` (path), `query` (query) |
| `GET` | `/api/memory/{agent_id}/context` | Get memory context for task | `agent_id` (path), `task_type` (query) |
| `GET` | `/api/memory/stats` | Memory statistics | — |

---

## Documents & Workspace

Document parsing, context injection, and workspace analysis.

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `POST` | `/api/documents/parse` | Parse a document (19 formats) | `file_path` or `content`, `format` (body) |
| `GET` | `/api/documents/search` | Search parsed documents | `query` (query) |
| `GET` | `/api/documents/context` | Get document context for injection | `task_type` (query) |
| `GET` | `/api/documents/stats` | Document parsing statistics | — |
| `GET` | `/api/workspace/analyze` | Analyze code repository | — |
| `POST` | `/api/workspace/analyze-dataset` | Parse and analyze a dataset | `file_path` (body) |
| `GET` | `/api/workspace/artifacts` | List workspace artifacts | — |
| `GET` | `/api/workspace/conflicts` | Check for edit conflicts | — |

---

## Delivery & Monitoring

Autonomous delivery engine and proactive monitoring.

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `POST` | `/api/delivery/deliver` | Trigger autonomous delivery | `project_id`, `task_id`, `files` (body) |
| `GET` | `/api/delivery/log` | Delivery log history | — |
| `GET` | `/api/monitor/health` | Proactive health check | — |
| `GET` | `/api/monitor/alerts` | Get active alerts | — |

---

## Team Synergy

Team collaboration optimization.

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `GET` | `/api/team/synergy` | Get synergy analysis | — |
| `POST` | `/api/team/synergy/record` | Record a team task result | `team_id`, `task_type`, `success`, `agents` (body) |
| `GET` | `/api/team/synergy/recommend` | Recommend optimal team composition | `task_type` (query) |

---

## Marketplace

Skill marketplace — sharing, forking, importing/exporting.

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `POST` | `/api/marketplace/experience/publish` | Publish experience to shared pool | `rule_id`, `team_id` (body) |
| `GET` | `/api/marketplace/experience/search` | Search shared experience | `query`, `category` (query) |
| `POST` | `/api/marketplace/experience/fork` | Fork experience from shared pool | `rule_id`, `team_id` (body) |
| `GET` | `/api/marketplace/experience/pending` | Rules pending approval | — |
| `POST` | `/api/marketplace/experience/approve` | Approve a rule | `rule_id` (body) |
| `POST` | `/api/marketplace/experience/reject` | Reject a rule | `rule_id`, `reason` (body) |
| `GET` | `/api/marketplace/experience/recommendations` | Recommended rules | — |
| `GET` | `/api/marketplace/experience/leaderboard` | Rule effectiveness leaderboard | — |
| `POST` | `/api/marketplace/experience/update-fork-effectiveness` | Update fork effectiveness | `fork_id`, `success` (body) |
| `POST` | `/api/marketplace/skills/fork` | Fork a skill pack | `skill_id`, `team_id` (body) |
| `GET` | `/api/marketplace/skills/forks` | List forked skill packs | — |
| `POST` | `/api/marketplace/skills/pull` | Pull updates from upstream | `fork_id` (body) |
| `POST` | `/api/marketplace/export` | Export a skill pack | `skill_id`, `format` (body) |
| `POST` | `/api/marketplace/import` | Import a skill pack | `file_path` or `content` (body) |
| `GET` | `/api/marketplace/exports` | List exported packs | — |
| `GET` | `/api/marketplace/stats` | Marketplace statistics | — |

### Community

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `GET` | `/api/community/search` | Search community skills (Git registry) | `query` (query) |
| `POST` | `/api/community/install` | Install from community | `skill_id`, `registry_url` (body) |

---

## MCP Configuration

Manage external MCP (Model Context Protocol) servers.

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `GET` | `/api/mcp/servers` | List MCP servers | — |
| `POST` | `/api/mcp/servers` | Add an MCP server | `name`, `command`, `args` (body) |
| `PUT` | `/api/mcp/servers/{name}` | Update an MCP server | `name` (path), body fields |
| `DELETE` | `/api/mcp/servers/{name}` | Remove an MCP server | `name` (path) |
| `POST` | `/api/mcp/servers/{name}/test` | Test MCP server connection | `name` (path) |

---

## Browser Automation

Playwright-based browser task queue and pool management.

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `POST` | `/api/browser/submit` | Submit a browser task | `url`, `actions`, `priority` (body) |
| `GET` | `/api/browser/status` | Queue and pool status | — |
| `GET` | `/api/browser/result/{task_id}` | Get task result | `task_id` (path) |
| `GET` | `/api/browser/results` | Get all results | — |
| `POST` | `/api/browser/start` | Start the task queue | — |
| `POST` | `/api/browser/stop` | Stop the task queue | — |
| `POST` | `/api/browser/pool/health-check` | Health check on browser pool | — |

---

## Admin & Operations

RBAC key management, backup, cache, and ops.

### Admin (RBAC)

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `POST` | `/api/admin/create-key` | Create an API key with role | `role`, `name`, `team_id` (body) |
| `GET` | `/api/admin/keys` | List all API keys | — |
| `DELETE` | `/api/admin/keys/{key_hash}` | Revoke an API key | `key_hash` (path) |

### Operations

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `GET` | `/health` | Health check (DB + disk + modules) | — |
| `GET` | `/metrics` | Prometheus-format metrics | — |
| `POST` | `/api/ops/backup` | Backup database | `label` (query) |
| `GET` | `/api/ops/backups` | List backups | — |
| `POST` | `/api/ops/restore` | Restore from backup | `backup_name` (body) |
| `GET` | `/api/ops/cache` | Cache statistics | — |
| `POST` | `/api/ops/cache/clear` | Clear all caches | — |
| `GET` | `/api/ops/logging` | Logging configuration | — |

---

## Models

Multi-model support with routing and fallback chains.

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `GET` | `/api/models` | List available models | `tier` (query) |
| `GET` | `/api/models/{model_id}` | Get model details | `model_id` (path) |
| `GET` | `/api/models/{model_id}/fallback` | Get fallback chain | `model_id` (path) |
| `GET` | `/api/llm/costs` | LLM cost summary | — |
| `GET` | `/api/llm/costs/records` | LLM cost records | — |
| `GET` | `/api/dashboard/performance` | Performance dashboard | — |
| `GET` | `/api/benchmark/tasks` | List benchmark tasks | — |
| `POST` | `/api/benchmark/run` | Run benchmarks | `task_ids` (body) |
| `GET` | `/api/benchmark/analyze` | Analyze benchmark results | — |

---

## Webhooks

Event-driven webhook notifications.

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `POST` | `/api/webhooks` | Register a webhook | `url`, `events` (body) |
| `GET` | `/api/webhooks` | List webhook subscriptions | — |
| `DELETE` | `/api/webhooks/{sub_id}` | Remove a webhook | `sub_id` (path) |
| `GET` | `/api/webhooks/stats` | Webhook delivery statistics | — |

**Supported events**: `task_completed`, `task_failed`, `rule_demoted`, `agent_promoted`, `asset_created`.

---

## Tenants

Multi-tenant management.

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `POST` | `/api/tenants` | Create a tenant | `name`, `description` (body) |
| `GET` | `/api/tenants` | List all tenants | — |
| `GET` | `/api/tenants/{tenant_id}` | Get tenant details | `tenant_id` (path) |
| `DELETE` | `/api/tenants/{tenant_id}` | Deactivate a tenant | `tenant_id` (path) |

---

## Session & History

Session management and conversation history.

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `GET` | `/api/sessions/{session_id}` | Get session state | `session_id` (path) |
| `GET` | `/api/history/sessions` | List historical sessions | — |
| `GET` | `/api/history/sessions/{session_id}/messages` | Get session messages | `session_id` (path) |

---

## System

Hybrid team assembly, gate management, employees, and minutes.

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `POST` | `/api/hybrid/team` | Assemble a human+agent hybrid team | `project_id`, `dag`, `humans` (body) |
| `GET` | `/api/employees` | List employee directory | — |
| `POST` | `/api/minutes` | Plan meeting minutes workflow | `transcript`, `submitter` (body) |
| `POST` | `/api/gates` | Create a gate/approval request | `requesterId`, `operation`, `approver` (body) |
| `GET` | `/api/gates/pending` | List pending gate requests | — |
| `POST` | `/api/gates/{request_id}/decide` | Decide on a gate request | `request_id` (path), `approved` (body) |

---

## Router Table

Dynamic routing configuration.

| Method | Path | Description | Key Parameters |
|--------|------|-------------|----------------|
| `GET` | `/api/router/table` | Get routing table | — |
| `PUT` | `/api/router/table` | Update routing table | Route entries (body) |
| `DELETE` | `/api/router/table/{dept_id}` | Remove a route entry | `dept_id` (path) |

---

## WebSocket Protocol

The WebSocket endpoint is at `ws://localhost:8765/ws`. See [AGENTS.md](../AGENTS.md) for the full message protocol reference.

**Connection**: 
```
ws://localhost:8765/ws?token={BACKEND_TOKEN}
```

**Key client → server messages**: `start_meeting`, `meeting_message`, `task_assign`, `create_proposal`, `cast_vote`, `checkpoint_save`.

**Key server → client messages**: `complexity_result`, `path_selected`, `meeting_started`, `agent_message`, `task_result`, `workflow_executed`.
