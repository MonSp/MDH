"""Tests for T4 (evolution chain API) and T5 (capability confidence-map API)"""
import json
import os

import pytest


@pytest.fixture
def extractor(tmp_path):
    """Create an ExperienceExtractor with sample rules in SQLite"""
    from experience_extractor import ExperienceExtractor, ExperienceRule
    ext = ExperienceExtractor(incremental_dir=str(tmp_path / "experience"))

    # Create evolution chain: rule-a → rule-b → rule-c
    for rule_id, parent_id, score in [("rule-a", "", 0.3), ("rule-b", "rule-a", 0.5), ("rule-c", "rule-b", 0.8)]:
        rule = ExperienceRule(
            rule_id=rule_id,
            trigger_condition=f"condition for {rule_id}",
            action=f"action for {rule_id}",
            note=f"note for {rule_id}",
            source_task_id="task-1",
            source_task_type="test",
            rule_type="success_pattern",
            status="approved" if rule_id != "rule-b" else "evolved",
            keywords=["test"],
            created_at="2026-08-26T00:00:00Z",
            effectiveness_score=score,
            usage_count=5,
            success_count=int(5 * score),
            parent_rule_id=parent_id,
        )
        ext._save_rule(rule)

    return ext


@pytest.fixture
def tmp_data(tmp_path, extractor):
    """Return tmp_path with rules already in SQLite"""
    # Write some YAML rules for capability_boundary to read
    rules_dir = tmp_path / "experience" / "rules"
    rules_dir.mkdir(parents=True, exist_ok=True)
    import yaml
    for rule_id, score in [("rule-a", 0.3), ("rule-b", 0.5), ("rule-c", 0.8)]:
        data = {"rules": [{
            "rule_id": rule_id, "rule_type": "success_pattern", "status": "approved",
            "effectiveness_score": score, "usage_count": 5, "keywords": ["test"],
        }]}
        with open(rules_dir / f"{rule_id}.yaml", "w") as f:
            yaml.dump(data, f)
    return tmp_path


class TestEvolutionChainAPI:
    """T4: Rule evolution chain endpoint"""

    def test_chain_returns_list(self, extractor):
        chain = extractor.get_evolution_chain("rule-c")
        assert isinstance(chain, list)
        assert len(chain) >= 1

    def test_chain_contains_all_ancestors(self, extractor):
        chain = extractor.get_evolution_chain("rule-c")
        chain_ids = [r.get("rule_id") for r in chain]
        assert "rule-c" in chain_ids
        assert "rule-b" in chain_ids
        assert "rule-a" in chain_ids

    def test_chain_order_root_to_leaf(self, extractor):
        chain = extractor.get_evolution_chain("rule-c")
        chain_ids = [r.get("rule_id") for r in chain]
        # Should be ordered from root to leaf
        assert chain_ids.index("rule-a") < chain_ids.index("rule-b")
        assert chain_ids.index("rule-b") < chain_ids.index("rule-c")

    def test_chain_nonexistent_rule(self, extractor):
        chain = extractor.get_evolution_chain("nonexistent")
        assert isinstance(chain, list)
        assert len(chain) == 0

    def test_chain_json_serializable(self, extractor):
        chain = extractor.get_evolution_chain("rule-c")
        json_str = json.dumps(chain)
        assert isinstance(json_str, str)


class TestConfidenceMapAPI:
    """T5: Capability confidence-map endpoint"""

    def test_confidence_map_structure(self, tmp_data):
        from capability_boundary import CapabilityBoundary
        boundary = CapabilityBoundary(str(tmp_data))
        result = boundary.compute_confidence_map()
        assert "domains" in result
        assert "overall_confidence" in result
        assert "total_domains" in result

    def test_confidence_map_has_domain_data(self, tmp_data):
        from capability_boundary import CapabilityBoundary
        boundary = CapabilityBoundary(str(tmp_data))
        result = boundary.compute_confidence_map()
        domains = result["domains"]
        assert isinstance(domains, dict)
        for domain_name, domain_data in domains.items():
            assert "confidence" in domain_data
            assert "level" in domain_data
            assert domain_data["level"] in ("high", "medium", "low", "unknown")

    def test_confidence_map_empty_rules(self, tmp_path):
        from capability_boundary import CapabilityBoundary
        (tmp_path / "experience" / "rules").mkdir(parents=True)
        boundary = CapabilityBoundary(str(tmp_path))
        result = boundary.compute_confidence_map()
        assert result["total_domains"] == 0
        assert result["overall_confidence"] == 0.0

    def test_confidence_map_json_serializable(self, tmp_data):
        from capability_boundary import CapabilityBoundary
        boundary = CapabilityBoundary(str(tmp_data))
        result = boundary.compute_confidence_map()
        json_str = json.dumps(result)
        assert isinstance(json_str, str)
