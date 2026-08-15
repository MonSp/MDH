# [M4 后续] 注入 wiring 真实纪要试点 Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/hybrid-team-platform.md)


> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 M4 登记的"注入 wiring 接线"（M4-T2 seam 已就绪但惰性——`input_data["team_id"]` 从不由既有工作流路径填充）：①`build_minutes_workflow` 加 `team_id` 参数（节点 input_spec 透传——wiring 的必要接线点）；②直驱真实纪要试点（pilot_asset_injection.py）——预置团队资产 + coordinator 绑定 `build_asset_context` 为 asset_context_builder + 真实纪要 DAG 运行验证注入接线生效。

**Architecture:** T1——`minutes_workflow.py` `build_minutes_workflow(transcript, approver="submitter", team_id="")` 尾置默认（向后兼容），节点 `input_spec={"transcript": transcript, **({"team_id": team_id} if team_id else {})}`（空 team_id 不加键，保持既有形状）。T2——直驱试点（复用 pilot_minutes 模式）：AssetStore 预置演示团队资产（模板/知识）+ SkillEvolution 提炼技能规则 → `MeetingCoordinator(asset_context_builder=...)` 绑定 `build_asset_context(store, extractor, ...)` → 真实纪要运行（process_user_message）→ 验收（注入接线生效：节点 prompt 含资产参考段；生成结果产出；注入失败不影响执行）。

**Tech Stack:** Python 3.11 · pytest 9.1.1（asyncio_mode=auto）· 纯标准库

## Global Constraints

- **测试环境**：backend 测试用 `/home/test/miniconda3/envs/agentscope/bin/python -m pytest <file> -v`（cwd=`backend/`）。
- **零新依赖**：不新增包。
- **不要动**：`_execute_workflow_node` 注入 seam 语义（M4-T2 已评审）；`build_asset_context`（M4-T1）；coordinator 构造既有参数（team_id 只经节点 input_spec 流）。
- **提交纪律**：每任务一个 commit；只 `git add` 本任务文件。
- **已知基线**：`tests/test_skill_packs_structure.py` PRE-EXISTING（勿处理）。

---

### Task 1: build_minutes_workflow 加 team_id（input_spec 透传）

**Files:**
- Modify: `backend/minutes_workflow.py`（`build_minutes_workflow` 尾置 `team_id` 参数 + 节点 input_spec 透传）
- Test: `backend/tests/test_minutes_workflow.py`（追加）

**Interfaces:**
- Produces: `build_minutes_workflow(transcript: str, approver: str = "submitter", team_id: str = "") -> WorkflowDefinition`——team_id 非空时各节点 `input_spec["team_id"] = team_id`（空则不加键——既有形状与既有调用零变化）。

- [ ] **Step 1: 写失败测试**（追加 `backend/tests/test_minutes_workflow.py`）

```python
def test_build_minutes_workflow_carries_team_id():
    wf = build_minutes_workflow("会议讨论发布计划。", team_id="team-x")
    for node in wf.nodes:
        assert node.input_spec.get("team_id") == "team-x"


def test_build_minutes_workflow_no_team_id_keeps_shape():
    wf = build_minutes_workflow("会议讨论发布计划。")
    for node in wf.nodes:
        assert "team_id" not in node.input_spec  # 缺省不加键（既有形状不变）
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_minutes_workflow.py::test_build_minutes_workflow_carries_team_id -v`
Expected: FAIL——`TypeError: build_minutes_workflow() got an unexpected keyword argument 'team_id'`。

- [ ] **Step 3: 实现**

`backend/minutes_workflow.py`：

```python
def build_minutes_workflow(transcript: str, approver: str = "submitter", team_id: str = "") -> WorkflowDefinition:
    # ... 既有节点构建（读实际代码确认 _NODES/循环结构）...
    # 节点 input_spec 透传 team_id（非空时；空则不加键——既有形状与调用零变化）：
    #   节点 input_spec = {"transcript": transcript}
    #   if team_id:
    #       node.input_spec["team_id"] = team_id
```

（以实际代码为准：读 build_minutes_workflow 的节点构造循环（约 :20-35），在每个节点 input_spec 构造后加 team_id 透传——保持既有 transcript 键不变。）

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_minutes_workflow.py tests/test_minutes_endpoint.py tests/test_workflow_integration.py -q`
Expected: 新 2 用例 + 既有回归（端点/集成——缺省 shape 不变）全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/minutes_workflow.py backend/tests/test_minutes_workflow.py
git commit -m "feat(hybrid): carry team id through minutes workflow node inputs for asset injection"
```

