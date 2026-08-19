# 架构优化 TODO

> 基于 2026-08-18 v1.2.2 规划，按优先级排列。

## v1.3.0 — 进行中

### Playwright 浏览器自动化

- [x] **PlaywrightBrowser 类** — orchestrator/src/toolkit/browser.ts
- [x] **25 个浏览器工具定义** — orchestrator/src/agent/tools.ts
- [x] **执行器集成** — orchestrator/src/toolkit/local.ts
- [ ] **集成测试** — 使用本地 HTML 文件测试完整流程
- [ ] **Python 端集成** — 通过 remote toolkit router 暴露给 Python Agent

### A 线：TS 安全补齐（P0）

- [x] **Shell 命令黑名单** — orchestrator/src/toolkit/shellSafety.ts，16 个危险模式
- [x] **Shell 命令白名单** — 60+ 允许命令
- [x] **路径遍历保护加固** — 已有 safePath()，无需额外修改
- [x] **工具参数校验** — tools.ts validateToolCall()，执行前校验 required 参数
- [x] **工具超时** — 已集成到 LLM guard 中（120s 超时 + 重试）
- [x] **LLM 调用超时守卫** — llm/guard.ts，safeChatStream() 120s 超时 + 2 次重试 + 指数退避

### B 线：TS 能力补齐（P1）

- [x] **DashScope/Qwen 支持** — baseUrl: dashscope.aliyuncs.com, model: qwen-plus
- [x] **Gemini 支持** — baseUrl: generativelanguage.googleapis.com, model: gemini-2.5-flash
- [x] **Moonshot 支持** — baseUrl: api.moonshot.cn, model: moonshot-v1-8k
- [x] **xAI/Grok 支持** — baseUrl: api.x.ai, model: grok-3
- [x] **思维链流式支持** — 解析 reasoning_content + thinking_start/delta/end 事件 + 前端折叠展示
- [x] **HITL 确认流** — agent/hitl.ts，危险操作用户确认，30s 超时自动拒绝
- [x] **技能渐进加载** — skill/progressive.ts，L0-L3 四层渐进披露
- [x] **技能到任务匹配** — findSkillsForTask() 关键词匹配自动选择技能

### C 线：Python 架构治理（P2）

- [x] **server.py REST 端点迁移** — 移除 34 个内联端点（skills/workflow/marketplace/mcp/community），server.py 2086→1652 行
- [x] **meeting_coordinator 讨论流程提取** — coordinator_discussion.py (127 行)
- [x] **meeting_coordinator 投票流程提取** — 已在 process_user_message 子方法中
- [x] **meeting_coordinator 审查流程提取** — coordinator_summary.py (108 行)
- [ ] **server.py 端点测试补充** — 当前仅 35 个
- [ ] **meeting_coordinator 测试** — 核心编排流程测试

---

## 已完成的历史优化

### v1.2.2（2026-08-18）

- ✅ A 线：TS 安全补齐（Shell 黑白名单、工具参数校验、LLM 调用超时守卫）
- ✅ B 线：TS 能力补齐（9 个 LLM 提供商、思维链流式、HITL 确认流、技能渐进加载）
- ✅ C 线：Python 架构治理（server.py -1012 行、meeting_coordinator -631 行）
- ✅ 严重问题修复（Node 20 兼容、glob 依赖、Docker 配置、LLM 超时保护）
- ✅ 死代码清理（删除遗留文件、未使用组件、移动测试脚本）
- ✅ 文档同步（README 版本历史/测试数量、AGENTS.md mock-sso）

### v1.2.1（2026-08-18）

- ✅ 启用 5 个 Router 模块（skills/mcp/marketplace/community/workflow）
- ✅ WebSocket handler 拆分（server.py 3098→2001 行）
- ✅ process_user_message 拆分（7 个子方法）
- ✅ meeting_coordinator 拆分（工作流提取，1911→1447 行）
- ✅ server.py 集成测试（+35 测试）
- ✅ 异常处理改进（空 pass → logging，27 端点分层捕获）
- ✅ isElectron/getMdH 统一（消除 31 处 as any）
- ✅ protocol.py 拆分（4 模块包）
- ✅ 消除双重消息处理（CeoChatPanel -34 行）
- ✅ WebSocket 消息类型校验（50+ 已知消息类型守卫）
- ✅ useMeetingSocket 拆分（1183→575 行）
- ✅ MeetingChatPanel 拆分（3 文件模块）
- ✅ OfficeTeamMode 拆分（3 文件模块）
- ✅ localStorage key 统一
- ✅ 类型统一（useBrowserStorage 消除重复）
- ✅ Local 文件重命名（5 个文件去除后缀）
- ✅ CI 改进（移除 deselect，缓存，Docker 构建）
- ✅ 组件测试（+15 测试）
- ✅ 安全加固（CORS 收窄，危险命令扩展，限流扩展）
- ✅ 依赖管理（版本锁定，pyyaml 修复，@types/three 移动）
- ✅ 文档同步（README 徽章/skill_packs，端口一致性）
- ✅ 前端性能（scrollIntoView rAF 防抖）
- ✅ CI Docker 构建修复（antd 依赖 + build 脚本）

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
