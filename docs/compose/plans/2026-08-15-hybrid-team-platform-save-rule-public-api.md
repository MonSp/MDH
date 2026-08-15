# [M4 后续] _save_rule 私有 API 公开化 Implementation Plan

> [!NOTE]
> This document may not reflect the current implementation.
> See the final report for up-to-date state:
> [Final Report](../reports/hybrid-team-platform.md)


> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除 `skill_evolution.py` 对 `ExperienceExtractor._save_rule` 私有方法的跨模块直调（M4 评审登记技术债）——把 `source_task_type` 纳入 `modify_rule` 的 `allowed_fields`，skill_evolution 改用公开 `modify_rule` API 完成元数据回写。

**Architecture:** `experience_extractor.py` `modify_rule` 的 `allowed_fields` 加 `"source_task_type"`（一行 + 注释——该字段是 `extract_from_meeting` 生成的规则类型，评审确认的缺失根因）；`skill_evolution.py` `evolve_from_feedback` 的"reload → 回填 → `_save_rule`"改为"`modify_rule(rule_id, updates)` 公开调用（白名单字段：source_task_type/trigger_condition/keywords）→ 重新 `_load_rule` 拿回填后 approved 副本 → `write_to_incremental_area`"（行为不变：rules/ 与 approved/ 双存储均含回填元数据）。`_load_rule` 读调用保留（meeting_coordinator.py:921 生产先例，非本次目标）。

**Tech Stack:** Python 3.11 · pytest 9.1.1（asyncio_mode=auto）· 纯标准库

## Global Constraints

- **测试环境**：backend 测试用 `/home/test/miniconda3/envs/agentscope/bin/python -m pytest <file> -v`（cwd=`backend/`）。
- **零新依赖**：不新增包。
- **不要动**：`approve_rule`/`submit_for_review`/`write_to_incremental_area`/`retrieve_relevant_rules` 语义；`_save_rule` 内部实现（它仍被 modify_rule/approve_rule 内部使用——只是不再被 skill_evolution 跨模块直调）；`_load_rule` 读调用点。
- **提交纪律**：单任务一个 commit；只 `git add` 本任务文件。
- **已知基线**：`tests/test_skill_packs_structure.py` PRE-EXISTING（勿处理）。

---

### Task 1: _save_rule 公开化（allowed_fields + skill_evolution 改用 modify_rule）

**Files:**
- Modify: `backend/experience_extractor.py`（`modify_rule` allowed_fields 加 source_task_type）
- Modify: `backend/skill_evolution.py`（evolve_from_feedback 用 modify_rule 替代 _save_rule 直调）
- Test: `backend/tests/test_experience_extractor.py`（追加 modify source_task_type）+ `backend/tests/test_skill_evolution.py`（回归/追加）

**Interfaces:**
- Consumes: `ExperienceExtractor.modify_rule(rule_id, updates) -> bool`（白名单 setattr + `_save_rule` 回写 rules/）；`_load_rule`（读）；`write_to_incremental_area`。
- Produces: `modify_rule` 支持 `source_task_type` 更新；skill_evolution 元数据回写走公开 API（`_save_rule` 不再被 skill_evolution 直调）；行为不变（rules/ 与 approved/ 双存储均含回填元数据）。

- [ ] **Step 1: 写失败测试**

`backend/tests/test_experience_extractor.py` 追加：

```python
def test_modify_rule_updates_source_task_type(tmp_path):
    extractor = ExperienceExtractor(str(tmp_path))
    rule = ExperienceRule(trigger_condition="task_type is general", action="test", keywords=["a"])
    rule_id = extractor.submit_for_review(rule)
    assert extractor.modify_rule(rule_id, {"source_task_type": "minutes"})
    loaded = extractor._load_rule(rule_id)
    assert loaded.source_task_type == "minutes"
```

`backend/tests/test_skill_evolution.py` 追加（锁定 evolve 后规则经公开 API 回填）：