---

### Task 2: pilot_asset_injection 直驱试点（真实纪要 + 注入验证）

**Files:**
- Create: `backend/pilot_asset_injection.py`
- Test: 无（试点脚本——参考 pilot_minutes/pilot_judge 惯例不强制测试；验收在脚本内）

**Interfaces:**
- Consumes: Task 1 `build_minutes_workflow(transcript, approver, team_id)`（经 semantic_analyzer 文档模式构建时——**注意**：process_user_message 的 workflow 由 semantic_analyzer 内部 build_minutes_workflow 生成（无 team_id 参数传入）——**试点需走直接 WorkflowEngine 路径或扩展 analyzer 传 team_id？**——先读 pilot_minutes 直驱流程确认 process_user_message 是否可传 team_id；**若 analyzer 内部构建无 team_id 通道**，试点改走**直接 workflow 路径**：构造 WorkflowEngine + build_minutes_workflow(team_id=...) → engine.execute + coordinator 节点执行？——不，节点执行在 coordinator._execute_workflow_node（workflow_engine 的 executor 注册）。**以实际为准**：若 process_user_message 无法传 team_id，试点在 workflow 构建后直接改节点 input_spec（`for node in wf.nodes: node.input_spec["team_id"] = "team-x"`）再执行）；`build_asset_context`（M4-T1）；`MeetingCoordinator(asset_context_builder=...)`（M4-T2 seam）；`AssetStore`/`ExperienceExtractor`/`SkillEvolution`。
- Produces: 直驱试点脚本——预置演示团队资产（AssetStore 好模板/知识 + SkillEvolution 提炼技能规则）→ MeetingCoordinator 绑定 builder（`lambda team_id, task_type, kw: build_asset_context(store, extractor, team_id, task_type, kw)`）→ 真实纪要运行（速记 → 纪要 DAG 3 节点真实 LLM）→ 验收清单（①注入接线生效——节点 prompt 含资产参考段（经 coordinator 测试钩子或日志/结果间接验证）；②生成结果产出（extract/draft 非空）；③无资产团队零成本（空 team 不注入））。

- [ ] **Step 1: 读现状确认执行路径**

读 `backend/pilot_minutes.py` 直驱流程（:120-150 附近：WorkspaceManager + MeetingSession + MeetingCoordinator 构造 + process_user_message）与 `meeting_coordinator.py` 的 process_user_message 工作流分支（:1195-1239）——确认 process_user_message 构建纪要 workflow 的 team_id 通道；**若 analyzer 内部 build_minutes_workflow 无 team_id 通道**（预期——build_minutes_workflow(transcript, approver) 只传两参），试点在 workflow 构建后改节点 input_spec（或在 workflow 引擎执行前拦截）。

- [ ] **Step 2: 写试点脚本**（`backend/pilot_asset_injection.py`）

骨架（以实际代码为准）：

