# Checklist

- [x] **C1**: 连续发送两条关联指令（如"打开百度"→"搜索天气"），第二条 LLM 请求的 messages 数组包含第一条的 user/assistant 消息
- [x] **C2**: 对话超过 10 轮后，第 11 轮 LLM 请求只携带最近 10 轮，更早的被截断
- [x] **C3**: 点击"新建对话"后，LLM 请求的 messages 数组只含当前 user message
- [x] **C4**: header 区域有"新建对话"按钮

- [x] **C5**: `plugin-shell.ts` 能处理 `manifest_push` / `manifest_update` / `page_changed` 事件
- [x] **C6**: header 区域展示当前页面 URL 和 title
- [x] **C7**: LLM 请求的 system prompt 中包含当前页面 URL 和 title 信息

- [x] **C8**: 进行 2 轮对话后刷新页面，对话历史恢复
- [x] **C9**: 点击"新建对话"后刷新页面，对话历史为空
- [x] **C10**: 对话列表变化时自动写入 localStorage（不阻塞 UI）

- [x] **C11**: execute_plan 成功后，结果区显示"保存为 Skill"按钮
- [x] **C12**: 点击"保存为 Skill"弹出编辑面板，自动识别可参数化的字段
- [x] **C13**: 保存后 Skill 出现在 Skill 列表中
- [x] **C14**: 刷新页面后 Skill 列表仍存在
- [x] **C15**: 选择 Skill → 填写参数 → 点击执行，正确发起 execute_plan
- [x] **C16**: header 或侧边栏有 Skill 列表入口

- [x] **C17**: execute_plan 步骤失败后自动重试（最多 3 次，指数退避间隔）
- [x] **C18**: TARGET_STALE 错误重试前先调用 get_page_context
- [x] **C19**: 重试中 timeline 步骤显示"重试中 (N/3)"状态
- [x] **C20**: 重试耗尽后步骤标记为 error，按 stop_on_error 决定是否继续

- [x] **C21**: 项目构建成功（`npm run build` 无错误）
