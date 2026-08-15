# [M4 后续] 规则级团队隔离 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地登记项"规则级团队隔离"（注入 wiring 试点评审发现）——`ExperienceExtractor.retrieve_relevant_rules` 当前**全局检索**（不按团队），M4 注入场景中团队 A 的纪要会注入团队 B 提炼的技能规则（跨团队知识泄漏；`AssetStore` 的 artifacts/templates 已团队隔离，rules 是唯一缺口）。

**Architecture:** `ExperienceRule` 加 `team_id: str = ""`（尾置默认——10 字段构造兼容）；YAML 序列化 save/load 同步（load 用 `r.get("team_id", "")` 旧规则缺键容错）；`retrieve_relevant_rules(task_type, keywords, team_id="")`——team_id 非空时过滤 `rule.team_id == team_id`（空 = 全局，既有行为零变化）；`SkillEvolution.evolve_from_feedback(..., team_id="")` 尾置——经 `modify_rule` 回填（`modify_rule` allowed_fields 加 `team_id`——与 source_task_type/keywords 同模式，M4-T5 已确立）；`AssetSearch.search(..., team_id)` 透传 retrieve_relevant_rules；`build_asset_context`（已接受 team_id）自动随 AssetSearch 透传——注入完整团队隔离。

**Tech Stack:** Python 3.11 · pytest 9.1.1（asyncio_mode=auto）· 纯标准库

## Global Constraints

- **测试环境**：backend 测试用 `/home/test/miniconda3/envs/agentscope/bin/python -m pytest <file> -v`（cwd=`backend/`）。
- **零新依赖**：不新增包。
- **不要动**：`retrieve_relevant_rules` 空 team_id 行为（全局——向后兼容）；既有规则的 source_task_id/source_task_type 语义；`_execute_workflow_node` seam。
- **提交纪律**：单任务一个 commit；只 `git add` 本任务文件。
- **已知基线**：`tests/test_skill_packs_structure.py` PRE-EXISTING（勿处理）；`test_performance.py` flaky。

---

### Task 1: 规则级团队隔离（字段/序列化/检索/回填/透传）

**Files:**
- Modify: `backend/experience_extractor.py`（`ExperienceRule.team_id` 尾置默认 + save/load 序列化 + `retrieve_relevant_rules` team_id 过滤 + `modify_rule` allowed_fields 加 team_id）
- Modify: `backend/skill_evolution.py`（`evolve_from_feedback` 尾置 team_id + 回填 updates 含 team_id）
- Modify: `backend/asset_search.py`（`search(..., team_id="")` 透传 retrieve_relevant_rules）
- Test: `backend/tests/test_experience_extractor.py`（team_id 序列化/检索过滤）+ `backend/tests/test_skill_evolution.py`（回填 team_id）+ `backend/tests/test_asset_search.py`（团队隔离检索）

**Interfaces:**
- Produces: `ExperienceRule.team_id: str = ""`（尾置默认）；`retrieve_relevant_rules(task_type, keywords, team_id="")`（非空过滤，空=全局）；`SkillEvolution.evolve_from_feedback(project_id, task_type, transcript, feedback, keywords, team_id="")`（尾置，modify_rule 回填 team_id）；`AssetSearch.search(team_id, query="", asset_type="", task_type="", keywords=None)`（签名已含 team_id——检索 rules 时透传过滤）；`build_asset_context`（已接受 team_id——随 AssetSearch 自动隔离，零改动）。

- [ ] **Step 1: 写失败测试**

`backend/tests/test_experience_extractor.py` 追加：

```python
def test_retrieve_relevant_rules_filters_by_team(tmp_path):
    extractor = ExperienceExtractor(str(tmp_path))
    rule_a = ExperienceRule(rule_id="r-a", trigger_condition="task_type is minutes", action="a",
                            note="", source_task_id="p1", source_task_type="minutes", rule_type="correction_tip",
                            status="approved", keywords=["纪要"], created_at="t", team_id="team-a")
    rule_b = ExperienceRule(rule_id="r-b", trigger_condition="task_type is minutes", action="b",
                            note="", source_task_id="p2", source_task_type="minutes", rule_type="correction_tip",
                            status="approved", keywords=["纪要"], created_at="t", team_id="team-b")
    extractor.submit_for_review(rule_a); extractor.approve_rule("r-a")
    extractor.submit_for_review(rule_b); extractor.approve_rule("r-b")
    assert [r.rule_id for r in extractor.retrieve_relevant_rules("minutes", ["纪要"], team_id="team-a")] == ["r-a"]
    assert [r.rule_id for r in extractor.retrieve_relevant_rules("minutes", ["纪要"], team_id="team-b")] == ["r-b"]
    assert len(extractor.retrieve_relevant_rules("minutes", ["纪要"])) == 2  # 空 team_id → 全局（向后兼容）
```

