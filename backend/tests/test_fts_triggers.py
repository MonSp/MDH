"""FTS5 触发器同步测试"""


import pytest

from agent_memory import AgentMemory
from experience_extractor import ExperienceExtractor, ExperienceRule


def _make_rule(rule_id: str, keywords: list[str]) -> ExperienceRule:
    return ExperienceRule(
        rule_id=rule_id, trigger_condition="cond", action="act",
        note="", source_task_id="t1", source_task_type="test",
        rule_type="success_pattern", status="approved",
        keywords=keywords, created_at="2026-01-01T00:00:00Z",
    )


class TestRuleFTSTriggers:

    @pytest.fixture
    def ext(self, tmp_path):
        return ExperienceExtractor(str(tmp_path))

    def test_fts_available(self, ext):
        assert ext._fts_available()

    def test_insert_trigger(self, ext):
        ext._save_rule(_make_rule("r1", ["foo", "bar"]))
        with ext._lock:
            row = ext._db.execute(
                "SELECT * FROM experience_rules_fts WHERE rule_id = ?", ("r1",)
            ).fetchone()
        assert row is not None
        assert "foo" in row["keywords_text"]

    def test_update_no_duplicate(self, ext):
        rule = _make_rule("r2", ["kw1"])
        ext._save_rule(rule)
        for _ in range(5):
            ext._save_rule(rule)
        with ext._lock:
            n = ext._db.execute(
                "SELECT COUNT(*) as c FROM experience_rules_fts WHERE rule_id = ?", ("r2",)
            ).fetchone()["c"]
        assert n == 1

    def test_delete_trigger(self, ext):
        ext._save_rule(_make_rule("r3", ["del"]))
        with ext._lock:
            ext._db.execute("DELETE FROM experience_rules WHERE rule_id = ?", ("r3",))
            ext._db.commit()
            row = ext._db.execute(
                "SELECT * FROM experience_rules_fts WHERE rule_id = ?", ("r3",)
            ).fetchone()
        assert row is None

    def test_fts_search_finds_rule(self, ext):
        ext._save_rule(_make_rule("r4", ["typescript", "react"]))
        ext.approve_rule("r4")
        results = ext.retrieve_relevant_rules("software-dev", ["typescript"])
        assert any(r.rule_id == "r4" for r in results)


class TestMemoryFTSTriggers:

    @pytest.fixture
    def mem(self, tmp_path):
        return AgentMemory(str(tmp_path))

    def test_fts_available(self, mem):
        assert mem._fts_available()

    def test_insert_trigger(self, mem):
        mem.add_memory("a1", {"type": "test", "content": "hello", "keywords": ["hello"], "importance": 0.5})
        with mem._lock:
            row = mem._db.execute(
                "SELECT * FROM agent_memories_fts WHERE agent_id = ?", ("a1",)
            ).fetchone()
        assert row is not None

    def test_update_no_duplicate(self, mem):
        mem.add_memory("a2", {"type": "test", "content": "hi", "keywords": ["hi"], "importance": 0.5})
        mem.recall("a2", "hi")  # updates referenced_count → fires UPDATE trigger
        with mem._lock:
            n = mem._db.execute(
                "SELECT COUNT(*) as c FROM agent_memories_fts WHERE agent_id = ?", ("a2",)
            ).fetchone()["c"]
        assert n == 1

    def test_delete_via_purge(self, mem):
        mem.add_memory("a3", {"type": "test", "content": "keep", "keywords": ["keep"], "importance": 0.8})
        mem.add_memory("a3", {"type": "test", "content": "drop", "keywords": ["drop"], "importance": 0.05})
        mem.purge_decayed("a3", min_importance=0.1)
        with mem._lock:
            n = mem._db.execute(
                "SELECT COUNT(*) as c FROM agent_memories_fts WHERE agent_id = ?", ("a3",)
            ).fetchone()["c"]
        assert n == 1
