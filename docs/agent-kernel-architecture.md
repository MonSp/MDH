# agent-kernel 架构：Python Agent 与 C++ 内核的集成

> 最后更新：2026-09-04 | 适用于 MDH-Company v0.2.0+

## 概述

MDH-Company 的 agent 体系由两层组成：

- **ChatAgent (Python)** — LLM 调用层，负责与 LLM API 交互生成文本
- **agent-kernel (C++ ECS daemon)** — 持久状态层，管理 agent 身份、技能、XP、职业、记忆

两层通过 Unix Socket IPC 松耦合集成，内核不可用时自动降级到纯 SQLite + LLM 模式。

## 分层架构

```
┌──────────────────────────────────────────────────────┐
│  ChatAgent (Python)                                  │
│  ─ LLMClient → DeepSeek / OpenAI / Anthropic / ...  │
│  ─ 纯文本流式对话 (reply / reply_stream)              │
│  ─ 无状态持久化，不依赖 agent-kernel                   │
│  ─ 文件: backend/chat_agent.py, backend/llm_client.py│
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  agent-kernel (C++17 ECS daemon)                     │
│  ─ 9 个 ECS 组件: Identity/Stats/Personality/Memory/ │
│    Lifecycle/Social/SkillTree/Career/Evolution        │
│  ─ 42 技能树 + 依赖关系 + 等级                         │
│  ─ L4 LLM 推理引擎 (agent_decide)                     │
│  ─ L5 Agent Tick 系统 (agent_tick / run_simulation)   │
│  ─ L6 EventJournal + AgentMailbox                     │
│  ─ IPC: Unix Socket + JSON (/tmp/agent-kernel.sock)   │
│  ─ 仓库: github.com/MonSp/agent-kernel                │
└──────────────────────────────────────────────────────┘
```

## 核心集成文件

| 文件 | 职责 |
|------|------|
| `backend/agent_kernel_client.py` | Python IPC 客户端，封装 Unix Socket JSON 协议，提供类型化方法 |
| `backend/kernel_integration.py` | 桥接层，管理 entity_id 映射，kernel-first + SQLite fallback 模式 |
| `backend/server.py` (L450-488) | 启动时自动连接/启动 daemon，注入到 router 和 WebSocket context |

## IPC 集成点（5 处）

### 1. 任务执行前 — agent_tick

**文件**: `backend/task_orchestrator.py:200-216`

任务执行前，先调用内核做一轮完整的 perceive → decide → execute 循环，将内核决策作为上下文注入 LLM prompt：

```python
# 阶段A0: Kernel agent tick
if self._kernel and self._kernel.is_available():
    tick_result = await asyncio.to_thread(
        self._kernel.agent_tick, task.agent_id, task.description
    )
    if tick_result:
        kernel_decision = tick_result.get("decision", {})
```

注入到 LLM prompt 的格式：

```
[内核决策建议] 行动: execute, 置信度: 70%
分析: 该任务属于后端开发范畴，与 agent 技能匹配度较高...
```

### 2. 任务复杂度分类 — agent_decide

**文件**: `backend/complexity_classifier.py:257-280`

三级分类策略：规则引擎 → agent-kernel → LLM fallback：

```python
# 2. agent-kernel 分类（主路径）
kernel_result = await self._kernel_classify(message)
# kernel_classify 内部调用:
decision = self._kernel.agent_decide("ceo-classifier", task)
```

内核 action 到复杂度的映射：`execute → simple`, `delegate/reflect/requestInfo → complex`

### 3. 会议规划 — agent_decide

**文件**: `backend/meeting_coordinator.py:506`

会议开始时，内核为 planner 角色做初步决策：

```python
decision = self._kernel.agent_decide("planner", prompt)
```

### 4. 任务分诊 — agent_decide

**文件**: `backend/coordinator_triage.py:101`

任务进入会议前，内核判断任务类型和处理路径：

```python
decision = kernel.agent_decide("planner", prompt)
```

### 5. 工作流预判 — agent_decide

**文件**: `backend/coordinator_workflow.py:80`

工作流执行前，内核预判执行策略：

```python
decision = kernel.agent_decide("executor", plan_prompt)
```

