# 大荒界 - Matrix DaHuang (MDH)

基于 React + Python FastAPI + AgentScope 的全领域智能体协作系统，支持多角色AI Agent在虚拟办公室中协作完成复杂任务。

## 功能特性

- 🏢 **虚拟办公室** - 3D科技大厦可视化场景
- 👥 **多角色团队** - 产品经理、架构师、开发、QA、DevOps等角色
- 🎯 **任务分配** - CEO智能分析需求并组建团队
- 🔧 **工具执行** - Agent可调用18种工具（文件、Git、搜索、测试等）
- 📋 **会议协作** - 支持实时讨论和任务协作
- 📊 **技能进化** - 角色技能可配置和扩展
- 🤖 **TS-Python 桥接** - 前端自定义智能体与后端 AgentScope 智能体互通
- 🗳️ **投票决策** - 多智能体提案、投票、共识评估
- ✅ **人工审批** - 高危操作的人工审批流程
- 📸 **检查点** - 任务执行状态的保存与恢复
- 🚨 **关键阻塞** - 紧急阻塞问题的快速响应
- 📝 **审计日志** - 操作审计追踪
- ⚙️ **工作流引擎** - REST API 管理工作流生命周期

## 项目结构

```
├── src/                    # React + TypeScript 前端
│   ├── components/         # UI组件
│   │   ├── techtower/      # 3D科技大厦
│   │   ├── office-team/    # 办公团队
│   │   └── skill-evolution/ # 技能进化
│   ├── hooks/              # React Hooks
│   └── modules/            # 功能模块
├── backend/                # Python后端
│   ├── server.py           # WebSocket服务
│   ├── agent_toolset.py    # Agent工具集
│   ├── tool_executor.py    # 工具执行器
│   ├── tool_registry.py    # 工具注册中心
│   └── roles_config.yaml   # 角色配置
├── docs/                   # 文档
└── index.html              # 入口页面
```

## 快速开始

### 前端

```bash
npm install
npm run dev
```

访问 `http://localhost:5173`

### 后端

```bash
pip install -r backend/requirements.txt
python backend/server.py
```

后端运行在 `ws://localhost:8765/ws`

## Agent工具系统

系统提供18个内置工具：

| 类别 | 工具 |
|------|------|
| 文件 | read_file, write_file, edit_file, list_directory |
| Git | git_status, git_commit, git_push, git_branch, git_diff, git_log |
| 搜索 | search_files, grep_content |
| 测试 | run_tests, run_linter |
| 文档 | create_document, edit_document |
| Web | web_fetch |

详细文档：[docs/agent-tools.md](docs/agent-tools.md)

## 角色配置

角色配置在 `backend/roles_config.yaml`：

```yaml
base_roles:
  executor:
    name: "执行者"
    permissions:
      tools: ["read_file", "write_file", "git_commit", ...]
      dangerous_tools: ["bash"]
    skills: ["fullstack_dev"]
```

支持自定义角色和技能混搭。

## 技术栈

- **前端**: React + TypeScript + Vite + Three.js
- **后端**: Python FastAPI + WebSocket
- **AI**: AgentScope + DeepSeek API
- **工具**: 自研工具执行框架

## 文档

- [Agent工具系统](docs/agent-tools.md)
- [角色配置](backend/roles_config.yaml)
- [集成测试报告](docs/integration-test-report.md)

## 测试

```bash
# TypeScript (865 tests)
npx vitest run

# Python (532 tests)
conda activate agentscope
cd backend && python -m pytest tests/ --timeout=10

# LLM 集成测试
export $(cat .env | grep -v '^#' | xargs)
python backend/test_llm_integration.py
```
