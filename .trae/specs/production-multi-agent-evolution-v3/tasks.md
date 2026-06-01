# Tasks

## Phase 1: 测试基础设施搭建

### Task 1: 引入 Vitest 测试框架
- [x] 1.1 在 `package.json` 中添加 `vitest`、`@vitest/coverage-v8` 依赖
- [x] 1.2 创建 `vitest.config.ts`，配置测试环境（jsdom）、路径别名、覆盖率报告
- [x] 1.3 在 `package.json` 中添加 `test` 和 `test:coverage` 脚本
- [x] 1.4 创建 `src/modules/__tests__/setup.ts` 测试辅助文件，导出通用 mock 工厂函数

---

## Phase 2: 代码质量治理

### Task 2: 消除 Vue/React 框架混用
- [x] 2.1 修改 `src/modules/skillStore.ts`，将 Vue `reactive` 替换为纯 JavaScript 对象 + 发布-订阅模式
- [x] 2.2 修改 `src/modules/pageContextStore.ts`，将 Vue `reactive` 替换为纯 JavaScript 对象 + 发布-订阅模式
- [x] 2.3 全局搜索确认无其他文件引用 Vue 的 `reactive`、`ref`、`computed` 等 API

### Task 3: 统一 UUID 生成方式
- [x] 3.1 修改 `src/modules/negotiationEngine.ts`，将自定义 `generateId()` 替换为 `crypto.randomUUID()`
- [x] 3.2 全局搜索确认其他模块的 UUID 生成方式一致性

### Task 4: AgentCoordinator 依赖注入改造
- [x] 4.1 修改 `src/modules/agentCoordinator.ts`，构造函数增加可选参数 `deps?: { registry?, communicationBus?, taskAssigner? }`
- [x] 4.2 未注入时使用默认实例，保持向后兼容
- [x] 4.3 确认现有调用方无需修改

---

## Phase 3: 模块统一导出

### Task 5: 创建 barrel export
- [x] 5.1 创建 `src/modules/index.ts`，统一导出所有模块的公共类型、类、接口
- [x] 5.2 确认导出覆盖所有 35 个模块的核心导出项
- [x] 5.3 验证 `import { ... } from '@/modules'` 路径在项目中可用

---

## Phase 4: 配置持久化

### Task 6: ConfigManager localStorage 持久化
- [x] 6.1 修改 `src/modules/configSchema.ts`，`ConfigManager` 构造函数添加 `persistKey?: string` 选项
- [x] 6.2 实现 `saveToStorage()` 方法：将当前配置序列化到 localStorage
- [x] 6.3 实现 `loadFromStorage()` 方法：从 localStorage 加载配置并与默认配置深合并
- [x] 6.4 在 `update()` 方法中自动调用 `saveToStorage()`（当 persistKey 存在时）
- [x] 6.5 在构造函数中自动调用 `loadFromStorage()`（当 persistKey 存在时）
- [x] 6.6 添加 `clearStorage()` 方法，清除已持久化的配置

---

## Phase 5: 核心模块单元测试（P0）

### Task 7: AgendaStateMachine 测试
- [x] 7.1 创建 `src/modules/__tests__/agendaStateMachine.test.ts`
- [x] 7.2 测试状态转换：idle → open_topic → discussion → proposal → voting → accepted → closed
- [x] 7.3 测试状态超时：配置超时时间后触发 `state_timeout` 事件
- [x] 7.4 测试 `getRemainingTime()` 返回正确的剩余时间
- [x] 7.5 测试 `resetTimer()` 重置超时计时器
- [x] 7.6 测试 `serialize()`/`deserialize()` 序列化与反序列化一致性
- [x] 7.7 测试令牌管理：请求令牌、释放令牌、令牌队列

### Task 8: CompensationEngine 测试
- [x] 8.1 创建 `src/modules/__tests__/compensationEngine.test.ts`
- [x] 8.2 测试正常补偿流程：单层补偿执行成功
- [x] 8.3 测试深度限制：超过 maxDepth 时停止递归
- [x] 8.4 测试超时保护：单个补偿动作超时后强制终止
- [x] 8.5 测试依赖图构建与反向拓扑排序
- [x] 8.6 测试失败降级策略：abort/skip/manual 三种模式
- [x] 8.7 测试 `getCompensationStats()` 统计数据正确性

### Task 9: CommunicationBus 测试
- [x] 9.1 创建 `src/modules/__tests__/communicationBus.test.ts`
- [x] 9.2 测试消息发送与接收：通道注册、处理器调用
- [x] 9.3 测试消息去重：相同 messageId 的消息不重复处理
- [x] 9.4 测试重试机制：处理器失败后按配置重试
- [x] 9.5 测试死信队列：超过重试次数的消息进入 DLQ
- [x] 9.6 测试 DLQ 阈值告警：DLQ 消息数超过阈值时触发回调
- [x] 9.7 测试广播功能：broadcast 正确发送到所有通道

### Task 10: PermissionManager 测试
- [x] 10.1 创建 `src/modules/__tests__/permissionManager.test.ts`
- [x] 10.2 测试能力白名单：允许的操作通过、禁止的操作拒绝
- [x] 10.3 测试双重签名：正确的双签名验证通过、篡改的签名拒绝
- [x] 10.4 测试速率限制：滑动窗口内超过限制的操作被拒绝
- [x] 10.5 测试按 Agent 覆盖速率限制
- [x] 10.6 测试审计日志：操作记录正确生成

### Task 11: ConfigManager 测试
- [x] 11.1 创建 `src/modules/__tests__/configSchema.test.ts`
- [x] 11.2 测试默认配置加载：未传入自定义配置时使用默认值
- [x] 11.3 测试配置合并：自定义配置与默认配置正确深合并
- [x] 11.4 测试配置验证：超出合法范围的值被拒绝并记录警告
- [x] 11.5 测试运行时更新：`update()` 方法正确更新配置并通知监听器
- [x] 11.6 测试 localStorage 持久化：保存、加载、清除功能
- [x] 11.7 测试监听器机制：配置变更时正确触发回调

### Task 12: TraceContext 测试
- [x] 12.1 创建 `src/modules/__tests__/traceContext.test.ts`
- [x] 12.2 测试 traceId 生成：32 位十六进制字符串
- [x] 12.3 测试 spanId 生成：16 位十六进制字符串
- [x] 12.4 测试 `getTraceparent()` 返回正确格式
- [x] 12.5 测试 `getTracestate()` 返回正确格式
- [x] 12.6 测试 `inject()`/`extract()` 往返一致性
- [x] 12.7 测试 `setSampled()` 正确设置 flags 采样标志位

---

## Task Dependencies

- Task 1（测试基础设施）可立即开始，无依赖
- Task 2（Vue 清理）可与 Task 1 并行
- Task 3（UUID 统一）可与 Task 1、Task 2 并行
- Task 4（依赖注入）可与 Task 1-3 并行
- Task 5（barrel export）依赖 Task 2（Vue 清理完成后模块接口稳定）
- Task 6（配置持久化）可与 Task 1-5 并行
- Task 7-12（单元测试）全部依赖 Task 1（测试基础设施就绪后才能编写测试）

### 可并行执行的任务组
- **并行组 A**: Task 1 + Task 2 + Task 3 + Task 4 + Task 6（基础设施 + 代码治理 + 配置持久化）
- **串行依赖**: Task 2 → Task 5
- **并行组 B**: Task 7 + Task 8 + Task 9 + Task 10 + Task 11 + Task 12（所有单元测试，依赖 Task 1）
