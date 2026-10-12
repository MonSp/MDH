"""影子晋升链生产钩子回归（方案 A：诚实决策对比 + 白名单 + 空串守卫）"""
import asyncio
import json

import yaml

from auto_optimizer import AutoOptimizer
from capability_boundary import CapabilityBoundary
from dynamic_router import DynamicRouter
from experience_extractor import ExperienceExtractor
from routers import tuning as tuning_router
from tuning_deployment import DeploymentManager
from tuning_registry import create_default_registry


class FakeDep:
    """影子部署管理器桩：shadow_new_values + record_shadows_for_param"""

    def __init__(self, shadows=None):
        self.shadows = shadows or {}
        self.recorded = []

    def shadow_new_values(self, param_name):
        return self.shadows.get(param_name, [])

    def record_shadows_for_param(self, param_name, old_decision, new_decision, task_type="general"):
        if not old_decision and not new_decision:
            return 0
        self.recorded.append((param_name, old_decision, new_decision, task_type))
        return 1


def _make_deployment(tmp_path, registry):
    return DeploymentManager(
        registry, _memory_conn(), str(tmp_path / "tuning_deployments.json"),
    )


def _memory_conn():
    import sqlite3
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    return conn


# ── 1. manager 钩子 ──
def test_record_shadows_for_param_counts_only_shadow_status(tmp_path):
    registry = create_default_registry(str(tmp_path / "reg.json"))
    dep = _make_deployment(tmp_path, registry)
    dep.start_shadow("router.priority_weight", 0.2, reason="t")
    dep.start_shadow("router.semantic_weight", 0.3, reason="t")
    # 先把一个晋升为 active，应被跳过
    dep.promote([d for d in dep.list_deployments() if d["param_name"] == "router.semantic_weight"][0]["deployment_id"])

    n = dep.record_shadows_for_param("router.priority_weight", "dept-a", "dept-b", "routing")
    assert n == 1
    recs = dep.list_deployments()
    pri = next(d for d in recs if d["param_name"] == "router.priority_weight")
    assert pri["shadow_tasks"] == 1
    assert pri["shadow_decisions_differ"] == 1  # dept-a ≠ dept-b → 不一致
    sem = next(d for d in recs if d["param_name"] == "router.semantic_weight")
    assert sem["shadow_tasks"] == 0  # active 不记


def test_record_shadows_rejects_empty_pair(tmp_path):
    registry = create_default_registry(str(tmp_path / "reg.json"))
    dep = _make_deployment(tmp_path, registry)
    dep.start_shadow("router.priority_weight", 0.2, reason="t")
    assert dep.record_shadows_for_param("router.priority_weight", "", "", "routing") == 0
    did = dep.list_deployments()[0]["deployment_id"]
    assert dep._deployments[did].shadow_tasks == 0


# ── 2. REST 空串守卫 ──
def test_rest_record_rejects_empty_pair():
    tuning_router.init(None, None, None)

    async def call():
        return await tuning_router.record_shadow_decision(
            "any-id", {"old_decision": "", "new_decision": ""},
        )

    resp = asyncio.run(call())
    assert resp.get("success") is False
    assert "空" in str(resp.get("error", ""))


# ── 3. 白名单 ──
def test_shadowable_whitelist():
    ok = AutoOptimizer.SHADOWABLE_PARAMS
    assert "router.priority_weight" in ok
    assert "experience.explore_ratio" in ok
    assert "boundary.confidence_high" in ok
    # 无离散决策源的参数不得自动影子
    assert "federation.trust_decay_rate" not in ok
    assert "memory.markdown_debounce_seconds" not in ok
    assert "experience.aging_days" not in ok


