"""Tests for RegistryClient and RegistryServer"""
import json
import pytest
import tempfile
import zipfile
from pathlib import Path
from unittest.mock import patch, MagicMock

from registry_client import RegistryClient, SkillMeta
from registry_server import RegistryServer


@pytest.fixture
def skill_dir(tmp_path):
    """创建测试技能目录"""
    skill = tmp_path / "skills" / "frontend_dev"
    skill.mkdir(parents=True)
    (skill / "SKILL.md").write_text(
        "---\nname: frontend_dev\nversion: 1.0.0\ndescription: Frontend\n"
        "category: development\nkeywords: [react, frontend]\n---\n\nInstructions",
        encoding="utf-8",
    )
    return tmp_path / "skills"


@pytest.fixture
def registry_server(tmp_path, skill_dir):
    """创建测试注册表服务"""
    server = RegistryServer(str(tmp_path / "registry"))
    # 复制技能到注册表
    import shutil
    shutil.copytree(str(skill_dir / "frontend_dev"), str(server._skills_dir / "frontend_dev"))
    server._rebuild_index()
    return server


class TestRegistryClient:
    def test_search_no_repo(self):
        """无仓库时搜索返回空"""
        client = RegistryClient("", auto_clone=False)
        results = client.search(keywords=["test"])
        assert results == []

    def test_search_with_local_index(self, skill_dir):
        """从本地索引搜索"""
        client = RegistryClient("", auto_clone=False)
        client._index = {
            "frontend_dev": SkillMeta(
                name="frontend_dev",
                version="1.0.0",
                description="Frontend",
                keywords=["react", "frontend"],
            )
        }
        results = client.search(keywords=["react"])
        assert len(results) == 1
        assert results[0].name == "frontend_dev"

    def test_search_category_filter(self):
        """类别过滤"""
        client = RegistryClient("", auto_clone=False)
        client._index = {
            "a": SkillMeta(name="a", version="1.0", description="", category="dev", keywords=["x"]),
            "b": SkillMeta(name="b", version="1.0", description="", category="test", keywords=["x"]),
        }
        results = client.search(category="dev")
        assert len(results) == 1
        assert results[0].name == "a"

    def test_install(self, skill_dir, tmp_path):
        """安装技能"""
        client = RegistryClient("", auto_clone=False)
        client._skills_dir = skill_dir  # skill_dir already points to skills/
        target = tmp_path / "installed"
        target.mkdir()

        result = client.install("frontend_dev", str(target))
        assert result is True
        assert (target / "frontend_dev" / "SKILL.md").exists()

    def test_install_nonexistent(self, tmp_path):
        """安装不存在的技能"""
        client = RegistryClient("", auto_clone=False)
        client._skills_dir = tmp_path / "empty"
        client._skills_dir.mkdir()

        result = client.install("nonexistent", str(tmp_path))
        assert result is False

    def test_get_skill_info(self):
        """获取技能信息"""
        client = RegistryClient("", auto_clone=False)
        client._index = {
            "test": SkillMeta(name="test", version="1.0", description="Test", keywords=["x"])
        }
        info = client.get_skill_info("test")
        assert info is not None
        assert info.name == "test"


class TestRegistryServer:
    def test_list_skills(self, registry_server):
        """列出技能"""
        skills = registry_server.list_skills()
        assert len(skills) == 1
        assert skills[0]["name"] == "frontend_dev"

    def test_get_skill(self, registry_server):
        """获取技能详情"""
        skill = registry_server.get_skill("frontend_dev")
        assert skill is not None
        assert skill["name"] == "frontend_dev"

    def test_get_nonexistent(self, registry_server):
        """获取不存在的技能"""
        skill = registry_server.get_skill("nonexistent")
        assert skill is None

    def test_download_skill(self, registry_server):
        """下载技能"""
        data = registry_server.download_skill("frontend_dev")
        assert data is not None
        assert len(data) > 0

        # 验证 zip 内容
        with zipfile.ZipFile(__import__('io').BytesIO(data), 'r') as zf:
            names = zf.namelist()
            assert any("SKILL.md" in n for n in names)

    def test_download_nonexistent(self, registry_server):
        """下载不存在的技能"""
        data = registry_server.download_skill("nonexistent")
        assert data is None

    def test_search_skills(self, registry_server):
        """搜索技能"""
        results = registry_server.search_skills(query="frontend")
        assert len(results) == 1
        assert results[0]["name"] == "frontend_dev"

    def test_search_category(self, registry_server):
        """按类别搜索"""
        results = registry_server.search_skills(category="development")
        assert len(results) == 1

    def test_search_no_match(self, registry_server):
        """无匹配结果"""
        results = registry_server.search_skills(query="nonexistent")
        assert len(results) == 0

    def test_upload_skill(self, registry_server, tmp_path):
        """上传技能"""
        # 创建 zip
        buffer = __import__('io').BytesIO()
        with zipfile.ZipFile(buffer, 'w') as zf:
            zf.writestr("new_skill/SKILL.md", "---\nname: new_skill\nversion: 1.0\n---\n\nTest")
        zip_data = buffer.getvalue()

        success = registry_server.upload_skill(zip_data, {
            "name": "new_skill",
            "version": "1.0",
            "description": "Test skill",
        })
        assert success is True
        assert registry_server.get_skill("new_skill") is not None


class TestSkillMeta:
    def test_to_dict(self):
        meta = SkillMeta(name="test", version="1.0", description="Test")
        d = meta.to_dict()
        assert d["name"] == "test"
        assert d["version"] == "1.0"

    def test_from_dict(self):
        data = {"name": "test", "version": "1.0", "description": "Test", "extra": "ignored"}
        meta = SkillMeta.from_dict(data)
        assert meta.name == "test"
        assert not hasattr(meta, 'extra')
