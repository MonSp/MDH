# P1 阶段实施计划（路由断链修复 / 技能闭环自动触发 / DAG 去硬编码 / 混合执行真接线 / 杂项收尾）

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落实产品发展方向 P1 优先级——补全主线能力：修复自适应路由学习断链（支柱 1）、技能闭环自动触发（支柱 5）、工作流 DAG 生成去硬编码（支柱 3）、TS 编排器混合执行真接线（横向）、杂项收尾（CLI 注入 / companion_log 去跟踪 / 前端审批验证）。

**Architecture:** 五处互不耦合的改造：① `MeetingCoordinator._update_routing_stats()` 在开发循环后统一消费 `_task_routing` 调 `router.update_stats`（修复双断链）；② 技能提取块后追加 `_finalize_skill_evolution()`（自动审核 pending → 写增量区 → 打包）；③ `SemanticAnalyzer._generate_workflow_definition` 以依赖推断替代硬编码线性链（实现类部门并行、qa/devops 依赖、按根节点数推执行策略）；④ TS `TeamCoordinator.execute` 新增 `roleLocations` 入参透传到 `createTeam`（member.location/runtime），server.ts 转发前端 role_locations；⑤ CLI 脚本注入共享引擎 + companion_log.json 去跟踪。

**Tech Stack:** Python 3.11（backend，`/usr/bin/python3` + pytest）、TypeScript（orchestrator，node 22 + vitest）

## Global Constraints

- backend 测试：`cd backend && /usr/bin/python3 -m pytest tests/<file>::<test> -v`（**不要加 `--timeout`**，环境无 pytest-timeout）；全量回归同目录 `tests/ -q`
- orchestrator 测试：`cd orchestrator && npm test`（vitest run，`src/**/*.test.ts`）
- 不引入新依赖；不改 `mock-sso/`；不提交编译产物（orchestrator 下 `*.js`/`*.js.map` 为过时 dist 副本，已 untracked，勿碰）
- `backend/companion_log.json` 为运行时产物：改动文件时不得 `git add` 它；T5 将其移出跟踪
- 现有测试基线：backend 852 passed / 1 PRE-EXISTING 环境失败（`test_skill_packs_structure`，main 工作树有未跟踪 skill 文件时通过）/ 1 skipped；orchestrator 基线以 `npm test` 实测为准
- LLM 调用统一现有模式（`Msg` + `model.reply` + `_extract_text` + `LLM_FALLBACK_TEMPLATE`）；私有方法/属性（`_load_rule`/`_incremental_dir` 等）在测试中可访问（本仓库既有风格）

---

### Task 1: 路由断链修复（自适应路由学习真正生效）

**Covers:** S2.4（支柱 1 意图识别引擎；局限 L3）
<!-- 双断链：meeting_coordinator._task_routing 只写不读；task_orchestrator._task_routing 有读无写（串行流程绕过 assign）。修复：开发循环后统一消费 -->

**Files:**
- Modify: `backend/meeting_coordinator.py`（新增 `_update_routing_stats` + 开发循环调用点）
- Test: `backend/tests/test_meeting_coordinator_router.py`

**Interfaces:**
- Consumes: `self._task_routing: Dict[str, str]`（meeting_coordinator.py:130，auto_assign_task :869-872 写入 `routing.selected_dept`）、`self.meeting.tasks`（`MeetingTaskInfo`，含 `.id`/`.status`，值 `"completed"`/`"failed"` 等）、`self.router.update_stats(dept_id, success) -> bool`（dynamic_router.py:444）
- Produces: `_update_routing_stats() -> None`——在 `process_user_message` 开发循环退出后（meeting_coordinator.py:1239 附近、项目总结前）调用

- [ ] **Step 1: 写失败测试**（追加到 `backend/tests/test_meeting_coordinator_router.py` 末尾；复用其 `meeting_coordinator` fixture）

