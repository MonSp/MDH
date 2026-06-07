# 多智能体公司架构重构 Spec

## Why

当前系统存在架构问题：前后端模块职责边界模糊、存在重复实现、测试覆盖不足、框架混用（Vue/React）、缺少依赖注入机制、配置无法持久化。这些问题影响系统的可维护性和可测试性，需要进行架构重构。

## What Changes

- **前后端职责边界划分**：明确后端负责业务逻辑，前端负责UI渲染和用户交互
- **测试基础设施建设**：引入Vitest测试框架，为核心模块编写单元测试
- **框架统一**：消除Vue/React混用，统一使用TypeScript
- **依赖注入机制**：为AgentCoordinator等模块引入构造函数依赖注入
- **配置持久化**：为ConfigManager添加localStorage持久化支持

## Impact

- Affected specs: production-multi-agent-evolution, production-multi-agent-evolution-v2, production-multi-agent-evolution-v3
- Affected code:
  - 删除: `src/modules/workflowEngine.ts`, `src/modules/skillRegistry.ts` 等重复实现
  - 新增: `vitest.config.ts`, `src/modules/__tests__/` 目录下测试文件, `src/modules/index.ts`
  - 修改: `package.json`, `src/modules/skillStore.ts`, `src/modules/pageContextStore.ts`, `src/modules/agentCoordinator.ts`, `src/modules/configSchema.ts`

---

## 目标

本项目旨在重构多智能体协作系统的架构，实现以下目标：
1. 建立清晰的前后端职责边界
2. 完善测试基础设施
3. 统一技术栈
4. 引入依赖注入机制
5. 实现配置持久化

## 范围

### 在范围内
- 前后端模块职责边界划分
- 测试基础设施建设
- 框架统一（消除Vue/React混用）
- 依赖注入机制
- 配置持久化

### 不在范围内
- 功能性需求变更
- 新功能开发
- UI/UX优化
- 性能优化

---

## 功能要求

### ADDED Requirements

#### Requirement: 前后端职责边界划分
系统 SHALL 建立清晰的前后端职责边界，后端负责业务逻辑处理和数据持久化，前端负责UI渲染和用户交互。

**验收标准（EARS）**：
- **当**系统启动时，**则**后端应负责业务逻辑处理和数据持久化，前端应负责UI渲染和用户交互
- **当**用户发起技能注册、项目创建、工作流执行等请求时，**则**后端应正确处理这些业务逻辑，前端仅负责发起请求和展示结果
- **当**用户进行对话输入、任务配置、状态查看等操作时，**则**前端应正确处理这些交互，通过API调用后端服务

**证据来源**：backend/server.py, src/modules/

---

#### Requirement: 测试基础设施建设
系统 SHALL 建立前端单元测试基础设施，支持核心模块的自动化验证。

**验收标准（EARS）**：
- **当**开发者执行 `npm run test` 时，**则**Vitest应运行所有 `*.test.ts` 文件，输出测试结果和覆盖率报告
- **当**核心模块代码发生变更时，**则**对应的单元测试能检测回归问题，覆盖关键路径和边界条件

**证据来源**：spec:production-multi-agent-evolution-v3

---

#### Requirement: 框架统一
系统 SHALL 统一使用TypeScript，消除Vue/React框架混用问题。

**验收标准（EARS）**：
- **当**系统构建时，**则**skillStore.ts和pageContextStore.ts应使用纯JavaScript对象，无Vue reactive依赖
- **当**需要生成UUID时，**则**统一使用crypto.randomUUID()，无自定义UUID生成

**证据来源**：src/modules/skillStore.ts, src/modules/pageContextStore.ts

---

#### Requirement: 依赖注入机制
系统 SHALL 支持通过构造函数注入依赖，提升模块可测试性。

**验收标准（EARS）**：
- **当**实例化AgentCoordinator等模块时，**则**应支持通过构造函数注入registry、communicationBus、taskAssigner参数
- **当**未注入依赖时，**则**应使用默认实例，保持向后兼容

