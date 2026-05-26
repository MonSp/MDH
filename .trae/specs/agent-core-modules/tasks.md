# Tasks

## Task 1: 多轮对话上下文 (ConversationMemory)
- [x] 在 `src/App.vue` 的 `deepseekRecognize()` 中，将 `messages` 数组由单条 user message 扩展为包含前序对话历史
  - 从 `conversations` 中提取最近 N 轮的 user/assistant 消息对（N 默认 10）
  - assistant 消息内容为上一轮的 tool call 摘要
  - 超出窗口的旧对话不携带
- [x] 在 header 区域添加"新建对话"按钮，点击后重置 conversations 和对话历史窗口
- 验证: 发送连续两条指令，确认第二条 LLM 请求携带了第一条的上下文

### Task 1 子步骤
- [x] 1.1 提取 conversation history helper 函数（从 conversations 数组构建 messages 历史）
- [x] 1.2 修改 `deepseekRecognize()` 的 messages 构造逻辑
- [x] 1.3 添加"新建对话"按钮 UI 及逻辑

---

## Task 2: 页面上下文记忆 (PageContextStore)
- [x] 在 `src/plugin-shell.ts` 中监听宿主推送的 `manifest_push`、`manifest_update`、`page_changed` 事件，暴露为可订阅的状态
- [x] 在 `src/App.vue` 中订阅页面上下文变化，将 URL/title 注入 `deepseekRecognize()` 的 system prompt
- [x] 在 header 区域展示当前页面 URL/title
- 验证: 导航到新页面后，UI 上的 URL/title 更新，LLM 请求的 system prompt 包含页面信息

### Task 2 子步骤
- [x] 2.1 在 `plugin-shell.ts` 中添加 `onManifestPush` / `onPageChanged` 回调机制
- [x] 2.2 在 `App.vue` 中注册回调，维护 reactive pageContext
- [x] 2.3 修改 system prompt 构造，追加页面上下文
- [x] 2.4 在 header 添加页面 URL/title 展示区域

---

## Task 3: 会话持久化 (SessionPersistence)
- [x] 利用 Vue `watch` 监听 `conversations` 变化，自动写入 localStorage
- [x] `onMounted` 时从 localStorage 恢复 conversations
- [x] 新建对话时同步清除 localStorage 中的持久化数据
- 验证: 对话后刷新页面，历史恢复；点击新建对话后刷新，历史为空

### Task 3 子步骤
- [x] 3.1 添加 save/load/clear 三个 localStorage 操作函数
- [x] 3.2 在 watch 中调用 save
- [x] 3.3 在 onMounted 中调用 load
- [x] 3.4 新建对话时调用 clear

---

## Task 4: 任务 Skill 模板 (SkillRegistry)
- [x] 定义 Skill 数据结构（name, description, params, plan）
- [x] 在 `execute_plan` 完成后，结果区增加"保存为 Skill"按钮
- [x] 弹出 Skill 编辑面板：自动分析 plan 中的可参数化部分，用户确认/编辑后保存
- [x] 在 header 或侧边栏添加 Skill 列表 UI，点击 Skill 弹出参数填写面板并执行
- [x] Skill 持久化到 localStorage
- 验证: 执行任务 → 保存 Skill → 刷新 → Skill 列表仍存在 → 选择 Skill 填写参数 → 执行成功

### Task 4 子步骤
- [x] 4.1 定义 Skill 类型和 SkillStore（localStorage 读写）
- [x] 4.2 实现"保存为 Skill"按钮和编辑面板 UI
- [x] 4.3 实现 Skill 列表 UI 和参数填写面板
- [x] 4.4 实现 Skill 执行逻辑（参数替换 + 发起 execute_plan）
- [x] 4.5 持久化与恢复（与 Task 3 共享 storage 工具）

---

## Task 5: 错误恢复与重试 (ErrorRecovery)
- [x] 在 `execute_plan` 循环中添加重试逻辑：失败后最多重试 3 次，指数退避等待（1s, 2s, 4s）
- [x] `TARGET_STALE` 错误特殊处理：先调用 get_page_context 重新获取 manifest，再重试
- [x] 重试中 timeline 步骤显示重试状态（"重试中 (1/3)"）
- 验证: 模拟步骤失败 → 观察自动重试 → 重试成功或耗尽后按预期停止

### Task 5 子步骤
- [x] 5.1 封装 `retryWithBackoff(fn, maxRetries)` 工具函数
- [x] 5.2 修改 execute_plan 循环，用 retryWithBackoff 包裹单个步骤执行
- [x] 5.3 TARGET_STALE 特殊处理：重试前先获取 manifest
- [x] 5.4 timeline 步骤 status 增加 'retrying' 状态及 UI 展示

---

## Task Dependencies
- Task 2 依赖 Task 1（页面上下文需要注入到 LLM 请求中，而 LLM 请求在 Task 1 中已改造）
- Task 3 依赖 Task 1（会话持久化的数据以 Task 1 改造后的 conversations 结构为准）
- Task 4 依赖 Task 3（Skill 持久化复用 storage 工具）
- Task 5 独立，无依赖
- Task 1 和 Task 3 可以并行推进（Task 1 改逻辑，Task 3 加持久化层，互不冲突）
- Task 5 独立，可与 Task 1-4 并行