```python
async def test_update_routing_stats_consumes_task_routing(meeting_coordinator):
    """_task_routing 中记录的任务在完成后触发 router.update_stats（修复断链）"""
    coordinator = meeting_coordinator
    # 模拟 auto_assign_task 写入的路由记录 + 任务状态
    task = coordinator.meeting.tasks[0]
    coordinator._task_routing[task.id] = "dept-frontend"
    task.status = "completed"

    with mock.patch.object(coordinator.router, "update_stats", return_value=True) as m:
        coordinator._update_routing_stats()

    m.assert_called_once_with("dept-frontend", True)


async def test_update_routing_stats_failed_task_reports_failure(meeting_coordinator):
    """失败任务上报 success=False"""
    coordinator = meeting_coordinator
    task = coordinator.meeting.tasks[0]
    coordinator._task_routing[task.id] = "dept-qa"
    task.status = "failed"

    with mock.patch.object(coordinator.router, "update_stats", return_value=True) as m:
        coordinator._update_routing_stats()

    m.assert_called_once_with("dept-qa", False)
```

> 若 fixture `meeting_coordinator` 的 meeting 无 tasks（`meeting.tasks` 为空），先读 fixture 定义，改用 `coordinator.meeting.add_task(...)`（MeetingSession 的既有方法，参考 test_meeting.py）构造一个任务再断言。`mock` 已在文件头部 import（该文件既有 mock 用法）。

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && /usr/bin/python3 -m pytest tests/test_meeting_coordinator_router.py -k "update_routing_stats" -v`
Expected: FAIL — `AttributeError: 'MeetingCoordinator' object has no attribute '_update_routing_stats'`

- [ ] **Step 3: 实现**

3a. `backend/meeting_coordinator.py` 新增方法（放在 `execute_assigned_tasks` 附近）：

```python
    def _update_routing_stats(self) -> None:
        """统一更新路由统计：修复自适应学习断链（auto_assign_task 写入的 _task_routing 从未被消费）"""
        for task_id, dept_id in self._task_routing.items():
            task = next((t for t in self.meeting.tasks if getattr(t, "id", None) == task_id), None)
            if task is None:
                continue
            self.router.update_stats(dept_id, success=task.status == "completed")
```

3b. `process_user_message` 开发循环退出后（`# 生成项目总结报告` 之前，约 :1239）插入调用：

```python
        # 更新路由统计（修复自适应学习断链）
        self._update_routing_stats()
```

> 先读开发循环尾部实际代码确认插入点（紧邻技能提取块之前即可）。

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && /usr/bin/python3 -m pytest tests/test_meeting_coordinator_router.py -q`
Expected: PASS（新增用例 + 既有用例；若既有 `test_no_stats_update_when_no_routing_dept` 仍通过——其断言"无路由记录时无更新"，与新增行为不冲突）

- [ ] **Step 5: 提交**

```bash
git add backend/meeting_coordinator.py backend/tests/test_meeting_coordinator_router.py
git commit -m "feat(router): close adaptive routing learning loop via unified stats update"
```

---

### Task 2: 技能闭环自动触发（项目结束自动审核→写增量→打包）

**Covers:** S2.4（支柱 5 技能随用随进化；局限 L5）
<!-- 技能提取块（meeting_coordinator.py:1252-1273）之后追加自动闭环：get_pending_rules → approve_rule → write_to_incremental_area → full_package -->

**Files:**
- Modify: `backend/meeting_coordinator.py`（新增 `_finalize_skill_evolution` + 技能提取块调用）
- Test: `backend/tests/test_meeting_coordinator_router.py`（或新建 `test_skill_evolution_autoclose.py`，推荐新建以隔离）

**Interfaces:**
- Consumes: `ExperienceExtractor`（`get_pending_rules()`、`approve_rule(rule_id)`、`_load_rule(rule_id)`、`write_to_incremental_area(rule)`、`_incremental_dir` 属性）、`SkillPackager(output_dir)`（`full_package(base_skill_path, incremental_path, project_id, skill_name) -> PackageResult`）
- Produces: `_finalize_skill_evolution(extractor, packager, project_id) -> Dict[str, Any]`（`{"approved", "written", "packaged": [skill_name, ...]}`）；在技能提取块（meeting_coordinator.py:1271 之后）调用并发送结果消息

- [ ] **Step 1: 写失败测试**（新建 `backend/tests/test_skill_evolution_autoclose.py`）

```python
"""技能闭环自动触发：pending 规则自动审核→写增量区→打包"""

