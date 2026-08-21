# Matrix DaHuang (MDH)

[![CI](https://github.com/MonSp/MDH/actions/workflows/ci.yml/badge.svg)](https://github.com/MonSp/MDH/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Backend Tests](https://img.shields.io/badge/backend-1412%20passed-brightgreen)]()
[![Frontend Tests](https://img.shields.io/badge/frontend-1726%20passed-brightgreen)]()
[![Test Coverage](https://img.shields.io/badge/test%20coverage-84%25-brightgreen)]()

[中文版](README.md) | **English**

A full-domain multi-agent collaboration system built with React + Python FastAPI + AgentScope. Multiple AI agents collaborate in a virtual office, completing the full pipeline from requirement analysis to code delivery.

## Core Capabilities

| Capability | Description |
|---|---|
| 🏢 Virtual Office | 3D tech-tower visualization, real-time agent status |
| 👥 Multi-Role Teams | 6 core roles (CEO, Architect, Developer, QA, DevOps, PM) + 20+ extended roles |
| 🎯 Intelligent Task Dispatch | CEO analyzes requirements → discusses → votes → assigns → executes → reviews |
| 🔧 18 Tools | File, Git, search, testing, documents, web, etc. |
| 🤖 TS-Python Bridge | Frontend custom agents interoperate with backend AgentScope agents |
| 🖥️ Local/Remote Hybrid Execution | Each agent independently chooses to execute tools locally (Node.js in browser) or remotely (Python Executor) |
| 🗳️ Voting Decisions | Proposal → vote → consensus evaluation (multiple strategies) |
| ✅ Human Approval | Approval flow for high-risk operations (incl. DAG node gate control) |
| 📸 Checkpoints | Save & restore task execution state |
| 📝 Audit Logs | Operation audit trail |
| ⚙️ Workflow Engine | DAG workflows (sequential/parallel/mixed strategies) + REST API lifecycle management |
| 🧠 Skill Evolution | Teams accumulate experience into reusable skill packs (evolves with use) |
| 📦 Asset Sedimentation | Artifacts stored + templates solidified (employee approval gate) + experience distilled into skill rules, team-scoped |
| 🔍 Asset Reuse Injection | DAG nodes auto-inject team asset references (templates/knowledge/skill rules, progressive disclosure) |
| 🧪 LLM Judge Gating | Templates/artifacts pass deterministic checks + LLM judge evaluation (fail-closed) + benchmark with CI gate |
| 📊 Reuse Visibility | Injection metrics (`/api/assets/reuse-metrics`) + frontend asset browser panel (`🧠 Assets` tab) |
| 📝 Meeting Minutes Pipeline | Intent-recognition doc mode → minutes DAG workflow (extract/draft/proofread) → artifact output + email delivery |
| 🧭 Routing-Aware Skill Levels | DynamicRouter 5-dimension weighted routing, agent skill levels influence department selection and task assignment |
| 🎯 Promotion-Driven Assignment | Simple tasks prefer junior agents (XP accumulation), complex tasks prefer senior agents (capability matching) |

## What is MDH

MDH is an **operating system for digital employees**. It is not another AI chat tool — it is a collaboration platform where AI agents work, learn, and grow like real employees.

In MDH, digital employees form a team: a CEO analyzes requirements, an architect designs solutions, developers write code, QA reviews quality, and a project manager coordinates progress. They meet in a 3D virtual office, discuss, vote, and execute tasks — just like a real company.

### They Accumulate Experience

Every task produces artifacts that are automatically stored as assets. Insights from team discussions are distilled into skill rules. When a similar task comes up next time, the system retrieves the most relevant experience and injects it into the agent's context — mistakes made once are not made twice.

### They Self-Purify

Not all experience is good experience. Every rule carries an effectiveness score: +1 when the task succeeds after injection, -1 when it fails. Rules used 3+ times with a success rate below 40% are automatically demoted for re-review. Bad experience is eliminated; good experience stays and gets shared across teams through quality gates.

Digital employees develop an immune system.

### They Have Careers

42 skills form a dependency tree spanning engineering, design, content, data, and management. Each digital employee has a persistent career profile that survives across projects. Completing tasks earns XP; skills level up from beginner to intermediate to advanced.

Each of 10 departments has independent promotion criteria — engineering requires `backend_dev` and `testing`, video requires `video_editing`, data requires `data_analysis`. Promotion is automatic when conditions are met. Senior employees doing simple tasks receive diminished XP — real growth requires real challenges.

### The Core Loop

```
Task → Execute → Produce Assets → Distill Experience → Evolve Skills → Next Task More Efficient
```

This loop transforms digital employees from one-shot tools into continuously evolving colleagues. They carry their own memory, experience, skill trees, and career paths — and they get stronger with every task.

## Quick Start

### 1. Frontend

```bash
npm install
npm run dev
```

Visit `http://localhost:5173`

### 2. Backend

```bash
# Install dependencies
pip install -r backend/requirements.txt

# Configure API Key
cp .env.example .env
# Edit .env and fill in DEEPSEEK_API_KEY

# Start
python backend/server.py
```

Backend runs at `ws://localhost:8765/ws`

### 3. Docker Deployment

```bash
docker compose up -d
```

## Project Structure

```
├── src/                          # React + TypeScript frontend
│   ├── components/
│   │   ├── techtower/            # 3D tech tower
│   │   ├── office-team/          # Office team panels
│   │   │   ├── VotingPanel.tsx   # Voting panel
│   │   │   ├── ApprovalPanel.tsx # Approval panel
│   │   │   ├── CeoChatPanel.tsx  # CEO chat + Per-Agent Location selector
│   │   │   └── ...
│   │   ├── skill-evolution/      # Skill evolution
│   │   └── cyberpunk/            # Cyberpunk visual effects
│   ├── hooks/
│   │   ├── useMeetingSocket.ts   # WebSocket meeting communication
│   │   ├── useAgentSystem.ts     # TS agent system (incl. bridge)
│   │   └── useApproval.ts        # Approval queue
│   └── modules/                  # 45+ core modules
│       ├── webSocketBridge.ts    # TS-Python bridge
│       ├── agentCoordinator.ts   # Agent coordinator
│       └── ...
├── backend/                      # Python backend (port 8765)
│   ├── server.py                 # FastAPI + WebSocket service
│   ├── meeting_coordinator.py    # Meeting coordinator (core)
│   ├── ceo_agent.py              # CEO agent
│   ├── agent_bridge.py           # TS-Python bridge
│   ├── roles_config.yaml         # Role config (25+ roles)
│   └── tests/                    # Python tests (1142 tests)
├── orchestrator/                 # TS orchestrator (user-local Node.js)
│   └── src/
│       ├── cli.ts                # CLI entry
│       ├── server.ts             # HTTP + WebSocket service
│       ├── team/                 # Team management
│       ├── llm/                  # LLM integration
│       ├── toolkit/              # Toolkit routing (local/remote/hybrid)
│       └── loop/                 # Loop execution engine
├── loop-engineering/             # Loop engineering optimization (standalone product)
├── skill_packs/                  # Skill packs
├── protocol/                     # Bridge protocol docs
├── docs/                         # Documentation
└── .env                          # Environment variables (API Key)
```

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript + Vite 6 + Three.js |
| Backend | Python 3.11 + FastAPI + WebSocket |
| Orchestrator | Node.js + TypeScript (runs user-local) |
| AI | AgentScope + DeepSeek API |
| Tools | Custom tool execution framework (local/remote routing) |
| Testing | Vitest (TS) + pytest (Python) |

## System Architecture

```
User Browser (Chrome Side Panel)
┌─────────────────────────────────────────────────┐
│  React Frontend (port 8080)                     │
│  3D virtual office + WebSocket client           │
└─────────────────────────────────────────────────┘
        │ WebSocket                    │ HTTP
        ▼                              ▼
┌───────────────────┐        ┌───────────────────┐
│  TS Orchestrator  │        │  Python Backend   │
│  (port 8080)      │        │  (port 8765)      │
│  - TeamCoordinator│        │  - CEO Agent      │
│  - LLM calls      │        │  - Voting/Approval│
│  - Local tools    │        │  - Skill evolution│
│  - Remote routing │        │                   │
└────────┬──────────┘        └───────────────────┘
         │ HTTP POST /execute
         ▼
┌───────────────────┐
│  Python Executor  │
│  (port 8767)      │
│  - 18 built-in    │
│    tools          │
│  - Workspace      │
│    isolation      │
└───────────────────┘
```

## Agent Tool System

| Category | Tools |
|---|---|
| File | read_file, write_file, edit_file, list_directory |
| Git | git_status, git_commit, git_push, git_branch, git_diff, git_log |
| Search | search_files, grep_content |
| Testing | run_tests, run_linter |
| Documents | create_document, edit_document |
| Web | web_fetch |

Tool execution supports local/remote routing:
- **Local execution**: Node.js child_process (for user-local file operations)
- **Remote execution**: HTTP POST to Python Executor (for server-side operations)
- **Per-Agent selection**: each agent independently chooses its execution location

Detailed docs: [docs/agent-tools.md](docs/agent-tools.md)

## Role Configuration

Roles are configured in `backend/roles_config.yaml`:

```yaml
base_roles:
  executor:
    name: "Full-Stack Developer"
    permissions:
      tools: ["read_file", "write_file", "edit_file", "list_directory", "bash", "git_status", "git_commit"]
      dangerous_tools: ["bash"]
    skills: ["frontend_dev", "backend_dev", "fullstack_dev", "testing"]
    team_role: Executor
```

Custom roles and skill mixes are supported:

```yaml
custom_roles:
  security_dev:
    base_role: executor
    extra_tools: ["grep_content", "run_linter"]
    extra_skills: ["security_audit"]
    name: "Security Developer"
```

Roles can be managed via the role editor in the frontend `🗳️ Vote` tab.

## WebSocket Message Protocol

### Frontend → Backend

| Message Type | Description |
|---|---|
| `start_meeting` | Start meeting (provider/model/api_key/max_iterations) |
| `meeting_message` | Send meeting message |
| `task_assign` | Manually assign task |
| `end_meeting` | End meeting |
| `create_proposal` | Create proposal |
| `cast_vote` | Cast vote |
| `evaluate_consensus` | Evaluate consensus |
| `request_approval` | Request human approval |
| `human_approval_response` | Approval response |
| `checkpoint_save` | Save checkpoint |
| `checkpoint_restore` | Restore checkpoint |
| `save_meeting_snapshot` | Save meeting snapshot |
| `restore_meeting_snapshot` | Restore meeting snapshot |
| `critical_blocker` | Report critical blocker |
| `log_audit` | Log audit event |
| `bridge_register_agent` | Register TS agent to Python |
| `bridge_message` | TS↔Python agent message |
| `set_max_iterations` | Set max iteration rounds |
| `adjust_agent_weight` | Adjust agent voting weight |

### Backend → Frontend

| Message Type | Description |
|---|---|
| `meeting_started` | Meeting started |
| `meeting_ended` | Meeting ended |
| `agent_message` | Agent message (incl. delta streaming) |
| `task_assigned` | Task assigned |
| `task_auto_assigned` | Task auto-assigned |
| `agenda_update` | Agenda status update |
| `proposal` | Proposal pushed |
| `vote` | Vote pushed |
| `vote_result` | Vote result |
| `human_approval_request` | Approval request |
| `checkpoint_saved` | Checkpoint saved |
| `checkpoint_restored` | Checkpoint restored |
| `meeting_snapshot_saved` | Snapshot saved |
| `meeting_snapshot_restored` | Snapshot restored |
| `critical_blocker` | Critical blocker notification |
| `audit_log` | Audit log pushed |
| `bridge_agent_registered` | TS agent registered |
| `bridge_message` | Python→TS agent message |

## REST API

### Workflow Engine

| Endpoint | Description |
|---|---|
| `POST /api/workflow/create` | Create workflow |
| `POST /api/workflow/execute/{id}` | Execute workflow |
| `POST /api/workflow/pause/{id}` | Pause workflow |
| `POST /api/workflow/resume/{id}` | Resume workflow |
| `POST /api/workflow/cancel/{id}` | Cancel workflow |
| `POST /api/workflow/retry/{id}/{nodeId}` | Retry node |
| `GET /api/workflow/status/{id}` | Get status |
| `GET /api/workflow/visualization/{id}` | Get visualization |

### Role Management

| Endpoint | Description |
|---|---|
| `GET /api/roles/config` | Get role config |
| `GET /api/roles/{id}` | Get single role |
| `POST /api/roles/{id}` | Create role |
| `PUT /api/roles/{id}` | Update role |
| `DELETE /api/roles/{id}` | Delete role |

### History

| Endpoint | Description |
|---|---|
| `GET /api/history/sessions` | List history sessions |
| `GET /api/history/sessions/{id}/messages` | Get history messages |

### Monitoring

| Endpoint | Description |
|---|---|
| `GET /health` | Health check |
| `GET /metrics` | Prometheus metrics |

## Testing

```bash
# Frontend tests (1657 tests)
npx vitest run

# Backend tests (1142 tests)
cd backend && python -m pytest tests/ --timeout=60

# Orchestrator tests
cd orchestrator && npx vitest run

# LLM integration tests
export $(cat .env | grep -v '^#' | xargs)
python backend/test_llm_integration.py

# LLM judge benchmark CI gate (deterministic self-check without a key)
python backend/asset_benchmark_gate.py
```

## Coverage

| Directory | Stmts | Branch | Funcs |
|---|---|---|---|
| src/modules | 84.39% | 87.85% | 85.02% |
| src/hooks | 92.86% | 75.36% | 91.66% |

## Documentation

- [Changelog](CHANGELOG.md)
- [Agent Roles](docs/agent-roles.md)
- [Agent Tools](docs/agent-tools.md)
- [Design](docs/design.md)
- [User Guide](docs/user-guide.md)
- [Docker Deployment Guide](DOCKER_README.md)
- [Project Rules](project_rules.md)
- [Benchmark CI Gate Guide](docs/compose/plans/2026-08-15-hybrid-team-platform-benchmark-ci-guide.md)

## Version History

Full change history in [CHANGELOG.md](CHANGELOG.md).

## License

[Apache License 2.0](LICENSE)
