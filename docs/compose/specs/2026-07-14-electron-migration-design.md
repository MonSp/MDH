# MDH Electron 桌面应用迁移设计

## [S1] 背景与目标

MDH 当前架构：React 前端（浏览器）+ TS Orchestrator（Node.js CLI）+ Python 后端（可选）。
用户需要手动安装 Node.js、配置环境变量、启动多个进程才能使用本地智能体团队。

**目标**：将 TS Orchestrator + React 前端打包为 Electron 桌面应用，实现：
- 双击图标即可启动本地智能体团队
- 内置 Node.js 运行时，零环境依赖
- 前端 + 编排器单窗口运行
- 可选连接远端 Python Executor

## [S2] 架构设计

### 当前架构

```
┌─ 浏览器 ──────────────┐     ┌─ Node.js 进程 ────────┐     ┌─ Python (可选) ───┐
│  React 前端            │ ←── │  TS Orchestrator      │ ──→ │  Python Executor   │
│  (port 8080)           │ WS  │  (port 9090)          │ HTTP│  (port 8767)       │
└────────────────────────┘     └────────────────────────┘     └────────────────────┘
```

### 目标架构（纯本地模式）

```
┌─ Electron App ──────────────────────────────────────────┐
│                                                         │
│  ┌─ Main Process (Node.js) ──────────────────────────┐  │
│  │  Orchestrator (原 cli.ts/server.ts)                │  │
│  │  ├── TeamCoordinator                              │  │
│  │  ├── LocalToolkitRouter (fs/child_process)        │  │
│  │  ├── RemoteToolkitRouter (HTTP, 可选)              │  │
│  │  ├── LLM 调用 (fetch → DeepSeek/OpenAI API)       │  │
│  │  └── IPC Handler (↔ renderer)                     │  │
│  └───────────────────────────────────────────────────┘  │
│                         ↕ IPC (contextBridge)           │
│  ┌─ Renderer Process (Chromium) ─────────────────────┐  │
│  │  React 前端 (Three.js 3D 办公室)                   │  │
│  │  ├── WebSocket → IPC 适配层                        │  │
│  │  ├── 智能体状态面板                                │  │
│  │  └── 投票/审批 UI                                  │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
         ↕ HTTP (可选)                    ↕ HTTPS
┌─ 远端 Executor ───────┐         ┌─ LLM API ───────────┐
│  Python/Node.js       │         │  DeepSeek/OpenAI     │
│  (port 8767)          │         │  Anthropic/...       │
└───────────────────────┘         └──────────────────────┘
```

## [S3] 目录结构

```
mdh-electron/
├── electron/
│   ├── main.ts              # Electron 主进程入口
│   ├── preload.ts           # contextBridge 暴露 IPC API
│   └── ipc-handlers.ts      # IPC 消息处理器（桥接前端↔Orchestrator）
├── src/                     # React 前端（现有，改动最小）
│   ├── hooks/
│   │   └── useIpcBridge.ts  # 新增：IPC 适配层（替代 WebSocket）
│   └── ...
├── orchestrator/            # TS Orchestrator（现有，作为库 import）
│   └── src/
│       ├── team/
│       ├── toolkit/
│       ├── llm/
│       └── ...
├── electron-builder.yml     # 打包配置
├── forge.config.ts          # Electron Forge 配置
└── package.json
```

## [S4] 核心改动清单

### 4.1 Electron 主进程 (`electron/main.ts`)

**职责**：创建窗口、启动 Orchestrator、注册 IPC 处理器。

```typescript
import { app, BrowserWindow, ipcMain } from 'electron';
import { TeamCoordinator } from '../orchestrator/src/team/coordinator.js';
import { RouterFactory } from '../orchestrator/src/toolkit/router.js';
import { LocalToolkitRouter } from '../orchestrator/src/toolkit/local.js';

let coordinator: TeamCoordinator;

app.whenReady().then(async () => {
  // 1. 初始化 Orchestrator（内嵌，非独立进程）
  const routerFactory = new RouterFactory();
  const localRouter = new LocalToolkitRouter();
  coordinator = new TeamCoordinator({
    llm: resolveLlmConfig(),
    routerFactory,
    defaultRouter: localRouter,
    workspace: getDefaultWorkspace(),
  });

  // 2. 创建窗口
  const win = new BrowserWindow({
    width: 1400, height: 900,
    webPreferences: { preload: join(__dirname, 'preload.js') },
  });
  win.loadFile('dist/index.html');

  // 3. 注册 IPC 处理器
  registerIpcHandlers(coordinator);
});
```

### 4.2 IPC 协议 (`electron/ipc-handlers.ts`)

**替代 WebSocket**，前端通过 `window.mdh.invoke()` 调用 Orchestrator。

