import os
import shutil
import tempfile

import pytest
import yaml

from skill_registry import SkillPackage, SkillRegistry


@pytest.fixture
def tmp_base(tmp_path):
    """提供一个临时的基础技能库目录。"""
    return str(tmp_path / "skill_base")


@pytest.fixture
def registry(tmp_base):
    """提供一个空的 SkillRegistry 实例。"""
    return SkillRegistry(tmp_base)


def _create_skill_package(base_dir: str, name: str = "test-skill",
                          version: str = "1.0.0", description: str = "测试技能包"):
    """在指定目录下创建一个合法的技能包结构。

    Returns:
        技能包目录路径。
    """
    skill_dir = os.path.join(base_dir, name)
    os.makedirs(os.path.join(skill_dir, "tools"), exist_ok=True)
    os.makedirs(os.path.join(skill_dir, "knowledge"), exist_ok=True)
    os.makedirs(os.path.join(skill_dir, "examples"), exist_ok=True)

    manifest = {
        "name": name,
        "version": version,
        "description": description,
        "required_env": ["python>=3.10"],
        "dependencies": [],
        "tools": [{"name": "test-tool", "description": "测试工具"}],
    }
    with open(os.path.join(skill_dir, "manifest.yaml"), "w", encoding="utf-8") as f:
        yaml.dump(manifest, f, allow_unicode=True)

    with open(os.path.join(skill_dir, "system_prompt.md"), "w", encoding="utf-8") as f:
        f.write("# 系统指令\n\n你是一个测试助手。")

    # 在 tools 下放一个示例文件
    with open(os.path.join(skill_dir, "tools", "sample.py"), "w", encoding="utf-8") as f:
        f.write("print('hello')")

    return skill_dir


class TestSkillRegistryValidation:
    """验证技能包目录结构校验。"""

    def test_validate_valid_structure(self, registry, tmp_path):
        """合法目录结构应通过验证。"""
        skill_dir = _create_skill_package(str(tmp_path))
        assert registry.validate_structure(skill_dir) is True

    def test_validate_missing_manifest(self, registry, tmp_path):
        """缺少 manifest.yaml 应返回 False。"""
        skill_dir = os.path.join(str(tmp_path), "no-manifest")
        os.makedirs(skill_dir, exist_ok=True)
        assert registry.validate_structure(skill_dir) is False

    def test_validate_invalid_yaml(self, registry, tmp_path):
        """manifest.yaml 内容无效应返回 False。"""
        skill_dir = os.path.join(str(tmp_path), "bad-yaml")
        os.makedirs(skill_dir, exist_ok=True)
        with open(os.path.join(skill_dir, "manifest.yaml"), "w", encoding="utf-8") as f:
            f.write("{{invalid yaml content}}")
        assert registry.validate_structure(skill_dir) is False

    def test_validate_missing_required_fields(self, registry, tmp_path):
        """manifest 缺少必需字段应返回 False。"""
        skill_dir = os.path.join(str(tmp_path), "partial")
        os.makedirs(skill_dir, exist_ok=True)
        manifest = {"name": "partial"}
        with open(os.path.join(skill_dir, "manifest.yaml"), "w", encoding="utf-8") as f:
            yaml.dump(manifest, f)
        assert registry.validate_structure(skill_dir) is False

    def test_validate_not_a_directory(self, registry, tmp_path):
        """不存在的目录应返回 False。"""
        assert registry.validate_structure("/nonexistent/path") is False


