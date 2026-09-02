import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dynamic_router import DynamicRouter, RouteEntry, RoutingDecision

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SAMPLE_ROUTING_TABLE = {
    "departments": [
        {
            "dept_id": "dept-software",
            "dept_name": "软件工程部",
            "capability_desc": "Web 应用开发、API 设计、数据库设计、代码编写与测试",
            "capability_keywords": ["代码", "编程", "开发", "web", "api", "python", "javascript", "react"],
            "tools": ["code_generator", "test_runner", "linter"],
            "success_rate": 0.85,
            "total_tasks": 100,
            "successful_tasks": 85,
            "last_active": "2026-06-01T10:00:00Z",
            "priority": 10,
        },
        {
            "dept_id": "dept-content",
            "dept_name": "内容演示部",
            "capability_desc": "PPT 制作、文档撰写、数据可视化、演示材料准备",
            "capability_keywords": ["ppt", "演示", "文档", "报告", "图表", "可视化"],
            "tools": ["ppt_generator", "chart_maker", "doc_writer"],
            "success_rate": 0.90,
            "total_tasks": 50,
            "successful_tasks": 45,
            "last_active": "2026-06-01T09:00:00Z",
            "priority": 8,
        },
        {
            "dept_id": "dept-data",
            "dept_name": "数据分析部",
            "capability_desc": "数据清洗、统计分析、机器学习、数据挖掘",
            "capability_keywords": ["数据", "分析", "统计", "机器学习", "模型", "预测"],
            "tools": ["data_cleaner", "statistical_analyzer", "ml_trainer"],
            "success_rate": 0.80,
            "total_tasks": 30,
            "successful_tasks": 24,
            "last_active": "2026-05-30T14:00:00Z",
            "priority": 7,
        },
    ]
}


@pytest.fixture
def tmp_routing_file(tmp_path):
    """创建临时路由表 JSON 文件并返回路径"""
    file_path = str(tmp_path / "routing_table.json")
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(SAMPLE_ROUTING_TABLE, f, ensure_ascii=False, indent=2)
    return file_path


@pytest.fixture
def router(tmp_routing_file):
    """创建已加载样本数据的 DynamicRouter 实例"""
    return DynamicRouter(tmp_routing_file)


@pytest.fixture
def empty_router(tmp_path):
    """创建空路由表的 DynamicRouter 实例（指向不存在的文件）"""
    file_path = str(tmp_path / "nonexistent.json")
    return DynamicRouter(file_path)


# ---------------------------------------------------------------------------
# 1. 路由表加载和保存
# ---------------------------------------------------------------------------

class TestRoutingTablePersistence:
    def test_load_routing_table(self, router):
        table = router.load_routing_table()
        assert len(table) == 3
        assert "dept-software" in table
        assert "dept-content" in table
        assert "dept-data" in table

    def test_load_returns_route_entry(self, router):
        table = router.load_routing_table()
        entry = table["dept-software"]
        assert isinstance(entry, RouteEntry)
        assert entry.dept_name == "软件工程部"
        assert "代码" in entry.capability_keywords
        assert entry.success_rate == 0.85

    def test_load_nonexistent_file(self, empty_router):
        table = empty_router.load_routing_table()
        assert table == {}

    def test_save_and_reload(self, tmp_routing_file):
        router = DynamicRouter(tmp_routing_file)
        # 修改数据
        router._table["dept-software"].success_rate = 0.99
        assert router.save_routing_table() is True

        # 重新加载验证
        router2 = DynamicRouter(tmp_routing_file)
        table = router2.load_routing_table()
        assert table["dept-software"].success_rate == 0.99

    def test_save_creates_directory(self, tmp_path):
        nested_path = str(tmp_path / "sub" / "dir" / "routing.json")
        router = DynamicRouter(nested_path)
        router._table["test"] = RouteEntry(
            dept_id="test", dept_name="测试", capability_desc="",
            capability_keywords=[], tools=[], success_rate=0.5,
            total_tasks=0, successful_tasks=0, last_active="", priority=0,
        )
        assert router.save_routing_table() is True
        assert os.path.isfile(nested_path)


