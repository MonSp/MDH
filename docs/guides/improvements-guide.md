# MDH 系统改进指南

> 本文档记录 2026-08-17 期间基于多智能体架构调研和 DSH 代码级取证实施的全部改进项。

---

## 目录

1. [架构总览](#架构总览)
2. [T1: 投票策略激活](#t1-投票策略激活)
3. [T2: TS 重复模块清理](#t2-ts-重复模块清理)
4. [T3: Subagent 委托模式](#t3-subagent-委托模式)
5. [T4: HITL 分级自动化](#t4-hitl-分级自动化)
6. [T5: MCP 协议评估](#t5-mcp-协议评估)
7. [T6: Agent Skills 标准对齐](#t6-agent-skills-标准对齐)
8. [T7: Review 报告闭环](#t7-review-报告闭环)
9. [T8: Context Engineering 深化](#t8-context-engineering-深化)
10. [T9: LLM 守卫系统](#t9-llm-守卫系统)
11. [配置层插件化](#配置层插件化)
12. [技能市场](#技能市场)
13. [模型自产工作流](#模型自产工作流)

---

## 架构总览

### 改进后的系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户界面层                                │
│  React + TypeScript + Three.js (3D 虚拟办公室)                   │
└───────────────────────────────┬─────────────────────────────────┘
                                │ WebSocket / HTTP
┌───────────────────────────────▼─────────────────────────────────┐
│                        智能体协调层                               │
│  CEO Agent → 意图识别 → 动态路由 → 团队组装 → 任务派发           │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ 工作流引擎   │  │ 审查流水线   │  │ 技能进化     │            │
│  │ DAG 调度    │  │ ReviewReport│  │ SkillBridge │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                        执行层                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ 本地执行     │  │ 远端执行     │  │ 混合执行     │            │
│  │ Node.js     │  │ Python      │  │ RouterFactory│            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                        数据层                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │ 共享经验池   │  │ 技能市场     │  │ Session Log │            │
│  │ SharedPool  │  │ Registry    │  │ JSONL       │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

### 改进项分类

| 类别 | 改进项 | 优先级 |
|------|--------|--------|
| **代码级修复** | T1 投票策略、T2 TS 清理 | P0 |
| **架构演进** | T3 Subagent、T4 HITL、T7 Review、T8 Context | P1 |
| **标准化** | T5 MCP、T6 Agent Skills | P2 |
| **可靠性** | T9 LLM 守卫 | P1 |
| **生态建设** | 配置层插件化、技能市场 | P2 |
| **智能化** | 模型自产工作流 | P3 |

---

## T1: 投票策略激活

### 问题

`meeting_coordinator.py` 硬编码 `ConsensusStrategy.SIMPLE_MAJORITY`，`weighted_vote`/`argument_based` 策略从未生效。

### 改动

- `NegotiationEngine` 新增 `set_default_strategy()` 方法
- `evaluate_consensus()` 调用传入 strategy 参数
- `MeetingCoordinator` 构造函数支持 `consensus_strategy` 参数
- `server.py` 的 `start_meeting` WebSocket 消息支持 `consensus_strategy` 字段

### 使用方式

```python
# 1. 启动会议时指定策略
await websocket.send_json({
    "type": "start_meeting",
    "consensus_strategy": "weighted_vote",  # 或 "argument_based"
    # ... 其他参数
})

# 2. 运行时切换策略
coordinator.negotiation.set_default_strategy(ConsensusStrategy.ARGUMENT_BASED)
```

### 三种策略对比

| 策略 | 判定逻辑 | 适用场景 |
|------|----------|----------|
| `simple_majority` | 赞成 > 反对 | 快速决策，默认 |
| `weighted_vote` | 加权赞成 > 加权反对 | 角色权重不均 |
| `argument_based` | 论据置信度加权 | 需要深度讨论 |

---

## T2: TS 重复模块清理

### 问题

`src/modules/` 存在 Python→TS 迁移产物：`dynamicRouter.ts`/`dynamicRouterLocal.ts` 和 `workflowEngine.ts`/`workflowEngineLocal.ts`。

### 改动

- 删除 `workflowEngine.ts`（REST shim，零生产引用）
- 保留 `dynamicRouter.ts`（`RouteTablePanel.tsx` 生产使用）
- `*Local.ts` 版本是生产实现，通过 `index.ts` 导出

---

## T3: Subagent 委托模式

### 问题

TS orchestrator 的 `TeamCoordinator` 是同步执行模型，不支持子任务委托。

### 改动

`RoleAgent` 新增 `spawnSubagent()` 方法：

```typescript
const child = await parentAgent.spawnSubagent("实现用户服务", {
    roleId: "executor",
    maxIterations: 10,
    onEvent: (event) => console.log(event),
});

// child.result: 执行结果文本
// child.summary: { filesCreated, filesModified, toolCalls, errors }
// child.childId: 子 agent ID
```

### 关键特性

- **独立上下文**: 子 agent 有独立的消息历史
- **Artifact 引用**: 子 agent 的文件产出以引用形式注入父 agent 上下文
- **事件通知**: `subagent_spawn` 和 `subagent_complete` 事件

---

## T4: HITL 分级自动化

### 问题

审批对所有任务一视同仁，93% 的审批是不必要的（Claude Code 实测数据）。

### 改动

新增 `classify_approval_tier()` 三级决策：

```python
from approval_manager import classify_approval_tier, risk_classify

# 三级判定
tier = classify_approval_tier("read_file")  # → "auto_approve"
tier = classify_approval_tier("write_file")  # → "classifier"
tier = classify_approval_tier("git_push")    # → "human"

# 风险分类器
result = risk_classify("bash", "npm install", context={"path": ".env"})
# → {"approved": False, "reason": "敏感文件", "risk_score": 0.7}
```

### 三级决策

| 层级 | 操作类型 | 处理方式 |
|------|----------|----------|
| Tier 1 | 白名单（read/list/git_status） | 自动通过，零弹窗 |
| Tier 2 | 中等风险（write/edit/bash） | 风险分类器判定 |
| Tier 3 | 高危（git_push/sudo/rm -rf） | 人工审批 |

---

## T5: MCP 协议评估

### 评估结论

- MCP 协议使用 JSON-RPC 2.0，与 MDH 的 `IToolkitRouter` 抽象高度兼容
- 推荐方案：`MCPAdapterRouter` 实现 `IToolkitRouter` 接口
- Phase 1+2 预计 26 人天
- 评估文档：`docs/compose/spec/mcp-integration-evaluation.md`

---

## T6: Agent Skills 标准对齐

### 评估结论

- MDH 实际有 42 个 skill packs（非 5 个）
- 最大差距：全量注入 vs 渐进式披露
- 推荐方案：混合模式（新格式 + 旧格式适配器）
- 评估文档：`docs/compose/spec/agent-skills-alignment-evaluation.md`

---

## T7: Review 报告闭环

### 问题

审查循环中 `review_result` 每轮被覆盖，无法追溯历史审查结果。

### 改动

新增 `ReviewIteration` 和 `ReviewReport` 数据结构：

```python
from review_pipeline import ReviewReport, ReviewIteration

# 在审查循环中自动累积
review_report = ReviewReport(task_id="agent-executor")
# ... 每轮审查后
review_report.add_iteration(ReviewIteration(
    iteration=1,
    status="revision_required",
    critic_severity="medium",
    issues=[...],
))

# 最终结果包含完整报告
result = {
    "type": "serial_completed",
    "review_report": review_report.to_dict(),
    # ...
}
```

### 报告结构

```json
{
    "task_id": "agent-executor",
    "final_status": "approved",
    "total_iterations": 2,
    "total_issues_found": 3,
    "total_files_written": ["app.py", "test_app.py"],
    "iterations": [
        {"iteration": 1, "status": "revision_required", "issues": [...]},
        {"iteration": 2, "status": "approved", "issues": []}
    ]
}
```

---

## T8: Context Engineering 深化

### 改动 1: 结构化事件

`MeetingSession` 新增 `append_event()` 方法：

```python
from meeting import SessionEventType

# 记录经验注入事件
meeting.append_event(
    SessionEventType.EXPERIENCE_INJECTION,
    content="注入 5 条经验规则",
    agent_id="coordinator",
    phase="pre_execution",
)
```

### 改动 2: 渐进披露

`ExperienceExtractor` 新增 `build_experience_summary()`：

```python
# 完整版（全量注入）
context = extractor.build_experience_context(rules)

# 精简版（渐进披露，~50 tokens/规则）
summary = extractor.build_experience_summary(rules, max_rules=5)
```

---

## T9: LLM 守卫系统

### 问题

多个 LLM 调用点没有超时保护，可能导致会话无限阻塞。

### 改动

新增 `llm_guard.py` 模块：

```python
from llm_guard import safe_llm_reply, safe_llm_call

# 带超时和重试的 LLM 调用
result = await safe_llm_reply(model, msg, timeout=120, max_retries=2)

# 通用异步调用守卫
result = await safe_llm_call(model.reply(msg), timeout=60, description="语义分析")
```

### 覆盖范围

| 组件 | 超时 | 重试 |
|------|------|------|
| meeting_coordinator | 120s | 2 |
| review_pipeline | 90s | 2 |
| semantic_analyzer | 60s | 1 |
| task_orchestrator | 120s | 2 |

---

## 配置层插件化

### 组件

| 组件 | 文件 | 功能 |
|------|------|------|
| SkillBridge | `skill_bridge.py` | 统一加载接口，自动检测 SKILL.md/legacy 格式 |
| ProgressiveSkillLoader | `progressive_skill_loader.py` | 四层渐进披露 |
| SkillRouter | `skill_router.py` | 技能路由桥接 |

### 使用方式

```python
from skill_bridge import SkillBridge
from progressive_skill_loader import ProgressiveSkillLoader

# 加载技能
bridge = SkillBridge("skill_packs")
skill = bridge.load("frontend_dev")
print(skill.source_format)  # "skill_md" 或 "legacy"

# 渐进式加载
loader = ProgressiveSkillLoader("skill_packs")
index = loader.format_skill_index()  # L0: 轻量索引
instructions = loader.load_instructions("frontend_dev")  # L1: 完整指令
```

### 技能格式迁移

```bash
# 预览迁移
python backend/migrate_skills.py --skill-dir skill_packs

# 执行迁移（带备份）
python backend/migrate_skills.py --skill-dir skill_packs --execute --backup
```

---

## 技能市场

### 三阶段架构

| Stage | 组件 | 功能 |
|-------|------|------|
| Stage 1 | SharedExperiencePool | 实例内跨项目共享 |
| Stage 1 | SkillForkManager | 技能包 Fork |
| Stage 2 | SkillExporter | 导入导出 |
| Stage 3 | RegistryClient | Git 注册表客户端 |
| Stage 3 | RegistryServer | HTTP 注册表服务 |

### REST API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/marketplace/experience/publish` | POST | 发布经验到共享池 |
| `/api/marketplace/experience/search` | GET | 搜索共享经验 |
| `/api/marketplace/experience/fork` | POST | Fork 经验到项目 |
| `/api/marketplace/skills/fork` | POST | Fork 技能包 |
| `/api/marketplace/skills/forks` | GET | 列出项目 Fork |
| `/api/marketplace/skills/pull` | POST | 拉取更新 |
| `/api/marketplace/export` | POST | 导出技能包 |
| `/api/marketplace/import` | POST | 导入技能包 |
| `/api/marketplace/stats` | GET | 共享池统计 |

### 使用示例

```python
# 1. 发布经验到共享池
from shared_experience_pool import SharedExperiencePool
pool = SharedExperiencePool("data/shared_experience")
pool.publish_rule({
    "trigger_condition": "前端 React 组件开发",
    "action": "使用函数组件 + Hooks，避免 class 组件",
    "keywords": ["react", "hooks", "frontend"],
}, source_project="proj-1")

# 2. 搜索共享经验
results = pool.search(keywords=["react"], limit=5)

# 3. Fork 技能包
from skill_fork_manager import SkillForkManager
forks = SkillForkManager("data/skill_forks", "skill_packs")
forks.fork_skill("frontend_dev", "proj-2")

# 4. 导入导出
from skill_exporter import SkillExporter
exporter = SkillExporter("skill_packs", "data/shared_experience")
path = exporter.export_skill("frontend_dev", include_experience=True)
result = exporter.import_skill(path, overwrite=True)
```

---

## 模型自产工作流

### 问题

工作流生成使用确定性关键词匹配，只能识别"前端/后端/测试/部署"四类节点。

### 改动

LLM 分析任务描述生成节点列表，依赖关系由确定性推断保证：

```python
# semantic_analyzer.py
def _generate_workflow_definition(self, user_message, routing_decision):
    # 1. 尝试 LLM 生成节点
    llm_nodes = self._llm_generate_nodes_sync(user_message)

    # 2. 验证 LLM 输出
    if llm_nodes and self._validate_workflow_nodes(llm_nodes):
        nodes = llm_nodes
    else:
        # 3. 回退到确定性生成
        nodes = self._deterministic_generate_nodes(user_message, routing_decision)

    # 4. 依赖推断（两种路径共用）
    edges = self._infer_dependencies(nodes)
```

### LLM 输出格式

```json
[
    {"task": "用户服务开发", "dept": "dept-backend", "description": "实现用户注册、登录"},
    {"task": "订单服务开发", "dept": "dept-backend", "description": "实现订单创建、查询"},
    {"task": "集成测试", "dept": "dept-qa", "description": "端到端测试"}
]
```

### 验证规则

- 节点数：1 ≤ N ≤ 8
- 部门映射：必须是 `dept-frontend/backend/qa/devops/fullstack/data/docs`
- 任务描述：非空
- 失败时静默回退到确定性生成

---

## 测试覆盖

| 层 | 测试数 | 通过 | 失败 |
|---|--------|------|------|
| Backend | 1243 | 1241 | 2 (pre-existing perf) |
| Frontend | 1647 | 1647 | 0 |
| Orchestrator | 158 | 157 | 1 (pre-existing skill loader) |

---

## 相关文档

- [Agent 角色配置](docs/agent-roles.md)
- [Agent 工具系统](docs/agent-tools.md)
- [设计文档](docs/design.md)
- [用户指南](docs/user-guide.md)
- [MCP 评估文档](docs/compose/spec/mcp-integration-evaluation.md)
- [Agent Skills 评估文档](docs/compose/spec/agent-skills-alignment-evaluation.md)
- [技能市场设计文档](docs/compose/spec/skill-marketplace.md)
