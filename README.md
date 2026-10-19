# MDH 大荒界 — MDH-Company (数字员工操作系统)

[![CI](https://github.com/MonSp/MDH/actions/workflows/ci.yml/badge.svg)](https://github.com/MonSp/MDH/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Backend Tests](https://img.shields.io/badge/backend-2052%20passed-brightgreen)]()
[![Frontend Tests](https://img.shields.io/badge/frontend-1726%20passed-brightgreen)]()
[![Orchestrator Tests](https://img.shields.io/badge/orchestrator-216%20passed-brightgreen)]()

**中文** | [English](README.en.md)

## MDH 大荒界 · 智能体世界

MDH 大荒界是一个统一的智能体世界平台，包含两个产品：

- **MDH-Company** (本项目) — 数字员工操作系统。AI agent 团队协作执行任务，开放创造由 LLM 完成，成熟经验**固化为可执行程序**（下次免 LLM 直跑，LLM 只审阅结果并驱动程序迭代）。
- **MDH-Game** ([太古纪元：霸业](https://github.com/MonSp/MyGame)) — 2.5D 修仙 MMORPG。数字员工在虚拟世界中以 NPC 形式存在，保留全部技能、记忆和经验。

两个产品共享同一套 **C++ ECS 智能体内核** (agent-kernel)，agent 的身份、技能树、经验值、记忆在两个视角下是同一份数据。

## MDH 是什么

MDH 是一个**数字员工操作系统**。它不是又一个 AI 聊天工具，而是一个让 AI agent 像真正的员工一样工作、学习、成长的协作平台。

在 MDH 里，数字员工是一个团队：CEO 分析需求、架构师设计方案、开发写代码、QA 审查质量、项目经理协调进度。它们在 3D 虚拟办公室里开会、讨论、投票、执行任务——就像一个真实的企业。

### 核心闭环

```
LLM 开放创造 → 经验固化为程序包（自带测试）→ 测试门禁晋升 → 相似任务免 LLM 直跑
                      ↑                                              │
                      └──── LLM 审阅结果 → 意见驱动修订 → 再过门禁 ←──┘
```

这个闭环让数字员工从「一次性工具」变成「持续进化的能力资产」：重复性工作不再烧 token，创造性工作仍由 LLM 完成；跑通一次、审阅一次、固化一版，越用越快、越用越便宜。

### 它们会积累程序资产

LLM 在开放创造中跑通的任务被**沉淀为程序包**（确定性 Python + 自带验收测试）。相似任务优先由本地程序直接执行（`llm_calls=0`），结果经 LLM 审阅通过后交付；未命中或失效则自动回退 LLM 路径（宁重勿轻）。历史经验规则仍可只读检索作为上下文参考。

### 它们有质量门禁

程序包不是「LLM 说了算」：候选必须通过**测试门禁**（pytest 子进程 + 血缘审计，含防「改测试过关」的哈希比对）才能晋升为可路由版本。审阅 fail 的意见驱动 LLM 修订程序，再过门禁；连续 3 次失败自动降级、回退 LLM 路径，等待下一轮沉淀。存量规则的评分降级治理仍然保留。

数字员工有了「准入证 + 免死牌」。

### 它们有职业发展

42 个技能组成依赖树，覆盖工程、设计、内容、数据、管理五大类别。每个数字员工有跨项目持久化的职业档案，完成任务获得经验值，技能从初级升到中级再到高级。

10 个部门各有独立的晋升标准——研发部看 `backend_dev` 和 `testing`，视频部看 `video_editing`，数据部看 `data_analysis`。满足条件自动晋升，高级员工做简单任务时 XP 衰减——必须承担真正有挑战的工作才能成长。

### 进化是自驱动的

沉淀、晋升、审阅、修订全程无需人工值守：程序包由任务成功轨迹自动编译产生候选，测试门禁自动晋升，LLM 审阅意见自动驱动修订，失败自动回滚/降级。规则文本层的自进化、联动进化与共享池写入已随 program-pivot 迁移**下线**（存量规则保留只读检索与评分治理）。

系统知道自己的能力边界——哪些领域高置信、哪些是盲区（能力边界感知），在不擅长的领域主动寻求外部帮助；人指定的技能发展方向仍影响任务分配与 XP 分配（人机协作反馈回路，反馈存储保留）。

### 它们有记忆和协作

每个数字员工有跨项目持久化的个人记忆，完成任务后自动提取关键信息写入记忆，下次执行同类任务时自动检索相关经验。10 个部门的数字员工有独立的晋升路径，从初级工程师到技术负责人。团队协同系统自动分析 agent 组合效率，推荐最优搭配。

数字员工能主动监控自身健康——发现弱项技能自动预警，检测领域规则有效性下降自动告警。人可以通过内联反馈参与 agent 的成长（反馈存储与技能方向指导保留）。

---

## RSI 愿景：递归自我改进

MDH 正在探索 **RSI（Recursive Self-Improvement，递归自我改进）** 在智能体层面的可行性——不是让 AI 重写自己的代码，而是让 AI 系统持续优化自己的知识、策略和行为参数。

### 什么是 MDH 的 RSI

传统 AI 系统的能力在部署后是静态的。MDH 构建了一个**三层递归改进循环**：

```
第一层 · 程序沉淀闭环（program-pivot，已实网验证）
  LLM 开放创造跑通 → ProgramCompiler 沉淀 candidate → 测试门禁晋升
  → 相似任务免 LLM 直跑（实网：同会话二命 program 0.8s vs LLM 36s）
  → LLM 审阅 fail 驱动修订 / 回滚 / 三连败降级
  正反馈：命中越多成本越低 → 更多成功轨迹可沉淀 → 程序库越厚

第二层 · 存量规则只读治理（legacy）
  旧文本规则的写入/自进化/联动进化/共享池写路径已下线（M1–M4）
  存量规则保留只读检索、评分降级与重审批——作为程序未命中时的上下文

第三层 · 系统自调优（架构层 RSI 探索中）
  系统优化自己的运行参数——18 个调优参数（路由权重/探索率/降级阈值等）
  从 A/B 数据中找最优值 → 影子验证 → 受控部署 → 指标劣化自动回滚
  这是对「学习策略」的改进
```

### 已实现的 RSI 机制

| 机制 | 说明 |
|------|------|
| **程序沉淀闭环** | 任务成功 → 编译为程序包 → 测试门禁晋升 → 免 LLM 复跑 → LLM 审阅驱动修订 |
| **门禁血缘审计** | 晋升/回滚/修订全量 lineage，含防「改测试过关」哈希比对 |
| **抗过拟合** | 多样性检查 + 老化降权 + 20% 探索/利用平衡 |
| **存量规则治理** | 评分降级/重审批保留；新增规则路径已下线 |
| **A/B 度量** | 量化「有经验注入 vs 无经验注入」的成功率差异 |
| **质量分桶** | 按规则质量（low/medium/high）分析对成功率的影响 |
| **自调优引擎** | 参数注册表 + 离线优化器 + 影子验证 + 自动回滚 |
| **能力边界感知** | 系统知道自己「不知道什么」，低置信领域主动求助 |

### RSI 的边界

MDH 探索的是**知识层 RSI**——agent 越来越「有经验」，而非越来越「聪明」。推理能力的提升依赖底层 LLM 的进步，MDH 的价值在于让经验积累的循环真正转起来，并构建防止退化和失控的护栏。

> **核心问题**：如何让自我改进的循环真正转起来，而不是转着转着就退化或失控？MDH 用 2080 个测试和完整的度量体系回答这个问题。

---

## 30秒快速体验

```bash
# 1. 克隆并配置
git clone https://github.com/MonSp/MDH.git && cd MDH
cp .env.example .env
# 编辑 .env 填入 DEEPSEEK_API_KEY

# 2. Docker 一键启动
docker compose up -d

# 3. 打开浏览器
open http://localhost:8080

# 4. 在 CEO Chat 中输入你的第一个任务
# 例如: '分析当前项目的代码质量并给出改进建议'
```

首次访问自动进入交互式引导（API Key 配置 → 模型选择 → 3 个示例任务）。

---

## 核心能力

| 能力 | 说明 |
|---|---|
| 🏢 虚拟办公室 | 3D 科技大厦可视化场景，实时展示智能体状态 |
| 👥 多角色团队 | CEO、架构师、开发、QA、DevOps、项目经理 6 个核心角色 + 43 个角色（25 基础 + 18 自定义） |
| 🎯 智能任务分配 | CEO 分析需求 → 讨论 → 投票 → 分派 → 执行 → 审查 |
| 📋 任务模板库 | 10 个预置模板（代码审查/API 设计/测试/文档/Bug 修复/重构/数据库/部署/性能/安全审计）+ 自定义模板 CRUD |
| 🔧 18 种工具 | 文件、Git、搜索、测试、文档、Web 等 |
| 🤖 TS-Python 桥接 | 前端自定义智能体与后端 AgentScope 智能体互通 |
| 🖥️ 本地/远端混合执行 | 每个智能体可独立选择在用户浏览器本地(Node.js)或远端(Python Executor)执行工具 |
| 🔗 A2A 执行节点协议 | Agent-to-Agent 协议接入外部执行节点（TS Orchestrator、Claude Code 等），中心调度 + 分布式执行 |
| 🗳️ 投票决策 | 提案 → 投票 → 共识评估（支持多种策略） |
| ✅ 人工审批 | 高危操作的人工审批流程（含 DAG 节点把关门禁） |
| 📸 检查点 | 任务执行状态的保存与恢复 |
| 📝 审计日志 | 操作审计追踪 |
| ⚙️ 工作流引擎 | DAG 工作流（顺序/并行/混合三策略）+ REST API 生命周期管理 |
| 🧠 程序沉淀 | 成功任务轨迹编译为 ProgramPack（确定性 Python + 自带测试），相似任务免 LLM 直跑 |
| 🧬 LLM 审阅迭代 | 审阅只评结果不重做任务；fail 意见驱动修订 → 再过测试门禁 → 自动晋升或回滚 |
| 📦 资产沉淀 | 产出物入库 + 模板固化（员工审批把关），团队级隔离 |
| 🔍 资产复用注入 | DAG 节点执行时自动注入团队资产参考（模板/知识/技能规则，渐进披露） |
| 🧪 LLM 评测把关 | 模板/产出物经确定性检查 + LLM judge 评测（fail-closed）+ 评测基准与 CI 门禁 |
| 📊 复用率可感知 | 注入计数指标（`/api/assets/reuse-metrics`）+ 前端资产浏览面板（`🧠 资产` 标签） |
| 📈 存量规则治理 | 旧经验规则只读检索 + 评分降级/重审批保留；新增写入已随 program-pivot 下线 |
| 🚀 数字员工职业发展 | AgentProfile 持久档案 + XP 系统 + 42 个技能树 + 10 部门职业路径 + 自动晋升 |
| 🤝 跨团队技能共享 | 质量门禁（score ≥ 0.6 + usage ≥ 2）+ 审批流 + 共享经验池 |
| 🧭 路由感知技能等级 | DynamicRouter 六维加权路由（关键词/语义/成功率/优先级/技能等级/升级加成），agent 技能等级影响部门选择和任务分配 |
| 🎯 晋升驱动任务分配 | 简单任务优先初级 agent（积累 XP），复杂任务优先高级 agent（能力匹配） |
| 🧠 Agent 持久记忆 | 跨项目个人记忆 + 自动摘要 + 记忆注入 + 老化机制 |
| 📄 文档感知协作 | 19 种文件格式解析 + 上下文注入 + 数据集分析 |
| 🔍 主动式监控 | 健康巡检 + 风险预警 + 告警分级 + 反思优先级 |
| 🤝 团队协同优化 | 协同分析 + 瓶颈识别 + 最优搭配推荐 |
| 🔌 Webhook 集成 | 5 种事件通知外部系统 + HMAC 签名验证 + 投递日志 |
| 🤖 多模型支持 | DeepSeek/OpenAI/Anthropic/Gemini/Ollama 等 9 个提供商 + 模型路由 + 自动降级 |
| 🧩 程序库 | ProgramPack 状态机 + 测试门禁晋升 + LLM 审阅修订闭环（规则自进化/联动进化已下线） |
| 🎯 反思优先级队列 | 自动识别最需反思的知识领域（域名健康度 + 进化成功率排序） |
| 🛡️ 抗过拟合 | 同类进化过多自动限制 + 长期未用规则降权 + 20% 时间探索未知领域 |
| 🌐 多团队进化联邦 | 高质量经验跨团队共享（信任评分 + 质量门禁 + 智能订阅） |
| 🧭 能力边界感知 | 置信度地图标注高/中/低置信领域，未知领域自动寻求外部帮助 |
| 💬 人机协作反馈 | 反馈存储与技能方向指导保留（转规则路径已随 M4 下线） |
| 📊 进化可观测 | Prometheus 指标 + Grafana 仪表盘（后端健康/Agent 性能/LLM 成本/路由准确率）+ 7 条告警规则 |

---

## 快速开始

### 1. 前端

```bash
npm install --legacy-peer-deps
npm run dev
```

访问 `http://localhost:5173`

### 2. 后端

```bash
pip install -r backend/requirements.txt
cp .env.example .env  # 编辑填入 DEEPSEEK_API_KEY
python backend/server.py
```

后端运行在 `ws://localhost:8765/ws`

### 3. Docker 部署

```bash
docker compose up -d
# 前端: http://localhost:8080
# 后端: http://localhost:8765
# Prometheus: http://localhost:9092
# Grafana: http://localhost:3000 (admin/admin)
```

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite 6 + Three.js |
| 后端 | Python 3.11 + FastAPI + WebSocket |
| 编排器 | Node.js + TypeScript（用户本地运行） |
| AI | AgentScope + DeepSeek API（9 提供商） |
| 协议 | A2A (Agent-to-Agent) — 中心调度 + 分布式执行 |
| 存储 | SQLite（WAL 模式，并发安全） |
| 监控 | Prometheus + Grafana |
| 测试 | Vitest (TS) + pytest (Python) |

## 系统架构

```
用户浏览器
┌─────────────────────────────────────────────────┐
│  React 前端                                      │
│  3D 虚拟办公室 + WebSocket 客户端 + 进化面板     │
└────────────────────────┬────────────────────────┘
                         │ WebSocket + REST
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                  Python 后端（Agent OS 大脑）                  │
│                                                               │
│  CEO Agent │ 经验进化 │ 职业发展 │ 资产管理 │ A2A Task Router │
│  会议协调   │ 技能管理 │ 记忆系统 │ 监控告警 │ 状态同步管理器  │
│                                                               │
│  156 REST API + 40 WebSocket 消息类型                         │
└───────────────────────────┬──────────────────────────────────┘
                            │ A2A 协议 (HTTP/SSE)
               ┌────────────┼────────────┐
               ▼            ▼            ▼
      ┌──────────────┐ ┌──────────┐ ┌──────────┐
      │TS Orchestrator│ │Claude Code│ │ 其他     │
      │(A2A Server)  │ │ Adapter  │ │ Adapter  │
      │· 本地工具执行 │ │· CLI 包装 │ │          │
      │· 9 LLM 提供商│ │· 本地状态 │ │          │
      └──────┬───────┘ └──────────┘ └──────────┘
             │ HTTP POST
             ▼
      ┌──────────────┐
      │Python Executor│
      │  (端口 8767)  │
      │  远端工具执行  │
      └──────────────┘
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

## 生产就绪

| 能力 | 说明 |
|------|------|
| 💾 SQLite 存储 | 所有数据迁移到 SQLite（WAL 模式，并发安全） |
| 🔐 RBAC 权限 | API key 三级角色（admin/agent/viewer）+ 多租户隔离 |
| 🔒 安全加固 | 路径穿越防护 + SSRF 防护 + WS 输入校验 + HTTP 限流 |
| 📊 健康检查 | 数据库/磁盘/模块状态 + 自动备份 |
| ⚡ 性能缓存 | LLM 语义缓存（SQLite 持久化 + 分层 TTL + 规范化命中） |
| 📈 可观测性 | Prometheus 指标 + Grafana 4 仪表盘 + 7 条告警规则 |
| 🔌 Webhook | 5 种事件通知外部系统 |
| 📈 评测基准 | 16 条任务 + CI 门禁 + 基线对比 + 回归检测 |
| ⏱️ 性能基准 | 真实 API/缓存/DB 延迟和吞吐测量 + 压力测试 |
| 🐳 Docker | 7 服务编排 + 资源限制 + 日志轮转 + 健康检查 |

## CI/CD

9 个 CI job 并行运行：

| Job | 功能 |
|---|---|
| Backend tests | pytest + 75% 覆盖率门禁 |
| Backend lint | ruff 静态分析 |
| Backend security | pip-audit 依赖扫描 |
| Frontend tests | vitest + coverage |
| Frontend lint | eslint |
| Orchestrator tests | vitest |
| LLM judge gate | 评测基准门禁 |
| Task benchmark | 任务基准 + 回归检测 |
| Docker build | 构建 + 健康检查 |

## 测试

```bash
# 前端测试 (1726 tests)
npx vitest run

# 后端测试 (2052 tests)
cd backend && python -m pytest tests/ --timeout=60

# Orchestrator 测试 (216 tests)
cd orchestrator && npm test

# E2E 功能验证 (40+ 项)
cd backend && python e2e_verify.py

# 性能基准
cd backend && python perf_benchmark.py

# 评测基准
cd backend && python benchmark_cli.py --analyze
```

## 文档

- [变更日志](CHANGELOG.md)
- [快速体验](docs/quickstart.md)
- [API 参考](docs/api-reference.md)
- [贡献指南](CONTRIBUTING.md)
- [Agent 角色配置](docs/agent-roles.md)
- [Agent 工具系统](docs/agent-tools.md)
- [设计文档](docs/design.md)
- [用户指南](docs/user-guide.md)
- [Docker 部署指南](DOCKER_README.md)

## 许可证

[Apache License 2.0](LICENSE)