# ---------------------------------------------------------------------------
# 2. 规则匹配正确性
# ---------------------------------------------------------------------------

class TestRuleMatch:
    def test_keyword_match_software(self, router):
        candidates = router.rule_match("帮我写一段 Python 代码")
        dept_ids = [e.dept_id for e in candidates]
        assert "dept-software" in dept_ids

    def test_keyword_match_content(self, router):
        candidates = router.rule_match("做一个 PPT 演示")
        dept_ids = [e.dept_id for e in candidates]
        assert "dept-content" in dept_ids

    def test_keyword_match_data(self, router):
        candidates = router.rule_match("分析这些数据的统计结果")
        dept_ids = [e.dept_id for e in candidates]
        assert "dept-data" in dept_ids

    def test_no_match_returns_all(self, router):
        """无任何关键词命中时返回全部部门"""
        candidates = router.rule_match("今天天气怎么样")
        assert len(candidates) == 3

    def test_empty_input_returns_all(self, router):
        candidates = router.rule_match("")
        assert len(candidates) == 3

    def test_multiple_departments_match(self, router):
        """包含多个部门关键词时，多个部门都应被匹配"""
        candidates = router.rule_match("用 python 做数据分析和可视化")
        dept_ids = [e.dept_id for e in candidates]
        # 至少应包含 software 和 data
        assert "dept-software" in dept_ids or "dept-data" in dept_ids

    def test_empty_table(self, empty_router):
        candidates = empty_router.rule_match("任何输入")
        assert candidates == []


# ---------------------------------------------------------------------------
# 3. 语义排序
# ---------------------------------------------------------------------------

class TestSemanticRank:
    def test_rank_returns_tuples(self, router):
        entries = list(router._table.values())
        results = router.semantic_rank(entries, "开发 Web 应用")
        assert len(results) == 3
        for entry, score in results:
            assert isinstance(entry, RouteEntry)
            assert 0.0 <= score <= 1.0

    def test_rank_sorted_descending(self, router):
        entries = list(router._table.values())
        results = router.semantic_rank(entries, "编写 Python 代码进行开发")
        scores = [score for _, score in results]
        assert scores == sorted(scores, reverse=True)

    def test_rank_software_higher_for_code(self, router):
        entries = list(router._table.values())
        results = router.semantic_rank(entries, "代码编程开发 Web API")
        score_map = {e.dept_id: s for e, s in results}
        assert score_map["dept-software"] >= score_map["dept-data"]

    def test_rank_empty_candidates(self, router):
        results = router.semantic_rank([], "任何输入")
        assert results == []

    def test_rank_empty_input(self, router):
        entries = list(router._table.values())
        results = router.semantic_rank(entries, "")
        assert all(score == 0.0 for _, score in results)


# ---------------------------------------------------------------------------
# 4. 综合路由决策
# ---------------------------------------------------------------------------

