# 浏览器Agent核心模块 Spec

## Why
当前 Agent 本质上是一个"单轮指令 → 单次执行"的薄层代理：没有对话记忆、没有页面环境感知、没有任务积累复用、没有容错能力。本次迭代需要补齐 5 个 P0/P1 核心模块，使 Agent 从一次性工具进化为可积累、可记忆、可恢复的智能助手。

## What Changes

### Phase 1: 多轮对话上下文 (ConversationMemory)
- 在 DeepSeek API 调用中注入前序对话历史
- 维护滑动窗口（最近 N 轮），控制 token 消耗
- 前序 tool call 结果摘要注入后续 system prompt
- 新建对话按钮支持

### Phase 2: 页面上下文记忆 (PageContextStore)
- 消费宿主推送的 `manifest_push` / `manifest_update` 事件
- 缓存当前页面的 `PageMetadata` 和 `ToolManifest`
- 将页面上下文注入 LLM 请求的 system prompt
- 页面 URL/title 实时展示

### Phase 3: 会话持久化 (SessionPersistence)
- 对话历史持久化到 localStorage
- 页面刷新后恢复上一次会话
- 支持清空历史

### Phase 4: 任务 Skill 模板 (SkillRegistry)
- 任务执行成功后，自动提示保存为 Skill
- Skill 定义：name + description + params + plan
- Skill 列表 UI（侧边栏/下拉）
- 点击 Skill 一键填充参数并执行
- Skill 持久化到 localStorage

### Phase 5: 错误恢复与重试 (ErrorRecovery)
- `execute_plan` 中单步失败自动重试（最多 N 次，指数退避）
- `TARGET_STALE` 错误后自动请求新 manifest 并重试
- 重试状态在 timeline 中可视化展示

## Impact
- Affected specs: 无（首次 spec）
- Affected code: `src/App.vue`（主逻辑变更）、`src/plugin-shell.ts`（监听 manifest 事件）、新增 `src/modules/` 目录

---

## ADDED Requirements

### Requirement: 多轮对话上下文
系统 SHALL 在发送 LLM 请求时携带前序对话历史，使 Agent 能理解上下文连续执行多步指令。

#### Scenario: 连续指令
- **GIVEN** 用户先发送"打开百度"
- **WHEN** 用户接着发送"搜索天气"
- **THEN** LLM 请求的 messages 数组包含前一轮 "打开百度" 的 user/assistant 消息

#### Scenario: 窗口限制
- **GIVEN** 对话已超过 10 轮
- **WHEN** 发送新消息
- **THEN** 只携带最近 10 轮对话，更早的轮次被截断

#### Scenario: 新对话
- **WHEN** 用户点击"新建对话"按钮
- **THEN** 对话历史窗口清空，新消息不会携带任何历史

---

### Requirement: 页面上下文记忆
系统 SHALL 消费宿主推送的 manifest 事件，维护当前页面的上下文信息，并注入 LLM 请求。

#### Scenario: 接收 manifest_push
- **WHEN** 宿主推送 `manifest_push` 事件（含 page_metadata 和 tools 清单）
- **THEN** PageContextStore 更新当前页面 URL、title、可用工具列表

#### Scenario: 页面上下文注入 LLM
- **WHEN** 发送 LLM 请求
- **THEN** system prompt 中包含当前页面 URL、title 和可用工具描述

#### Scenario: 页面切换自动更新
- **WHEN** 导航到新页面后宿主推送 `page_changed` 事件
- **THEN** 页面 URL/title 在 UI 上实时更新，页面上下文也随之更新

---

### Requirement: 会话持久化
系统 SHALL 将对话历史持久化到 localStorage，页面刷新后可恢复。

#### Scenario: 刷新恢复
- **GIVEN** 用户已进行 3 轮对话
- **WHEN** 用户刷新页面
- **THEN** 3 轮对话重新渲染，继续之前的上下文

#### Scenario: 清空历史
- **WHEN** 用户点击"清空对话"按钮
- **THEN** 所有对话历史从 localStorage 中删除，UI 恢复空白状态

#### Scenario: 持久化时机
- **WHEN** 对话列表发生变化（新增/更新）
- **THEN** 自动写入 localStorage，不阻塞 UI

---

### Requirement: 任务 Skill 模板
系统 SHALL 支持将成功执行的任务保存为参数化 Skill 模板，并支持一键复用。

#### Scenario: 保存 Skill
- **GIVEN** 用户完成一次"搜索 [X] → 点击第一个结果 → 截图"的任务
- **WHEN** 用户在结果区点击"保存为 Skill"
- **THEN** 弹出 Skill 定义面板，自动提取参数（如 [X]），用户可编辑 name/description 后保存

#### Scenario: 使用 Skill
- **WHEN** 用户在 Skill 面板中选择"某某 Skill"
- **THEN** 弹出参数填写面板，用户填入参数后点击执行

#### Scenario: Skill 持久化
- **GIVEN** 用户保存了 3 个 Skill
- **WHEN** 用户刷新页面
- **THEN** 3 个 Skill 仍然可用

---

### Requirement: 错误恢复与重试
系统 SHALL 在 `execute_plan` 执行中提供自动重试能力。

#### Scenario: 单步失败自动重试
- **GIVEN** execute_plan 的某一步因超时失败
- **WHEN** 重试次数未超过上限（默认 3 次）
- **THEN** 自动重试该步骤，等待间隔为指数退避（1s, 2s, 4s）

#### Scenario: 重试耗尽
- **GIVEN** 某步骤已重试 3 次仍然失败
- **WHEN** 第 4 次仍然失败
- **THEN** 标记该步骤为 error，根据 `stop_on_error` 决定是否继续

#### Scenario: TARGET_STALE 恢复
- **GIVEN** 步骤返回 `TARGET_STALE` 错误
- **WHEN** 自动重试
- **THEN** 先调用 get_page_context 重新获取 manifest，再用新 target_ref 重试

#### Scenario: 重试可视化
- **WHEN** 步骤正在重试中
- **THEN** timeline 中该步骤显示重试次数和倒计时

---

## MODIFIED Requirements

### Requirement: LLM 请求构造 (已修改)
**原行为**: messages 数组只含当前 user message
**新行为**: messages 数组包含窗口内的前序对话 + 当前 user message

详见 "多轮对话上下文" 需求。

### Requirement: execute_plan 执行 (已修改)
**原行为**: 步骤失败即停止
**新行为**: 步骤失败先自动重试（可配置次数），重试耗尽后才停止

详见 "错误恢复与重试" 需求。

---

## REMOVED Requirements

无。