class TestSkillRegistryRegister:
    """测试技能包注册功能。"""

    def test_register_success(self, registry, tmp_path):
        """注册合法技能包应成功。"""
        skill_dir = _create_skill_package(str(tmp_path))
        pkg = registry.register(skill_dir)

        assert isinstance(pkg, SkillPackage)
        assert pkg.name == "test-skill"
        assert pkg.version == "1.0.0"
        assert pkg.description == "测试技能包"
        assert pkg.required_env == ["python>=3.10"]
        assert pkg.skill_id  # uuid 不为空
        assert pkg.created_at  # 注册时间不为空
        assert os.path.isdir(pkg.base_path)

    def test_register_invalid_structure_raises(self, registry, tmp_path):
        """注册不合法目录应抛出 ValueError。"""
        skill_dir = os.path.join(str(tmp_path), "bad")
        os.makedirs(skill_dir, exist_ok=True)
        with pytest.raises(ValueError, match="目录结构不合法"):
            registry.register(skill_dir)

    def test_register_preserves_files(self, registry, tmp_path):
        """注册后基础库中应包含原始技能包的所有文件。"""
        skill_dir = _create_skill_package(str(tmp_path))
        pkg = registry.register(skill_dir)

        assert os.path.isfile(os.path.join(pkg.base_path, "manifest.yaml"))
        assert os.path.isfile(os.path.join(pkg.base_path, "system_prompt.md"))
        assert os.path.isfile(os.path.join(pkg.base_path, "tools", "sample.py"))
        assert os.path.isdir(os.path.join(pkg.base_path, "knowledge"))
        assert os.path.isdir(os.path.join(pkg.base_path, "examples"))
        # 元数据文件
        assert os.path.isfile(os.path.join(pkg.base_path, ".skill_meta.yaml"))

    def test_register_generates_unique_ids(self, registry, tmp_path):
        """多次注册应生成不同的 skill_id。"""
        dir1 = _create_skill_package(str(tmp_path), name="skill-a")
        dir2 = _create_skill_package(str(tmp_path), name="skill-b")

        pkg1 = registry.register(dir1)
        pkg2 = registry.register(dir2)

        assert pkg1.skill_id != pkg2.skill_id


class TestSkillRegistryClone:
    """测试技能包克隆功能。"""

    def test_clone_success(self, registry, tmp_path):
        """克隆已注册的技能包应成功。"""
        skill_dir = _create_skill_package(str(tmp_path))
        pkg = registry.register(skill_dir)

        clone_target = str(tmp_path / "clone_output")
        result_path = registry.clone(pkg.skill_id, clone_target)

        assert os.path.isdir(result_path)
        # 基础文件应存在
        assert os.path.isfile(os.path.join(result_path, "manifest.yaml"))
        assert os.path.isfile(os.path.join(result_path, "system_prompt.md"))

        # 增量区结构应存在
        incremental_dir = os.path.join(clone_target, "incremental")
        assert os.path.isdir(incremental_dir)
        assert os.path.isfile(os.path.join(incremental_dir, "system_prompt_addon.md"))
        assert os.path.isfile(os.path.join(incremental_dir, "README.md"))
        assert os.path.isdir(os.path.join(incremental_dir, "rules"))
        assert os.path.isdir(os.path.join(incremental_dir, "tools"))
        assert os.path.isdir(os.path.join(incremental_dir, "knowledge_add"))

    def test_clone_nonexistent_raises(self, registry):
        """克隆不存在的技能包应抛出 KeyError。"""
        with pytest.raises(KeyError, match="技能包不存在"):
            registry.clone("nonexistent-id", "/tmp/clone")

    def test_clone_creates_incremental_structure(self, registry, tmp_path):
        """克隆后的增量区应包含标准化的目录结构和 README 内容。"""
        skill_dir = _create_skill_package(str(tmp_path))
        pkg = registry.register(skill_dir)

        clone_target = str(tmp_path / "clone_check")
        registry.clone(pkg.skill_id, clone_target)

        readme_path = os.path.join(clone_target, "incremental", "README.md")
        with open(readme_path, encoding="utf-8") as f:
            content = f.read()
        assert "增量区" in content
        assert "rules/" in content