import os

import pytest

from experience_extractor import ExperienceExtractor
from skill_packager import SkillPackager


class _FakePackager:
    def __init__(self):
        self.calls = []

    def full_package(self, **kwargs):
        self.calls.append(kwargs)
        from skill_packager import PackageResult
        return PackageResult(
            package_path="x.zip", readme_content="", desensitize_report={},
            diff_summary={}, skill_name=kwargs.get("skill_name", ""),
            base_version="1.0", output_version="1.1",
        )


def _seed_pending_rule(extractor, rule_id="r-test-1"):
    from experience_extractor import ExperienceRule
    rule = ExperienceRule(
        rule_id=rule_id,
        trigger_condition="task_type is software-dev and role is executor",
        action="建议采用事件驱动架构",
        note="来自executor的讨论建议",
        rule_type="success_pattern",
        status="pending_review",
        keywords=["executor", "backend_dev"],
    )
    extractor._save_rule(rule)
    return rule


def test_finalize_skill_evolution_approves_writes_and_packages(tmp_path):
    extractor = ExperienceExtractor(incremental_dir=str(tmp_path / "experience"))
    packager = _FakePackager()
    _seed_pending_rule(extractor)

    from meeting_coordinator import MeetingCoordinator
    coordinator = object.__new__(MeetingCoordinator)  # 仅调用静态/独立方法，不构造全量
    result = MeetingCoordinator._finalize_skill_evolution(
        object.__new__(MeetingCoordinator), extractor, packager, "proj-1"
    )

    assert result["approved"] == 1
    assert result["written"] == 1
    assert os.path.exists(tmp_path / "experience" / "approved" / "r-test-1.yaml")
    assert "backend_dev" in result["packaged"]
    assert packager.calls and packager.calls[0]["project_id"] == "proj-1"
```

> 注：`_finalize_skill_evolution` 设计为实例方法（内部只用参数与常量），测试用 `object.__new__` 绕过构造；若实现改为模块级函数则测试相应简化。`ExperienceRule`/`PackageResult` 字段以 `backend/experience_extractor.py`、`backend/skill_packager.py` 实际定义为准（read 确认后调整）。keywords 需命中真实 `skill_packs/backend_dev/` 目录（仓库根 `skill_packs/backend_dev/system_prompt.md` 存在，main 工作树有未跟踪技能文件）。

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && /usr/bin/python3 -m pytest tests/test_skill_evolution_autoclose.py -v`
Expected: FAIL — `AttributeError: type object 'MeetingCoordinator' has no attribute '_finalize_skill_evolution'`

- [ ] **Step 3: 实现**

3a. `backend/meeting_coordinator.py` 新增方法：

```python
    def _finalize_skill_evolution(
        self,
        extractor,
        packager,
        project_id: str,
    ) -> Dict[str, Any]:
        """技能闭环自动触发：审核 pending 规则 → 写增量区 → 打包升级版技能包

        Returns:
            {"approved": int, "written": int, "packaged": List[str]}
        """
        result: Dict[str, Any] = {"approved": 0, "written": 0, "packaged": []}
        skill_packs_root = os.path.join(os.path.dirname(os.path.dirname(__file__)), "skill_packs")

        pending = extractor.get_pending_rules()
        for rule in pending:
            if not extractor.approve_rule(rule.rule_id):
                continue
            result["approved"] += 1
            approved_rule = extractor._load_rule(rule.rule_id)
            if approved_rule and extractor.write_to_incremental_area(approved_rule):
                result["written"] += 1
                for kw in approved_rule.keywords or []:
                    base_skill = os.path.join(skill_packs_root, kw)
                    if os.path.isdir(base_skill) and kw not in result["packaged"]:
                        packager.full_package(
                            base_skill_path=base_skill,
                            incremental_path=extractor._incremental_dir,
                            project_id=project_id,
                            skill_name=kw,
                        )
                        result["packaged"].append(kw)
        return result
```

3b. 技能提取块（meeting_coordinator.py:1252-1273，`extract_from_meeting` 之后）追加：

