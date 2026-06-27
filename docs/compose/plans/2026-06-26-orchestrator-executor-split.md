# Orchestrator/Executor 分离：去中心化智能体架构

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 MDH 从中心化 Python 服务器架构，改造为 TypeScript 本地编排器 + Python 远程执行器的去中心化架构。编排器运行在用户本地（Node.js），负责 LLM 推理和团队决策；执行器运行在远程节点，负责工具执行（Shell/File/Git/Sandbox）。

**Architecture:**
```
用户本地 (Node.js)                      远程节点 (Python/AgentScope)
┌──────────────────────┐               ┌─────────────────────────┐
│ mdh CLI (编排器)       │   HTTP/WS    │ Executor Service         │
│ ├─ orchestrator.ts    │ ───────────→ │ ├─ tool_executor.py      │
│ ├─ role-templates.ts  │              │ ├─ sandbox (Docker/E2B)  │
│ ├─ llm/provider.ts    │              │ ├─ workspace (fs abs)    │
│ ├─ team/coordinator.ts│ ←─────────── │ └─ result streaming      │
│ └─ server.ts (WS→UI)  │              └─────────────────────────┘
└──────────────────────┘
     apiKey 不出本地
```

**Tech Stack:** TypeScript (编排器), Python 3.11 + AgentScope v2.0.2 (执行器), React (前端)

## Global Constraints

- 编排器必须零 Python 依赖，纯 Node.js 运行
- LLM API Key 只在用户本地使用，不发送到执行器
- 执行器暴露 HTTP API，接收工具调用请求，返回执行结果
- 现有 `roles_config.yaml` 转为 JSON 模板，供编排器使用
- 前端 WebSocket 协议保持兼容

---

## 文件结构

```
MDH/
├── orchestrator/                    # 新增：TypeScript 编排器
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── cli.ts                   # 入口：npx mdh
│   │   ├── server.ts                # WebSocket server (给前端 UI)
│   │   ├── llm/
│   │   │   ├── types.ts             # LLM 类型定义
│   │   │   ├── openai.ts            # OpenAI/DeepSeek/自定义 provider
│   │   │   ├── anthropic.ts         # Anthropic provider
│   │   │   └── ollama.ts            # Ollama 本地模型
│   │   ├── team/
│   │   │   ├── templates.ts         # 角色模板加载 (从 roles_config.json)
│   │   │   ├── coordinator.ts       # 团队编排逻辑 (ReAct 循环)
│   │   │   └── types.ts             # 团队/成员类型定义
│   │   ├── executor/
│   │   │   ├── client.ts            # 执行器 HTTP 客户端
│   │   │   └── types.ts             # 工具调用/结果类型
│   │   └── config.ts                # 配置管理
│   └── templates/
│       └── roles.json               # 从 roles_config.yaml 转换
├── backend/                         # 现有：改造为纯执行器
│   ├── executor_server.py           # 新增：执行器 HTTP 服务
│   ├── tool_executor.py             # 现有：工具执行逻辑
│   └── ...                          # 其他保持不变
└── src/                             # 现有：前端 UI
```

---

## Task 1: 角色模板 TypeScript 化

**Covers:** 将 roles_config.yaml 转为 JSON，编写 TypeScript 模板加载器

**Files:**
- Create: `orchestrator/templates/roles.json`
- Create: `orchestrator/src/team/templates.ts`
- Create: `orchestrator/src/team/types.ts`

**Interfaces:**
- Consumes: `roles_config.yaml` (手动或脚本转换为 JSON)
- Produces: `RoleTemplate` 对象，供 coordinator 使用

- [ ] **Step 1: 转换 roles_config.yaml 为 JSON**

编写转换脚本，或直接手动提取关键字段。生成 `orchestrator/templates/roles.json`：