| IPC 通道 | 方向 | 说明 |
|----------|------|------|
| `mdh:startMeeting` | renderer→main | 启动会议（团队模板 + 任务） |
| `mdh:sendMessage` | renderer→main | 发送用户消息 |
| `mdh:castVote` | renderer→main | 投票 |
| `mdh:approval` | renderer→main | 审批响应 |
| `mdh:onAgentMessage` | main→renderer | 智能体消息推送（流式） |
| `mdh:onStatusChange` | main→renderer | 状态变化通知 |
| `mdh:getRoles` | renderer→main | 获取可用角色列表 |
| `mdh:getHealth` | renderer→main | 健康检查 |

### 4.3 前端适配层 (`src/hooks/useIpcBridge.ts`)

**关键改动**：WebSocket → IPC 透明切换。检测运行环境，自动选择通信方式。

```typescript
// 检测是否在 Electron 环境
const isElectron = typeof window !== 'undefined' && window.mdh !== undefined;

// 统一接口
export function useBridge() {
  if (isElectron) {
    // Electron: 通过 IPC 通信
    return {
      send: (type: string, data: any) => window.mdh.invoke('mdh:sendMessage', { type, ...data }),
      onMessage: (cb: Function) => window.mdh.on('mdh:onAgentMessage', cb),
    };
  } else {
    // 浏览器: 通过 WebSocket 通信（现有逻辑）
    return useWebSocket();
  }
}
```

### 4.4 打包策略

使用 `electron-builder` 打包：

| 平台 | 格式 | 预估体积 |
|------|------|----------|
| Windows | .exe (NSIS) | ~100MB |
| macOS | .dmg | ~90MB |
| Linux | .AppImage | ~100MB |

**体积优化**：
- 排除 `node_modules` 中的开发依赖
- 排除 Python 后端代码（纯本地模式不需要）
- 使用 `asar` 压缩
- Three.js 资源按需加载

## [S5] 改动影响分析

| 组件 | 改动量 | 说明 |
|------|--------|------|
| **React 前端** | 小 | 新增 `useIpcBridge.ts` 适配层，WebSocket 逻辑保留作为浏览器回退 |
| **TS Orchestrator** | **无** | 作为库被 import，不需要改动 |
| **Python 后端** | **无** | 纯本地模式不使用 |
| **构建配置** | 中 | 新增 `electron-builder.yml`、`forge.config.ts` |
| **package.json** | 小 | 新增 Electron 依赖和构建脚本 |

## [S6] LLM API Key 管理

Electron 应用中 API Key 存储策略：

1. **首次启动**：弹出设置向导，用户输入 API Key
2. **存储**：使用 `keytar`（系统钥匙串）或 `electron-store`（加密存储）
3. **运行时**：Main process 读取 Key，注入 LLM config
4. **不打包到应用**：Key 不写入代码或配置文件

## [S7] 远端 Executor 连接

纯本地模式下，所有工具在本地执行（`LocalToolkitRouter`）。
用户可选择性连接远端 Executor：

1. 设置页面输入 Executor URL + Token
2. Main process 创建 `RemoteToolkitRouter` 实例
3. `RouterFactory` 根据 `member.location` 路由

## [S8] 自动更新

使用 `electron-updater`：
- 检查 GitHub Releases 或自建更新服务器
- 后台下载，下次启动时安装
- 用户可关闭自动更新

## [S9] 开发模式

开发时同时启动：
1. Vite dev server（前端热更新）
2. Electron main process（加载 Vite dev server URL）

```json
{
  "scripts": {
    "dev": "concurrently \"vite\" \"wait-on http://localhost:8080 && electron .\"",
    "build": "vite build && electron-builder",
    "package": "vite build && electron-builder --win --mac --linux"
  }
}
```

## [S10] 实施计划

| 阶段 | 任务 | 工作量 |
|------|------|--------|
| P1 | Electron 脚手架 + Main Process 启动 | 1天 |
| P2 | IPC 协议实现 + 前端适配层 | 2天 |
| P3 | API Key 管理 + 设置页面 | 1天 |
| P4 | 打包配置 + 多平台构建 | 1天 |
| P5 | 测试 + 修复平台差异 | 2天 |
| P6 | 自动更新 + 发布 | 1天 |
| **合计** | | **~8天** |

## [S11] 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Node.js 版本兼容 | 工具执行行为差异 | 锁定 Node.js 20 LTS |
| 大文件 Three.js 资源 | 首次加载慢 | 资源按需加载 + 缓存 |
| child_process 安全 | bash 工具执行风险 | 沙箱限制 + 用户确认 |
| macOS 签名 | 未签名无法分发 | Apple Developer 证书 |
| Windows Defender 误报 | .exe 被拦截 | 代码签名 + 信任白名单 |