```python
            # 技能闭环自动触发：审核 pending → 写增量区 → 打包
            from skill_packager import SkillPackager

            skill_packager = SkillPackager(output_dir=os.path.join(data_dir, "packages"))
            finalize = self._finalize_skill_evolution(
                extractor, skill_packager, project_id=self.meeting.meeting_id
            )
            if finalize["written"]:
                finalize_text = (
                    f"项目经理：已自动审核并沉淀 {finalize['written']} 条经验规则，"
                    f"打包技能包: {', '.join(finalize['packaged']) if finalize['packaged'] else '无匹配技能目录'}。"
                )
                await self._msg(coordinator_id, finalize_text)
                self.meeting.add_message("agent", finalize_text, coordinator_id)
```

> 先读技能提取块实际代码（变量 `data_dir`/`coordinator_id`/`evolution_rules` 是否在作用域内），按其结构接入。

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && /usr/bin/python3 -m pytest tests/test_skill_evolution_autoclose.py tests/test_experience_extractor.py tests/test_skill_packager.py -q`
Expected: PASS（新增用例 + 既有用例）

- [ ] **Step 5: 提交**

```bash
git add backend/meeting_coordinator.py backend/tests/test_skill_evolution_autoclose.py
git commit -m "feat(skill): auto-close skill evolution loop with review, incremental write and packaging"
```

---

### Task 3: DAG 生成去硬编码（依赖推断替代线性链）

**Covers:** S2.4（支柱 3 并行执行；局限 L2）
<!-- _generate_workflow_definition 的硬编码关键词分支 + dept_order 线性链 + 固定 mixed → 依赖推断 + 策略按根节点数推导 -->

**Files:**
- Modify: `backend/semantic_analyzer.py`（`_generate_workflow_definition` :196-269 重写边构建与策略部分）
- Test: `backend/tests/test_workflow_integration.py`

**Interfaces:**
- Consumes: `WorkflowNode/WorkflowEdge/WorkflowDefinition`（backend/protocol.py:13-60）、`RoutingDecision`（含 `selected_dept`/`candidate_depts`）
- Produces: `_generate_workflow_definition(user_message, routing_decision) -> WorkflowDefinition`——节点集保留关键词检测+路由兜底；**边由依赖推断生成**（实现类部门互不依赖=并行；qa 依赖所有实现节点；devops 依赖 qa 与实现节点）；`execution_strategy` 按根节点数推导（根>1 → parallel，否则 sequential）

- [ ] **Step 1: 写失败测试**（追加到 `backend/tests/test_workflow_integration.py` 末尾；`MockRoutingDecision` 为该文件既有 mock）

```python
def test_generate_workflow_definition_parallel_batch():
    """前端+后端节点无依赖边（可并行），策略为 parallel"""
    from semantic_analyzer import SemanticAnalyzer
    analyzer = SemanticAnalyzer(router=None, get_model_fn=None, meeting_agents=[])
    wf = analyzer._generate_workflow_definition("前端和后端一起开发", MockRoutingDecision(selected_dept="dept-frontend"))
    depts = [n.dept_id for n in wf.nodes]
    assert "dept-frontend" in depts and "dept-backend" in depts
    edge_pairs = {(e.source_node_id, e.target_node_id) for e in wf.edges}
    by_dept = {n.node_id: n.dept_id for n in wf.nodes}
    for src, tgt in edge_pairs:
        assert not ({by_dept[src], by_dept[tgt]} <= {"dept-frontend", "dept-backend", "dept-fullstack", "dept-data"})
    assert wf.execution_strategy == "parallel"


def test_generate_workflow_definition_qa_depends_on_impl():
    """qa 节点依赖所有实现类节点"""
    from semantic_analyzer import SemanticAnalyzer
    analyzer = SemanticAnalyzer(router=None, get_model_fn=None, meeting_agents=[])
    wf = analyzer._generate_workflow_definition("前端和后端以及测试", MockRoutingDecision(selected_dept="dept-frontend"))
    by_dept = {n.node_id: n.dept_id for n in wf.nodes}
    qa_ids = [nid for nid, d in by_dept.items() if d == "dept-qa"]
    impl_ids = [nid for nid, d in by_dept.items() if d in {"dept-frontend", "dept-backend", "dept-fullstack", "dept-data"}]
    assert qa_ids and impl_ids
    incoming = {e.source_node_id for e in wf.edges if e.target_node_id == qa_ids[0]}
    assert set(impl_ids) <= incoming