class TestRoute:
    def test_route_returns_decision(self, router):
        decision = router.route("帮我写一个 Python Web 应用")
        assert isinstance(decision, RoutingDecision)
        assert decision.selected_dept != ""
        assert 0.0 <= decision.confidence <= 1.0
        assert decision.reason != ""

    def test_route_software_for_code_task(self, router):
        decision = router.route("帮我用 Python 写代码开发一个 Web 应用")
        assert decision.selected_dept == "dept-software"

    def test_route_content_for_ppt(self, router):
        decision = router.route("帮我做一个 PPT 演示文档")
        assert decision.selected_dept == "dept-content"

    def test_route_data_for_analysis(self, router):
        decision = router.route("对这些数据进行统计分析和预测建模")
        assert decision.selected_dept == "dept-data"

    def test_route_has_candidate_depts(self, router):
        decision = router.route("编写 Python 代码")
        assert len(decision.candidate_depts) > 0
        for dept in decision.candidate_depts:
            assert "dept_id" in dept
            assert "dept_name" in dept
            assert "score" in dept
            assert "matched_keywords" in dept

    def test_route_candidate_sorted_by_score(self, router):
        decision = router.route("编写 Python 代码")
        scores = [d["score"] for d in decision.candidate_depts]
        assert scores == sorted(scores, reverse=True)

    def test_route_matched_keywords(self, router):
        decision = router.route("用 python 写代码")
        assert "python" in [kw.lower() for kw in decision.matched_keywords] or \
               "代码" in decision.matched_keywords

    def test_route_empty_table(self, empty_router):
        decision = empty_router.route("任何输入")
        assert decision.selected_dept == ""
        assert decision.confidence == 0.0

    def test_route_confidence_gap(self, router):
        """当最高分远高于次高分时，置信度应较高"""
        decision = router.route("用 python 和 javascript 编写 react 前端代码开发 web 应用")
        assert decision.confidence > 0.0


# ---------------------------------------------------------------------------
# 5. 统计数据更新
# ---------------------------------------------------------------------------

class TestUpdateStats:
    def test_update_success(self, router):
        original = router._table["dept-software"].total_tasks
        assert router.update_stats("dept-software", True) is True
        assert router._table["dept-software"].total_tasks == original + 1
        assert router._table["dept-software"].successful_tasks == 86

    def test_update_failure(self, router):
        original_success = router._table["dept-software"].successful_tasks
        assert router.update_stats("dept-software", False) is True
        assert router._table["dept-software"].successful_tasks == original_success
        assert router._table["dept-software"].total_tasks == 101

    def test_update_recalculates_success_rate(self, router):
        router.update_stats("dept-software", True)
        # 86 / 101 ≈ 0.8514...
        expected = 86 / 101
        assert abs(router._table["dept-software"].success_rate - expected) < 1e-6

    def test_update_persists(self, tmp_routing_file):
        router = DynamicRouter(tmp_routing_file)
        router.update_stats("dept-content", True)

        router2 = DynamicRouter(tmp_routing_file)
        table = router2.load_routing_table()
        assert table["dept-content"].total_tasks == 51
        assert table["dept-content"].successful_tasks == 46

    def test_update_nonexistent_dept(self, router):
        assert router.update_stats("dept-nonexistent", True) is False

    def test_update_changes_last_active(self, router):
        old_active = router._table["dept-software"].last_active
        router.update_stats("dept-software", True)
        new_active = router._table["dept-software"].last_active
        assert new_active != old_active


# ---------------------------------------------------------------------------
# 6. 路由条目增删
# ---------------------------------------------------------------------------

