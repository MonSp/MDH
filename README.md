# 大荒界 - Matrix DaHuang (MDH)

[![CI](https://github.com/MonSp/MDH/actions/workflows/ci.yml/badge.svg)](https://github.com/MonSp/MDH/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Backend Tests](https://img.shields.io/badge/backend-1585%20passed-brightgreen)]()
[![Frontend Tests](https://img.shields.io/badge/frontend-1726%20passed-brightgreen)]()
[![Test Coverage](https://img.shields.io/badge/test%20coverage-84%25-brightgreen)]()

**中文** | [English](README.en.md)

基于 React + Python FastAPI + AgentScope 的全领域智能体协作系统。多个 AI 智能体在虚拟办公室中协作，完成从需求分析到代码交付的完整流程。

## 核心能力

| 能力 | 说明 |
|---|---|
| 🏢 虚拟办公室 | 3D 科技大厦可视化场景，实时展示智能体状态 |
| 👥 多角色团队 | CEO、架构师、开发、QA、DevOps、项目经理 6 个核心角色 + 20+ 扩展角色 |
| 🎯 智能任务分配 | CEO 分析需求 → 讨论 → 投票 → 分派 → 执行 → 审查 |
| 🔧 18 种工具 | 文件、Git、搜索、测试、文档、Web 等 |
| 🤖 TS-Python 桥接 | 前端自定义智能体与后端 AgentScope 智能体互通 |
| 🖥️ 本地/远端混合执行 | 每个智能体可独立选择在用户浏览器本地(Node.js)或远端(Python Executor)执行工具 |
| 🗳️ 投票决策 | 提案 → 投票 → 共识评估（支持多种策略） |
| ✅ 人工审批 | 高危操作的人工审批流程（含 DAG 节点把关门禁） |
| 📸 检查点 | 任务执行状态的保存与恢复 |
| 📝 审计日志 | 操作审计追踪 |
| ⚙️ 工作流引擎 | DAG 工作流（顺序/并行/混合三策略）+ REST API 生命周期管理 |
| 🧠 技能进化 | 项目执行积累经验，生成可复用技能包（随用随进化） |
| 📦 资产沉淀 | 产出物入库 + 模板固化（员工审批把关）+ 经验提炼为技能规则，团队级隔离 |
| 🔍 资产复用注入 | DAG 节点执行时自动注入团队资产参考（模板/知识/技能规则，渐进披露） |
| 🧪 LLM 评测把关 | 模板/产出物经确定性检查 + LLM judge 评测（fail-closed）+ 评测基准与 CI 门禁 |
| 📊 复用率可感知 | 注入计数指标（`/api/assets/reuse-metrics`）+ 前端资产浏览面板（`🧠 资产` 标签） |
| 📝 会议纪要全链路 | 意图识别文档模式 → 纪要 DAG 工作流（提取/起草/校对）→ 产出物落盘 + 邮件分发 |
| 📈 规则有效性追踪 | 注入规则自动追踪任务成功率，低分规则自动降级退回审核 |
| 🚀 数字员工职业发展 | AgentProfile 持久档案 + XP 系统 + 42 个技能树 + 10 部门职业路径 + 自动晋升 |
| 🤝 跨团队技能共享 | 质量门禁（score ≥ 0.6 + usage ≥ 2）+ 审批流 + 共享经验池 |
| 🧭 路由感知技能等级 | DynamicRouter 五维加权路由，agent 技能等级影响部门选择和任务分配 |
| 🎯 晋升驱动任务分配 | 简单任务优先初级 agent（积累 XP），复杂任务优先高级 agent（能力匹配） |
| 🧠 Agent 持久记忆 | 跨项目个人记忆 + 自动摘要 + 记忆注入 + 老化机制 |
| 📄 文档感知协作 | 20+ 种文件格式解析 + 上下文注入 + 数据集分析 |
| 🔍 主动式监控 | 健康巡检 + 风险预警 + 告警分级 + 反思优先级 |
| 🤝 团队协同优化 | 协同分析 + 瓶颈识别 + 最优搭配推荐 |

## MDH 是什么

MDH 是一个**数字员工操作系统**。它不是又一个 AI 聊天工具，而是一个让 AI agent 像真正的员工一样工作、学习、成长的协作平台。

在 MDH 里，数字员工是一个团队：CEO 分析需求、架构师设计方案、开发写代码、QA 审查质量、项目经理协调进度。它们在 3D 虚拟办公室里开会、讨论、投票、执行任务——就像一个真实的企业。

### 它们会积累经验

每次任务执行的产出物自动入库为资产。团队讨论中提炼的经验被写成技能规则。下一次执行同类任务时，系统自动检索最相关的经验注入到上下文里——踩过的坑不会再踩。

### 它们会自我净化

不是所有经验都是好经验。每条规则都有有效性评分：注入后任务成功 +1，失败 -1。连续使用 3 次以上、成功率低于 40% 的规则自动降级退回审核队列。坏经验被淘汰，好经验留下来并通过质量门禁跨团队共享。

数字员工有了「免疫系统」。

### 它们有职业发展

42 个技能组成依赖树，覆盖工程、设计、内容、数据、管理五大类别。每个数字员工有跨项目持久化的职业档案，完成任务获得经验值，技能从初级升到中级再到高级。

10 个部门各有独立的晋升标准——研发部看 `backend_dev` 和 `testing`，视频部看 `video_editing`，数据部看 `data_analysis`。满足条件自动晋升，高级员工做简单任务时 XP 衰减——必须承担真正有挑战的工作才能成长。

### 核心闭环

```
任务 → 执行 → 产出资产 → 提炼经验 → 技能进化 → 下一次任务更高效
```

这个闭环让数字员工从「一次性工具」变成「持续进化的同事」。它们有自己的记忆、经验、技能树、职业路径，并且在每一次任务中变得更强。

### 进化是自驱动的

规则不只是被动降级——低分规则自动生成改进版（自进化），改进后的规则联动更新关联的技能包和资产（联动进化）。系统自动识别最需要反思的知识领域（反思优先级），并防止进化过拟合：同一领域进化过多会被限制，长期未用的规则自动降权，20% 的时间用于探索未知领域。

高质量经验通过质量门禁跨团队共享，低信任团队的经验被信任评分机制过滤（多团队进化联邦）。系统知道自己的能力边界——哪些领域高置信、哪些领域是盲区（能力边界感知），在不擅长的领域主动寻求外部帮助。

人的反馈不是「看过就忘」——结构化的审查意见自动转化为经验规则，直接影响数字员工的下一次表现。人指定的技能发展方向会影响任务分配和 XP 分配（人机协作反馈回路）。

### 它们有记忆和协作

每个数字员工有跨项目持久化的个人记忆，完成任务后自动提取关键信息写入记忆，下次执行同类任务时自动检索相关经验。10 个部门的数字员工有独立的晋升路径，从初级工程师到技术负责人。团队协同系统自动分析 agent 组合效率，推荐最优搭配。

数字员工能主动监控自身健康——发现弱项技能自动预警，检测领域规则有效性下降自动告警。人可以通过内联反馈直接参与 agent 的成长，反馈自动转化为经验规则。

## 快速开始

### 1. 前端

```bash
npm install
npm run dev
```

访问 `http://localhost:5173`

### 2. 后端

```bash
# 安装依赖
pip install -r backend/requirements.txt

# 配置 API Key
cp .env.example .env
# 编辑 .env 填入 DEEPSEEK_API_KEY

# 启动
python backend/server.py
```

后端运行在 `ws://localhost:8765/ws`

### 3. Docker 部署

```bash
docker compose up -d
```

## 项目结构

```
├── src/                          # React + TypeScript 前端
│   ├── components/
│   │   ├── techtower/            # 3D 科技大厦
│   │   ├── office-team/          # 办公团队面板
│   │   │   ├── VotingPanel.tsx   # 投票面板
│   │   │   ├── ApprovalPanel.tsx # 审批面板
│   │   │   ├── CeoChatPanel.tsx  # CEO 对话 + Per-Agent Location 选择
│   │   │   └── ...
│   │   ├── skill-evolution/      # 技能进化
│   │   │       AgentProfilePanel/CareerPathPanel/SkillTreeView # 职业发展面板
│   │   └── cyberpunk/            # 赛博朋克视觉效果
│   ├── hooks/
│   │   ├── useMeetingSocket.ts   # WebSocket 会议通信
│   │   ├── useAgentSystem.ts     # TS 智能体系统（含 bridge）
│   │   └── useApproval.ts        # 审批队列
│   └── modules/                  # 45+ 核心模块
│       ├── webSocketBridge.ts    # TS-Python 桥接
│       ├── agentCoordinator.ts   # 智能体协调器
│       └── ...
├── backend/                      # Python 后端（端口 8765）
│   ├── server.py                 # FastAPI + WebSocket 服务
│   ├── meeting_coordinator.py    # 会议协调器（核心）
│   ├── ceo_agent.py              # CEO 智能体
│   ├── agent_bridge.py           # TS-Python 桥接
│   ├── roles_config.yaml         # 角色配置（25+ 角色 + 10 部门职业路径 + 42 技能树）
│   └── tests/                    # Python 测试（1585 tests）
├── orchestrator/                 # TS 编排器（用户本地 Node.js）
│   └── src/
│       ├── cli.ts                # CLI 入口
│       ├── server.ts             # HTTP + WebSocket 服务
│       ├── team/                 # 团队管理
│       ├── llm/                  # LLM 集成
│       ├── toolkit/              # 工具包路由（local/remote/hybrid）
│       └── loop/                 # 循环执行引擎
├── loop-engineering/             # 循环工程优化（独立产品）
├── skill_packs/                  # 技能包（43 个）
├── protocol/                     # Bridge 协议文档
├── docs/                         # 文档
└── .env                          # 环境变量（API Key）
```

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite 6 + Three.js |
| 后端 | Python 3.11 + FastAPI + WebSocket |
| 编排器 | Node.js + TypeScript（用户本地运行） |
| AI | AgentScope + DeepSeek API |
| 工具 | 自研工具执行框架（支持本地/远端路由） |
| 测试 | Vitest (TS) + pytest (Python) |

## 系统架构

```
用户浏览器 (Chrome Side Panel)
┌─────────────────────────────────────────────────┐
│  React 前端 (端口 8080)                          │
│  3D 虚拟办公室 + WebSocket 客户端                │
└─────────────────────────────────────────────────┘
        │ WebSocket                    │ HTTP
        ▼                              ▼
┌───────────────────┐        ┌───────────────────┐
│  TS Orchestrator  │        │  Python Backend   │
│  (端口 8080)      │        │  (端口 8765)      │
│  - TeamCoordinator│        │  - CEO Agent      │
│  - LLM 调用       │        │  - 投票/审批      │
│  - 本地工具执行    │        │  - 技能进化       │
│  - 远端工具路由    │        │                   │
└────────┬──────────┘        └───────────────────┘
         │ HTTP POST /execute
         ▼
┌───────────────────┐
│  Python Executor  │
│  (端口 8767)      │
│  - 18 种内置工具  │
│  - 工作区隔离     │
└───────────────────┘
```

## Agent 工具系统

| 类别 | 工具 |
|---|---|
| 文件 | read_file, write_file, edit_file, list_directory |
| Git | git_status, git_commit, git_push, git_branch, git_diff, git_log |
| 搜索 | search_files, grep_content |
| 测试 | run_tests, run_linter |
| 文档 | create_document, edit_document |
| Web | web_fetch |

工具执行支持本地/远端路由：
- **本地执行**: Node.js child_process（适用于用户本地文件操作）
- **远端执行**: HTTP POST 到 Python Executor（适用于服务器端操作）
- **Per-Agent 选择**: 每个智能体可独立选择执行位置

详细文档：[docs/agent-tools.md](docs/agent-tools.md)

## 角色配置

角色配置在 `backend/roles_config.yaml`：

```yaml
base_roles:
  executor:
    name: "全栈开发工程师"
    permissions:
      tools: ["read_file", "write_file", "edit_file", "list_directory", "bash", "git_status", "git_commit"]
      dangerous_tools: ["bash"]
    skills: ["frontend_dev", "backend_dev", "fullstack_dev", "testing"]
    team_role: Executor
```

支持自定义角色和技能混搭：

```yaml
custom_roles:
  security_dev:
    base_role: executor
    extra_tools: ["grep_content", "run_linter"]
    extra_skills: ["security_audit"]
    name: "安全开发工程师"
```

可通过前端 `🗳️ 投票` 标签页的角色编辑器管理。

## 数字员工职业发展

每个数字员工有持久化的职业档案，跨项目积累经验：

| 能力 | 说明 |
|------|------|
| 🧬 技能树 | 42 个技能，5 类别（engineering/design/content/data/management），前置依赖链 |
| ⚡ XP 系统 | 任务成功 +XP，审查加成，XP 衰减防刷 |
| 🏢 部门职业路径 | 10 个部门独立晋升标准（研发/内容/演示/设计/数据/视频/AI影视/市场/销售/产品） |
| 🎖️ 自动晋升 | 满足技能条件后自动晋升（初级→中级→高级→Lead） |
| 📊 前端面板 | 部门卡片网格 + 晋升时间线 + 技能进度条 + 技能树可视化 |
| 🧭 路由感知 | agent 技能等级影响路由决策，升级驱动部门路由加成（正反馈循环） |

## 版本历史

完整变更记录见 [CHANGELOG.md](CHANGELOG.md)。

## WebSocket 消息协议

### 前端 → 后端

| 消息类型 | 说明 |
|---|---|
| `start_meeting` | 启动会议（含 provider/model/api_key/max_iterations） |
| `meeting_message` | 发送会议消息 |
| `task_assign` | 手动分派任务 |
| `end_meeting` | 结束会议 |
| `create_proposal` | 创建提案 |
| `cast_vote` | 投票 |
| `evaluate_consensus` | 评估共识 |
| `request_approval` | 请求人工审批 |
| `human_approval_response` | 审批响应 |
| `checkpoint_save` | 保存检查点 |
| `checkpoint_restore` | 恢复检查点 |
| `save_meeting_snapshot` | 保存会议快照 |
| `restore_meeting_snapshot` | 恢复会议快照 |
| `critical_blocker` | 报告关键阻塞 |
| `log_audit` | 记录审计日志 |
| `bridge_register_agent` | 注册 TS 智能体到 Python |
| `bridge_message` | TS↔Python 智能体消息 |
| `set_max_iterations` | 设置最大迭代轮次 |
| `adjust_agent_weight` | 调整智能体投票权重 |

### 后端 → 前端

| 消息类型 | 说明 |
|---|---|
| `meeting_started` | 会议已启动 |
| `meeting_ended` | 会议已结束 |
| `agent_message` | 智能体消息（含 delta 流式） |
| `task_assigned` | 任务已分派 |
| `task_auto_assigned` | 任务自动分派 |
| `agenda_update` | 议程状态更新 |
| `proposal` | 提案推送 |
| `vote` | 投票推送 |
| `vote_result` | 投票结果 |
| `human_approval_request` | 审批请求 |
| `checkpoint_saved` | 检查点已保存 |
| `checkpoint_restored` | 检查点已恢复 |
| `meeting_snapshot_saved` | 快照已保存 |
| `meeting_snapshot_restored` | 快照已恢复 |
| `critical_blocker` | 关键阻塞通知 |
| `audit_log` | 审计日志推送 |
| `bridge_agent_registered` | TS 智能体注册确认 |
| `bridge_message` | Python→TS 智能体消息 |

## REST API

### 工作流引擎

| 端点 | 说明 |
|---|---|
| `POST /api/workflow/create` | 创建工作流 |
| `POST /api/workflow/execute/{id}` | 执行工作流 |
| `POST /api/workflow/pause/{id}` | 暂停工作流 |
| `POST /api/workflow/resume/{id}` | 恢复工作流 |
| `POST /api/workflow/cancel/{id}` | 取消工作流 |
| `POST /api/workflow/retry/{id}/{nodeId}` | 重试节点 |
| `GET /api/workflow/status/{id}` | 获取状态 |
| `GET /api/workflow/visualization/{id}` | 获取可视化 |

### 角色管理

| 端点 | 说明 |
|---|---|
| `GET /api/roles/config` | 获取角色配置 |
| `GET /api/roles/{id}` | 获取单个角色 |
| `POST /api/roles/{id}` | 创建角色 |
| `PUT /api/roles/{id}` | 更新角色 |
| `DELETE /api/roles/{id}` | 删除角色 |

### 历史记录

| 端点 | 说明 |
|---|---|
| `GET /api/history/sessions` | 列出历史会话 |
| `GET /api/history/sessions/{id}/messages` | 获取历史消息 |

### 监控

| 端点 | 说明 |
|---|---|
| `GET /health` | 健康检查 |
| `GET /metrics` | Prometheus 指标 |

## 测试

```bash
# 前端测试 (1726 tests)
npx vitest run

# 后端测试 (1585 tests)
cd backend && python -m pytest tests/ --timeout=60

# Orchestrator 测试 (164 tests)
cd orchestrator && npm test

# LLM 评测基准 CI 门禁（无 key 时确定性自检）
python backend/asset_benchmark_gate.py
```

## 覆盖率

| 目录 | Stmts | Branch | Funcs |
|---|---|---|---|
| src/modules | 84.39% | 87.85% | 85.02% |
| src/hooks | 92.86% | 75.36% | 91.66% |

## 文档

- [变更日志](CHANGELOG.md)
- [Agent 角色配置](docs/agent-roles.md)
- [Agent 工具系统](docs/agent-tools.md)
- [设计文档](docs/design.md)
- [用户指南](docs/user-guide.md)
- [Docker 部署指南](DOCKER_README.md)
- [项目规则](project_rules.md)
- [评测基准 CI 门禁指南](docs/compose/plans/2026-08-15-hybrid-team-platform-benchmark-ci-guide.md)

## 许可证

[Apache License 2.0](LICENSE)
