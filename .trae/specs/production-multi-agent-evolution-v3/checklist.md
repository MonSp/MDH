# Checklist

## Phase 1: 测试基础设施

- [x] **C1**: `vitest` 和 `@vitest/coverage-v8` 已添加到 `package.json` 的 devDependencies
- [x] **C2**: `vitest.config.ts` 正确配置了 jsdom 环境、路径别名（`@/` → `src/`）、覆盖率报告
- [x] **C3**: `npm run test` 能成功运行所有 `*.test.ts` 文件
- [x] **C4**: `npm run test:coverage` 能输出覆盖率报告
- [x] **C5**: `src/modules/__tests__/setup.ts` 提供了通用 mock 工厂函数

## Phase 2: 代码质量治理

- [x] **C6**: `skillStore.ts` 不再引用 Vue 的 `reactive`，使用纯 JavaScript 对象 + 发布-订阅模式
- [x] **C7**: `pageContextStore.ts` 不再引用 Vue 的 `reactive`，使用纯 JavaScript 对象 + 发布-订阅模式
- [x] **C8**: 全局搜索确认无其他文件引用 Vue 的 `reactive`、`ref`、`computed`
- [x] **C9**: `negotiationEngine.ts` 使用 `crypto.randomUUID()` 替代自定义 UUID 生成
- [x] **C10**: `AgentCoordinator` 构造函数支持可选的依赖注入参数，未注入时使用默认实例
- [x] **C11**: 现有调用 `AgentCoordinator` 的代码无需修改即可正常工作

## Phase 3: 模块统一导出

- [x] **C12**: `src/modules/index.ts` 存在并统一导出所有 35 个模块的核心导出项
- [x] **C13**: `import { ... } from '@/modules'` 路径在项目中可正常使用（路径别名已配置）

## Phase 4: 配置持久化

- [x] **C14**: `ConfigManager` 构造函数接受 `persistKey?: string` 选项
- [x] **C15**: 配置更新时自动同步到 localStorage（当 `persistKey` 存在）
- [x] **C16**: 系统启动时自动从 localStorage 加载已保存的配置并与默认配置合并
- [x] **C17**: `clearStorage()` 方法能正确清除 localStorage 中的配置
- [x] **C18**: localStorage 中存储的配置格式为合法 JSON，可被正确反序列化

## Phase 5: 核心模块单元测试

### AgendaStateMachine 测试
- [x] **C19**: 测试文件 `agendaStateMachine.test.ts` 存在且可运行
- [x] **C20**: 状态转换测试覆盖完整的正常路径（idle → open_topic → discussion → proposal → voting → accepted → closed）
- [x] **C21**: 状态超时测试验证超时后正确触发 `state_timeout` 事件
- [x] **C22**: `getRemainingTime()` 和 `resetTimer()` 测试通过
- [x] **C23**: `serialize()`/`deserialize()` 往返测试通过，恢复后状态一致

### CompensationEngine 测试
- [x] **C24**: 测试文件 `compensationEngine.test.ts` 存在且可运行
- [x] **C25**: 正常补偿流程测试通过
- [x] **C26**: 深度限制测试验证超过 `maxDepth` 时停止递归
- [x] **C27**: 超时保护测试验证超时后强制终止
- [x] **C28**: 失败降级策略测试覆盖 abort/skip/manual 三种模式
- [x] **C29**: `getCompensationStats()` 统计数据测试通过

### CommunicationBus 测试
- [x] **C30**: 测试文件 `communicationBus.test.ts` 存在且可运行
- [x] **C31**: 消息发送与接收测试通过
- [x] **C32**: 消息去重测试验证相同 messageId 不重复处理
- [x] **C33**: 重试机制测试验证失败后按配置重试
- [x] **C34**: 死信队列测试验证超过重试次数的消息进入 DLQ
- [x] **C35**: DLQ 阈值告警测试通过
- [x] **C36**: 广播功能测试通过

### PermissionManager 测试
- [x] **C37**: 测试文件 `permissionManager.test.ts` 存在且可运行
- [x] **C38**: 能力白名单测试通过（允许/拒绝）
- [x] **C39**: 双重签名验证测试通过
- [x] **C40**: 速率限制滑动窗口测试通过
- [x] **C41**: 审计日志测试通过

### ConfigManager 测试
- [x] **C42**: 测试文件 `configSchema.test.ts` 存在且可运行
- [x] **C43**: 默认配置加载测试通过
- [x] **C44**: 配置深合并测试通过
- [x] **C45**: 配置验证测试通过（超范围值被拒绝）
- [x] **C46**: 运行时更新与监听器通知测试通过
- [x] **C47**: localStorage 持久化保存/加载/清除测试通过

### TraceContext 测试
- [x] **C48**: 测试文件 `traceContext.test.ts` 存在且可运行
- [x] **C49**: traceId（32 位十六进制）和 spanId（16 位十六进制）格式测试通过
- [x] **C50**: `getTraceparent()` 和 `getTracestate()` 格式测试通过
- [x] **C51**: `inject()`/`extract()` 往返一致性测试通过
- [x] **C52**: `setSampled()` flags 标志位测试通过

## 整体集成

- [x] **C53**: 所有修改与现有 V1/V2 功能向后兼容
- [x] **C54**: `npm run build` 构建成功，无新增 TypeScript 错误
- [x] **C55**: `npm run test` 所有测试通过（0 failures）