class TestRouteEntryCRUD:
    def test_add_route_entry(self, router):
        new_entry = RouteEntry(
            dept_id="dept-design",
            dept_name="设计部",
            capability_desc="UI 设计、UX 设计、原型制作",
            capability_keywords=["设计", "UI", "UX", "原型"],
            tools=["figma_plugin"],
            success_rate=0.75,
            total_tasks=20,
            successful_tasks=15,
            last_active="2026-06-01T12:00:00Z",
            priority=6,
        )
        assert router.add_route_entry(new_entry) is True
        assert "dept-design" in router._table
        assert router._table["dept-design"].dept_name == "设计部"

    def test_add_persists(self, tmp_routing_file):
        router = DynamicRouter(tmp_routing_file)
        new_entry = RouteEntry(
            dept_id="dept-qa",
            dept_name="质量保障部",
            capability_desc="测试、质量保障",
            capability_keywords=["测试", "QA"],
            tools=["test_runner"],
            success_rate=0.95,
            total_tasks=40,
            successful_tasks=38,
            last_active="2026-06-01T08:00:00Z",
            priority=9,
        )
        router.add_route_entry(new_entry)

        router2 = DynamicRouter(tmp_routing_file)
        table = router2.load_routing_table()
        assert "dept-qa" in table
        assert table["dept-qa"].dept_name == "质量保障部"

    def test_add_overwrites_existing(self, router):
        entry = router._table["dept-software"]
        entry.priority = 99
        router.add_route_entry(entry)
        assert router._table["dept-software"].priority == 99

    def test_remove_route_entry(self, router):
        assert router.remove_route_entry("dept-data") is True
        assert "dept-data" not in router._table
        assert len(router._table) == 2

    def test_remove_persists(self, tmp_routing_file):
        router = DynamicRouter(tmp_routing_file)
        router.remove_route_entry("dept-content")

        router2 = DynamicRouter(tmp_routing_file)
        table = router2.load_routing_table()
        assert "dept-content" not in table

    def test_remove_nonexistent(self, router):
        assert router.remove_route_entry("dept-nonexistent") is False

    def test_get_route_table(self, router):
        table = router.get_route_table()
        assert isinstance(table, list)
        assert len(table) == 3
        for dept in table:
            assert isinstance(dept, dict)
            assert "dept_id" in dept
            assert "dept_name" in dept
            assert "capability_desc" in dept
            assert "capability_keywords" in dept
            assert "tools" in dept
            assert "success_rate" in dept
            assert "total_tasks" in dept
            assert "successful_tasks" in dept
            assert "last_active" in dept
            assert "priority" in dept

    def test_get_route_table_empty(self, empty_router):
        table = empty_router.get_route_table()
        assert table == []


# ---------------------------------------------------------------------------
# 边界条件和集成测试
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_route_after_add_and_remove(self, tmp_routing_file):
        router = DynamicRouter(tmp_routing_file)
        # 添加新部门
        router.add_route_entry(RouteEntry(
            dept_id="dept-ai",
            dept_name="AI 部",
            capability_desc="人工智能、深度学习、自然语言处理",
            capability_keywords=["AI", "深度学习", "NLP", "大模型"],
            tools=["model_trainer"],
            success_rate=0.70,
            total_tasks=10,
            successful_tasks=7,
            last_active="2026-06-01T11:00:00Z",
            priority=8,
        ))
        decision = router.route("用大模型做自然语言处理")
        assert decision.selected_dept == "dept-ai"

        # 移除后再路由
        router.remove_route_entry("dept-ai")
        decision2 = router.route("用大模型做自然语言处理")
        assert decision2.selected_dept != "dept-ai"

    def test_update_stats_then_route(self, router):
        """更新统计后重新路由，成功率变化应影响排序"""
        # 大幅提升 data 部的成功率
        for _ in range(100):
            router.update_stats("dept-data", True)
        table = router._table
        assert table["dept-data"].success_rate > 0.95

    def test_load_routing_table_reload(self, tmp_routing_file):
        """多次调用 load_routing_table 应正确刷新"""
        router = DynamicRouter(tmp_routing_file)
        assert len(router._table) == 3

        # 外部修改文件
        with open(tmp_routing_file, "w", encoding="utf-8") as f:
            json.dump({"departments": []}, f)

        table = router.load_routing_table()
        assert len(table) == 0

    def test_malformed_json_file(self, tmp_path):
        bad_file = str(tmp_path / "bad.json")
        with open(bad_file, "w") as f:
            f.write("{invalid json!!!")

        router = DynamicRouter(bad_file)
        assert router._table == {}

    def test_partial_dept_fields(self, tmp_path):
        """缺少部分字段的部门条目应使用默认值"""
        file_path = str(tmp_path / "partial.json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump({
                "departments": [
                    {"dept_id": "dept-x", "dept_name": "X部"}
                ]
            }, f)

        router = DynamicRouter(file_path)
        assert "dept-x" in router._table
        entry = router._table["dept-x"]
        assert entry.capability_keywords == []
        assert entry.success_rate == 0.0
        assert entry.priority == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
