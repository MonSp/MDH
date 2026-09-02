"""Tests for SkillExporter — import/export"""
import zipfile
from pathlib import Path

import pytest

from skill_exporter import SkillExporter


@pytest.fixture
def exporter(tmp_path):
    """创建临时 SkillExporter"""
    skill_dir = tmp_path / "skills"
    skill_dir.mkdir()

    # 创建技能
    skill = skill_dir / "frontend_dev"
    skill.mkdir()
    (skill / "SKILL.md").write_text(
        "---\nname: frontend_dev\nversion: 2.0.0\ndescription: Frontend\n---\n\nInstructions",
        encoding="utf-8",
    )
    refs = skill / "references"
    refs.mkdir()
    (refs / "patterns.md").write_text("# Patterns", encoding="utf-8")

    # 创建经验规则
    exp_dir = tmp_path / "experience"
    exp_dir.mkdir()

    return SkillExporter(str(skill_dir), str(exp_dir), str(tmp_path / "exports"))


class TestSkillExporter:
    def test_export_skill(self, exporter):
        path = exporter.export_skill("frontend_dev")
        assert path is not None
        assert Path(path).exists()
        assert path.endswith(".zip")

    def test_export_nonexistent_returns_none(self, exporter):
        result = exporter.export_skill("nonexistent")
        assert result is None

    def test_export_zip_contains_manifest(self, exporter):
        path = exporter.export_skill("frontend_dev")
        with zipfile.ZipFile(path, 'r') as zf:
            names = zf.namelist()
            assert "manifest.json" in names
            assert any("SKILL.md" in n for n in names)

    def test_export_zip_manifest_data(self, exporter):
        import json
        path = exporter.export_skill("frontend_dev")
        with zipfile.ZipFile(path, 'r') as zf:
            manifest = json.loads(zf.read("manifest.json"))
            assert manifest["skill_name"] == "frontend_dev"
            assert manifest["skill_version"] == "2.0.0"

    def test_import_skill(self, exporter):
        path = exporter.export_skill("frontend_dev")
        # 删除原始技能
        import shutil
        shutil.rmtree(str(exporter._skill_dir / "frontend_dev"))

        result = exporter.import_skill(path)
        assert result.success is True
        assert result.skill_name == "frontend_dev"
        assert (exporter._skill_dir / "frontend_dev" / "SKILL.md").exists()

    def test_import_nonexistent_file(self, exporter):
        result = exporter.import_skill("/nonexistent/path.zip")
        assert result.success is False

    def test_import_no_overwrite(self, exporter):
        path = exporter.export_skill("frontend_dev")
        result = exporter.import_skill(path, overwrite=False)
        assert result.success is False
        assert "已存在" in result.error

    def test_import_with_overwrite(self, exporter):
        path = exporter.export_skill("frontend_dev")
        result = exporter.import_skill(path, overwrite=True)
        assert result.success is True

    def test_list_exports(self, exporter):
        exporter.export_skill("frontend_dev")
        exports = exporter.list_exports()
        assert len(exports) >= 1
        assert exports[0]["skill_name"] == "frontend_dev"
