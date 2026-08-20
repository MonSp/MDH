# 架构优化 TODO

> 基于 2026-08-19 v1.3.1 规划，按优先级排列。

## v1.3.3 — 循环导入修复 + 类型安全（2026-08-20）

- [x] **循环导入修复** — 提取 SidePanel.styles.ts，子组件从共享文件导入
- [x] **前端类型安全** — useRolesConfig/RolePanel/SkillPanel/ToolPanel any 清零
- [x] **Handler 类型安全** — 5个handler模块+dispatcher+meetingStore any 清零
- [x] **useMeetingSocket 类型安全** — BridgeMessage 类型化

## v1.3.2 — 前端架构治理收尾 + 大文件拆分（2026-08-20）

### Code Review 修复

- [x] **C1** — SidePanel 删除重复导入
- [x] **C2** — SidePanel 导出 inputStyle/selectStyle/tagStyle 供子组件使用
- [x] **C3** — useCeoCommunication setMeetingPhase 类型 string→MeetingPhase
- [x] **I1** — SidePanel 清理残留 render 函数体 (618→292行)

### A 线：useMeetingSocket 重构

- [x] **拆分消息处理器** — handlers.ts 按领域拆分为 meeting/voting/approval/checkpoint/bridge 5 个子模块
- [x] **引入状态管理** — Zustand store 替代 40+ useState，按领域拆分 5 个 slice
- [x] **消除双重消息处理** — CeoChatPanel 仅处理 CEO 特有消息，其余委托给 useMeetingSocket
- [x] **添加单元测试** — 6 个测试文件，52 个用例覆盖所有 handler + dispatcher

### B 线：CeoChatPanel 拆分

- [x] **提取通信逻辑** — useCeoCommunication hook 封装 IPC/WS 通信
- [x] **提取角色选择** — RoleSelector 组件（部门分组 + 位置切换）
- [x] **提取工作区配置** — WorkspaceConfig 组件（类型/路径/分支配置）
- [x] **简化主组件** — CeoChatPanel 1044→547 行，接入 useCeoCommunication + RoleSelector，提取 ceo-types.ts/ceo-constants.ts

### C 线：OfficeTeamMode 拆分

- [x] **提取视图切换** — tower/office/meeting 视图切换逻辑在 index.tsx 中
- [x] **提取会议面板** — MeetingPanel.tsx (303 行) 独立组件
- [x] **简化主组件** — 主组件仅保留布局和状态协调，删除旧 OfficeTeamMode.tsx

### D 线：质量提升

- [x] **Progressive loader 集成** — progressive.ts 已实现，system-prompt 使用既有 loadSkillPacks（路径一致性）
- [x] **剩余 as any 清理** — ChatMessage 添加 _thinking/_workflowResult 类型定义
- [x] **组件测试补充** — CeoChatPanel、OfficeTeamMode 测试已通过（1714 passed）

### E 线：大文件拆分

- [x] **OfficeScene** — 939→264 行，提取 styles(499行) + 4 个 Tab 组件
- [x] **TechTowerView** — 884→417 行，提取 FloorProjectPanel/StorageSetupPrompt/SceneControlsPanel/ResourceButtons/constants
- [x] **MeetingChatPanel** — 764→删除，迁移到目录版本，修复相对路径
- [x] **CyberpunkGround** — 650→133 行，提取材质(materials.ts) + 8个子组件(components.tsx)
- [x] **dependencyAnalyzer** — 627→475 行，提取默认规则和模式到 defaults.ts
- [x] **taskDecomposer** — 590→437 行，提取内置模板到 templates.ts
- [x] **SidePanel** — 1155→621 行，提取 useRolesConfig hook + RolePanel/SkillPanel/ToolPanel 子组件
- [x] **plannerAgent** — 608→516 行，提取 plannerAgent.types.ts
- [x] **agentReferenceSystem** — 603→557 行，提取 agentReferenceSystem.types.ts
- [x] **taskScheduler** — 551→524 行，提取 taskScheduler.types.ts
- [x] **agentCoordinator** — 537→519 行，提取 agentCoordinator.types.ts
- [x] **CyberpunkBuildings** — 523→212 行，提取纹理生成器到 BuildingTextures.ts(271行)
- [x] **MeetingTable** — 521→267 行，提取 styles 到 MeetingTable.styles.ts(257行)
- [x] **SkillMarketplace** — 531→406 行，提取 types + styles
- [x] **taskPlanner** — 509→341 行，提取 types + NLP工具函数
- [x] **RoleConfigPanel** — 506→412 行，提取 types + NewRoleModal 子组件

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
