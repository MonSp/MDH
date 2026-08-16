# [M4 后续] 存量规则 team_id 迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 T44 登记的后续项——存量 `team_id=""` 规则迁移（规则级团队隔离 fail-closed 后注入死数据）。当前 `backend/data/experience/rules/` 有 115 条存量规则全部缺 team_id 键（load 回落 ""），团队检索（`retrieve_relevant_rules(team_id=...)`）与注入场景对其不可见。迁移到演示团队 `team-x`（用户确认）——与 M4/M5 演示数据一致，注入演示场景立即可见。

**Architecture:** `ExperienceExtractor.migrate_rules_team_id(team_id, rule_ids=None) -> int`——扫描 `_list_rule_ids()`（或指定子集），对 `team_id == ""` 的规则经 `modify_rule(rule_id, team_id=team_id)` 公开 API 回填（白名单已含 team_id，T44 已确立）；返回迁移条数；幂等（已含 team_id 跳过、二次调用 0）。演示迁移 = 对 data/ 存量规则执行迁移到 team-x（一次性数据操作，data/ gitignored 不入库）。测试锁定：迁移前团队检索不可见 → 迁移后可见 + 幂等 + 指定子集 + 已指定规则不动。

**Tech Stack:** Python 3.11 · pytest 9.1.1 · 纯标准库

## Global Constraints

- **测试环境**：backend 测试用 `/home/test/miniconda3/envs/agentscope/bin/python -m pytest <file> -v`（cwd=`backend/`）。
- **零新依赖**：不新增包。
- **不要动**：`modify_rule`/`retrieve_relevant_rules` 既有语义（T44 已交付）；规则 YAML schema；`data/`（gitignored 运行数据——迁移是运行时操作非入库代码）。
- **提交纪律**：单任务一个 commit；只 `git add` 本任务文件。
- **已知基线**：`tests/test_skill_packs_structure.py` PRE-EXISTING（勿处理）；`test_performance.py` flaky。

---

### Task 1: migrate_rules_team_id + 演示迁移

**Files:**
- Modify: `backend/experience_extractor.py`（`migrate_rules_team_id` 方法）
- Test: `backend/tests/test_experience_extractor.py`（追加）
- （演示迁移为运行时数据操作——实现者在 worktree 中执行一次迁移到 team-x 验证真实存量数据；不产生入库文件）

**Interfaces:**
- Produces: `ExperienceExtractor.migrate_rules_team_id(team_id: str, rule_ids: Optional[List[str]] = None) -> int`——None 扫描全部 `_list_rule_ids()`，否则仅指定子集；对 `team_id == ""` 的规则 `modify_rule(rule_id, team_id=team_id)`；返回迁移条数（已含 team_id/未命中规则不计）；幂等。

- [ ] **Step 1: 写失败测试**（追加 `backend/tests/test_experience_extractor.py`）

```python
def test_migrate_rules_team_id_backfills_and_isolates(tmp_path):
    extractor = ExperienceExtractor(str(tmp_path))
    # 构造 2 条 team_id="" 规则（submit+approve——T44 测试同模式）：
    #   r-old（无 team_id——缺键构造即 ""）
    #   r-team（team_id="team-a"——已指定）
    # 迁移前：retrieve_relevant_rules("minutes", ["纪要"], team_id="team-x") 空（严格过滤）
    # migrate_rules_team_id("team-x") → 返回 1（仅 r-old 回填；r-team 已含不动）
    # 迁移后：retrieve_relevant_rules(..., team_id="team-x") 含 r-old
    # 幂等：再次 migrate_rules_team_id("team-x") → 返回 0


def test_migrate_rules_team_id_specific_subset(tmp_path):
    extractor = ExperienceExtractor(str(tmp_path))
    # 构造 2 条 team_id="" 规则（submit+approve）
    # migrate_rules_team_id("team-x", rule_ids=[r1.rule_id]) → 返回 1
    # r1 已迁移（load 回读 team_id=="team-x"）；r2 仍 ""（未动）
```

（**注意**：`_load_rule` 对缺 team_id 键回落 ""——旧构造即 team_id 缺省；`modify_rule` 返回 True 且只改磁盘副本——`_load_rule` 回读验证。）

- [ ] **Step 2: 运行确认失败**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_experience_extractor.py::test_migrate_rules_team_id_backfills_and_isolates -v`
Expected: FAIL——`migrate_rules_team_id` 不存在（AttributeError）。

- [ ] **Step 3: 实现**

`backend/experience_extractor.py`（`retrieve_relevant_rules` 附近追加方法）：

```python
    def migrate_rules_team_id(self, team_id: str, rule_ids: Optional[List[str]] = None) -> int:
        """存量规则 team_id 回填（规则级团队隔离迁移）。

        team_id 严格过滤（fail-closed）下 team_id="" 的存量规则对团队检索不可见
        （注入死数据）——本方法把未归属规则批量回填到指定团队，返回迁移条数。
        已含 team_id 的规则与未命中规则不计；幂等（重复调用返回 0）。
        """
        ids = rule_ids if rule_ids is not None else self._list_rule_ids()
        migrated = 0
        for rule_id in ids:
            rule = self._load_rule(rule_id)
            if rule is None or rule.team_id:
                continue
            if self.modify_rule(rule_id, team_id=team_id):
                migrated += 1
        return migrated
```

（`modify_rule` 对未命中/未知字段 warning-only 返回 True 的语义——回填后 `_load_rule` 回读断言 team_id 已写入；`Optional`/`List` 从 typing 导入——读文件头确认已导入。）

- [ ] **Step 4: 运行确认通过**

Run: `/home/test/miniconda3/envs/agentscope/bin/python -m pytest tests/test_experience_extractor.py -q`
Expected: 新用例 + 既有回归（T44 团队过滤/序列化）全绿。

- [ ] **Step 5: 演示迁移 + 提交**

演示迁移（真实存量数据验证——data/ gitignored，不入库）：

```bash
# worktree/backend 下执行（agentscope env python）：
# from experience_extractor import ExperienceExtractor
# extractor = ExperienceExtractor("data/experience")  # 与生产同路径（读既有 incremental_dir 配置——读实际默认值）
# n = extractor.migrate_rules_team_id("team-x")
# print(n)  # 预期 115（全部存量 team_id="" 规则回填）
# 抽查：extractor._load_rule(<任一条>) 后 team_id == "team-x"
```

（**实现者注意**：ExperienceExtractor 构造默认 incremental_dir——读实际签名确认生产路径 `data/experience`；迁移后抽查 1-2 条规则确认 team_id 落盘。）

```bash
git add backend/experience_extractor.py backend/tests/test_experience_extractor.py
git commit -m "feat(hybrid): migrate legacy rules to team scope via modify rule backfill"
```

---

## Self-Review 结论

- **覆盖**：登记项"存量规则迁移"落地——`migrate_rules_team_id`（modify_rule 公开 API 批量回填 + 幂等）+ 测试（严格过滤可见性/子集/已指定不动）+ 演示迁移（真实 115 条 → team-x）。
- **无占位符**：全部步骤含可运行代码/命令与预期输出；涉及构造/路径给"以实际为准"指引。
- **范围**：experience_extractor 新增方法 + 测试；modify_rule/retrieve_relevant_rules 既有语义零改动；data/ 迁移为运行时操作不入库。
