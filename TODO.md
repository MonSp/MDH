# 架构优化 TODO

> 基于 2026-08-18 深度代码审查，按优先级排列。

## v1.2.1 已完成（2026-08-18）

- [x] **修复 duplicate except ValueError** — server.py clone_skill 端点不可达代码
- [x] **全局异常处理器返回 HTTP 500** — 原先返回 200，编程错误伪装成正常响应
- [x] **Docker DEEPSEEK_BASE_URL 修复** — 默认值补充 `/v1` 后缀
- [x] **移除损坏的 mock-sso 服务** — 引用已删除目录，启动必失败
- [x] **Docker healthcheck + restart 策略** — backend/executor 添加健康检查，所有服务添加重启策略
- [x] **路由模块 init() 调用就绪** — skills/workflow/marketplace/mcp/community 路由器已接线
- [x] **.env.example 补充缺失变量** — EXECUTOR_WORKSPACE、EXECUTOR_STORAGE、CORS_ORIGINS

---

## P0 — 严重风险（立即处理）

### server.py 单体巨石（3075 行）

- [ ] **启用 Router 模块** — 5 个路由模块已创建但全部被注释，需逐个验证与内联端点行为一致后启用
- [ ] **拆分 `_run_meeting_message`** — 872 行的单体函数，需拆分为独立的 WebSocket 消息处理器
- [ ] **server.py WebSocket handler 拆分** — 1175 行的 if/elif 链处理 43 种消息类型，提取为独立 handler 类

### meeting_coordinator.py 单体（1911 行）

- [ ] **提取讨论/投票/审查流程为独立协调器** — `process_user_message` 496 行，职责过多

### 核心模块零测试覆盖

- [ ] **server.py 集成测试** — 3075 行，零直接测试，CRITICAL
- [ ] **meeting_coordinator.py 集成测试** — 1911 行，核心编排逻辑未测试
- [ ] **mcp_server.py 测试** — 991 行 MCP 协议实现，HIGH
- [ ] **ceo_agent.py 测试** — 709 行 CEO 智能体逻辑，HIGH

---

## P1 — 高优先级（1-2 周）

### 前端 god hook

- [ ] **拆分 useMeetingSocket** — 1172 行，21 个 useState，636 行 switch handler。拆为 useMeetingState / useVoting / useApproval / useCheckpoints
- [ ] **消除双重消息处理** — CeoChatPanel 和 useMeetingSocket 各自独立监听 WebSocket，形成竞争管线

### 前端 god 组件

- [ ] **拆分 CeoChatPanel** — 1097 行，混合 IPC/WS 通信、角色选择、工作区配置
- [ ] **拆分 OfficeTeamMode** — 731 行，视图状态 + 会议生命周期 + 任务列表 + 工作流
- [ ] **拆分 MeetingChatPanel** — 764 行，消息渲染 + 立场显示 + 流式光标

### 异常处理质量

- [ ] **收窄 except Exception** — 213 个宽泛捕获（server.py 独占 49 个），引入结构化异常层次
- [ ] **消除空 pass 吞异常** — 52 个空 pass 语句，改为 logging 或具体异常处理
- [ ] **print 替换为 logging** — 62 个 print() 调用在生产代码中

### 类型安全

- [ ] **封装 isElectron() 工具函数** — 消除 31 处 `(window as any).mdh` 重复模式
- [ ] **WebSocket 消息类型校验** — handler 参数为 any，用 Zod 做运行时校验
- [ ] **拆分 protocol.py** — 64 个类/函数在单文件中

---

## P2 — 中期改进（2-4 周）

### 重复类型定义

- [ ] **统一 Project/SubTask/ProjectTask 类型** — 6 个文件中独立定义，形状略有不同，抽取 shared types

### Local/non-Local 命名

- [ ] **统一 *Local.ts 命名约定** — 4 对文件有 API wrapper，5 个 Local 文件无对应 wrapper，命名暗示不存在的远程版本

### 状态管理碎片化

- [ ] **统一 localStorage key 常量** — 62 处裸 localStorage 调用，key 使用不一致
- [ ] **useMeetingSocket 状态管理重构** — 40+ 返回值的扁平 bag，考虑引入 Zustand

### 组件测试

- [ ] **CeoChatPanel 测试** — 主要组件无测试
- [ ] **MeetingChatPanel 测试** — 主要组件无测试
- [ ] **SkillMarketplace 测试** — 市场面板无测试
- [ ] **McpConfigPanel 测试** — MCP 配置面板无测试

### CI/CD 完善

- [ ] **修复被 deselect 的测试** — test_skill_packs_structure 和 test_performance 被跳过而非修复
- [ ] **添加依赖缓存** — CI 每次从零下载所有依赖
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
