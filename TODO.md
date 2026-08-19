# 架构优化 TODO

> 基于 2026-08-19 v1.3.1 规划，按优先级排列。

## v1.3.1 — 前端架构治理（计划中）

### A 线：useMeetingSocket 重构

- [x] **拆分消息处理器** — handlers.ts 按领域拆分为 meeting/voting/approval/checkpoint/bridge 5 个子模块
- [ ] **引入状态管理** — 用 Zustand 替代 40+ useState 扁平 bag，按领域拆分 store
- [ ] **消除双重消息处理** — CeoChatPanel 和 useMeetingSocket 的消息分发统一
- [ ] **添加单元测试** — 每个 handler 独立测试

### B 线：CeoChatPanel 拆分

- [ ] **提取通信逻辑** — IPC/WS 通信提取到 useCeoCommunication hook
- [ ] **提取角色选择** — 角色选择逻辑提取到 RoleSelector 组件
- [ ] **提取工作区配置** — 工作区配置提取到 WorkspaceConfig 组件
- [ ] **简化主组件** — 主组件仅保留布局和状态协调

### C 线：OfficeTeamMode 拆分

- [ ] **提取视图切换** — tower/office/meeting 视图切换逻辑提取
- [ ] **提取会议面板** — 会议面板渲染逻辑已拆分到 MeetingPanel.tsx
- [ ] **简化主组件** — 主组件仅保留布局和状态协调

### D 线：质量提升

- [ ] **Progressive loader 集成** — 将 progressive.ts 集成到执行流
- [ ] **剩余 as any 清理** — 55 处类型安全
- [ ] **组件测试补充** — CeoChatPanel、OfficeTeamMode 测试

---

## 已完成的历史优化

### v1.3.0（2026-08-19）

- ✅ Playwright 浏览器自动化（25 个工具，TS + Python 双端）
- ✅ Playwright 能力深化（有头模式、任务队列、HITL、实例池、录制回放、批量 API）
- ✅ TS 安全补齐（Shell 黑白名单、工具参数校验、LLM 守卫）
- ✅ TS 能力补齐（9 个 LLM 提供商、思维链流式、HITL 确认流、技能渐进加载）
- ✅ Python 架构治理（server.py -1451 行、meeting_coordinator -631 行）
- ✅ 死代码清理（删除遗留文件、未使用组件、移动测试脚本）
- ✅ 文档同步（README 版本历史/测试数量、AGENTS.md mock-sso）

### v1.2.2（2026-08-18）

- ✅ A 线：TS 安全补齐（Shell 黑白名单、工具参数校验、LLM 调用超时守卫）
- ✅ B 线：TS 能力补齐（9 个 LLM 提供商、思维链流式、HITL 确认流、技能渐进加载）
- ✅ C 线：Python 架构治理（server.py -1012 行、meeting_coordinator -631 行）

### v1.2.1（2026-08-18）

- ✅ 启用 5 个 Router 模块（skills/mcp/marketplace/community/workflow）
- ✅ WebSocket handler 拆分（server.py 3098→2001 行）
- ✅ process_user_message 拆分（7 个子方法）
- ✅ meeting_coordinator 拆分（工作流提取，1911→1447 行）

### v1.2.0（2026-08-17）

- ✅ 14 项调研驱动的全栈改进
- ✅ MCP 集成（Phase 1-3）
- ✅ 技能市场（Stage 1-3）
- ✅ 资产管理系统
- ✅ 模型管理重构
- ✅ LLM 守卫系统
- ✅ 配置层插件化
- ✅ 死代码清理（-4283 行）

### v1.1.0（2026-08-16）

- ✅ 会议纪要全链路
- ✅ 资产沉淀闭环

### v1.0.0（2026-08-14）

- ✅ 初始发布基线