## 状态管理层 IPC（通过 routers/agents.py）

| 操作 | 方法 | 说明 |
|------|------|------|
| 读取 profile | `kernel.get_agent(agent_id)` | kernel-first，SQLite fallback |
| 读取技能树 | `kernel.get_skills(agent_id)` | 从内核 ECS SkillTree 组件读取 |
| 写入 XP | `kernel.grant_xp_via_kernel(agent_id, skill_id, xp)` | 先写内核，再写 SQLite |
| 职业 XP | `kernel.grant_career_xp_via_kernel(agent_id, xp)` | 职业晋升 XP |
| 列出所有 | `kernel.list_agents()` | 从内核获取全部 agent 状态 |
| 批量同步 | `kernel.sync_all_from_company(profiles)` | SQLite → 内核全量同步 |
| 内核状态 | `kernel.get_kernel_state()` | 序列化所有 agent 为 dict |

## IPC 协议

- **传输**: Unix Domain Socket (`/tmp/agent-kernel.sock`)
- **格式**: 换行分隔 JSON (newline-delimited JSON)
- **线程安全**: 内核端有 `std::mutex` 保护 EventJournal/AgentMailbox，IPC handler 串行化
- **超时**: Python 端使用 `asyncio.to_thread()` 包装阻塞 socket I/O

### 请求格式

```json
{"id": 1, "method": "createAgent", "params": {"name": "alice", "department": "Engineering"}}
```

### 响应格式

```json
{"id": 1, "result": {"entity_id": 0, "name": "alice", "department": "Engineering", ...}}
```

## 降级策略

```
kernel.is_available() == True
  → kernel-first 读写 + LLM prompt 注入内核决策

kernel.is_available() == False
  → SQLite 作为唯一状态存储
  → LLM 调用不注入内核上下文
  → 系统功能完全正常，只是缺少 ECS 状态和推理能力
```

启动时 `server.py` 会尝试：
1. 连接已有 daemon (`_ki.connect()`)
2. 如果失败，自动 spawn daemon binary (`agent-kernel/build/agent-kernel-daemon`)
3. 如果 binary 不存在，log warning，降级到 SQLite-only 模式

## ChatAgent 与 agent-kernel 的关系

**不是替代关系，是互补关系：**

| 维度 | ChatAgent | agent-kernel |
|------|-----------|--------------|
| 职责 | LLM API 调用、文本生成 | 状态持久化、ECS 推理、技能/XP 管理 |
| 技术 | Python + httpx | C++17 + Unix Socket |
| 状态 | 无状态（会话内 history） | 持久化（SQLite + ECS 组件） |
| LLM | 直接调 API 生成文本 | agent_decide 输出结构化 Decision |
| 可选性 | 必须（没有它无法调 LLM） | 可选（不可用时降级） |

典型任务执行流程：

```
1. kernel.agent_tick(entity_id, task)    ← IPC: 内核预判
2. 内核返回 Decision{action, reasoning, confidence}
3. [内核决策建议] 注入到 LLM prompt
4. ChatAgent.reply_stream(prompt)        ← HTTP: LLM API
5. LLM 生成代码/文本，流式返回前端
6. kernel.grant_xp(...)                  ← IPC: 更新 XP/技能
```

## agent-kernel ECS 组件

| 组件 | 字段 | 用途 |
|------|------|------|
| IdentityComponent | id, name, department, company_role | agent 身份 |
| StatsComponent | power, hp, mp, realm, xp | 数值属性 |
| PersonalityComponent | traits, values, communication_style | 性格特征 |
| MemoryComponent | short_term, mid_term, long_term | 三层记忆 |
| LifecycleComponent | state, created_at, last_active | 生命周期 |
| SocialComponent | energy, mood, hunger, fatigue | 社交/情绪 |
| SkillTreeComponent | skills (42个), dependencies, levels | 技能树 |
| CareerComponent | career_stage, total_xp, tasks_completed | 职业发展 |
| EvolutionComponent | evolution_history, rule_effectiveness | 进化历史 |

添加新组件需要修改 Registry.h 的 6 个位置（详见 agent-kernel 仓库文档）。
