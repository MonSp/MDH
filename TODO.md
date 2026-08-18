# 架构优化 TODO

> 基于 2026-08-18 深度代码审查，按优先级排列。

## v1.2.1 已完成（2026-08-18）

- [x] **修复 duplicate except ValueError** — server.py clone_skill 端点不可达代码
- [x] **全局异常处理器返回 HTTP 500** — 原先返回 200，编程错误伪装成正常响应
- [x] **Docker DEEPSEEK_BASE_URL 修复** — 默认值补充 `/v1` 后缀
- [x] **移除损坏的 mock-sso 服务** — 引用已删除目录，启动必失败
- [x] **Docker healthcheck + restart 策略** — backend/executor 添加健康检查，所有服务添加重启策略
- [x] **启用全部 5 个 Router 模块** — skills/mcp/marketplace/community/workflow 全部验证通过并启用
- [x] **.env.example 补充缺失变量** — EXECUTOR_WORKSPACE、EXECUTOR_STORAGE、CORS_ORIGINS

---

## P0 — 严重风险（立即处理）

### server.py 单体巨石（3075 行）

- [x] **启用 Router 模块** — 5/5 已启用（skills/mcp/marketplace/community/workflow），1250 tests passing
- [x] **server.py WebSocket handler 拆分** — 43 个 handler 提取到 ws_handlers.py，server.py 3098→1998 行
- [x] **拆分 process_user_message** — 496 行函数拆分为 7 个子方法，meeting_coordinator 1911→1744 行

### meeting_coordinator.py 单体（原 1911 行）

- [x] **拆分 process_user_message** — 496 行拆为 7 个子方法 + 编排器
- [x] **提取工作流执行到 coordinator_workflow.py** — 8 个方法（311 行），meeting_coordinator 1911→1447 行

### 核心模块零测试覆盖

- [x] **server.py 集成测试** — 35 个测试覆盖 86 个 REST 端点，修复 http_exception_handler bug
- [ ] **meeting_coordinator.py 集成测试** — 1911 行，核心编排逻辑未测试
- [ ] **mcp_server.py 测试** — 991 行 MCP 协议实现，HIGH
- [ ] **ceo_agent.py 测试** — 709 行 CEO 智能体逻辑，HIGH

---

## P1 — 高优先级（1-2 周）

### 前端 god hook

- [x] **拆分 useMeetingSocket** — 618 行 switch handler 提取到 handlers.ts，主文件 1183→575 行
- [x] **消除双重消息处理** — CeoChatPanel 不再处理 agent_message，委托给 useMeetingSocket

### 前端 god 组件

- [ ] **拆分 CeoChatPanel** — 1097 行，混合 IPC/WS 通信、角色选择、工作区配置
- [x] **拆分 OfficeTeamMode** — 731 行拆为 3 文件模块（index/TaskList/MeetingPanel）
- [x] **拆分 MeetingChatPanel** — 764 行拆为 3 文件模块（index/helpers/renderers）

### 异常处理质量

- [x] **收窄 except Exception** — 27 个 REST 端点添加 (KeyError, ValueError) 具体捕获
- [x] **消除空 pass 吞异常** — 关键文件（server/ws_handlers/skill_packager）的空 pass 已替换为 logging
- [x] **print 替换为 logging** — 62 个 print() 均在 __main__ 块中（demo 代码），生产代码无 print

### 类型安全

- [x] **封装 isElectron() 工具函数** — 统一使用 constants.ts 的 isElectron()/getMdH()，消除 31 处 as any
- [x] **WebSocket 消息类型校验** — 添加 isWsMessage/isKnownMessageType 类型守卫，50+ 已知消息类型
- [x] **拆分 protocol.py** — 64 个类/函数拆为 protocol/ 包（workflow/meeting/voting/approval 4 模块）

---

## P2 — 中期改进（2-4 周）

### 重复类型定义

- [x] **统一 Project/SubTask/ProjectTask 类型** — useBrowserStorage 改为导入 office-team/types

