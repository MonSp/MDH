# 多智能体协作系统生产级进化 V3 — 测试与质量治理 Spec

## Why
经过 V1/V2 两轮迭代，35 个前端模块功能已全部实现，但**零前端测试覆盖**是生产就绪的最大障碍。同时存在 Vue/React 框架混用、类型安全不足、缺少模块统一导出等代码质量问题，以及配置无法持久化等功能性缺口。本轮迭代旨在补齐测试基础设施、治理代码质量、实现配置持久化，使系统真正达到可维护、可测试的生产标准。

## What Changes
- **测试基础设施**：引入 Vitest 测试框架，配置覆盖率报告，为 6 个核心模块编写单元测试
- **代码质量治理**：消除 Vue/React 框架混用、修复类型断言、统一 UUID 生成方式
- **模块统一导出**：创建 `src/modules/index.ts` barrel export，规范模块引用路径
- **依赖注入改造**：为 `AgentCoordinator` 等模块引入构造函数依赖注入，提升可测试性
- **配置持久化**：为 `ConfigManager` 添加 localStorage 持久化支持

## Impact
- Affected specs: production-multi-agent-evolution, production-multi-agent-evolution-v2
- Affected code:
  - 新增: `vitest.config.ts`, `src/modules/__tests__/` 目录下 6 个测试文件, `src/modules/index.ts`
  - 修改: `package.json`（添加 vitest 依赖和测试脚本）, `skillStore.ts`, `pageContextStore.ts`, `negotiationEngine.ts`, `agentCoordinator.ts`, `configSchema.ts`

---

## ADDED Requirements

### Requirement: 测试基础设施
系统 SHALL 建立前端单元测试基础设施，支持核心模块的自动化验证。

#### Scenario: 测试框架配置
- **WHEN** 开发者执行 `npm run test`
- **THEN** Vitest 运行所有 `*.test.ts` 文件，输出测试结果和覆盖率报告

#### Scenario: 核心模块测试覆盖
- **WHEN** 核心模块代码发生变更
- **THEN** 对应的单元测试能检测回归问题，覆盖关键路径和边界条件

---

### Requirement: 模块统一导出
系统 SHALL 提供 barrel export 文件，规范模块引用方式。

#### Scenario: 统一导入
- **WHEN** 组件需要使用多个模块
- **THEN** 可通过 `import { Xxx, Yyy } from '@/modules'` 统一导入，无需记住具体文件路径

---

### Requirement: 配置持久化
ConfigManager SHALL 支持将配置持久化到 localStorage，系统重启后自动恢复。

#### Scenario: 配置保存
- **WHEN** 配置通过 `update()` 方法更新
- **THEN** 自动同步到 localStorage，下次启动时优先从 localStorage 加载

#### Scenario: 配置恢复
- **WHEN** 系统启动且 localStorage 中存在已保存的配置
- **THEN** ConfigManager 自动加载已保存的配置并与默认配置合并

---

## MODIFIED Requirements

### Requirement: skillStore 与 pageContextStore
现有 `skillStore.ts` 和 `pageContextStore.ts` SHALL 消除 Vue 框架依赖：
- 将 Vue `reactive` 替换为纯 JavaScript 对象或 React 兼容的状态管理
- 保持现有 API 接口不变，确保上层调用无需修改

### Requirement: negotiationEngine UUID 生成
现有 `NegotiationEngine` SHALL 将自定义 UUID 生成替换为 `crypto.randomUUID()`：
- 移除自定义 `generateId()` 函数
- 统一使用 Web Crypto API

### Requirement: AgentCoordinator 依赖注入
现有 `AgentCoordinator` SHALL 支持通过构造函数注入依赖：
- 构造函数接受可选的 `registry`、`communicationBus`、`taskAssigner` 参数
- 未注入时使用默认实例，保持向后兼容
- 注入时允许测试替换为 mock 实例

---

## REMOVED Requirements
无移除需求。所有现有功能保持兼容。

---

## 测试范围定义

### 优先级 P0（本轮必须完成）
| 模块 | 测试重点 |
|------|---------|
| `agendaStateMachine.ts` | 状态转换、超时触发、序列化/反序列化、resetTimer |
| `compensationEngine.ts` | 深度限制、超时保护、依赖图遍历、失败降级 |
| `communicationBus.ts` | 消息去重、重试机制、死信队列、DLQ 阈值告警 |
| `permissionManager.ts` | 双重签名验证、速率限制、审计日志 |
| `configSchema.ts` | 配置加载、验证、运行时更新、localStorage 持久化 |
| `traceContext.ts` | W3C traceparent/tracestate 生成与解析、inject/extract |

### 优先级 P1（后续迭代）
| 模块 | 测试重点 |
|------|---------|
| `negotiationEngine.ts` | 三种共识策略、论辩结构、决策回溯 |
| `deadlockDetector.ts` | 环检测、解决策略、超时处理 |
| `taskScheduler.ts` | 5 种调度算法、并行组计算 |
| `taskAssigner.ts` | 4 种分配策略、候选评分 |
| `approvalQueue.ts` | 升级策略、批量操作、优先级调整 |
| `metricsCollector.ts` | 指标采集、导出格式、告警规则 |