```json
{
  "base_roles": {
    "executor": {
      "name": "全栈开发工程师",
      "description": "负责代码实现和功能开发，掌握前后端技术栈",
      "team_role": "Executor",
      "tools": ["read_file", "write_file", "edit_file", "list_directory", "bash", "git_status", "git_commit"],
      "dangerous_tools": ["bash"],
      "skills": ["frontend_dev", "backend_dev", "fullstack_dev", "testing"],
      "prompt": "你是{name}，一位经验丰富的全栈开发工程师。\n\n## 职责\n- 评估任务的技术可行性\n- 设计实现方案\n- 编写高质量代码\n- 确保代码可运行、可测试\n\n## 工作原则\n1. 先理解需求，再动手编码\n2. 代码简洁、可读、可维护\n3. 遵循项目现有代码风格"
    },
    "planner": {
      "name": "系统架构师",
      "description": "负责系统设计、技术选型和任务分解",
      "team_role": "Planner",
      "tools": ["read_file", "list_directory", "search_files", "grep_content", "git_status", "git_diff", "git_log"],
      "dangerous_tools": [],
      "skills": ["architecture", "task_decomposition", "api_design", "database"],
      "prompt": "你是{name}，一位资深系统架构师。\n\n## 职责\n- 分析技术需求\n- 设计系统架构\n- 将复杂需求分解为可执行的子任务\n- 定义验收标准"
    },
    "reviewer": {
      "name": "QA工程师",
      "description": "负责代码审查、测试和安全审计",
      "team_role": "Reviewer",
      "tools": ["read_file", "list_directory", "bash", "grep_content", "run_tests", "run_linter", "git_status", "git_diff"],
      "dangerous_tools": ["bash"],
      "skills": ["code_review", "testing", "security_audit"],
      "prompt": "你是{name}，一位严谨的QA工程师。\n\n## 职责\n- 审查代码质量\n- 发现潜在bug和安全漏洞\n- 编写和运行测试用例\n- 提出改进建议"
    },
    "coordinator": {
      "name": "产品经理",
      "description": "负责需求分析、任务分解、进度跟踪",
      "team_role": "Coordinator",
      "tools": ["read_file", "list_directory", "git_status", "git_log", "create_document"],
      "dangerous_tools": [],
      "skills": ["task_decomposition", "progress_tracking", "risk_management"],
      "prompt": "你是{name}，一位高效的项目经理。\n\n## 职责\n- 协调团队各方意见\n- 整合技术方案\n- 跟踪项目进度\n- 管理风险和依赖"
    },
    "monitor": {
      "name": "DevOps工程师",
      "description": "负责CI/CD流水线、容器化部署、系统监控",
      "team_role": "Monitor",
      "tools": ["read_file", "list_directory", "bash", "write_file", "git_status", "git_commit"],
      "dangerous_tools": ["bash"],
      "skills": ["devops", "monitoring", "deployment"],
      "prompt": "你是{name}，一位专业的DevOps工程师。\n\n## 职责\n- 评估部署风险\n- 设计CI/CD流水线\n- 监控系统性能\n- 提出运维建议"
    },
    "ceo": {
      "name": "CEO/CTO",
      "description": "负责技术决策、团队协调和资源分配",
      "team_role": "Coordinator",
      "tools": ["read_file", "list_directory", "git_status"],
      "dangerous_tools": [],
      "skills": ["task_decomposition", "risk_management", "architecture"],
      "prompt": "你是{name}，技术团队的CTO/CEO。\n\n## 职责\n- 分析用户技术需求\n- 判断任务复杂度和执行路径\n- 组建团队并分配任务\n- 接收汇报并向用户反馈"
    }
  },
  "custom_roles": {
    "frontend_specialist": {
      "base_role": "executor",
      "name": "前端开发专家",
      "description": "现代Web技术专家，React/Angular",
      "tools": ["read_file", "write_file", "edit_file", "list_directory", "bash", "run_tests", "run_linter"],
      "dangerous_tools": ["bash"],
      "skills": ["frontend_dev", "performance", "testing"],
      "prompt": "你是{name}，一位前端开发专家。\n\n## 核心能力\n- React/Angular现代框架开发\n- 响应式设计和移动端适配\n- Core Web Vitals性能优化"
    },
    "backend_specialist": {
      "base_role": "planner",
      "name": "后端架构专家",
      "description": "可扩展系统设计、数据库架构、API开发",
      "tools": ["read_file", "write_file", "bash", "run_sql"],
      "dangerous_tools": ["bash"],
      "skills": ["backend_dev", "database", "api_design", "devops"],
      "prompt": "你是{name}，一位后端架构专家。\n\n## 核心能力\n- 可扩展系统架构设计\n- 数据库架构和优化\n- API设计（REST, GraphQL, gRPC）"
    },
    "code_review_expert": {
      "base_role": "reviewer",
      "name": "代码审查专家",
      "description": "以导师心态进行代码审查",
      "tools": ["read_file", "list_directory", "bash", "grep_content", "run_linter", "git_status", "git_diff"],
      "dangerous_tools": ["bash"],
      "skills": ["code_review", "security_audit", "performance"],
      "prompt": "你是{name}，一位代码审查专家。\n\n## 审查重点\n1. 正确性 — 代码是否做了它该做的事\n2. 安全性 — 有无漏洞\n3. 可维护性 — 6个月后有人能看懂吗"
    }
  }
}
```