```python
def test_evolve_writes_backfill_via_public_api(tmp_path):
    extractor = ExperienceExtractor(str(tmp_path))
    evo = SkillEvolution(extractor)
    result = evo.evolve_from_feedback("p1", "minutes", "会议讨论发布计划。",
                                      "审核修改：遗漏行动项责任人。", ["责任人", "行动项"])
    assert result["count"] >= 1
    rule_id = result["rule_id"]
    loaded = extractor._load_rule(rule_id)
    assert loaded.source_task_type == "minutes"  # 经 modify_rule 回填 rules/
    assert "责任人" in loaded.keywords
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_experience_extractor.py::test_modify_rule_updates_source_task_type -v`
Expected: FAIL——modify_rule 白名单不含 source_task_type（logger.warning "not modifiable, skipped"）→ 加载后仍默认值。

- [ ] **Step 3: 实现**

`backend/experience_extractor.py` `modify_rule` 的 `allowed_fields`（:460-467）加：

```python
        allowed_fields = {
            "trigger_condition",
            "action",
            "note",
            "rule_type",
            "status",
            "keywords",
            "source_task_type",  # 规则类型（extract_from_meeting 生成）；skill_evolution 元数据回填用
        }
```

`backend/skill_evolution.py` `evolve_from_feedback` 的元数据回写段（现 :75 reload → 回填 → :98 `_save_rule`）改为：

```python
        written = 0
        for rule in rules:
            review_id = self._extractor.submit_for_review(rule)
            if self._extractor.approve_rule(review_id, reviewer_comment="auto-approve (skill evolution)"):
                approved_rule = self._extractor._load_rule(review_id)
                updates = {}
                if task_type:
                    updates["source_task_type"] = task_type
                    updates["trigger_condition"] = (
                        f"task_type is {task_type} and " + approved_rule.trigger_condition.split(" and ", 1)[-1]
                        if " and " in approved_rule.trigger_condition
                        else f"task_type is {task_type}"
                    )
                if keywords:
                    updates["keywords"] = sorted(set(approved_rule.keywords) | set(keywords))
                if updates:
                    # 公开 API 回写 rules/（替代 _save_rule 直调）；modify_rule 白名单含
                    # source_task_type/trigger_condition/keywords
                    self._extractor.modify_rule(review_id, updates)
                    approved_rule = self._extractor._load_rule(review_id)  # 回填后的 approved 副本
                if self._extractor.write_to_incremental_area(approved_rule):
                    written += 1
        return {"ok": True, "rule_id": rules[0].rule_id if rules else "", "count": written}
```

（**以实际代码为准**：现循环结构（:70-93 附近）——保持 submit/approve/reload/write 顺序与既有行为；仅把"内存回填 + `_save_rule`"替换为"`modify_rule` 公开调用 + 重 reload"。**注意**：重 reload 保证 write_to_incremental_area 用的 approved_rule 是回填后 approved 副本（rules/ 与 approved/ 双存储一致——既有语义）。）

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_experience_extractor.py tests/test_skill_evolution.py tests/test_asset_search.py -q`
Expected: 新 2 用例 + 既有回归（含 test_asset_search 的 rules 检索依赖回填）全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/experience_extractor.py backend/skill_evolution.py backend/tests/test_experience_extractor.py backend/tests/test_skill_evolution.py
git commit -m "refactor(hybrid): expose rule metadata update via modify_rule instead of private _save_rule"
```

---

## Self-Review 结论

- **覆盖**：M4 评审登记技术债（`_save_rule` 跨模块直调）落地——`source_task_type` 纳入 allowed_fields + skill_evolution 改用公开 `modify_rule`；`_save_rule` 不再被 skill_evolution 直调（仅内部使用）。
- **无占位符**：全部步骤含可运行代码/命令与预期输出；涉及既有循环结构给"以实际代码为准"指引。
- **范围**：experience_extractor（allowed_fields +1 行）+ skill_evolution（回写段重构）+ 测试；approve_rule/write_to_incremental_area/_load_rule 读调用语义不变；双存储行为不变。
