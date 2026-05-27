# Browser Agent - Side Panel Host

浏览器自动化助手，前端 Vue 3 + Vite，后端 Python FastAPI WebSocket，AI 引擎基于 AgentScope + DeepSeek。

## 项目结构

| 目录/文件 | 说明 |
|---|---|
| `src/` | Vue 3 前端源码 |
| `index.html` | Plugin Shell 页面（侧边栏宿主，包裹 iframe） |
| `company-app.html` | Vue 应用入口（iframe 内的业务页面） |
| `backend/` | Python FastAPI 后端 + AgentScope 子模块 |
| `backend/server.py` | WebSocket 服务入口，端口 8765 |
| `dist/` | 构建产物目录 |

## 环境准备

### 前端

```bash
npm install
```

### 后端

```bash
git submodule update --init --recursive
pip install -e backend/agentscope
pip install fastapi uvicorn python-frontmatter
```

## 启动开发环境

### 启动后端

```bash
python backend/server.py
```

后端运行在 `0.0.0.0:8765`，提供 WebSocket 服务 `/ws`。

> `npm run dev:backend` 硬编码了别人的 Python 路径，建议直接用上面命令，或修改 `package.json` 中的路径。

### 启动前端（Vue 应用独立运行）

```bash
npm run dev
```

启动 Vite 开发服务器并自动打开 `company-app.html`。支持热更新。默认监听 `0.0.0.0:5173`。

### 启动侧边栏宿主（Plugin Shell）

Plugin Shell 需要构建产物，无法热更新：

```bash
npm run build && npm run preview
# 或
npm start
```

访问 `http://<本机IP>:4173/index.html`。

局域网其他设备可通过同一地址打开侧边栏宿主页面。

## WebSocket 地址

前端默认连接 `ws://<当前页面hostname>:8765/ws`，也可在设置面板中手动修改。

## 技术栈

- **前端**: Vue 3 + Vite 6 + esbuild
- **后端**: Python FastAPI + WebSocket
- **AI**: AgentScope + DeepSeek API