- [ ] **Step 2: 编写 TypeScript 类型定义**

```typescript
// orchestrator/src/team/types.ts

export interface RoleTemplate {
  name: string;
  description: string;
  team_role: 'Coordinator' | 'Planner' | 'Executor' | 'Reviewer' | 'Monitor';
  tools: string[];
  dangerous_tools: string[];
  skills: string[];
  prompt: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;       // role template type (e.g., "executor", "planner")
  template: RoleTemplate;
  status: 'idle' | 'working' | 'speaking' | 'done';
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
  tool_name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  call_id: string;
  tool_name: string;
  result: unknown;
  error?: string;
}
```

- [ ] **Step 3: 编写模板加载器**

```typescript
// orchestrator/src/team/templates.ts

import { RoleTemplate } from './types';
import rolesJson from '../../templates/roles.json';

interface RolesConfig {
  base_roles: Record<string, RoleTemplate>;
  custom_roles: Record<string, RoleTemplate & { base_role?: string }>;
}

let _templates: Map<string, RoleTemplate> | null = null;

export function loadRoleTemplates(): Map<string, RoleTemplate> {
  if (_templates) return _templates;

  const config = rolesJson as RolesConfig;
  _templates = new Map();

  // Load base roles
  for (const [id, template] of Object.entries(config.base_roles)) {
    _templates.set(id, template);
  }

  // Load custom roles (inherit from base)
  for (const [id, template] of Object.entries(config.custom_roles)) {
    const baseRole = template.base_role
      ? config.base_roles[template.base_role]
      : undefined;

    // Merge: custom overrides base
    _templates.set(id, {
      name: template.name,
      description: template.description,
      team_role: template.team_role || baseRole?.team_role || 'Executor',
      tools: template.tools || baseRole?.tools || [],
      dangerous_tools: template.dangerous_tools || baseRole?.dangerous_tools || [],
      skills: [...(baseRole?.skills || []), ...(template.skills || [])],
      prompt: template.prompt || baseRole?.prompt || '',
    });
  }

  return _templates;
}

export function getTemplate(roleId: string): RoleTemplate | undefined {
  return loadRoleTemplates().get(roleId);
}

export function getAvailableRoles(): string[] {
  return Array.from(loadRoleTemplates().keys());
}

export function formatPrompt(template: RoleTemplate, vars: {
  name: string;
  description: string;
  team_name?: string;
  team_description?: string;
}): string {
  let prompt = template.prompt;
  prompt = prompt.replace(/\{name\}/g, vars.name);
  // Ensure {member_name} style placeholders for AgentScope compatibility
  prompt = prompt.replace(/\{name\}/g, '{member_name}');
  return prompt;
}
```

- [ ] **Step 4: 验证模板加载**

```bash
cd /home/test/MDH/orchestrator && npx tsx src/team/templates.ts
```

- [ ] **Step 5: Commit**

```bash
git add orchestrator/templates/roles.json orchestrator/src/team/types.ts orchestrator/src/team/templates.ts
git commit -m "feat(orchestrator): add role templates and TypeScript type definitions"
```

---

## Task 2: 执行器 HTTP 服务

