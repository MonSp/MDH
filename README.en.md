# Matrix DaHuang (MDH)

[![CI](https://github.com/MonSp/MDH/actions/workflows/ci.yml/badge.svg)](https://github.com/MonSp/MDH/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Backend Tests](https://img.shields.io/badge/backend-1759%20passed-brightgreen)]()
[![Frontend Tests](https://img.shields.io/badge/frontend-1726%20passed-brightgreen)]()

[中文版](README.md) | **English**

## What is MDH

MDH is an **operating system for digital employees**. It is not another AI chat tool — it is a collaboration platform where AI agents work, learn, and grow like real employees.

In MDH, digital employees form a team: a CEO analyzes requirements, an architect designs solutions, developers write code, QA reviews quality, and a project manager coordinates progress. They meet in a 3D virtual office, discuss, vote, and execute tasks — just like a real company.

### The Core Loop

```
Task → Execute → Produce Assets → Distill Experience → Evolve Skills → Next Task More Efficient
```

This loop transforms digital employees from one-shot tools into continuously evolving colleagues. They carry their own memory, experience, skill trees, and career paths — and they get stronger with every task.

### They Accumulate Experience

Every task produces artifacts that are automatically stored as assets. Insights from team discussions are distilled into skill rules. When a similar task comes up next time, the system retrieves the most relevant experience and injects it into the agent's context — mistakes made once are not made twice.

### They Self-Purify

Not all experience is good experience. Every rule carries an effectiveness score: +1 when the task succeeds after injection, -1 when it fails. Rules used 3+ times with a success rate below 40% are automatically demoted for re-review. Bad experience is eliminated; good experience stays and gets shared across teams through quality gates.

Digital employees develop an immune system.

### They Have Careers

42 skills form a dependency tree spanning engineering, design, content, data, and management. Each digital employee has a persistent career profile that survives across projects. Completing tasks earns XP; skills level up from beginner to intermediate to advanced.

Each of 10 departments has independent promotion criteria — engineering requires `backend_dev` and `testing`, video requires `video_editing`, data requires `data_analysis`. Promotion is automatic when conditions are met. Senior employees doing simple tasks receive diminished XP — real growth requires real challenges.

### Evolution Is Self-Driving

Rules don't just get passively demoted — low-scoring rules automatically generate improved versions (self-evolution), and improved rules cascade updates to related skill packs and assets (linked evolution). The system automatically identifies which knowledge domains need the most reflection (reflection priority queue), and prevents evolution overfitting: saturation in one domain is capped, stale rules are deprioritized, and 20% of injection time is spent exploring unknown domains.

High-quality experience flows across teams through quality gates, while low-trust teams' rules are filtered by trust scoring (multi-team evolution federation). The system knows its own capability boundaries — which domains are high-confidence, which are blind spots (capability boundary awareness) — and proactively seeks external help when operating in unfamiliar territory.

Human feedback isn't "seen and forgotten" — structured review comments are automatically converted into experience rules that directly influence the digital employee's next performance. Skill direction guidance from humans affects task assignment and XP allocation (human-in-the-loop feedback).

---

## 30-Second Quick Start

```bash
# 1. Clone and configure
git clone https://github.com/MonSp/MDH.git && cd MDH
cp .env.example .env
# Edit .env and fill in your DEEPSEEK_API_KEY

# 2. One-command Docker start
docker compose up -d

# 3. Open your browser
open http://localhost:8080

# 4. Type your first task in CEO Chat
# e.g.: 'Analyze the code quality of this project and suggest improvements'
```

---

## Core Capabilities

| Capability | Description |
|---|---|
| 🏢 Virtual Office | 3D tech-tower visualization, real-time agent status |
| 👥 Multi-Role Teams | 6 core roles (CEO, Architect, Developer, QA, DevOps, PM) + 20+ extended roles |
| 🎯 Intelligent Task Dispatch | CEO analyzes requirements → discusses → votes → assigns → executes → reviews |
| 🔧 18 Tools | File, Git, search, testing, documents, web, etc. |
| 🤖 TS-Python Bridge | Frontend custom agents interoperate with backend AgentScope agents |
| 🖥️ Local/Remote Hybrid Execution | Each agent independently chooses to execute tools locally (Node.js in browser) or remotely (Python Executor) |
| 🔗 A2A Execution Node Protocol | Agent-to-Agent protocol for external execution nodes (TS Orchestrator, Claude Code, etc.) — centralized scheduling + distributed execution |
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
| 📈 Rule Effectiveness Tracking | Injected rules auto-track task success rate, low-score rules auto-demoted |
| 🚀 Digital Employee Careers | AgentProfile persistent archive + XP system + 42 skill trees + 10 department career paths + auto-promotion |
| 🤝 Cross-Team Skill Sharing | Quality gates (score ≥ 0.6 + usage ≥ 2) + approval flow + shared experience pool |
| 🧭 Routing-Aware Skill Levels | DynamicRouter 6-dimension weighted routing (keyword/semantic/success rate/priority/skill level/upgrade boost), agent skill levels influence department selection and task assignment |
| 🎯 Promotion-Driven Assignment | Simple tasks prefer junior agents (XP accumulation), complex tasks prefer senior agents (capability matching) |
| 🧠 Agent Persistent Memory | Cross-project personal memory + auto-summary + memory injection + aging |
| 📄 Document-Aware Collaboration | 20+ file format parsing + context injection + dataset analysis |
| 🔍 Proactive Monitoring | Health checks + risk warnings + alert grading + reflection priority |
| 🤝 Team Synergy Optimization | Synergy analysis + bottleneck detection + optimal team matching |
| 🔌 Webhook Integration | 5 event types notify external systems + HMAC signature verification |
| 🤖 Multi-Model Support | DeepSeek/OpenAI/Anthropic/Gemini/Ollama etc. (9 providers) + model routing + auto fallback |

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

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript + Vite 6 + Three.js |
| Backend | Python 3.11 + FastAPI + WebSocket |
| Orchestrator | Node.js + TypeScript (runs user-local) |
| AI | AgentScope + DeepSeek API |
| Protocol | A2A (Agent-to-Agent) — centralized scheduling + distributed execution |
| Tools | Custom tool execution framework (local/remote routing) |
| Testing | Vitest (TS) + pytest (Python) |

## System Architecture

```
User Browser
┌─────────────────────────────────────────────────┐
│  React Frontend                                  │
│  3D virtual office + WebSocket client            │
└────────────────────────┬─────────────────────────┘
                         │ WebSocket + REST
                         ▼
┌──────────────────────────────────────────────────────────────┐
│              Python Backend (Agent OS Brain)                   │
│                                                               │
│  CEO Agent │ Skill Evo │ Careers │ Assets │ A2A Task Router  │
│  Meetings  │ Skills    │ Memory  │ Monitor │ State Sync Mgr   │
│                                                               │
│  147 REST API endpoints + 41 WebSocket message types          │
└───────────────────────────┬──────────────────────────────────┘
                            │ A2A Protocol (HTTP/SSE)
               ┌────────────┼────────────┐
               ▼            ▼            ▼
      ┌──────────────┐ ┌──────────┐ ┌──────────┐
      │TS Orchestrator│ │Claude Code│ │ Other    │
      │(A2A Server)  │ │ Adapter  │ │ Adapters │
      │· Local tools  │ │· CLI wrap│ │          │
      │· 9 LLM       │ │· Local   │ │          │
      └──────┬───────┘ └──────────┘ └──────────┘
             │ HTTP POST
             ▼
      ┌──────────────┐
      │Python Executor│
      │  (port 8767)  │
      │  Remote tools │
      └──────────────┘
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

## Digital Employee Careers

Each digital employee has a persistent career profile, accumulating experience across projects:

| Capability | Description |
|------|------|
| 🧬 Skill Tree | 42 skills, 5 categories (engineering/design/content/data/management), prerequisite chains |
| ⚡ XP System | Task success +XP, review bonus, XP decay anti-farming |
| 🏢 Department Paths | 10 departments with independent promotion criteria |
| 🎖️ Auto Promotion | Meets skill conditions → auto-promoted (Junior→Mid→Senior→Lead) |
| 📊 Frontend Panels | Department card grid + promotion timeline + skill progress bars + skill tree visualization |
| 🧭 Routing Awareness | Agent skill levels influence routing decisions, upgrades drive department routing bonuses |

## Production Ready (v0.2.0)

| Capability | Description |
|------|------|
| 💾 SQLite Storage | All data migrated to SQLite (WAL mode, concurrent-safe) |
| 🔐 RBAC Permissions | API key three-tier roles (admin/agent/viewer) |
| 📊 Health Checks | Database/disk/module status + auto backup |
| ⚡ LLM Cache | Semantic caching (SQLite persistence + tiered TTL + normalization) |
| 🔌 Webhooks | 5 event types notify external systems |
| 📈 Benchmark Suite | 16 tasks + CI gate + baseline comparison + regression detection |
| ⏱️ Perf Benchmarks | Real API/cache/DB/artifact latency and throughput measurement |

## Testing

```bash
# Frontend tests (1726 tests)
npx vitest run

# Backend tests (1759 tests)
cd backend && python -m pytest tests/ --timeout=60

# Orchestrator tests (214 tests)
cd orchestrator && npm test

# E2E verification (31 checks)
cd backend && python e2e_verify.py

# Performance benchmarks
cd backend && python perf_real.py

# Evaluation benchmarks
cd backend && python benchmark_cli.py --analyze
```

## Documentation

- [Changelog](CHANGELOG.md)
- [Agent Roles](docs/agent-roles.md)
- [Agent Tools](docs/agent-tools.md)
- [Design](docs/design.md)
- [User Guide](docs/user-guide.md)
- [Docker Deployment Guide](DOCKER_README.md)
- [Performance Test Guide](docs/PERF_TEST_GUIDE.md)

## License

[Apache License 2.0](LICENSE)
