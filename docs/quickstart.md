# MDH 快速入门指南 / Quick Start Guide

## 前提条件 / Prerequisites

| 依赖 | 最低版本 | 用途 |
|------|----------|------|
| Docker | 20+ | 容器化部署（推荐） |
| Docker Compose | 2+ | 多服务编排 |
| Git | 2.30+ | 克隆仓库 |
| DeepSeek API Key | — | LLM 调用（[申请地址](https://platform.deepseek.com/)） |

> **不需要 Docker？** 可以用 Python 3.11+ 和 Node.js 18+ 分别手动启动前后端（见下方"手动安装"章节）。

---

## 方式一：Docker 一键部署（推荐）

### 步骤 1：克隆仓库

```bash
git clone https://github.com/MonSp/MDH.git
cd MDH
```

### 步骤 2：配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入至少一个 LLM API Key：

```env
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

### 步骤 3：启动服务

```bash
docker compose up -d
```

首次启动需要拉取镜像和构建，约 2-5 分钟。

### 步骤 4：验证服务

```bash
# 检查容器状态
docker compose ps

# 健康检查
curl http://localhost:8765/health
```

### 步骤 5：打开浏览器

访问 **http://localhost:8080**，你将看到 3D 虚拟办公室界面。

---

## 方式二：手动安装

### 后端（Python）

```bash
# 确保 Python 3.11+
python --version

# 安装依赖
pip install -r backend/requirements.txt

# 配置
cp .env.example .env
# 编辑 .env 填入 DEEPSEEK_API_KEY

# 启动后端
python backend/server.py
```

后端运行在 `http://localhost:8765`，WebSocket 在 `ws://localhost:8765/ws`。

### 前端（Node.js）

```bash
# 确保 Node.js 18+
node --version

# 安装依赖
npm install --legacy-peer-deps

# 启动开发服务器
npm run dev
```

前端运行在 `http://localhost:5173`。

### 编排器（可选）

```bash
cd orchestrator
npm install
npm test
```

---

## 第一个任务示例

### 示例 1：代码质量分析

在 CEO Chat 面板中输入：

> 分析当前项目的代码质量并给出改进建议

**预期输出：**

1. CEO 智能体分析任务复杂度，判定为"简单"路径
2. SimpleExecutor 执行代码分析
3. 返回代码质量报告，包含改进建议列表

### 示例 2：全栈功能开发

> 开发一个用户登录功能，包含前端表单、后端 API 和单元测试

**预期输出：**

1. CEO 智能体判定为"复杂"路径
2. 动态组建团队：架构师 + 前端开发 + 后端开发 + QA
3. 工作流引擎按 DAG 顺序执行：架构设计 → 前端实现 → 后端实现 → 测试
4. 审查智能体把控代码质量
5. 技能自动进化，经验规则入库

### 示例 3：会议纪要

> 帮我整理这段会议记录：[粘贴你的会议内容]

**预期输出：**

1. 识别为文档模式
2. 启动纪要 DAG 工作流（提取/起草/校对）
3. 输出结构化会议纪要

---

## 环境变量说明

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `DEEPSEEK_API_KEY` | 是 | — | DeepSeek API 密钥 |
| `DEEPSEEK_BASE_URL` | 否 | `https://api.deepseek.com` | API 端点 |
| `DEEPSEEK_MODEL` | 否 | `deepseek-chat` | 模型名称 |
| `EXECUTOR_URL` | 否 | `http://localhost:8767` | 远端执行器地址 |
| `EXECUTOR_TOKEN` | 否 | — | 执行器认证 Token |
| `BACKEND_TOKEN` | 否 | 自动生成 | 后端 API 认证 Token |
| `CORS_ORIGINS` | 否 | `http://localhost:8080,http://localhost:9090` | 允许的跨域来源 |

---

## 常见问题 / Troubleshooting

### Q: Docker 启动后访问 8080 报错

**A:** 检查容器状态：
```bash
docker compose logs backend
docker compose logs frontend
```
确保 `DEEPSEEK_API_KEY` 已正确配置。

### Q: WebSocket 连接失败

**A:** 
1. 确认后端已启动：`curl http://localhost:8765/health`
2. 检查浏览器控制台是否有 CORS 错误
3. 确认防火墙未阻止 8765 端口

### Q: "未配置API密钥" 错误

**A:** 检查以下三个位置：
1. `.env` 文件中的 `DEEPSEEK_API_KEY`
2. 前端 localStorage 中的 `deepseek_api_key`
3. WebSocket 会话中的 `api_key`

### Q: 后端 pytest 测试失败

**A:**
```bash
# 跳过 legacy 测试
cd backend && python -m pytest tests/ --ignore=tests/legacy -q

# 确保安装了所有测试依赖
pip install -r backend/requirements.txt
```

### Q: 前端 npm install 报版本冲突

**A:** 使用 `--legacy-peer-deps` 标志：
```bash
npm install --legacy-peer-deps
```

### Q: Docker Compose 构建超时

**A:** 
```bash
# 单独构建各服务
docker compose build backend
docker compose build frontend

# 使用国内镜像加速（如需要）
# 编辑 daemon.json 添加 registry-mirrors
```

### Q: 如何切换 LLM 提供商？

**A:** 在 `.env` 中配置其他提供商的 API Key，或在前端设置面板中切换。MDH 支持 9 个提供商：DeepSeek、OpenAI、Anthropic、Gemini、Ollama、Moonshot、XAI 等。

---

## 下一步

- [用户指南](user-guide.md) — 详细的使用指南
- [Agent 角色配置](agent-roles.md) — 自定义角色和技能
- [设计文档](design.md) — 架构和设计决策
- [Docker 部署指南](../DOCKER_README.md) — 生产环境部署
- [API 参考](api-reference.md) — REST API 端点文档
- [贡献指南](../CONTRIBUTING.md) — 参与开发