def test_generate_workflow_definition_single_node_sequential():
    """单节点工作流策略为 sequential"""
    from semantic_analyzer import SemanticAnalyzer
    analyzer = SemanticAnalyzer(router=None, get_model_fn=None, meeting_agents=[])
    wf = analyzer._generate_workflow_definition("优化数据库查询", MockRoutingDecision(selected_dept="dept-backend"))
    assert len(wf.nodes) == 1
    assert wf.execution_strategy == "sequential"
```

> `MockRoutingDecision` 若构造签名不同（如无参），以文件内既有用法为准调整。`SemanticAnalyzer.__init__` 签名以 backend/semantic_analyzer.py 实际为准（可能含更多参数，用既有 fixture 或传 None）。

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && /usr/bin/python3 -m pytest tests/test_workflow_integration.py -k "generate_workflow_definition" -v`
Expected: FAIL——既有 `test_generate_workflow_definition` 断言 `execution_strategy == "mixed"` 在新策略推导下不成立，且新断言（无实现类互连边）对当前线性链失败

- [ ] **Step 3: 实现**

重写 `backend/semantic_analyzer.py` `_generate_workflow_definition` 中"节点构建之后"的部分（保留关键词节点检测与路由/兜底节点；替换 `dept_order` 排序、线性连边与固定 `mixed`）：

```python
        # 依赖推断（替代硬编码 dept_order 线性链）：
        # 实现类部门（前端/后端/全栈/数据）互不依赖 → 可并行；
        # qa 依赖所有实现类节点；devops 依赖 qa 与实现类节点；docs 独立。
        IMPL_DEPTS = {"dept-frontend", "dept-backend", "dept-fullstack", "dept-data"}
        for node in nodes:
            if node.dept_id == "dept-qa":
                for other in nodes:
                    if other.node_id != node.node_id and other.dept_id in IMPL_DEPTS:
                        edges.append(WorkflowEdge(source_node_id=other.node_id, target_node_id=node.node_id))
            elif node.dept_id == "dept-devops":
                for other in nodes:
                    if other.node_id != node.node_id and other.dept_id in (IMPL_DEPTS | {"dept-qa"}):
                        edges.append(WorkflowEdge(source_node_id=other.node_id, target_node_id=node.node_id))

        if not edges and len(nodes) > 1:
            # 兜底：无依赖关系时按原顺序线性连接，保证可执行
            for i in range(len(nodes) - 1):
                edges.append(WorkflowEdge(source_node_id=nodes[i].node_id, target_node_id=nodes[i + 1].node_id))

        # 执行策略：根节点（无入边）> 1 → parallel；否则 sequential
        incoming = {e.target_node_id for e in edges}
        root_count = sum(1 for n in nodes if n.node_id not in incoming)
        execution_strategy = "parallel" if root_count > 1 else "sequential"

        return WorkflowDefinition(
            workflow_id=workflow_id,
            name=f"工作流-{user_message[:30]}",
            description=user_message,
            nodes=nodes,
            edges=edges,
            execution_strategy=execution_strategy,
        )
```

