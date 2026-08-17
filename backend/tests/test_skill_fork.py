"""Tests for SkillForkManager"""
import pytest
from pathlib import Path

from skill_fork_manager import SkillForkManager


@pytest.fixture
def manager(tmp_path):
    """创建临时 SkillForkManager"""
    source_dir = tmp_path / "skill_packs"
    source_dir.mkdir()

    # 创建一个技能
    skill = source_dir / "frontend_dev"
    skill.mkdir()
    (skill / "SKILL.md").write_text(
        "---\nname: frontend_dev\nversion: 1.0.0\ndescription: Frontend\n---\n\nInstructions",
        encoding="utf-8",
    )

    forks_dir = tmp_path / "forks"
    return SkillForkManager(str(forks_dir), str(source_dir))


class TestSkillForkManager:
    def test_fork_skill(self, manager):
        fork = manager.fork_skill("frontend_dev", "proj-1")
        assert fork is not None
        assert fork.source_skill == "frontend_dev"
        assert fork.project_id == "proj-1"
        assert fork.source_version == "1.0.0"

    def test_fork_creates_local_copy(self, manager):
        manager.fork_skill("frontend_dev", "proj-1")
        path = manager.get_fork_path("frontend_dev", "proj-1")
        assert path is not None
        assert (path / "SKILL.md").exists()

    def test_fork_nonexistent_returns_none(self, manager):
        result = manager.fork_skill("nonexistent", "proj-1")
        assert result is None

    def test_fork_idempotent(self, manager):
        fork1 = manager.fork_skill("frontend_dev", "proj-1")
        fork2 = manager.fork_skill("frontend_dev", "proj-1")
        assert fork1.fork_id == fork2.fork_id

    def test_list_forks(self, manager):
        manager.fork_skill("frontend_dev", "proj-1")
        forks = manager.list_forks("proj-1")
        assert len(forks) == 1
        assert forks[0].source_skill == "frontend_dev"

    def test_list_forks_empty(self, manager):
        forks = manager.list_forks("proj-999")
        assert len(forks) == 0

    def test_pull_update_same_version(self, manager):
        manager.fork_skill("frontend_dev", "proj-1")
        updated = manager.pull_update("frontend_dev", "proj-1")
        assert updated is False  # same version

    def test_pull_update_new_version(self, manager):
        manager.fork_skill("frontend_dev", "proj-1")
        # 更新源版本
        skill_path = manager._source_dir / "frontend_dev" / "SKILL.md"
        skill_path.write_text(
            "---\nname: frontend_dev\nversion: 2.0.0\ndescription: Updated\n---\n\nNew instructions",
            encoding="utf-8",
        )
        updated = manager.pull_update("frontend_dev", "proj-1")
        assert updated is True
        # 验证本地文件已更新
        fork_path = manager.get_fork_path("frontend_dev", "proj-1")
        content = (fork_path / "SKILL.md").read_text(encoding="utf-8")
        assert "2.0.0" in content