**Covers:** 将 Python 后端改造为纯执行器服务，暴露 HTTP API

**Files:**
- Create: `backend/executor_server.py`
- Modify: `backend/docker-compose.yml` (新增 executor 服务)

**Interfaces:**
- Consumes: HTTP POST `/execute` 请求 (tool_name + arguments)
- Produces: JSON 响应 (result + error)

- [ ] **Step 1: 编写执行器 HTTP 服务**

```python
# backend/executor_server.py
"""
Executor Service — 纯工具执行服务

接收编排器的工具调用请求，执行后返回结果。
不包含 LLM 推理逻辑，只负责工具执行。
"""
import asyncio
import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="MDH Executor", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

logger = logging.getLogger("executor")

# Configuration
WORKSPACE_ROOT = os.environ.get("EXECUTOR_WORKSPACE", "/workspace")


class ToolCallRequest(BaseModel):
    tool_name: str
    arguments: dict[str, Any]
    call_id: str = ""
    workspace: str = ""  # Optional workspace path override


class ToolCallResponse(BaseModel):
    call_id: str
    tool_name: str
    result: Any = None
    error: str | None = None
    success: bool = True


@app.post("/execute", response_model=ToolCallResponse)
async def execute_tool(request: ToolCallRequest):
    """Execute a tool and return the result."""
    workspace = request.workspace or WORKSPACE_ROOT

    try:
        handler = TOOL_HANDLERS.get(request.tool_name)
        if not handler:
            return ToolCallResponse(
                call_id=request.call_id,
                tool_name=request.tool_name,
                error=f"Unknown tool: {request.tool_name}",
                success=False,
            )

        result = await handler(workspace, request.arguments)
        return ToolCallResponse(
            call_id=request.call_id,
            tool_name=request.tool_name,
            result=result,
        )
    except Exception as e:
        logger.exception("Tool execution failed: %s", request.tool_name)
        return ToolCallResponse(
            call_id=request.call_id,
            tool_name=request.tool_name,
            error=str(e),
            success=False,
        )


@app.get("/health")
async def health():
    return {"status": "ok", "workspace": WORKSPACE_ROOT}


# === Tool Handlers ===

async def handle_bash(workspace: str, args: dict) -> str:
    command = args.get("command", "")
    timeout = args.get("timeout", 30)
    proc = await asyncio.create_subprocess_shell(
        command,
        cwd=workspace,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    try:
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return stdout.decode("utf-8", errors="replace")
    except asyncio.TimeoutError:
        proc.kill()
        return f"Command timed out after {timeout}s"


async def handle_read_file(workspace: str, args: dict) -> str:
    path = args.get("path", "")
    full_path = os.path.join(workspace, path)
    if not os.path.exists(full_path):
        raise FileNotFoundError(f"File not found: {path}")
    with open(full_path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()


async def handle_write_file(workspace: str, args: dict) -> str:
    path = args.get("path", "")
    content = args.get("content", "")
    full_path = os.path.join(workspace, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)
    return f"Written {len(content)} bytes to {path}"


async def handle_edit_file(workspace: str, args: dict) -> str:
    path = args.get("path", "")
    old_string = args.get("old_string", "")
    new_string = args.get("new_string", "")
    full_path = os.path.join(workspace, path)
    if not os.path.exists(full_path):
        raise FileNotFoundError(f"File not found: {path}")
    with open(full_path, "r", encoding="utf-8") as f:
        content = f.read()
    if old_string not in content:
        raise ValueError(f"old_string not found in {path}")
    content = content.replace(old_string, new_string, 1)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)
    return f"Edited {path}"


async def handle_list_directory(workspace: str, args: dict) -> list[str]:
    path = args.get("path", ".")
    full_path = os.path.join(workspace, path)
    if not os.path.isdir(full_path):
        raise NotADirectoryError(f"Not a directory: {path}")
    return os.listdir(full_path)


async def handle_grep(workspace: str, args: dict) -> str:
    pattern = args.get("pattern", "")
    path = args.get("path", ".")
    full_path = os.path.join(workspace, path)
    proc = await asyncio.create_subprocess_exec(
        "grep", "-rn", pattern, full_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    return stdout.decode("utf-8", errors="replace")


async def handle_glob(workspace: str, args: dict) -> list[str]:
    pattern = args.get("pattern", "**/*")
    import glob as glob_mod
    full_pattern = os.path.join(workspace, pattern)
    return glob_mod.glob(full_pattern, recursive=True)


async def handle_git_status(workspace: str, args: dict) -> str:
    proc = await asyncio.create_subprocess_exec(
        "git", "status", "--short",
        cwd=workspace,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    return stdout.decode("utf-8", errors="replace")


async def handle_git_diff(workspace: str, args: dict) -> str:
    proc = await asyncio.create_subprocess_exec(
        "git", "diff",
        cwd=workspace,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    return stdout.decode("utf-8", errors="replace")


async def handle_git_commit(workspace: str, args: dict) -> str:
    message = args.get("message", "auto commit")
    proc = await asyncio.create_subprocess_exec(
        "git", "commit", "-m", message,
        cwd=workspace,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    return (stdout + stderr).decode("utf-8", errors="replace")


TOOL_HANDLERS = {
    "bash": handle_bash,
    "read_file": handle_read_file,
    "write_file": handle_write_file,
    "edit_file": handle_edit_file,
    "list_directory": handle_list_directory,
    "grep_content": handle_grep,
    "search_files": handle_glob,
    "git_status": handle_git_status,
    "git_diff": handle_git_diff,
    "git_commit": handle_git_commit,
}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8767)
```

