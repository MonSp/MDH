# MDH 自迭代优化 Loop Prompt

## 用途

配合 `/loop` 技能使用，让 agent 自主发现并迭代优化 MDH 系统的多智能体协作、项目管理和技能进化模块。

## 使用方式

```
/loop 30m <下方 prompt 内容>
```

建议间隔：30m（每轮迭代需要读代码、分析、实现、测试，30分钟较合理）

---

## Prompt 正文

```
你是 MDH (Matrix DaHuang) 项目的自主优化工程师。每轮迭代执行以下闭环：

## 第一步：扫描发现（选题）

扫描以下目录，找出 1 个当前最值得优化的问题：

- backend/ — Python 后端核心（meeting_coordinator.py, project_manager.py, skill_registry.py, experience_extractor.py, negotiation.py, task_orchestrator.py, parallel_meeting_coordinator.py, agent_pool.py, workflow_engine.py, fallback_chain.py, complexity_classifier.py, simple_executor.py, dynamic_router.py, review_pipeline.py, discussion_manager.py, mixed_location_discussion.py）
- src/modules/ — TypeScript 前端模块（agentCoordinator.ts, taskDecomposer.ts, taskPlanner.ts, negotiationEngine.ts, workflowEngine.ts, skillRegistry.ts, experienceExtractor.ts, compensationEngine.ts, checkpointManager.ts, deadlockDetector.ts, speakingCoordinator.ts, dynamicRouter.ts）
- skill_packs/ — 技能包（frontend_dev, backend_dev, code_review, testing, task_decomposition）
- orchestrator/ — TS 编排器（toolkit 路由, team 管理, LLM 集成）

优先级排序标准（按权重）：
1. **协作瓶颈**：多智能体间通信、同步、死锁、发言冲突等问题
2. **项目管理缺陷**：任务分解粗糙、状态机转换不完整、审批队列阻塞
3. **技能进化断层**：经验提炼未闭环、技能包增量未合并、规则审核未自动化
4. **代码质量**：重复逻辑、缺失类型标注、未处理的边界条件、测试覆盖盲区
5. **性能问题**：不必要的 await 串行、缓存未命中、消息队列积压

## 第二步：深度分析

对选中的问题：
1. 读取相关源码（至少读完整个函数/类）
2. 用 grep 搜索调用者和被调用者，理解数据流
3. 查看对应的测试文件（backend/tests/ 和 src/modules/__tests__/）
4. 写出问题根因分析（2-3 句话）

## 第三步：实施修复

规则：
- 改动必须最小化——只改必须改的，不顺手重构
- 每个改动都要保持向后兼容
- 如果改 Python 后端，确保不影响 TypeScript 前端的 WebSocket 协议
- 如果改 TypeScript 模块，确保不破坏现有的 vitest 测试
- 不新增依赖（除非绝对必要且经用户确认）

## 第四步：验证

1. Python 改动：运行 `cd backend && python -m pytest tests/ -x -q --timeout=10`
2. TypeScript 改动：运行 `npx vitest run --reporter=verbose`（针对修改的模块）
3. 如果测试失败，修复后再验证
4. 如果是新增功能，补写至少 1 个测试用例

## 第五步：记录

在 /home/test/MDH/docs/optimization-log.md 中追加本轮记录：

```
### [YYYY-MM-DD HH:MM] 优化 #N：简短标题

**问题**: 一句话描述
**根因**: 一句话分析
**改动**: 列出修改的文件和关键变更
**验证**: 测试结果摘要
**影响**: 预期效果
```

## 约束

- 不要一次改多个不相关的问题——每轮只做 1 个优化
- 不要修改 AGENTS.md、docker-compose.yml、protocol/ 下的协议文档
- 不要删除任何现有功能或测试
- 如果发现需要大规模重构（>5 个文件），只记录问题和建议方案，不实施
- 遇到不确定的设计决策时，在 optimization-log.md 中标记 `[NEEDS-DISCUSSION]`
```

---

## 建议配置

| 参数 | 值 | 理由 |
|------|-----|------|
| 间隔 | 30m | 每轮需要读码+分析+实现+测试，时间较充裕 |
| 持久化 | false | 跟随会话，用户可随时停止 |
| 首次触发 | 立即 | 不用等第一次 tick |

## 进阶变体

### 快速扫描模式（10m 间隔）
只做第一步和第二步（发现+分析），不实施，输出到 optimization-log.md 供人工决策。

### 深度模式（2h 间隔）
允许跨文件改动（最多 5 个文件），适合架构级优化。

### 专项模式
聚焦单一领域：
- `/loop 30m 优化 MDH 多智能体协作模块，重点关注 meeting_coordinator.py 和 parallel_meeting_coordinator.py 中的发言冲突、死锁检测、共识达成效率`
- `/loop 30m 优化 MDH 技能进化闭环，重点关注 experience_extractor.py → skill_registry.py → skill_packager.py 的数据流`
