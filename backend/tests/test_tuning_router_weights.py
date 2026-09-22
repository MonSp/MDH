"""路由权重优化器测试 — _analyze_router_weights"""

import json
import sqlite3

import pytest

from tuning_optimizer import TuningOptimizer
from tuning_registry import create_default_registry


@pytest.fixture
def registry(tmp_path):
    return create_default_registry(str(tmp_path / "registry.json"))


@pytest.fixture
def ab_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute(
        """CREATE TABLE task_type_performance (
            period_start TEXT,
            task_type TEXT,
            total_tasks INTEGER,
            success_count INTEGER,
            tasks_with_rules INTEGER DEFAULT 0,
            success_with_rules INTEGER DEFAULT 0,
            success_without_rules INTEGER DEFAULT 0,
            rule_count_sum INTEGER DEFAULT 0,
            rule_score_sum REAL DEFAULT 0
        )"""
    )
    return conn


def _write_routing(path, depts):
    path.write_text(json.dumps({"departments": depts}, ensure_ascii=False), encoding="utf-8")


def _dept(did, total, rate, boost=0.0, priority=10):
    succ = round(total * rate)
    return {
        "dept_id": did,
        "dept_name": did,
        "capability_desc": "",
        "capability_keywords": [],
        "tools": [],
        "success_rate": succ / total if total else 0.0,
        "total_tasks": total,
        "successful_tasks": succ,
        "last_active": "2026-09-16T12:00:00+00:00",
        "priority": priority,
        "skill_level_boost": boost,
    }


def test_no_routing_path_returns_empty(registry, ab_conn):
    opt = TuningOptimizer(registry, ab_conn, routing_table_path=None)
    assert opt._analyze_router_weights() == []


def test_insufficient_samples_returns_empty(registry, ab_conn, tmp_path):
    p = tmp_path / "rt.json"
    _write_routing(p, [
        _dept("a", 5, 0.9),
        _dept("b", 5, 0.5),
    ])
    opt = TuningOptimizer(registry, ab_conn, routing_table_path=str(p))
    assert opt._analyze_router_weights() == []


def test_high_spread_proposes_success_rate_weight(registry, ab_conn, tmp_path):
    p = tmp_path / "rt.json"
    _write_routing(p, [
        _dept("frontend", 40, 0.85, boost=0.25, priority=10),
        _dept("backend", 35, 0.77, boost=0.15, priority=10),
        _dept("devops", 20, 0.55, boost=0.05, priority=7),
        _dept("data", 30, 0.70, boost=0.10, priority=7),
        _dept("qa", 25, 0.68, boost=0.10, priority=8),
        _dept("security", 15, 0.87, boost=0.30, priority=8),
    ])
    opt = TuningOptimizer(registry, ab_conn, routing_table_path=str(p))
    props = opt._analyze_router_weights()
    names = {p.param_name: p for p in props}

    assert "router.success_rate_weight" in names
    sr = names["router.success_rate_weight"]
    assert sr.current_value == 0.20
    assert sr.proposed_value == 0.25
    assert sr.confidence >= 0.3
    assert sr.sample_size >= 30
    assert "[需人工确认]" in sr.reason

    # rebalance keyword down
    assert "router.keyword_weight" in names
    kw = names["router.keyword_weight"]
    assert kw.proposed_value == 0.30


def test_boost_ceiling_proposal(registry, ab_conn, tmp_path):
    p = tmp_path / "rt.json"
    _write_routing(p, [
        _dept("a", 40, 0.85, boost=0.30),
        _dept("b", 35, 0.77, boost=0.15),
        _dept("c", 30, 0.70, boost=0.10),
    ])
    opt = TuningOptimizer(registry, ab_conn, routing_table_path=str(p))
    props = opt._analyze_router_weights()
    boost = next((x for x in props if x.param_name == "router.skill_level_boost_max"), None)
    assert boost is not None
    assert boost.current_value == 0.3
    assert boost.proposed_value == 0.35


def test_low_spread_no_success_rate_proposal(registry, ab_conn, tmp_path):
    p = tmp_path / "rt.json"
    _write_routing(p, [
        _dept("a", 40, 0.80, boost=0.1),
        _dept("b", 35, 0.79, boost=0.1),
        _dept("c", 30, 0.81, boost=0.1),
    ])
    opt = TuningOptimizer(registry, ab_conn, routing_table_path=str(p))
    props = opt._analyze_router_weights()
    assert not any(x.param_name == "router.success_rate_weight" for x in props)


def test_run_includes_router_proposals(registry, ab_conn, tmp_path):
    p = tmp_path / "rt.json"
    _write_routing(p, [
        _dept("frontend", 40, 0.85, boost=0.30),
        _dept("backend", 35, 0.77, boost=0.15),
        _dept("devops", 20, 0.55, boost=0.05),
        _dept("data", 30, 0.70, boost=0.10),
    ])
    opt = TuningOptimizer(registry, ab_conn, routing_table_path=str(p))
    report = opt.run(period_days=30)
    router_props = [x for x in report.proposals if x.param_name.startswith("router.")]
    assert len(router_props) >= 1


def test_pearson_basic():
    assert TuningOptimizer._pearson([1, 2, 3], [2, 4, 6]) == pytest.approx(1.0)
    assert TuningOptimizer._pearson([1, 2, 3], [6, 4, 2]) == pytest.approx(-1.0)
    assert TuningOptimizer._pearson([1, 2], [1, 2]) == 0.0
    assert TuningOptimizer._pearson([1, 1, 1], [1, 2, 3]) == 0.0