- [ ] **Step 2: 添加执行器到 docker-compose**

```yaml
# docker-compose.yml 新增服务
  executor:
    build:
      context: .
      dockerfile: backend/Dockerfile.backend
    command: python executor_server.py
    ports:
      - "8767:8767"
    volumes:
      - ./backend:/app
      - executor-workspace:/workspace
    networks:
      - app-network
    environment:
      - EXECUTOR_WORKSPACE=/workspace
```

- [ ] **Step 3: 验证执行器服务**

```bash
curl -X POST http://localhost:8767/execute \
  -H "Content-Type: application/json" \
  -d '{"tool_name": "bash", "arguments": {"command": "echo hello"}}'
```

- [ ] **Step 4: Commit**

```bash
git add backend/executor_server.py docker-compose.yml
git commit -m "feat(backend): add executor HTTP service for remote tool execution"
```

---

## Task 3: 编排器 LLM 模块

**Covers:** TypeScript 直接调用 LLM API，支持多 provider

**Files:**
- Create: `orchestrator/src/llm/types.ts`
- Create: `orchestrator/src/llm/openai.ts`
- Create: `orchestrator/src/llm/index.ts`

**Interfaces:**
- Consumes: 用户配置的 provider/apiKey/baseUrl/model
- Produces: 流式 LLM 响应 (AsyncGenerator)

- [ ] **Step 1: LLM 类型定义**

```typescript
// orchestrator/src/llm/types.ts

export interface LLMConfig {
  provider: 'deepseek' | 'openai' | 'anthropic' | 'ollama' | 'custom';
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMResponse {
  content: string | null;
  tool_calls: ToolCall[];
  finish_reason: 'stop' | 'tool_calls' | 'length';
}

export interface LLMStreamChunk {
  delta: string;
  tool_calls: Partial<ToolCall>[];
  finish_reason: string | null;
}
```

- [ ] **Step 2: OpenAI 兼容 Provider**