**证据来源**：src/modules/agentCoordinator.ts

---

#### Requirement: 配置持久化
ConfigManager SHALL 支持将配置持久化到localStorage，系统重启后自动恢复。

**验收标准（EARS）**：
- **当**配置通过 `update()` 方法更新时，**则**自动同步到 localStorage，下次启动时优先从 localStorage 加载
- **当**系统启动且 localStorage 中存在已保存的配置时，**则**ConfigManager 自动加载已保存的配置并与默认配置合并

**证据来源**：src/modules/configSchema.ts

---

### MODIFIED Requirements

#### Requirement: 现有前端模块
现有前端模块 SHALL 消除重复实现：
- 删除workflowEngine.ts、skillRegistry.ts等与后端重复的模块
- 创建统一的API调用层，所有后端调用通过该层进行
- 保持现有UI组件和用户交互不变

#### Requirement: 现有后端模块
现有后端模块 SHALL 保持现有功能不变，仅优化接口设计以支持前端统一调用。

---

### REMOVED Requirements

#### Requirement: 前端重复模块
前端的workflowEngine.ts、skillRegistry.ts等重复实现模块将被删除，所有业务逻辑统一由后端处理。

---

## 验收标准

### 成功标准
| ID | 标准 |
|----|------|
| sc1 | 前后端模块职责边界清晰，无重复实现 |
| sc2 | 核心模块测试覆盖率达到80%以上 |
| sc3 | 统一使用TypeScript，消除Vue/React框架混用 |
| sc4 | 建立依赖注入机制，支持模块可测试性 |
| sc5 | 配置持久化，系统重启后自动恢复 |

### 测试范围定义

#### 优先级 P0（本轮必须完成）
| 模块 | 测试重点 |
|------|---------|
| `agendaStateMachine.ts` | 状态转换、超时触发、序列化/反序列化、resetTimer |
| `compensationEngine.ts` | 深度限制、超时保护、依赖图遍历、失败降级 |
| `communicationBus.ts` | 消息去重、重试机制、死信队列、DLQ 阈值告警 |
| `permissionManager.ts` | 双重签名验证、速率限制、审计日志 |
| `configSchema.ts` | 配置加载、验证、运行时更新、localStorage 持久化 |
| `traceContext.ts` | W3C traceparent/tracestate 生成与解析、inject/extract |

#### 优先级 P1（后续迭代）
| 模块 | 测试重点 |
|------|---------|
| `negotiationEngine.ts` | 三种共识策略、论辩结构、决策回溯 |
| `deadlockDetector.ts` | 环检测、解决策略、超时处理 |
| `taskScheduler.ts` | 5 种调度算法、并行组计算 |
| `taskAssigner.ts` | 4 种分配策略、候选评分 |
| `approvalQueue.ts` | 升级策略、批量操作、优先级调整 |
| `metricsCollector.ts` | 指标采集、导出格式、告警规则 |

---

## 里程碑

### 里程碑1：架构基础（第1-2周）
**目标**：建立清晰的前后端职责边界

**交付物**：
- 前后端模块职责文档
- API接口规范文档
- 模块清理完成

### 里程碑2：质量保障（第3-4周）
**目标**：建立完善的测试基础设施

**交付物**：
- Vitest配置完成
- 核心模块测试覆盖80%+
- 测试覆盖率报告

### 里程碑3：技术统一（第5-6周）
**目标**：消除框架混用，引入依赖注入

**交付物**：
- Vue依赖消除
- 统一UUID生成
- 依赖注入机制实现

### 里程碑4：配置优化（第7周）
**目标**：实现配置持久化

**交付物**：
- ConfigManager持久化功能
- 配置迁移工具
- 用户文档

### 里程碑5：收尾与验证（第8周）
**目标**：全面验证和文档完善

**交付物**：
- 集成测试通过
- 性能测试报告
- 完整的用户文档
