# 贡献指南

感谢你对 MDH（大荒界）项目的关注！本文档将帮助你快速搭建开发环境并参与贡献。

## 开发环境

### Python 后端

- Python 3.11+
- pip install -r backend/requirements.txt
- cp .env.example .env (填入 API Key)
- python backend/server.py

### 前端

- Node.js 18+
- npm install --legacy-peer-deps
- npm run dev

### 编排器

- cd orchestrator && npm install
- npm test

## 代码组织

| 目录 | 说明 |
|------|------|
| `src/` | React + TypeScript 前端 |
| `backend/` | Python + FastAPI 后端 |
| `orchestrator/` | TypeScript 编排器 |
| `adapters/` | A2A 协议适配器 |
| `skill_packs/` | 技能包 |

## 测试

```bash
# 后端
cd backend && python -m pytest tests/ --ignore=tests/legacy

# 前端
npm test

# 编排器
cd orchestrator && npm test
```

## Commit 规范

使用以下格式提交：

- `feat(scope): 描述` — 新功能
- `fix(scope): 描述` — Bug 修复
- `docs(scope): 描述` — 文档更新
- `test(scope): 描述` — 测试相关

其中 `scope` 为影响范围，如 `backend`、`frontend`、`orchestrator`、`api`、`a2a` 等。

## PR 流程

1. Fork 仓库
2. 创建 feature 分支
3. 确保测试通过
4. 提交 PR
5. 代码审查
6. 合并
