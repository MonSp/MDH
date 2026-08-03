---
feature: electron-project-storage
status: designed
updated: 2026-07-31
branch: main
commits:
---

# Electron 项目持久化存储

## Report

## [S1] Problem

Electron 模式下，3D 科技大厦的项目管理（创建项目、历史项目、任务/子任务）完全不可用，重启后数据丢失。

**根因链条：**
1. `TechTowerView.tsx:249` — `skipSetup = isElectron` 直接跳过存储目录设置 → `dirName` 为空 → `projects` 永远为空数组
2. 底层 `useLocalStorage` hook 依赖 **File System Access API**（`window.showDirectoryPicker`），在 Electron 的 `file://` 协议下不可靠
3. `/api/projects` REST 通道（`projectManager.ts`）在 Electron 拦截器 `API_TO_IPC` 中没有映射 → OfficeTeamMode 项目详情请求 `file:///api/projects/...` 必然失败
4. 结果：项目创建只存在于内存 state，应用重启即丢失

## [S2] Design

### 存储后端：主进程 JSON 文件

Electron 主进程负责项目数据的持久化，存储到 `app.getPath('userData')/projects.json`。渲染进程通过 IPC 访问，与现有 `roles/skills` IPC 模式一致。

### IPC 通道（新增，preload 白名单 + ipc-handlers 实现）

| 通道 | 方向 | 参数 | 返回 |
|------|------|------|------|
| `mdh:projectList` | renderer→main | — | `ProjectData[]` |
| `mdh:projectSave` | renderer→main | `project: ProjectData` | `{ success: boolean }` |
| `mdh:projectDelete` | renderer→main | `projectId: string` | `{ success: boolean }` |
| `mdh:projectGet` | renderer→main | `projectId: string` | `ProjectData \| null` |

主进程维护单一 `projects.json` 文件（数组），所有变更操作读取→修改→原子写入。写操作加简单重试（最多 2 次）。

### 前端适配：fileSystemStorage 增加 Electron 分支

在 `src/services/fileSystemStorage.ts` 内部新增 Electron IPC 实现，**对外 API 签名不变**（`getProjects`/`saveProject`/`deleteProject`/`renameProject`/`addTask`/`deleteTask`/`addSubtask`/`updateSubtaskStatus`/`getCategories`/`exportAll`/`importAll`），因此 `useLocalStorage` hook 和 `TechTowerView` 零改动。

Electron 分支的存储直接映射到 IPC 通道，不使用 File System Access API：

- `getProjects()` → `mdh:projectList`
- `saveProject(project)` → `mdh:projectSave`
- `deleteProject(id)` → `mdh:projectDelete`
- `renameProject(id, name)` → 读列表→改名→`mdh:projectSave`（或新增专用通道，最小化则复用 save）
- `addTask/deleteTask/addSubtask/updateSubtaskStatus` → 读列表→改→save（保持与现有实现相同的"全量重写"模式）

### 环境检测

沿用现有模式：`typeof window !== 'undefined' && (window as any).mdh?.isElectron === true`。

模块内部在首次调用时检测一次环境，缓存结果：
```typescript
const isElectron = typeof window !== 'undefined' && (window as any).mdh?.isElectron === true
```

### 默认项目兜底

`TechTowerView` 渲染时已合并 `DEFAULT_PROJECTS`（`TechTowerView.tsx:82`），因此即使无历史项目，3D 大厦仍有默认项目可展示。本项目不改变该行为。

### 拦截器补充（可选增强）

`electronApiInterceptor.ts` 的 `API_TO_IPC` 增加 `/api/projects` 映射，让 `projectManager.ts` 的 REST 调用在 Electron 下也走 IPC。**范围决策**：OfficeTeamMode 的项目详情依赖 `/api/projects/:id`（GET），拦截器当前只拦截 GET 且无 method 的请求。为最小化改动，本项目只覆盖 3D 大厦（TechTowerView）路径——即 fileSystemStorage Electron 分支；`/api/projects` 拦截为可选后续项（见 S3）。

## [S3] Out of Scope

- `/api/projects` REST 拦截器映射（OfficeTeamMode 的项目详情 REST 路径）——单独后续任务
- 项目数据迁移（浏览器 File System API 数据 → Electron JSON）——无自动迁移，用户重新创建
- 多项目分类的目录选择 UI——Electron 直接使用 userData 目录，不弹目录选择器
- 修改 `useLocalStorage` hook 或 `TechTowerView` 组件代码

## Tasks

- [ ] T1: 主进程项目 IPC 处理器 — acceptance: `ipc-handlers.ts` 实现 `mdh:projectList/Save/Delete/Get`，读写 `userData/projects.json`，preload 白名单加入 4 个通道 (covers: S2)
- [ ] T2: fileSystemStorage Electron 分支 — acceptance: `fileSystemStorage.ts` 在 Electron 环境下走 IPC，`getProjects/saveProject/deleteProject/renameProject/addTask/deleteTask/addSubtask/updateSubtaskStatus` 全部映射，浏览器环境行为不变 (covers: S2; depends: T1)
- [ ] T3: 测试 — acceptance: 新增 `electron-project-storage` 相关测试（前端 fileSystemStorage 分支 + Electron IPC 处理器单元测试），运行通过 (covers: S2; depends: T2)
- [ ] T4: 构建验证 — acceptance: `npm run build:electron` 成功，`tsc --noEmit` 无新错误 (covers: S2; depends: T3)