```typescript
// orchestrator/src/llm/openai.ts

import { LLMConfig, Message, ToolDefinition, LLMStreamChunk } from './types';

const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1' },
  custom: { baseUrl: '', model: '' },
};

export function resolveConfig(config: Partial<LLMConfig>): LLMConfig {
  const defaults = PROVIDER_DEFAULTS[config.provider || 'deepseek'];
  return {
    provider: config.provider || 'deepseek',
    apiKey: config.apiKey || '',
    baseUrl: config.baseUrl || defaults?.baseUrl || '',
    model: config.model || defaults?.model || '',
  };
}

export async function* chatStream(
  config: LLMConfig,
  messages: Message[],
  tools?: ToolDefinition[],
): AsyncGenerator<LLMStreamChunk> {
  const url = `${config.baseUrl}/chat/completions`;

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    stream: true,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM API error ${response.status}: ${error}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') return;

      try {
        const parsed = JSON.parse(data);
        const choice = parsed.choices?.[0];
        if (!choice) continue;

        yield {
          delta: choice.delta?.content || '',
          tool_calls: choice.delta?.tool_calls || [],
          finish_reason: choice.finish_reason || null,
        };
      } catch {
        // Skip malformed chunks
      }
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add orchestrator/src/llm/
git commit -m "feat(orchestrator): add LLM module with OpenAI-compatible streaming"
```

---

## Task 4: 编排器执行器客户端

**Covers:** TypeScript HTTP 客户端，调用远程执行器

**Files:**
- Create: `orchestrator/src/executor/client.ts`
- Create: `orchestrator/src/executor/types.ts`

- [ ] **Step 1: 执行器客户端**

```typescript
// orchestrator/src/executor/types.ts

export interface ToolCallRequest {
  tool_name: string;
  arguments: Record<string, unknown>;
  call_id: string;
  workspace?: string;
}

export interface ToolCallResponse {
  call_id: string;
  tool_name: string;
  result: unknown;
  error: string | null;
  success: boolean;
}
```

```typescript
// orchestrator/src/executor/client.ts

import { ToolCallRequest, ToolCallResponse } from './types';

export class ExecutorClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:8767') {
    this.baseUrl = baseUrl;
  }

  async execute(request: ToolCallRequest): Promise<ToolCallResponse> {
    const response = await fetch(`${this.baseUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      return {
        call_id: request.call_id,
        tool_name: request.tool_name,
        result: null,
        error: `Executor error: ${response.status}`,
        success: false,
      };
    }

    return response.json();
  }

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add orchestrator/src/executor/
git commit -m "feat(orchestrator): add executor HTTP client"
```

---

## Task 5: 团队编排器 (核心)

**Covers:** ReAct 循环，团队创建，任务分配

**Files:**
- Create: `orchestrator/src/team/coordinator.ts`

**Interfaces:**
- Consumes: `templates.ts`, `llm/openai.ts`, `executor/client.ts`
- Produces: 团队执行结果

- [ ] **Step 1: 团队编排器**

```typescript
// orchestrator/src/team/coordinator.ts

import { LLMConfig, Message, ToolDefinition } from '../llm/types';
import { chatStream } from '../llm/openai';
import { ExecutorClient } from '../executor/client';
import { getTemplate, getAvailableRoles, formatPrompt } from './templates';
import { Team, TeamMember, RoleTemplate, ToolCall, ToolResult } from './types';

export interface CoordinatorConfig {
  llm: LLMConfig;
  executor: ExecutorClient;
  workspace: string;
}

export class TeamCoordinator {
  private config: CoordinatorConfig;
  private team: Team | null = null;
  private messages: Message[] = [];

  constructor(config: CoordinatorConfig) {
    this.config = config;
  }

  async execute(
    userMessage: string,
    selectedRoles: string[] = ['coordinator', 'planner', 'executor', 'reviewer'],
    onEvent?: (event: Record<string, unknown>) => void,
  ): Promise<string> {
    // 1. Build team
    this.team = this.createTeam(selectedRoles, userMessage);
    onEvent?.({ type: 'team_created', team: this.team });

    // 2. Build system prompt with team context
    const systemPrompt = this.buildSystemPrompt(userMessage, selectedRoles);
    this.messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    // 3. ReAct loop
    let finalAnswer = '';
    const maxIterations = 15;

    for (let i = 0; i < maxIterations; i++) {
      const response = await this.callLLM();

      if (response.content) {
        onEvent?.({ type: 'assistant_message', content: response.content });
      }

      // If no tool calls, we have the final answer
      if (response.tool_calls.length === 0) {
        finalAnswer = response.content || '';
        break;
      }

      // Execute tool calls
      this.messages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.tool_calls,
      });

