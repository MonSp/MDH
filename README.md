# 大荒界 - Matrix DaHuang (MDH)

[![CI](https://github.com/MonSp/MDH/actions/workflows/ci.yml/badge.svg)](https://github.com/MonSp/MDH/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Backend Tests](https://img.shields.io/badge/backend-1759%20passed-brightgreen)]()
[![Frontend Tests](https://img.shields.io/badge/frontend-1726%20passed-brightgreen)]()

**中文** | [English](README.en.md)

## MDH 是什么

MDH 是一个**数字员工操作系统**。它不是又一个 AI 聊天工具，而是一个让 AI agent 像真正的员工一样工作、学习、成长的协作平台。

在 MDH 里，数字员工是一个团队：CEO 分析需求、架构师设计方案、开发写代码、QA 审查质量、项目经理协调进度。它们在 3D 虚拟办公室里开会、讨论、投票、执行任务——就像一个真实的企业。

### 核心闭环

```
任务 → 执行 → 产出资产 → 提炼经验 → 技能进化 → 下一次任务更高效
```

这个闭环让数字员工从「一次性工具」变成「持续进化的同事」。它们有自己的记忆、经验、技能树、职业路径，并且在每一次任务中变得更强。

### 它们会积累经验

每次任务执行的产出物自动入库为资产。团队讨论中提炼的经验被写成技能规则。下一次执行同类任务时，系统自动检索最相关的经验注入到上下文里——踩过的坑不会再踩。

### 它们会自我净化

不是所有经验都是好经验。每条规则都有有效性评分：注入后任务成功 +1，失败 -1。连续使用 3 次以上、成功率低于 40% 的规则自动降级退回审核队列。坏经验被淘汰，好经验留下来并通过质量门禁跨团队共享。

数字员工有了「免疫系统」。

### 它们有职业发展

42 个技能组成依赖树，覆盖工程、设计、内容、数据、管理五大类别。每个数字员工有跨项目持久化的职业档案，完成任务获得经验值，技能从初级升到中级再到高级。

10 个部门各有独立的晋升标准——研发部看 `backend_dev` 和 `testing`，视频部看 `video_editing`，数据部看 `data_analysis`。满足条件自动晋升，高级员工做简单任务时 XP 衰减——必须承担真正有挑战的工作才能成长。

### 进化是自驱动的

规则不只是被动降级——低分规则自动生成改进版（自进化），改进后的规则联动更新关联的技能包和资产（联动进化）。系统自动识别最需要反思的知识领域（反思优先级），并防止进化过拟合：同一领域进化过多会被限制，长期未用的规则自动降权，20% 的时间用于探索未知领域。

高质量经验通过质量门禁跨团队共享，低信任团队的经验被信任评分机制过滤（多团队进化联邦）。系统知道自己的能力边界——哪些领域高置信、哪些领域是盲区（能力边界感知），在不擅长的领域主动寻求外部帮助。

人的反馈不是「看过就忘」——结构化的审查意见自动转化为经验规则，直接影响数字员工的下一次表现。人指定的技能发展方向会影响任务分配和 XP 分配（人机协作反馈回路）。

### 它们有记忆和协作

每个数字员工有跨项目持久化的个人记忆，完成任务后自动提取关键信息写入记忆，下次执行同类任务时自动检索相关经验。10 个部门的数字员工有独立的晋升路径，从初级工程师到技术负责人。团队协同系统自动分析 agent 组合效率，推荐最优搭配。

数字员工能主动监控自身健康——发现弱项技能自动预警，检测领域规则有效性下降自动告警。人可以通过内联反馈直接参与 agent 的成长，反馈自动转化为经验规则。

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

---

## 核心能力

| 能力 | 说明 |
|---|---|
| 🏢 虚拟办公室 | 3D 科技大厦可视化场景，实时展示智能体状态 |
| 👥 多角色团队 | CEO、架构师、开发、QA、DevOps、项目经理 6 个核心角色 + 20+ 扩展角色 |
| 🎯 智能任务分配 | CEO 分析需求 → 讨论 → 投票 → 分派 → 执行 → 审查 |
| 🔧 18 种工具 | 文件、Git、搜索、测试、文档、Web 等 |
| 🤖 TS-Python 桥接 | 前端自定义智能体与后端 AgentScope 智能体互通 |
| 🖥️ 本地/远端混合执行 | 每个智能体可独立选择在用户浏览器本地(Node.js)或远端(Python Executor)执行工具 |
| 🔗 A2A 执行节点协议 | Agent-to-Agent 协议接入外部执行节点（TS Orchestrator、Claude Code 等），中心调度 + 分布式执行 |
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
| 🧭 路由感知技能等级 | DynamicRouter 六维加权路由（关键词/语义/成功率/优先级/技能等级/升级加成），agent 技能等级影响部门选择和任务分配 |
| 🎯 晋升驱动任务分配 | 简单任务优先初级 agent（积累 XP），复杂任务优先高级 agent（能力匹配） |
| 🧠 Agent 持久记忆 | 跨项目个人记忆 + 自动摘要 + 记忆注入 + 老化机制 |
| 📄 文档感知协作 | 19 种文件格式解析 + 上下文注入 + 数据集分析 |
| 🔍 主动式监控 | 健康巡检 + 风险预警 + 告警分级 + 反思优先级 |
| 🤝 团队协同优化 | 协同分析 + 瓶颈识别 + 最优搭配推荐 |
| 🔌 Webhook 集成 | 5 种事件通知外部系统 + HMAC 签名验证 + 投递日志 |
| 🤖 多模型支持 | DeepSeek/OpenAI/Anthropic/Gemini/Ollama 等 9 个提供商 + 模型路由 + 自动降级 |
| 🧬 自进化 | 低分规则自动生成改进版（保留核心意图 + 失败约束），进化链追踪 |
| 🔗 联动进化 | 规则进化 → 级联更新关联技能包和资产（知识网络联动） |
| 🎯 反思优先级队列 | 自动识别最需反思的知识领域（域名健康度 + 进化成功率排序） |
| 🛡️ 抗过拟合 | 同类进化过多自动限制 + 长期未用规则降权 + 20% 时间探索未知领域 |
| 🌐 多团队进化联邦 | 高质量经验跨团队共享（信任评分 + 质量门禁 + 智能订阅） |
| 🧭 能力边界感知 | 置信度地图标注高/中/低置信领域，未知领域自动寻求外部帮助 |
| 💬 人机协作反馈 | 结构化审查意见自动转化为经验规则，影响数字员工下一次表现 |

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

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite 6 + Three.js |
| 后端 | Python 3.11 + FastAPI + WebSocket |
| 编排器 | Node.js + TypeScript（用户本地运行） |
| AI | AgentScope + DeepSeek API |
| 协议 | A2A (Agent-to-Agent) — 中心调度 + 分布式执行 |
| 工具 | 自研工具执行框架（支持本地/远端路由） |
| 测试 | Vitest (TS) + pytest (Python) |

## 系统架构

```
用户浏览器
┌─────────────────────────────────────────────────┐
│  React 前端                                      │
│  3D 虚拟办公室 + WebSocket 客户端                │
└────────────────────────┬────────────────────────┘
                         │ WebSocket + REST
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                  Python 后端（Agent OS 大脑）                  │
│                                                               │
│  CEO Agent │ 经验进化 │ 职业发展 │ 资产管理 │ A2A Task Router │
│  会议协调   │ 技能管理 │ 记忆系统 │ 监控告警 │ 状态同步管理器  │
│                                                               │
│  147 REST API + 41 WebSocket 消息类型                         │
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

## 生产就绪 (v0.2.0)

| 能力 | 说明 |
|------|------|
| 💾 SQLite 存储 | 所有数据迁移到 SQLite（WAL 模式，并发安全） |
| 🔐 RBAC 权限 | API key 三级角色（admin/agent/viewer） |
| 📊 健康检查 | 数据库/磁盘/模块状态 + 自动备份 |
| ⚡ 性能缓存 | LLM 语义缓存（SQLite 持久化 + 分层 TTL + 规范化命中） |
| 🔌 Webhook | 5 种事件通知外部系统 |
| 📈 评测基准 | 16 条任务 + CI 门禁 + 基线对比 + 回归检测 |
| ⏱️ 性能基准 | 真实 API/缓存/DB/Artifact 延迟和吞吐测量 |

## 测试

```bash
# 前端测试 (1726 tests)
npx vitest run

# 后端测试 (1759 tests)
cd backend && python -m pytest tests/ --timeout=60

# Orchestrator 测试 (214 tests)
cd orchestrator && npm test

# E2E 功能验证 (31 项)
cd backend && python e2e_verify.py

# 性能基准
cd backend && python perf_real.py

# 评测基准
cd backend && python benchmark_cli.py --analyze
```

## 文档

- [变更日志](CHANGELOG.md)
- [Agent 角色配置](docs/agent-roles.md)
- [Agent 工具系统](docs/agent-tools.md)
- [设计文档](docs/design.md)
- [用户指南](docs/user-guide.md)
- [Docker 部署指南](DOCKER_README.md)
- [评测基准指南](docs/PERF_TEST_GUIDE.md)

## 许可证

[Apache License 2.0](LICENSE)