class TestSkillRegistryListAndGet:
    """测试列表查询和详情获取。"""

    def test_list_empty_registry(self, registry):
        """空注册中心应返回空列表。"""
        assert registry.list_skills() == []

    def test_list_after_register(self, registry, tmp_path):
        """注册后列表应包含对应技能包。"""
        skill_dir = _create_skill_package(str(tmp_path))
        registry.register(skill_dir)

        skills = registry.list_skills()
        assert len(skills) == 1
        assert skills[0]["name"] == "test-skill"
        assert skills[0]["version"] == "1.0.0"
        assert skills[0]["description"] == "测试技能包"
        assert "skill_id" in skills[0]

    def test_list_multiple_skills(self, registry, tmp_path):
        """注册多个技能包后列表应全部包含。"""
        _create_skill_package(str(tmp_path), name="skill-a", description="技能A")
        _create_skill_package(str(tmp_path), name="skill-b", description="技能B")

        # 手动注册两个
        for name in ["skill-a", "skill-b"]:
            registry.register(os.path.join(str(tmp_path), name))

        skills = registry.list_skills()
        assert len(skills) == 2
        names = {s["name"] for s in skills}
        assert names == {"skill-a", "skill-b"}

    def test_get_skill_success(self, registry, tmp_path):
        """根据 skill_id 获取技能包详情应成功。"""
        skill_dir = _create_skill_package(str(tmp_path))
        pkg = registry.register(skill_dir)

        retrieved = registry.get_skill(pkg.skill_id)
        assert retrieved.skill_id == pkg.skill_id
        assert retrieved.name == "test-skill"
        assert retrieved.version == "1.0.0"

    def test_get_skill_nonexistent_raises(self, registry):
        """获取不存在的技能包应抛出 KeyError。"""
        with pytest.raises(KeyError, match="技能包不存在"):
            registry.get_skill("nonexistent-id")


class TestSkillRegistryVersions:
    """测试版本查询功能。"""

    def test_get_versions_current_only(self, registry, tmp_path):
        """没有历史版本时应只返回当前版本。"""
        skill_dir = _create_skill_package(str(tmp_path))
        pkg = registry.register(skill_dir)

        versions = registry.get_versions(pkg.skill_id)
        assert len(versions) == 1
        assert versions[0]["version"] == "1.0.0"
        assert versions[0]["changelog"] == "当前版本"

    def test_get_versions_with_history(self, registry, tmp_path):
        """存在历史版本目录时应返回所有版本。"""
        skill_dir = _create_skill_package(str(tmp_path))
        pkg = registry.register(skill_dir)

        # 在注册后的技能包目录中创建历史版本
        versions_dir = os.path.join(pkg.base_path, "versions")
        os.makedirs(os.path.join(versions_dir, "0.9.0"), exist_ok=True)

        old_manifest = {"name": "test-skill", "version": "0.9.0", "description": "旧版本"}
        with open(os.path.join(versions_dir, "0.9.0", "manifest.yaml"), "w", encoding="utf-8") as f:
            yaml.dump(old_manifest, f, allow_unicode=True)

        with open(os.path.join(versions_dir, "0.9.0", "CHANGELOG.md"), "w", encoding="utf-8") as f:
            f.write("初始版本")

        # 重新加载注册中心以读取新版本
        new_registry = SkillRegistry(str(tmp_path / "skill_base" if (tmp_path / "skill_base").exists() else pkg.base_path.rsplit("/", 1)[0]))
        # 直接用当前 registry 也能获取（版本目录是物理存在的）
        versions = registry.get_versions(pkg.skill_id)
        assert len(versions) == 2
        version_numbers = {v["version"] for v in versions}
        assert "1.0.0" in version_numbers
        assert "0.9.0" in version_numbers

    def test_get_versions_nonexistent_raises(self, registry):
        """查询不存在技能包的版本应抛出 KeyError。"""
        with pytest.raises(KeyError, match="技能包不存在"):
            registry.get_versions("nonexistent-id")


class TestSkillRegistryIncrementalArea:
    """测试增量区创建功能。"""

    def test_create_incremental_area(self, registry, tmp_path):
        """创建增量区应生成标准化目录结构。"""
        target = str(tmp_path / "incremental")
        result = registry.create_incremental_area(target)

        assert os.path.isdir(result)
        assert os.path.isfile(os.path.join(result, "system_prompt_addon.md"))
        assert os.path.isfile(os.path.join(result, "README.md"))
        assert os.path.isdir(os.path.join(result, "rules"))
        assert os.path.isdir(os.path.join(result, "tools"))
        assert os.path.isdir(os.path.join(result, "knowledge_add"))

    def test_create_incremental_area_idempotent(self, registry, tmp_path):
        """重复创建增量区不应覆盖已有文件内容。"""
        target = str(tmp_path / "incremental")
        registry.create_incremental_area(target)

        # 写入自定义内容
        addon_path = os.path.join(target, "system_prompt_addon.md")
        custom_content = "## 自定义规则\n\n不要自动重启服务。"
        with open(addon_path, "w", encoding="utf-8") as f:
            f.write(custom_content)

        # 再次创建
        registry.create_incremental_area(target)

        # 自定义内容应保留
        with open(addon_path, encoding="utf-8") as f:
            assert f.read() == custom_content

    def test_create_incremental_area_readme_content(self, registry, tmp_path):
        """README.md 应包含增量区使用说明。"""
        target = str(tmp_path / "incremental_readme")
        registry.create_incremental_area(target)

        readme_path = os.path.join(target, "README.md")
        with open(readme_path, encoding="utf-8") as f:
            content = f.read()
        assert "增量区" in content
        assert "system_prompt_addon.md" in content
        assert "rules/" in content
        assert "tools/" in content
        assert "knowledge_add/" in content