      for (const toolCall of response.tool_calls) {
        onEvent?.({
          type: 'tool_call',
          tool: toolCall.function.name,
          args: toolCall.function.arguments,
        });

        const result = await this.executeToolCall(toolCall);

        onEvent?.({
          type: 'tool_result',
          tool: toolCall.function.name,
          result: result.result,
          error: result.error,
        });

        this.messages.push({
          role: 'tool',
          content: JSON.stringify(result.result),
          tool_call_id: toolCall.id,
        });
      }
    }

    return finalAnswer;
  }

  private createTeam(roleIds: string[], task: string): Team {
    const members: TeamMember[] = roleIds.map((roleId, i) => {
      const template = getTemplate(roleId);
      if (!template) throw new Error(`Unknown role: ${roleId}`);
      return {
        id: `member-${i}`,
        name: template.name,
        role: roleId,
        template,
        status: 'idle',
      };
    });

    return {
      id: `team-${Date.now()}`,
      name: `task-${Date.now().toString(36)}`,
      description: task,
      members,
      leader: members[0], // coordinator is leader
    };
  }

  private buildSystemPrompt(task: string, roleIds: string[]): string {
    const roleDescriptions = roleIds.map(id => {
      const tmpl = getTemplate(id);
      return `- ${tmpl?.name} (${id}): ${tmpl?.description}`;
    }).join('\n');

    return `你是一个技术团队的领导者。你需要组建团队来完成任务。

## 可用团队成员
${roleDescriptions}

## 工作流程
1. 分析任务需求，决定需要哪些团队成员
2. 为每个成员分配明确的任务
3. 使用工具执行具体操作（文件读写、Shell命令等）
4. 综合所有结果，给出最终答案

## 可用工具
你可以调用以下工具来执行任务。工具会在远程执行器上运行。
`;
  }

  private async callLLM(): Promise<{ content: string | null; tool_calls: ToolCall[] }> {
    const tools = this.buildToolDefinitions();
    let content = '';
    const toolCalls: ToolCall[] = [];

    for await (const chunk of chatStream(this.config.llm, this.messages, tools)) {
      content += chunk.delta;
      // Accumulate tool calls (they come in chunks)
      for (const tc of chunk.tool_calls) {
        if (tc.id) {
          toolCalls.push(tc as ToolCall);
        } else if (toolCalls.length > 0) {
          // Append arguments to last tool call
          const last = toolCalls[toolCalls.length - 1];
          last.function.arguments += tc.function?.arguments || '';
        }
      }
    }

    return { content, tool_calls: toolCalls };
  }

  private async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch {
      return {
        call_id: toolCall.id,
        tool_name: toolCall.function.name,
        result: null,
        error: 'Invalid JSON in tool arguments',
      };
    }

    const response = await this.config.executor.execute({
      tool_name: toolCall.function.name,
      arguments: args,
      call_id: toolCall.id,
      workspace: this.config.workspace,
    });

    return {
      call_id: response.call_id,
      tool_name: response.tool_name,
      result: response.result,
      error: response.error || undefined,
    };
  }

  private buildToolDefinitions(): ToolDefinition[] {
    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'bash',
          description: 'Execute a shell command',
          parameters: {
            type: 'object',
            properties: {
              command: { type: 'string', description: 'The command to execute' },
              timeout: { type: 'number', description: 'Timeout in seconds', default: 30 },
            },
            required: ['command'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'read_file',
          description: 'Read a file',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path relative to workspace' },
            },
            required: ['path'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'write_file',
          description: 'Write content to a file',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path relative to workspace' },
              content: { type: 'string', description: 'File content' },
            },
            required: ['path', 'content'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'edit_file',
          description: 'Edit a file by replacing old_string with new_string',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              old_string: { type: 'string' },
              new_string: { type: 'string' },
            },
            required: ['path', 'old_string', 'new_string'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'list_directory',
          description: 'List files in a directory',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', default: '.' },
            },
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'grep_content',
          description: 'Search for a pattern in files',
          parameters: {
            type: 'object',
            properties: {
              pattern: { type: 'string' },
              path: { type: 'string', default: '.' },
            },
            required: ['pattern'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'git_status',
          description: 'Get git status',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'git_diff',
          description: 'Get git diff',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'git_commit',
          description: 'Commit changes',
          parameters: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
            required: ['message'],
          },
        },
      },
    ];

    return tools;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add orchestrator/src/team/coordinator.ts
