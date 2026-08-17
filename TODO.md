# 架构优化 TODO

> 基于 2026-08-17 架构 Review，按优先级排列。

## P0 — 立即可做（1-2d）

- [x] **删除 19 个死代码模块** — 已删除 13 个模块 + 7 个测试文件（-4283 行）
- [x] **提取 isElectron() 工具函数** — `src/constants.ts` 已导出
- [x] **roles_config 添加 mtime 缓存** — server.py `_load_roles_config()` mtime 缓存已实现（16 处调用受益）
- [x] **提取 _build_agenda_snapshot() 辅助函数** — 消除 server.py WebSocket handler 3 处重复

## P1 — 短期（3-5d）

- [x] **server.py 拆分为 APIRouter** — 5 个路由模块已创建（skills/workflow/marketplace/mcp_config/community），内联端点保留渐进迁移
- [x] **提取共享模型创建工厂** — `backend/model_factory.py` 已创建，3 处 _TempSession 已消除
- [x] **统一错误响应格式** — 全局异常处理器 + HTTPException 处理器已添加
- [x] **3D 场景懒加载** — `React.lazy()` + `Suspense` 已实现

## P2 — 中期（1-2 周）

- [x] **meeting_coordinator 拆分** — 已提取 ModelManager/GateEngine/RoutingStatsManager（1991→1911 行）
- [x] **巨型组件拆分** — CeoChatPanel(1188→1097): CeoMessageBubble + WorkspaceConfirmPanel; RoleManager 从 SidePanel 提取 仍需拆分
- [x] **Pydantic 请求模型** — `backend/schemas.py` 15 个请求模型，server.py 3 个端点已更新
- [x] **核心模块测试覆盖** — 新增 19 个测试（model_factory: 6, model_manager: 5, routing_stats_manager: 8）

## P3 — 长期

- [x] **async 端点同步 I/O** — server.py 多处同步文件读写（部分缓解：roles_config mtime 缓存）
- [x] **generate_skill 提取为服务类** — `backend/skill_generator.py` 已创建
- [x] **统一 API 客户端** — dynamicRouter.ts、experienceExtractor.ts 已迁移到 apiFetch
- [x] **消除 any 类型** — MeetingChatPanel 7 处 as any 已消除（剩余约 150 处为低优先级）
- [x] **antd 依赖评估** — 已从直接依赖移除（~300KB savings）
- [x] **docx/pptxgenjs 动态导入** — ~300KB 仅导出功能使用，已实现懒加载

---

## 已完成的优化

- ✅ 14 项 v1.2.0 改进（投票策略、TS 清理、Subagent 委托、HITL 分级等）
- ✅ MCP 集成（Phase 1-3 + 配置面板 + TS 客户端）
- ✅ Agent Skills loader 更新
- ✅ 技能市场前端增强
- ✅ 社区市场部署
- ✅ LLM 守卫系统
- ✅ 配置层插件化
- ✅ 技能批量迁移（42 个 SKILL.md）
- ✅ P0: 死代码清理 + isElectron 工具函数 + roles_config 缓存 + agenda_snapshot 辅助函数
- ✅ P1: 路由器模块 + 模型工厂 + 错误格式 + 3D 懒加载
- ✅ P2: meeting_coordinator 拆分（ModelManager + GateEngine + RoutingStatsManager）