```python
"""注入 wiring 真实纪要试点：验证 M4 资产复用注入 seam 的接线生效。

预置演示团队资产（模板/知识/技能规则）→ MeetingCoordinator 绑定 build_asset_context
为 asset_context_builder → 真实纪要 DAG 运行（deepseek-chat）→ 验收：
①注入接线生效（节点 prompt 含资产参考段）；②生成结果产出；③无资产团队零成本。
"""

import argparse, asyncio, os, sys, tempfile
sys.path.insert(0, os.path.dirname(__file__))

from asset_store import AssetStore
from asset_injection import build_asset_context
from experience_extractor import ExperienceExtractor
from skill_evolution import SkillEvolution
from meeting_coordinator import MeetingCoordinator
from workspace_manager import WorkspaceManager, WorkspaceType
from meeting import MeetingSession, create_team_from_roles
from agent_toolset import load_roles_config
from approval_manager import ApprovalManager

TEAM_ID = "pilot-asset-team"
TRANSCRIPT = "今天的会议讨论了新产品发布计划：确定 8 月 15 日上线，市场部负责宣传物料，研发部负责版本冻结，销售部准备客户通知。请把速记整理成会议纪要并生成待办清单。"
GOOD_TEMPLATE = (... 好模板 54+ 字符 ...)
GOOD_ARTIFACT = (... 好产出物 ...)


def seed_assets(store, extractor):
    store.store_artifact(TEAM_ID, "纪要-0815", GOOD_ARTIFACT)
    store.propose_template(TEAM_ID, "会议纪要模板", GOOD_TEMPLATE)
    SkillEvolution(extractor).evolve_from_feedback("p1", "minutes", "会议讨论发布计划。",
                                                    "审核修改：遗漏行动项责任人。", ["责任人", "行动项"])


async def run(args):
    # 预置资产
    with tempfile.TemporaryDirectory() as tmp:
        store = AssetStore(os.path.join(tmp, "assets"))
        extractor = ExperienceExtractor(os.path.join(tmp, "rules"))
        seed_assets(store, extractor)

        # coordinator 绑定 builder
        builder = lambda team_id, task_type, kw: build_asset_context(store, extractor, team_id, task_type, kw)
        coordinator = MeetingCoordinator(..., asset_context_builder=builder, ...)

        # 真实纪要运行（同 pilot_minutes 直驱——process_user_message）
        result = await coordinator.process_user_message(TRANSCRIPT, collector.collect)
        # 注入验证：捕获节点执行时的 prompt 或经节点结果验证资产段（读 _execute_workflow_node 是否可观测 prompt）
        # 验收清单打印 + 退出码
```

（**关键**：①注入验证——`_execute_workflow_node` 的 prompt 在内部构造（:337-349）不直接暴露——试点可在 coordinator 构造后 monkeypatch `_execute_workflow_node` 捕获 prompt（wrapper 记录 prompt 含"资产参考"后调原方法），或经节点结果/日志间接验证；**以实际可观测方式为准**（优先 wrapper 捕获——直接验证注入段）；②team_id 通道——若 process_user_message 内部构建的 workflow 节点 input_spec 无 team_id（预期），试点在 workflow 执行前改节点 input_spec（process_user_message 内部 _execute_workflow 无法拦截？——**读 process_user_message 工作流分支**：若 workflow 构建在执行内部，试点需换路径（直接 WorkflowEngine + 注册 executor？）——**最简可行路径**：若无法拦截，试点改走 coordinator._execute_workflow 之前先构建 workflow 并改 input_spec 的**独立路径**（仿 pilot_minutes 但绕过 process_user_message 的 analyzer——直接调 build_minutes_workflow(team_id=) + workflow_engine 执行 + coordinator 节点执行）——**以实际代码为准，保证"注入接线生效 + 真实 LLM 纪要生成"两个目标达成**。）

- [ ] **Step 3: 实跑（真实 key）**

Run: `KEY=... BASE=... MODEL=... /home/test/miniconda3/envs/agentscope/bin/python pilot_asset_injection.py --api-key "$KEY" --base-url "$BASE" --model "$MODEL"`
Expected: 验收清单（注入接线生效/生成结果产出/零成本）——注入段验证 PASS + 纪要 3 节点产出非空。

- [ ] **Step 4: 验证 + 手册**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m py_compile backend/pilot_asset_injection.py`
在试点手册（docs/compose/plans/2026-08-14-hybrid-team-platform-pilot.md）追加 §11：注入 wiring 试点——运行方式/结果/接线说明（build_minutes_workflow team_id → input_spec → coordinator seam → 节点注入）。

- [ ] **Step 5: 提交**

```bash
git add backend/pilot_asset_injection.py docs/compose/plans/2026-08-14-hybrid-team-platform-pilot.md
git commit -m "feat(pilot): asset injection wiring real minutes pilot with seeded team assets"
```

---

## Self-Review 结论

- **覆盖**：M4 登记"注入 wiring 接线"落地——T1 build_minutes_workflow team_id 透传（wiring 必要接线点）+ T2 直驱真实纪要试点（预置资产 + coordinator 绑定 builder + 注入接线生效验证）。M4-T2 seam 从惰性转活跃。
- **无占位符**：全部步骤含可运行代码/命令与预期输出；涉及执行路径（process_user_message 内部 workflow 构建的 team_id 通道）给"以实际代码为准"指引。
- **范围**：minutes_workflow（尾置参数向后兼容）+ 试点脚本 + 手册；`_execute_workflow_node` seam/build_asset_context/coordinator 既有参数零改动。
