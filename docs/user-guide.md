# MDH 用户文档

## 目录

1. [快速入门](#快速入门)
2. [创建会议](#创建会议)
3. [Per-Agent Location 选择](#per-agent-location-选择)
4. [智能体协作流程](#智能体协作流程)
5. [投票决策](#投票决策)
6. [人工审批](#人工审批)
7. [检查点与断点续跑](#检查点与断点续跑)
8. [TS-Python 桥接](#ts-python-桥接)
9. [角色管理](#角色管理)
10. [工作流引擎](#工作流引擎)
11. [历史回放](#历史回放)

---

## 快速入门

### 环境要求

- Node.js 18+
- Python 3.11+（推荐 Conda 环境）
- DeepSeek API Key

### 启动（Docker 方式）

```bash
# 1. 配置 API Key
cp .env.example .env
# 编辑 .env: DEEPSEEK_API_KEY=sk-xxx

# 2. 启动所有服务
docker compose up -d

# 3. 访问
# 前端: http://localhost:8080
# 后端: http://localhost:8765
```

### 启动（开发模式）

```bash
# 1. 安装前端依赖
npm install

# 2. 配置 API Key
cp .env.example .env
# 编辑 .env: DEEPSEEK_API_KEY=sk-xxx

# 3. 启动后端
python backend/server.py

# 4. 启动前端
npm run dev

# 5. (可选) 启动 Orchestrator
cd orchestrator && npm install && npm run dev
```

访问 `http://localhost:5173`，点击「多智能体团队」进入虚拟办公室。

---

## 创建会议

1. 在科技大厦中选择一个项目
2. 点击「开始会议」
3. 输入任务描述（如："帮我写一个用户认证模块"）
4. CEO 智能体会分析需求并组建团队

### 会议配置

启动会议时可配置：
- **LLM Provider**: deepseek / openai / anthropic
- **模型名称**: deepseek-chat / gpt-4 / claude-3
- **最大迭代轮次**: 1-10（默认 3）

---

## Per-Agent Location 选择

MDH 支持每个智能体独立选择工具执行位置：

### 选择方式

1. 在 CEO 对话面板中选择角色
2. 每个已选角色旁有 💻(本地) / ☁️(远端) 徽章
3. 点击徽章切换执行位置
4. 可任意组合 team 成员的执行位置

### 执行位置说明

| 位置 | 执行方式 | 适用场景 |
|------|----------|----------|
| 💻 本地 | Node.js child_process | 用户本地文件操作、快速响应 |
| ☁️ 远端 | HTTP POST → Python Executor | 服务器端操作、复杂计算 |

### 配置

```bash
# CLI 启动时指定默认路由
node orchestrator/src/cli.ts --executor=http://localhost:8767

# 环境变量
EXECUTOR_URL=http://localhost:8767
EXECUTOR_TOKEN=your_token_here
```

---

## 智能体协作流程

```
CEO 交接 → 需求确认 → 语义分析 → 项目规划 → 讨论 → 投票 → 分派 → 审批 → 执行 → 审查 → 总结
```

### 各阶段说明

| 阶段 | 负责人 | 说明 |
|---|---|---|
| CEO 交接 | CEO | 接收用户需求，转交项目经理 |
| 需求确认 | 项目经理 | 确认需求细节和复杂度 |
| 语义分析 | 项目经理 | 分析意图，确定目标智能体 |
| 项目规划 | 项目经理 | 制定 4 阶段计划 |
| 讨论 | 全体 | 多角色讨论方案 |
| 投票 | 全体 | 对方案进行投票 |
| 分派 | 项目经理 | 将任务分派给执行者 |
| 审批 | 人工 | 高风险操作需人工审批 |
| 执行 | 执行者 | 编写代码、执行任务 |
| 审查 | QA | 质量审查，最多 3 轮迭代 |
| 总结 | 项目经理 | 生成报告，提取经验 |

---

## 投票决策

### 创建提案

在会议的 `🗳️ 投票` 标签页中：
1. 输入提案内容
2. 点击「提交」

### 智能体投票

各智能体会根据角色分析自动投票：
- **赞成**: 方案可行，建议执行
- **反对**: 存在风险，建议修改

### 共识评估

支持 3 种策略：
- **简单多数** (simple_majority): 赞成票 > 反对票
- **加权投票** (weighted_vote): 考虑智能体权重
- **基于论据** (argument_based): 考虑论据质量

### 调整权重

在投票标签页的「智能体权重」面板中，用滑动条调整每个智能体的投票权重（0-5）。

---

## 人工审批

### 触发条件

以下操作会触发审批请求：
- 高风险工具调用（bash、文件操作）
- 包含危险关键词的任务（rm -rf、DROP TABLE 等）

### 审批流程

1. 后端发送 `human_approval_request`
2. 前端显示审批对话框（风险等级、操作描述）
3. 用户点击「批准」或「拒绝」
4. 前端发送 `human_approval_response`
5. 后端处理并继续/终止任务

### 手动触发

在投票标签页的「审批」面板中，可以查看所有待审批请求。

---

## 检查点与断点续跑

### 保存检查点

在投票标签页的「检查点管理」面板中：
1. 输入任务 ID 和步骤号
2. 点击「保存」

### 恢复检查点

1. 在检查点列表中找到目标
2. 点击「恢复」

### 会议快照

- **保存**: 发送 `save_meeting_snapshot` 消息
- **恢复**: 发送 `restore_meeting_snapshot` 消息

会议快照包含完整的 agents、tasks、messages 状态。

---

## TS-Python 桥接

### 注册 TS 智能体

```typescript
const { registerBridgeAgent } = useMeetingSocket({ wsRef })

// 注册到 Python 端
const { pyAgentId } = await registerBridgeAgent(
  agentId,    // TS 端的智能体 ID
  'My Agent', // 名称
  'executor', // 角色
  ['code_generation'], // 能力
)
```

### 发送消息

```typescript
const { sendBridgeMessage } = useMeetingSocket({ wsRef })

// 发消息给 Python 智能体
sendBridgeMessage(agentId, 'agent-executor', { content: '请帮我写代码' })
```

### 接收消息

```typescript
const { onBridgeMessage } = useMeetingSocket({ wsRef })

// 监听 Python 智能体的回复
const unsubscribe = onBridgeMessage(agentId, (msg) => {
  console.log(msg.payload.content)
})
```

---

## 角色管理

### 查看角色

在投票标签页的「角色模板」面板中查看所有角色。

### 创建角色

1. 点击「+ 新建」
2. 填写名称、描述、工具列表、系统提示词
3. 点击「创建」

### 编辑角色

1. 在角色列表中选择目标
2. 修改字段
3. 点击「保存」

### 删除角色

选择角色后点击「删除」。

---

## 工作流引擎

### 创建工作流

```bash
curl -X POST http://localhost:8765/api/workflow/create \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "wf-1",
    "name": "My Workflow",
    "nodes": [
      {"node_id": "n1", "task_description": "Setup", "dept_id": "dept-backend"},
      {"node_id": "n2", "task_description": "Build", "dept_id": "dept-frontend"}
    ],
    "edges": [{"source_node_id": "n1", "target_node_id": "n2"}],
    "execution_strategy": "sequential"
  }'
```

### 执行工作流

```bash
curl -X POST http://localhost:8765/api/workflow/execute/wf-1
```

### 查看状态

```bash
curl http://localhost:8765/api/workflow/status/wf-1
```

---

## 历史回放

在投票标签页的「会议历史」面板中：
1. 选择一个历史会话
2. 查看消息列表
3. 回顾讨论和决策过程

---

## 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API Key | 必填 |
| `DEEPSEEK_BASE_URL` | API 基础 URL | `https://api.deepseek.com/v1` |
| `DEEPSEEK_MODEL` | 模型名称 | `deepseek-chat` |
| `EXECUTOR_URL` | Python Executor URL | `http://localhost:8767` |
| `EXECUTOR_TOKEN` | Executor API Token | 自动生成 |

---

## 常见问题

### Q: 会议启动后没有响应？

检查：
1. `.env` 中的 `DEEPSEEK_API_KEY` 是否正确
2. 后端是否正常运行 (`curl http://localhost:8765/health`)
3. 网络是否能访问 DeepSeek API

### Q: 投票一直不通过？

调整智能体权重或修改提案内容。投票使用简单多数策略，需要至少 3 票赞成。

### Q: 如何查看执行日志？

- 前端: 查看会议面板的聊天记录
- 后端: 查看 `docker logs mdh-backend-1` 或终端输出
- 指标: 访问 `http://localhost:8765/metrics`

### Q: Orchestrator 和 Backend 有什么区别？

- **Backend** (Python): 会议协调、CEO 智能体、投票/审批、技能进化
- **Orchestrator** (Node.js): 用户本地运行，LLM 调用、团队管理、本地工具执行

两者可以同时运行，Orchestrator 提供本地优先的执行路径。

### Q: 如何选择本地/远端执行？

在 CEO 对话面板中，每个角色旁有 💻/☁️ 徽章，点击即可切换。本地执行适合文件操作，远端执行适合复杂计算。
