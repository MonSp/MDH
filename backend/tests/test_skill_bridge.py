"""Tests for SkillBridge and ProgressiveSkillLoader"""
import pytest
import tempfile
from pathlib import Path

from skill_bridge import SkillBridge, SkillDescriptor
from progressive_skill_loader import ProgressiveSkillLoader, SkillSummary


# ── Fixtures ──

@pytest.fixture
def skill_dir(tmp_path):
    """创建包含两种格式技能的临时目录"""
    # 旧格式技能
    legacy = tmp_path / "frontend_dev"
    legacy.mkdir()
    (legacy / "manifest.yaml").write_text(
        "name: frontend_dev\nversion: 1.0.0\ndescription: 前端开发技能\ncategory: development\n"
        "methodology: React + TypeScript\nrequired_tools: [read_file, write_file]\n"
        "keywords: [react, typescript, frontend]\n",
        encoding="utf-8",
    )
    (legacy / "system_prompt.md").write_text("你是前端开发专家。", encoding="utf-8")

    # 新格式技能
    new_format = tmp_path / "api_design"
    new_format.mkdir()
    (new_format / "SKILL.md").write_text(
        "---\nname: api_design\nversion: 2.0.0\ndescription: API 设计技能\n"
        "trigger: 设计 REST API\ncategory: architecture\nmethodology: RESTful\n"
        "required_tools: [read_file, write_file]\nkeywords: [api, rest, design]\n---\n\n"
        "你是 API 设计专家。\n\n## 参考\n请参考 references/patterns.md\n",
        encoding="utf-8",
    )
    refs = new_format / "references"
    refs.mkdir()
    (refs / "patterns.md").write_text("# REST Patterns\n...", encoding="utf-8")

    # 无技能文件的目录（应被跳过）
    (tmp_path / "empty_dir").mkdir()

    return tmp_path


# ── SkillBridge Tests ──

class TestSkillBridge:
    def test_discover_finds_all_skills(self, skill_dir):
        bridge = SkillBridge(str(skill_dir))
        skills = bridge.discover()
        assert len(skills) == 2
        names = {s.name for s in skills}
        assert "frontend_dev" in names
        assert "api_design" in names

    def test_legacy_format_loaded(self, skill_dir):
        bridge = SkillBridge(str(skill_dir))
        desc = bridge.load("frontend_dev")
        assert desc is not None
        assert desc.source_format == "legacy"
        assert desc.name == "frontend_dev"
        assert desc.version == "1.0.0"
        assert "前端开发" in desc.description
        assert "React" in desc.methodology
        assert "read_file" in desc.required_tools
        assert "你是前端开发专家" in desc.instructions

    def test_skill_md_format_loaded(self, skill_dir):
        bridge = SkillBridge(str(skill_dir))
        desc = bridge.load("api_design")
        assert desc is not None
        assert desc.source_format == "skill_md"
        assert desc.name == "api_design"
        assert desc.version == "2.0.0"
        assert "API" in desc.description
        assert desc.trigger == "设计 REST API"
        assert "api" in desc.keywords
        assert len(desc.references) == 1

    def test_nonexistent_skill_returns_none(self, skill_dir):
        bridge = SkillBridge(str(skill_dir))
        assert bridge.load("nonexistent") is None

    def test_summary_format(self, skill_dir):
        bridge = SkillBridge(str(skill_dir))
        desc = bridge.load("frontend_dev")
        summary = desc.summary()
        assert "[development]" in summary
        assert "frontend_dev" in summary

    def test_export_to_skill_md(self, skill_dir):
        bridge = SkillBridge(str(skill_dir))
        output = skill_dir / "exported" / "SKILL.md"
        result = bridge.export_to_skill_md("frontend_dev", str(output))
        assert result is True
        assert output.exists()
        content = output.read_text(encoding="utf-8")
        assert "frontend_dev" in content
        assert "前端开发" in content

    def test_export_new_format_returns_false(self, skill_dir):
        bridge = SkillBridge(str(skill_dir))
        result = bridge.export_to_skill_md("api_design")
        assert result is False


# ── ProgressiveSkillLoader Tests ──

class TestProgressiveSkillLoader:
    def test_get_skill_index(self, skill_dir):
        loader = ProgressiveSkillLoader(str(skill_dir))
        index = loader.get_skill_index()
        assert len(index) == 2
        assert all(isinstance(s, SkillSummary) for s in index)

    def test_format_skill_index(self, skill_dir):
        loader = ProgressiveSkillLoader(str(skill_dir))
        text = loader.format_skill_index()
        assert "可用技能索引" in text
        assert "frontend_dev" in text
        assert "api_design" in text

    def test_load_instructions(self, skill_dir):
        loader = ProgressiveSkillLoader(str(skill_dir))
        instructions = loader.load_instructions("frontend_dev")
        assert "前端开发专家" in instructions

    def test_load_reference(self, skill_dir):
        loader = ProgressiveSkillLoader(str(skill_dir))
        ref = loader.load_reference("api_design", "patterns.md")
        assert "REST Patterns" in ref

    def test_find_skills_for_task(self, skill_dir):
        loader = ProgressiveSkillLoader(str(skill_dir))
        matched = loader.find_skills_for_task("设计一个 REST API 接口")
        assert "api_design" in matched

    def test_find_skills_no_match(self, skill_dir):
        loader = ProgressiveSkillLoader(str(skill_dir))
        matched = loader.find_skills_for_task("完全无关的任务 xyz")
        assert len(matched) == 0