### Local/non-Local 命名

- [x] **统一 *Local.ts 命名约定** — 5 个无 wrapper 的 Local 文件已重命名去除 Local 后缀

### 状态管理碎片化

- [x] **统一 localStorage key 常量** — CeoChatPanel/SidePanel/useMeetingSocket 改用 STORAGE_KEYS
- [ ] **useMeetingSocket 状态管理重构** — 40+ 返回值的扁平 bag，考虑引入 Zustand

### 组件测试

- [ ] **CeoChatPanel 测试** — 主要组件无测试
- [ ] **MeetingChatPanel 测试** — 主要组件无测试
- [ ] **SkillMarketplace 测试** — 市场面板无测试
- [ ] **McpConfigPanel 测试** — MCP 配置面板无测试

### CI/CD 完善

- [x] **修复被 deselect 的测试** — test_skill_packs_structure 已通过，test_performance 已删除，移除 deselect
- [x] **添加依赖缓存** — CI 添加 pip 和 npm 缓存
- [ ] **添加 Docker 镜像构建流水线** — 当前仅有测试 CI，无构建/部署

---

## P3 — 长期演进

### 前端性能

- [ ] **chatMessages 虚拟化** — 每条消息触发数组拷贝 + 全量 re-render，快速消息流下性能问题
- [ ] **scrollIntoView 布局抖动** — 快速消息到达时频繁触发

### 安全加固

- [ ] **收窄 CORS 配置** — `allow_methods=["*"]`、`allow_headers=["*"]` 应限制
- [ ] **扩展危险命令模式** — security.py 仅拦截 7 种（缺少 curl|bash、eval、反向 shell 等）
- [ ] **扩展限流覆盖** — 仅覆盖 browser_automation 和 file_operation

### 依赖管理

- [ ] **锁定 requirements.txt 版本** — 全部用 >= 无锁版本，构建不可复现
- [ ] **修复 pyyaml 重复条目**
- [ ] **@types/three 移到 devDependencies**
- [ ] **修复 peer dependency 冲突** — CI 用 --legacy-peer-deps 掩盖

### 文档同步

- [ ] **README 徽章更新** — 显示 "1142 passed"，实际 1251
- [ ] **README skill_packs 数量** — 写的 5 个，实际 43 个
- [ ] **端口文档一致性** — AGENTS.md orchestrator 端口 8080 vs docker-compose 9090

---

## 已完成的历史优化

- ✅ v1.2.1 Bug 修复（duplicate except、HTTP 500、Docker 配置、healthcheck）
- ✅ 14 项 v1.2.0 改进（投票策略、TS 清理、Subagent 委托、HITL 分级等）
- ✅ MCP 集成（Phase 1-3 + 配置面板 + TS 客户端）
- ✅ Agent Skills loader 更新（42 个 SKILL.md 迁移）
- ✅ 技能市场（Stage 1-3：共享池 + Fork + 导入导出 + Git 注册表）
- ✅ 资产管理系统（存储 + 评测 + LLM judge + 注入 + 模板固化）
- ✅ 模型管理重构（model_factory + model_manager + agent.py 多 provider）
- ✅ LLM 守卫系统（超时 + 重试 + 指数退避）
- ✅ 配置层插件化（SkillBridge + 渐进披露加载器）
- ✅ 死代码清理（-4283 行）
- ✅ 路由器模块创建（5 个 Router，待启用）
- ✅ 模型创建工厂（消除重复 provider registry 调用）
- ✅ 3D 场景懒加载（React.lazy + Suspense）
- ✅ meeting_coordinator 拆分（ModelManager + GateEngine + RoutingStatsManager）
- ✅ Pydantic 请求模型（schemas.py 20 个 Request 类）
- ✅ 统一 API 客户端（apiFetch.ts）
- ✅ antd 依赖移除（~300KB savings）
- ✅ docx/pptxgenjs 动态导入（懒加载）