> 同步更新既有 `test_generate_workflow_definition`（test_workflow_integration.py:74-93）：`execution_strategy == "mixed"` 改为对"前端和后端一起开发"断言 `"parallel"`；`len(nodes) >= 2` 保留。

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && /usr/bin/python3 -m pytest tests/test_workflow_integration.py -q`
Expected: PASS（新增 3 用例 + 既有用例，含更新后的 `test_generate_workflow_definition`）

- [ ] **Step 5: 提交**

```bash
git add backend/semantic_analyzer.py backend/tests/test_workflow_integration.py
git commit -m "feat(workflow): derive DAG edges from dependencies instead of hardcoded linear chain"
```

---

### Task 4: 混合执行真接线（TS orchestrator）

**Covers:** S2.4（横向混合执行；局限 L6）
<!-- coordinator.execute 无 role_locations 入参、createTeam 硬编码 local → 前端 role_locations 贯穿 TS 编排器，remote/hybrid 路由生效 -->

**Files:**
- Modify: `orchestrator/src/team/coordinator.ts`（`execute` 签名 + `createTeam` location/runtime）
- Modify: `orchestrator/src/server.ts`（`unified_message` 处理转发 `msg.role_locations`）
- Test: 新建 `orchestrator/src/team/coordinator.test.ts`

**Interfaces:**
- Consumes: `TeamMember`（types.ts:19-27，含 `location: 'local'|'remote'` 与 `runtime: TeamMemberRuntime`）、`getTemplate(roleId)`、`this.config.routerFactory.getRouterForMember(member)`（router.ts:31-47）、`defaultRuntime?: { workspace; executorUrl?; executorToken? }`
- Produces: `execute(userMessage, selectedRoles, onEvent?, roleLocations?: Record<string, 'local'|'remote'>)`；`createTeam(roleIds, task, roleLocations = {}, defaultRuntime?)`——member.location = `roleLocations[roleId] || 'local'`；remote 成员 runtime = `{type:'remote', workspace, executorUrl, executorToken}`

- [ ] **Step 1: 写失败测试**（新建 `orchestrator/src/team/coordinator.test.ts`；先读 `coordinator.ts` 构造器与 `config` 形状、`assembler.test.ts` 的 mock 风格）

```typescript
import { describe, it, expect, vi } from 'vitest';
import { TeamCoordinator } from './coordinator';
import type { LLMConfig } from '../llm/types';

function makeCoordinator(overrides: Record<string, unknown> = {}) {
  const config = {
    llm: { provider: 'deepseek', model: 'deepseek-chat', apiKey: 'test', baseUrl: '' } as LLMConfig,
    workspace: '/tmp/ws',
    routerFactory: {
      getRouterForMember: vi.fn(() => ({ execute: vi.fn() })),
      getWorkspaceForMember: vi.fn(() => '/tmp/ws'),
    },
    ...overrides,
  };
  return new TeamCoordinator(config);
}