class TestSkillRegistryPersistence:
    """测试注册中心的持久化能力。"""

    def test_reload_existing_skills(self, tmp_path):
        """重新创建注册中心应恢复已注册的技能包。"""
        base_dir = str(tmp_path / "skill_base")
        skill_dir = _create_skill_package(str(tmp_path))

        # 首次注册
        registry1 = SkillRegistry(base_dir)
        pkg = registry1.register(skill_dir)
        assert len(registry1.list_skills()) == 1

        # 重新创建注册中心（模拟重启）
        registry2 = SkillRegistry(base_dir)
        assert len(registry2.list_skills()) == 1
        loaded = registry2.get_skill(pkg.skill_id)
        assert loaded.name == "test-skill"
        assert loaded.version == "1.0.0"


class TestSkillRegistryLoadFromSkillPacks:
    """测试从 skill_packs 目录加载技能包。"""

    def test_load_from_skill_packs(self, tmp_path):
        """从 skill_packs 加载技能包应成功注册。"""
        skill_dir = tmp_path / "skill_packs" / "test_skill"
        skill_dir.mkdir(parents=True)
        manifest = {
            "name": "test_skill",
            "version": "1.0.0",
            "description": "测试技能",
            "category": "testing",
            "required_tools": ["read_file"],
        }
        (skill_dir / "manifest.yaml").write_text(
            yaml.dump(manifest, allow_unicode=True), encoding="utf-8"
        )
        (skill_dir / "system_prompt.md").write_text("# Test prompt", encoding="utf-8")

        registry = SkillRegistry(str(tmp_path / "base"))
        registry.load_from_skill_packs(str(tmp_path / "skill_packs"))

        skills = registry.list_skills()
        assert any(s["name"] == "test_skill" for s in skills)

    def test_load_from_skill_packs_skips_duplicates(self, tmp_path):
        """已注册的技能包不应重复加载。"""
        skill_dir = tmp_path / "skill_packs" / "dup_skill"
        skill_dir.mkdir(parents=True)
        manifest = {"name": "dup_skill", "version": "1.0.0", "description": "重复"}
        (skill_dir / "manifest.yaml").write_text(
            yaml.dump(manifest, allow_unicode=True), encoding="utf-8"
        )

        registry = SkillRegistry(str(tmp_path / "base"))
        registry.load_from_skill_packs(str(tmp_path / "skill_packs"))
        registry.load_from_skill_packs(str(tmp_path / "skill_packs"))

        skills = registry.list_skills()
        assert len(skills) == 1

    def test_load_from_skill_packs_nonexistent_dir(self, tmp_path):
        """不存在的 skill_packs 目录应安全跳过。"""
        registry = SkillRegistry(str(tmp_path / "base"))
        registry.load_from_skill_packs(str(tmp_path / "nonexistent"))
        assert registry.list_skills() == []

    def test_load_from_skill_packs_skips_no_manifest(self, tmp_path):
        """没有 manifest.yaml 的子目录应跳过。"""
        skill_dir = tmp_path / "skill_packs" / "no_manifest"
        skill_dir.mkdir(parents=True)
        (skill_dir / "readme.txt").write_text("no manifest here")

        registry = SkillRegistry(str(tmp_path / "base"))
        registry.load_from_skill_packs(str(tmp_path / "skill_packs"))
        assert registry.list_skills() == []


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
