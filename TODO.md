# 架构优化 TODO

> 基于 2026-08-17 架构 Review，按优先级排列。

## P0 — 立即可做（1-2d）

- [ ] **删除 19 个死代码模块** — pilot_asset_injection.py, pilot_judge.py, pilot_judge_endpoint.py, pilot_minutes.py, pilot_minutes_ws.py, migrate_skills.py, run_project.py, demo_full_cycle.py, agent_discovery.py, workspace_sync.py, trace.py, message_queue.py, skill_router.py, api_config.py, registry_server.py, executor_server.py, mcp_server.py (standalone), run_project.py
- [ ] **提取 isElectron() 工具函数** — 消除 9 处 `(window as any).mdh?.isElectron` 重复
- [ ] **roles_config 添加 mtime 缓存** — server.py `_load_roles_config()` 每次读磁盘
- [ ] **提取 _build_agenda_snapshot() 辅助函数** — 消除 server.py WebSocket handler 5 处重复

## P1 — 短期（3-5d）

- [ ] **server.py 拆分为 APIRouter** — WebSocket handler ~1200 行，REST 端点混杂
- [ ] **提取共享模型创建工厂** — `_TempSession` 模式复制粘贴 3 遍 (server.py:890, meeting_coordinator.py:457, ceo_agent.py:155)
- [ ] **统一错误响应格式** — REST 端点混用 `_ok/_fail`、raw dict、HTTPException
- [ ] **3D 场景懒加载** — three.js + react-three-fiber 全量加载，应 React.lazy()

## P2 — 中期（1-2 周）

- [ ] **meeting_coordinator 拆分** — 1991 行，模型管理/任务编排/路由/门禁/技能进化混在一个类
- [ ] **巨型组件拆分** — CeoChatPanel(1188), SidePanel(1154), useMeetingSocket(1172)
- [ ] **Pydantic 请求模型** — 大多数端点用 raw dict，无输入验证
- [ ] **核心模块测试覆盖** — 44% 模块无测试（37/85），包括 server.py、meeting_coordinator.py

## P3 — 长期

- [ ] **async 端点同步 I/O** — server.py 多处同步文件读写
- [ ] **generate_skill 提取为服务类** — 170 行内联 LLM 编排
- [ ] **统一 API 客户端** — dynamicRouter.ts、experienceExtractor.ts 用 raw fetch，其他用 apiClient
- [ ] **消除 any 类型** — src/ 约 330 个 any，orchestrator 约 54 个
- [ ] **antd 依赖评估** — 仅 AgentScope chat 使用，~300KB gzipped
- [ ] **docx/pptxgenjs 动态导入** — ~300KB 仅导出功能使用

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
