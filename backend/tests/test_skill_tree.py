# backend/tests/test_skill_tree.py
import pytest
import yaml
import os

@pytest.fixture
def roles_config():
    path = os.path.join(os.path.dirname(__file__), "..", "roles_config.yaml")
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)

class TestSkillTreeParsing:
    def test_all_skills_have_category(self, roles_config):
        """每个技能都有 category 字段"""
        skills = roles_config.get("skills", {})
        for skill_id, skill_def in skills.items():
            assert "category" in skill_def, f"{skill_id} missing category"
            assert skill_def["category"] in ("engineering", "design", "content", "data", "management")

    def test_all_skills_have_xp_thresholds(self, roles_config):
        """每个技能都有 xp_thresholds，3 个递增的整数"""
        skills = roles_config.get("skills", {})
        for skill_id, skill_def in skills.items():
            assert "xp_thresholds" in skill_def, f"{skill_id} missing xp_thresholds"
            thresholds = skill_def["xp_thresholds"]
            assert len(thresholds) == 3
            assert thresholds[0] < thresholds[1] < thresholds[2]

    def test_all_skills_have_prerequisites(self, roles_config):
        """每个技能都有 prerequisites 列表"""
        skills = roles_config.get("skills", {})
        for skill_id, skill_def in skills.items():
            assert "prerequisites" in skill_def, f"{skill_id} missing prerequisites"
            assert isinstance(skill_def["prerequisites"], list)

    def test_prerequisites_reference_valid_skills(self, roles_config):
        """前置技能引用的 skill_id 必须存在"""
        skills = roles_config.get("skills", {})
        for skill_id, skill_def in skills.items():
            for prereq in skill_def.get("prerequisites", []):
                assert prereq["skill"] in skills, f"{skill_id} references unknown skill {prereq['skill']}"
                assert prereq["min_level"] in (1, 2, 3)

    def test_no_circular_prerequisites(self, roles_config):
        """前置技能不能形成环"""
        skills = roles_config.get("skills", {})
        visited = set()
        path = set()

        def dfs(skill_id):
            if skill_id in path:
                return False  # cycle
            if skill_id in visited:
                return True
            path.add(skill_id)
            visited.add(skill_id)
            for prereq in skills.get(skill_id, {}).get("prerequisites", []):
                if not dfs(prereq["skill"]):
                    return False
            path.remove(skill_id)
            return True

        for skill_id in skills:
            assert dfs(skill_id), f"Circular prerequisite detected involving {skill_id}"