describe('TeamCoordinator roleLocations', () => {
  it('applies roleLocations to member.location and remote runtime', async () => {
    const coordinator = makeCoordinator();
    const result = await coordinator.execute(
      '开发前端页面',
      ['executor', 'reviewer'],
      undefined,
      { executor: 'remote', reviewer: 'local' },
    );
    expect(coordinator['team']).toBeDefined();
    const members = coordinator['team']!.members;
    const execMember = members.find((m) => m.role === 'executor');
    const revMember = members.find((m) => m.role === 'reviewer');
    expect(execMember?.location).toBe('remote');
    expect(execMember?.runtime.type).toBe('remote');
    expect(revMember?.location).toBe('local');
    expect(revMember?.runtime.type).toBe('local');
  });

  it('defaults to local when roleLocations omitted', async () => {
    const coordinator = makeCoordinator();
    await coordinator.execute('简单任务', ['executor']);
    const execMember = coordinator['team']!.members.find((m) => m.role === 'executor');
    expect(execMember?.location).toBe('local');
  });
});
```

> 先读 `coordinator.ts`：构造器参数名、`execute` 返回类型、`this.team` 字段、`createAgents` 是否需要真实 LLM 调用（测试需 mock LLM 或短路）。若 `execute` 内部会真实调用 LLM（`createAgents`/`runAgentTask`），测试改为直接断言 `createTeam` 产物：构造 coordinator 后调用私有 `createTeam`（`(coordinator as any).createTeam(...)`）断言 members，避免真实 LLM。以实际代码为准调整，验收标准不变：roleLocations → member.location/runtime 正确映射。

- [ ] **Step 2: 运行确认失败**

Run: `cd orchestrator && npm test -- src/team/coordinator.test.ts`
Expected: FAIL——`execute` 现签名无第 4 参或 `createTeam` 无 roleLocations 支持

- [ ] **Step 3: 实现**

3a. `orchestrator/src/team/coordinator.ts` `execute` 签名加参数并透传：

```typescript
  async execute(
    userMessage: string,
    selectedRoles: string[],
    onEvent?: EventHandler,
    roleLocations?: Record<string, 'local' | 'remote'>,
  ): Promise<string> {
```

调用处改为 `this.team = this.createTeam(rolesToUse, userMessage, roleLocations)`（保持其余逻辑）。

3b. `createTeam` 支持 roleLocations 与 remote runtime：

```typescript
  private createTeam(roleIds: string[], task: string, roleLocations: Record<string, 'local' | 'remote'> = {}, defaultRuntime?: { workspace: string; executorUrl?: string; executorToken?: string }): Team {
    const members: TeamMember[] = roleIds.map((roleId, i) => {
      const template = getTemplate(roleId);
      if (!template) throw new Error(`Unknown role: ${roleId}`);
      const location = roleLocations[roleId] || 'local';
      const runtime =
        location === 'remote'
          ? {
              type: 'remote' as const,
              workspace: defaultRuntime?.workspace ?? this.config.workspace,
              executorUrl: defaultRuntime?.executorUrl ?? '',
              executorToken: defaultRuntime?.executorToken ?? '',
            }
          : defaultRuntime
            ? { type: 'local' as const, workspace: defaultRuntime.workspace, executorUrl: defaultRuntime.executorUrl, executorToken: defaultRuntime.executorToken }
            : { type: 'local' as const, workspace: this.config.workspace };
      return {
        id: `member-${i}`,
        name: template.name,
        role: roleId,
        template,
        status: 'idle',
        location,
        runtime,
      };
    });
    return { id: `team-${Date.now()}`, name: `task-${Date.now().toString(36)}`, description: task, members, leader: members[0] };
  }
```

（`TeamMemberRuntime` 类型以 `types.ts`/`team.ts` 实际定义为准；原实现中 `defaultRuntime` 分支保留原语义，仅新增 remote 分支与 location 透传。）

3c. `orchestrator/src/server.ts` `unified_message` 处理（:183-185 附近）转发：

```typescript
      const roleLocations = (msg.role_locations ?? {}) as Record<string, 'local' | 'remote'>;
      // 调用 coordinator.execute 处追加 roleLocations 参数（第 4 参）
```

（先读 server.ts 的 execute 调用点，把 `msg.role_locations` 作为第 4 参传入。）

- [ ] **Step 4: 运行确认通过**

Run: `cd orchestrator && npm test`
Expected: PASS（新增用例 + 既有 vitest 用例）

- [ ] **Step 5: 提交**

```bash
git add orchestrator/src/team/coordinator.ts orchestrator/src/server.ts orchestrator/src/team/coordinator.test.ts
git commit -m "feat(orchestrator): wire roleLocations through team creation for hybrid execution"
```

---

### Task 5: 杂项收尾（CLI 注入 + companion_log 去跟踪）

**Covers:** S2.4（横向；评审遗留）
<!-- CLI 脚本注入共享 workflow_engine；companion_log.json 移出 git 跟踪 -->

**Files:**
- Modify: `backend/run_project.py`（:335-342 构造点）、`backend/demo_full_cycle.py`（:121-128 构造点）
- Modify: `.gitignore`（新增 `backend/companion_log.json`）
- Git: `git rm --cached backend/companion_log.json`

**Interfaces:**
- Consumes: `WorkflowEngine`（backend/workflow_engine.py）、`MeetingCoordinator(..., workflow_engine=..., approval_manager=...)`
- Produces: 两 CLI 脚本的 coordinator 注入 `workflow_engine=WorkflowEngine()`（脚本内共享；approval_manager 保持 None——CLI 无人工 UI，自动通过为诚实默认）

- [ ] **Step 1: 写失败测试（编译验证）**

Run: `cd backend && /usr/bin/python3 -m py_compile run_project.py demo_full_cycle.py`
Expected: PASS（改动前基线）

- [ ] **Step 2: 实现**

2a. `backend/run_project.py:335-342` 构造点加 `workflow_engine=WorkflowEngine()`（文件头部补 `from workflow_engine import WorkflowEngine`）。

2b. `backend/demo_full_cycle.py:121-128` 构造点同样注入。

2c. 根 `.gitignore` 追加一行 `backend/companion_log.json`。

2d. `git rm --cached backend/companion_log.json`（保留磁盘文件，仅移出跟踪）。

- [ ] **Step 3: 验证**

Run: `cd backend && /usr/bin/python3 -m py_compile run_project.py demo_full_cycle.py && /usr/bin/python3 -m pytest tests/ -q`
Expected: py_compile PASS；全量回归 852 passed / 1 环境失败 / 1 skipped；`git status` 不再显示 companion_log.json 的 M 状态

- [ ] **Step 4: 提交**

```bash
git add backend/run_project.py backend/demo_full_cycle.py .gitignore
git rm --cached backend/companion_log.json
git commit -m "chore(cli): inject shared workflow engine in CLI scripts, untrack companion_log"
```

---

### Task 6: 前端审批面板端到端验证

**Covers:** S2.4（横向审批；P0 推送契约的验证闭环）
<!-- useMeetingSocket 对结构化 human_approval_request 的处理（:691-716）已存在，P0 已改为结构化推送——补自动化验证 -->

**Files:**
- Test: 前端 hooks 测试（`src/hooks/__tests__/` 或既有 useMeetingSocket 测试文件，以实际结构为准）

**Interfaces:**
- Consumes: `useMeetingSocket` 的 `human_approval_request` 分支（:691-716）与 `sendApprovalResponse`（:1009-1016）、`pendingApprovals` state

- [ ] **Step 1: 摸底**

Run: `ls src/hooks/__tests__ 2>/dev/null; grep -rn "pendingApprovals\|human_approval_request" src/hooks src/modules --include="*.test.ts*" | head`
Expected: 确认既有测试文件与覆盖现状（前端测试命令以根 package.json 为准，如 `npm test`）

- [ ] **Step 2: 补测试或验证**

若可低成本构造 `useMeetingSocket` 测试（参考既有 hooks 测试的 renderHook/mock 风格），新增：模拟 WS 消息 `{ type: 'human_approval_request', request: { id, requesterId, operation, description, riskLevel, confidence, createdAt } }`，断言 `pendingApprovals.get(id)` 字段完整。

若 hooks 测试基建不存在或成本过高，退化为验证性结论：代码级确认 `:691-716` 处理结构化请求 + `sendApprovalResponse` 发送 `human_approval_response`（P0 推送契约已通），在任务报告中记录验证结果并说明未补测试的原因。

- [ ] **Step 3: 验证**

Run:（前端测试命令，以根 package.json 为准）预期通过；若无测试补入，报告代码级验证结论即可。

- [ ] **Step 4: 提交**

```bash
git add <测试文件或 (none)>
git commit -m "test(frontend): verify structured human_approval_request handling"  # 若无测试则跳过提交
```

---

## 自检备注（Self-Review）

- **Spec coverage**：T1 → 支柱 1（L3）；T2 → 支柱 5（L5）；T3 → 支柱 3（L2）；T4 → 横向混合执行（L6）；T5 → 横向杂项（评审遗留）；T6 → 横向审批验证（P0 契约闭环）。全部对应分析文档 S2.4 P1 项。
- **已知取舍（记录而非回避）**：T3 采用确定性依赖推断而非 LLM 生成 DAG（LLM 结构化 DAG 生成属 P2，保持可测试性与零额外 LLM 成本）；T5 CLI 的 approval_manager 保持 None（CLI 无人工 UI，自动通过为诚实默认并输出明确文案）；T2 自动审核采用"全部采纳"策略（与 demo_full_cycle 既有 `demo_skill_evolution` 一致，产品化的人工审核面板保留 REST 通道）。
- **明确不做的**：审查确定性门禁、HITL 分级（未入选本阶段）、MCP/A2A、durable execution（P2）、mock-sso、技能打包人工审核 UI 改造。
- **环境**：backend 全量回归基线 852 passed；orchestrator `npm test` 基线以首跑为准；main 工作树未跟踪 skill_packs 文件影响 `test_skill_packs_structure`（PRE-EXISTING）。