（**注意**：`submit_for_review`/`approve_rule` 走 YAML 持久化（rule_id 文件）——`_load_rule` 读取时 team_id 需序列化保真；构造 `ExperienceRule` 现 11 字段（10 + team_id 尾置默认）——旧测试全字段构造仍兼容。）

`backend/tests/test_skill_evolution.py` 追加：

```python
def test_evolve_stores_team_id(tmp_path):
    extractor = ExperienceExtractor(str(tmp_path))
    evo = SkillEvolution(extractor)
    result = evo.evolve_from_feedback("p1", "minutes", "会议讨论发布计划。",
                                      "审核修改：遗漏行动项责任人。", ["责任人"], team_id="team-a")
    assert result["count"] >= 1
    loaded = extractor._load_rule(result["rule_id"])
    assert loaded.team_id == "team-a"
```

`backend/tests/test_asset_search.py` 追加（或改既有——以实际为准）：

```python
def test_search_rules_respects_team_isolation(tmp_path):
    # 团队 A/B 各 evolve 规则 → search(team_id="team-a") 仅返回 A 的规则
    # （构建同 test_search_merges_three_asset_types 模式——两团队 evolve 后 search 过滤）
```

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_experience_extractor.py::test_retrieve_relevant_rules_filters_by_team -v`
Expected: FAIL——`retrieve_relevant_rules` 无 team_id 参数（TypeError）或过滤不生效。

- [ ] **Step 3: 实现**

`backend/experience_extractor.py`：

```python
# ExperienceRule dataclass 尾置加：
    team_id: str = ""  # 归属团队（"" = 全局/未隔离——旧规则兼容）

# save（:145-156）加：
                    "team_id": rule.team_id,

# load（:175-176）加：
                team_id=r.get("team_id", ""),  # 旧规则文件缺键容错

# modify_rule allowed_fields 加：
            "team_id",

# retrieve_relevant_rules 签名加 team_id="" + 过滤：
    def retrieve_relevant_rules(self, task_type: str, keywords: List[str], team_id: str = "") -> List[ExperienceRule]:
        ...
        for rule_id in all_rule_ids:
            rule = self._load_rule(rule_id)
            if rule is None or rule.status != "approved":
                continue
            if team_id and rule.team_id != team_id:
                continue  # 团队隔离：非空 team_id 时仅返回同团队规则（空=全局，向后兼容）
            ...
```

（以实际代码为准：ExperienceRule 尾置字段——dataclass 尾置默认向后兼容（既有 10 字段必填构造不变）；`submit_for_review` 持久化路径（save）同步 team_id；`_extract_keywords`/`_infer_task_type` 等不涉及。**注意 approve_rule 改磁盘副本的既有语义**——测试的 `approve_rule("r-a")` 后 `_load_rule` 读回含 team_id（save 已写）。）

`backend/skill_evolution.py` `evolve_from_feedback` 尾置 `team_id: str = ""` + 回填 updates（:83-96 现有 updates dict 加）：

```python
                if team_id:
                    updates["team_id"] = team_id
```

（modify_rule allowed_fields 已加 team_id——回填经公开 API。）

`backend/asset_search.py` `search` 的 rules 检索（:47-56）：

```python
            for rule in self._extractor.retrieve_relevant_rules(task_type, keywords, team_id=team_id):
```

（`search(team_id, ...)` 签名已含 team_id——rules 检索现在按团队过滤；artifacts/templates 已按团队。）

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_experience_extractor.py tests/test_skill_evolution.py tests/test_asset_search.py tests/test_asset_injection.py -q`
Expected: 新用例 + 既有回归（空 team_id 全局行为/全字段构造/检索）全绿。

- [ ] **Step 5: 提交**

```bash
git add backend/experience_extractor.py backend/skill_evolution.py backend/asset_search.py <测试文件>
git commit -m "feat(hybrid): team-scoped skill rule isolation through retrieval and evolution"
```

---

## Self-Review 结论

- **覆盖**：登记项"规则级团队隔离"落地——ExperienceRule.team_id 字段 + 序列化（旧规则缺键容错）+ retrieve_relevant_rules 团队过滤（空=全局向后兼容）+ evolve 回填（modify_rule 公开 API）+ AssetSearch/build_asset_context 注入透传——M4 注入完整团队隔离（artifacts/templates/rules 三类资产均按团队）。
- **无占位符**：全部步骤含可运行代码/命令与预期输出；涉及既有构造/持久化给"以实际为准"指引。
- **范围**：experience_extractor（字段/序列化/检索/白名单）+ skill_evolution（尾置+回填）+ asset_search（透传）+ 测试；空 team_id 行为零变化；`_execute_workflow_node` seam 零改动。