# ── 4. route 权重影子：重打分翻转 top-1 ──
def test_route_weight_shadow_records_flip(tmp_path):
    table = {"departments": [
        # 两部门都含 "tool" 保证同为候选；A 词表短（kw 分高）、B 词表长（kw 分低但 sr/priority 高）
        {"dept_id": "dept-a", "dept_name": "A", "capability_desc": "",
         "capability_keywords": ["tool"], "tools": [],
         "success_rate": 0.5, "total_tasks": 10, "successful_tasks": 5,
         "last_active": "", "priority": 1, "skill_level_boost": 0.0},
        {"dept_id": "dept-b", "dept_name": "B", "capability_desc": "",
         "capability_keywords": ["tool", "beta", "gamma", "delta"], "tools": [],
         "success_rate": 1.0, "total_tasks": 10, "successful_tasks": 10,
         "last_active": "", "priority": 10, "skill_level_boost": 0.0},
    ]}
    path = str(tmp_path / "rt.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(table, f)

    dep = FakeDep({"router.keyword_weight": [0.0]})  # 关键词权重归零 → A 失守
    router = DynamicRouter(path, deployment_manager=dep)

    decision = router.route("tool task")
    # live 权重下 A 赢（keyword 0.35 主导）
    assert decision.selected_dept == "dept-a"
    # 影子（keyword=0）下 B 赢 → 已记录对比
    assert ("router.keyword_weight", "dept-a", "dept-b", "routing") in dep.recorded


# ── 5. boost_max clamp 决策 ──
def test_boost_max_shadow_clamp_decision(tmp_path):
    table = {"departments": [
        {"dept_id": "dept-a", "dept_name": "A", "capability_desc": "",
         "capability_keywords": ["x"], "tools": [], "success_rate": 0.5,
         "total_tasks": 1, "successful_tasks": 1, "last_active": "",
         "priority": 1, "skill_level_boost": 0.28},
    ]}
    path = str(tmp_path / "rt.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(table, f)

    dep = FakeDep({"router.skill_level_boost_max": [0.5]})  # live max=0.3 → 顶帽
    router = DynamicRouter(path, deployment_manager=dep)

    router.update_skill_boost("dept-a", level_gained=1)
    # old: min(0.3, 0.33)=0.30；shadow: min(0.5, 0.33)=0.33 → 不同
    hits = [r for r in dep.recorded if r[0] == "router.skill_level_boost_max"]
    assert hits and hits[0][1] == "0.3000" and hits[0][2] == "0.3300"
    assert hits[0][3] == "skill_boost"


# ── 6. explore_ratio 同一 u 决策对比 ──
def _seed_rules(extractor, n=3):
    from experience_extractor import ExperienceRule
    for i in range(n):
        rule = ExperienceRule(
            rule_id=f"r{i}", trigger_condition=f"t{i}", action="a", note="",
            source_task_id="p", source_task_type="general",
            rule_type="success_pattern", status="approved",
            keywords=["关键词", "task"], created_at="2026-10-09T00:00:00Z",
            source_agent_id="x", effectiveness_score=0.9, usage_count=10,
            success_count=9,
        )
        extractor._save_rule(rule)


def test_explore_ratio_shadow_single_draw(tmp_path, monkeypatch):
    extractor = ExperienceExtractor(incremental_dir=str(tmp_path / "exp"))
    _seed_rules(extractor, 3)
    dep = FakeDep({"experience.explore_ratio": [0.5]})  # live=0.2
    extractor.attach_deployment(dep)

    monkeypatch.setattr("random.random", lambda: 0.3)  # 0.3<0.2 False; 0.3<0.5 True
    results = extractor.retrieve_with_aging("general", ["关键词", "task"])
    assert results  # 检索本身正常

    hits = [r for r in dep.recorded if r[0] == "experience.explore_ratio"]
    assert hits and hits[0][1] == "exploit" and hits[0][2] == "explore"
    assert hits[0][3] == "rule_retrieval"


# ── 7. demotion_threshold 决策对比 ──
def test_demotion_shadow_keep_vs_demote(tmp_path):
    from experience_extractor import ExperienceRule
    extractor = ExperienceExtractor(incremental_dir=str(tmp_path / "exp"))
    # 20 次使用 9 成功 → 失败一次后 score=9/21≈0.43：live(0.4) keep，shadow(0.5) demote
    rule = ExperienceRule(
        rule_id="rd", trigger_condition="t", action="a", note="",
        source_task_id="p", source_task_type="general",
        rule_type="success_pattern", status="approved",
        keywords=["k"], created_at="2026-10-09T00:00:00Z",
        source_agent_id="x", effectiveness_score=9 / 20, usage_count=20,
        success_count=9,
    )
    extractor._save_rule(rule)
    dep = FakeDep({"experience.demotion_threshold": [0.5]})
    extractor.attach_deployment(dep)

    assert extractor.update_rule_effectiveness("rd", success=False)
    hits = [r for r in dep.recorded if r[0] == "experience.demotion_threshold"]
    assert hits and hits[0][1] == "keep" and hits[0][2] == "demote"
    # live 阈值 0.4 下 0.43 不降级
    assert extractor._load_rule("rd").status == "approved"


# ── 8. boundary confidence 阈值影子 ──
def test_boundary_level_shadow_flip(tmp_path):
    exp_dir = tmp_path / "data" / "experience" / "rules"
    exp_dir.mkdir(parents=True)
    for i in range(8):
        rule = {"rules": [{
            "rule_id": f"b{i}", "trigger_condition": f"x{i}", "action": "y",
            "rule_type": "success_pattern", "keywords": ["backend"],
            "status": "approved", "effectiveness_score": 0.85,
            "usage_count": 20, "success_count": 17,
        }]}
        (exp_dir / f"b{i}.yaml").write_text(yaml.dump(rule), encoding="utf-8")

    dep = FakeDep({"boundary.confidence_high": [0.95]})  # live high=0.7
    boundary = CapabilityBoundary(str(tmp_path / "data"), deployment_manager=dep)

    result = boundary.compute_confidence_map()
    backend = result["domains"]["backend"]
    assert backend["level"] == "high"  # live 0.7 以下的 conf 判 high

    hits = [r for r in dep.recorded if r[0] == "boundary.confidence_high"]
    assert any(h[1] == "high" and h[2] != "high" for h in hits)  # 影子阈值 0.95 翻转
    assert hits[0][3] == "boundary"