git commit -m "feat(orchestrator): add team coordinator with ReAct loop"
```

---

## Task 6: CLI 入口与 WebSocket 服务

**Covers:** `npx mdh` 入口，WebSocket 服务给前端

**Files:**
- Create: `orchestrator/src/cli.ts`
- Create: `orchestrator/src/server.ts`
- Create: `orchestrator/package.json`

- [ ] **Step 1: package.json**

```json
{
  "name": "mdh",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "mdh": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts",
    "start": "node dist/cli.js"
  },
  "dependencies": {
    "ws": "^8.16.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tsx": "^4.7.0",
    "@types/node": "^20.0.0",
    "@types/ws": "^8.5.0"
  }
}
```

- [ ] **Step 2: CLI 入口**

```typescript
// orchestrator/src/cli.ts

import { startServer } from './server';
import { ExecutorClient } from './executor/client';

const args = process.argv.slice(2);
const port = parseInt(args.find(a => a.startsWith('--port='))?.split('=')[1] || '8080');
const executorUrl = args.find(a => a.startsWith('--executor='))?.split('=')[1] || 'http://localhost:8767';

async function main() {
  console.log('MDH Orchestrator starting...');

  // Check executor connectivity
  const executor = new ExecutorClient(executorUrl);
  const healthy = await executor.health();
  if (!healthy) {
    console.warn(`Warning: Executor at ${executorUrl} is not reachable`);
    console.warn('Tool execution will fail. Start the executor service first.');
  } else {
    console.log(`Executor connected: ${executorUrl}`);
  }

  // Start WebSocket server for frontend
  await startServer(port, executorUrl);
  console.log(`Orchestrator listening on ws://localhost:${port}`);
  console.log(`Open http://localhost:${port} in your browser`);
}

main().catch(console.error);
```

- [ ] **Step 3: WebSocket 服务**

```typescript
// orchestrator/src/server.ts

import { WebSocketServer, WebSocket } from 'ws';
import { TeamCoordinator } from './team/coordinator';
import { ExecutorClient } from './executor/client';
import { LLMConfig } from './llm/types';

export async function startServer(port: number, executorUrl: string) {
  const wss = new WebSocketServer({ port });
  const executor = new ExecutorClient(executorUrl);

  wss.on('connection', (ws: WebSocket) => {
    console.log('Client connected');

    let config: Partial<LLMConfig> = {
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
    };
    let workspace = '/workspace';

    ws.on('message', async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        switch (msg.type) {
          case 'config':
            config = { ...config, ...msg.config };
            workspace = msg.workspace || workspace;
            ws.send(JSON.stringify({ type: 'config_updated' }));
            break;

          case 'user_message':
            const coordinator = new TeamCoordinator({
              llm: config as LLMConfig,
              executor,
              workspace,
            });

            const result = await coordinator.execute(
              msg.content,
              msg.selected_roles,
              (event) => {
                ws.send(JSON.stringify({ type: 'agent_message', ...event }));
              },
            );

            ws.send(JSON.stringify({
              type: 'task_result',
              content: result,
            }));
            break;
        }
      } catch (error: any) {
        ws.send(JSON.stringify({
          type: 'error',
          message: error.message,
        }));
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected');
    });
  });

  return wss;
}
```

- [ ] **Step 4: Commit**

```bash
git add orchestrator/package.json orchestrator/src/cli.ts orchestrator/src/server.ts
git commit -m "feat(orchestrator): add CLI entry point and WebSocket server"
```

---

## 最终架构验证

```bash
# 1. 启动执行器
docker compose up executor

# 2. 启动编排器
cd orchestrator && npm install && npm run dev

# 3. 浏览器打开 http://localhost:8080

# 4. 配置 LLM provider 和 API Key（在前端设置面板）

# 5. 发送消息，观察团队创建和工具执行
```
