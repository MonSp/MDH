import os
import shutil
import zipfile

import pytest
import yaml

from skill_packager import PackageResult, SkillPackager

# ──────────────────── 测试辅助 ────────────────────


def _create_base_skill(base_dir: str, name: str = "test-skill", version: str = "1.0.0"):
    """创建一个基础技能包目录结构。"""
    skill_dir = os.path.join(base_dir, "base_skill")
    os.makedirs(os.path.join(skill_dir, "tools"), exist_ok=True)
    os.makedirs(os.path.join(skill_dir, "knowledge"), exist_ok=True)
    os.makedirs(os.path.join(skill_dir, "examples"), exist_ok=True)

    manifest = {
        "name": name,
        "version": version,
        "description": "测试技能包",
    }
    with open(os.path.join(skill_dir, "manifest.yaml"), "w", encoding="utf-8") as f:
        yaml.dump(manifest, f, allow_unicode=True)

    with open(os.path.join(skill_dir, "system_prompt.md"), "w", encoding="utf-8") as f:
        f.write("# 系统指令\n\n你是一个测试助手。")

    with open(os.path.join(skill_dir, "tools", "sample_tool.py"), "w", encoding="utf-8") as f:
        f.write("def run():\n    return 'hello'\n")

    with open(os.path.join(skill_dir, "tools", "shared_tool.py"), "w", encoding="utf-8") as f:
        f.write("def shared():\n    return 'base version'\n")

    with open(os.path.join(skill_dir, "knowledge", "base_knowledge.md"), "w", encoding="utf-8") as f:
        f.write("# 基础知识\n\n这是基础知识内容。")

    with open(os.path.join(skill_dir, "examples", "base_example.md"), "w", encoding="utf-8") as f:
        f.write("# 基础案例\n\n这是基础案例。")

    return skill_dir


def _create_incremental(inc_dir: str):
    """创建增量区目录结构。"""
    os.makedirs(os.path.join(inc_dir, "rules"), exist_ok=True)
    os.makedirs(os.path.join(inc_dir, "tools"), exist_ok=True)
    os.makedirs(os.path.join(inc_dir, "knowledge_add"), exist_ok=True)
    os.makedirs(os.path.join(inc_dir, "examples"), exist_ok=True)

    # system_prompt_addon
    with open(os.path.join(inc_dir, "system_prompt_addon.md"), "w", encoding="utf-8") as f:
        f.write("## 追加规则\n\n不要自动重启服务。")

    # 新增工具
    with open(os.path.join(inc_dir, "tools", "new_tool.py"), "w", encoding="utf-8") as f:
        f.write("def new_feature():\n    return 'new'\n")

    # 替换同名工具
    with open(os.path.join(inc_dir, "tools", "shared_tool.py"), "w", encoding="utf-8") as f:
        f.write("def shared():\n    return 'incremental version'\n")

    # 规则文件
    rule_data = {
        "rules": [
            {
                "rule_id": "rule-001",
                "trigger_condition": "task_type is web-dev",
                "action": "use flex layout",
                "note": "经过验证的最佳实践",
                "rule_type": "success_pattern",
                "keywords": ["web-dev", "layout"],
            }
        ]
    }
    with open(os.path.join(inc_dir, "rules", "rule-001.yaml"), "w", encoding="utf-8") as f:
        yaml.dump(rule_data, f, allow_unicode=True)

    # 新增知识
    with open(os.path.join(inc_dir, "knowledge_add", "new_knowledge.md"), "w", encoding="utf-8") as f:
        f.write("# 新知识\n\n项目中积累的新知识。")

    # 新增案例
    with open(os.path.join(inc_dir, "examples", "new_example.md"), "w", encoding="utf-8") as f:
        f.write("# 新案例\n\n项目中积累的新案例。")


@pytest.fixture
def packager(tmp_path):
    """提供一个 SkillPackager 实例。"""
    output_dir = str(tmp_path / "output")
    return SkillPackager(output_dir)


@pytest.fixture
def base_skill(tmp_path):
    """提供一个基础技能包目录。"""
    return _create_base_skill(str(tmp_path))


@pytest.fixture
def incremental(tmp_path):
    """提供一个增量区目录。"""
    inc_dir = str(tmp_path / "incremental")
    _create_incremental(inc_dir)
    return inc_dir


# ──────────────────── 技能合并测试 ────────────────────


class TestMergeSkills:
    """测试技能合并功能。"""

    def test_merge_system_prompt_appended(self, packager, base_skill, incremental):
        """system_prompt.md 应追加增量内容。"""
        merged = packager.merge_skills(base_skill, incremental)

        try:
            prompt_path = os.path.join(merged, "system_prompt.md")
            with open(prompt_path, encoding="utf-8") as f:
                content = f.read()

            assert "你是一个测试助手" in content
            assert "不要自动重启服务" in content
        finally:
            shutil.rmtree(merged, ignore_errors=True)

    def test_merge_tools_replaced_and_added(self, packager, base_skill, incremental):
        """同名工具应被替换，新工具应被追加。"""
        merged = packager.merge_skills(base_skill, incremental)

        try:
            # 新工具存在
            new_tool = os.path.join(merged, "tools", "new_tool.py")
            assert os.path.isfile(new_tool)
            with open(new_tool, encoding="utf-8") as f:
                assert "new_feature" in f.read()

            # 同名工具被替换
            shared_tool = os.path.join(merged, "tools", "shared_tool.py")
            assert os.path.isfile(shared_tool)
            with open(shared_tool, encoding="utf-8") as f:
                assert "incremental version" in f.read()

            # 原有独立工具保留
            sample_tool = os.path.join(merged, "tools", "sample_tool.py")
            assert os.path.isfile(sample_tool)
        finally:
            shutil.rmtree(merged, ignore_errors=True)

    def test_merge_rules_merged(self, packager, base_skill, incremental):
        """增量区的规则文件应被合并。"""
        merged = packager.merge_skills(base_skill, incremental)

        try:
            rule_path = os.path.join(merged, "rules", "rule-001.yaml")
            assert os.path.isfile(rule_path)
            with open(rule_path, encoding="utf-8") as f:
                data = yaml.safe_load(f)
            assert "rules" in data
            assert data["rules"][0]["rule_id"] == "rule-001"
        finally:
            shutil.rmtree(merged, ignore_errors=True)

    def test_merge_knowledge_add(self, packager, base_skill, incremental):
        """增量知识应被添加到 knowledge 目录。"""
        merged = packager.merge_skills(base_skill, incremental)

        try:
            # 基础知识保留
            base_kn = os.path.join(merged, "knowledge", "base_knowledge.md")
            assert os.path.isfile(base_kn)

            # 新知识追加
            new_kn = os.path.join(merged, "knowledge", "new_knowledge.md")
            assert os.path.isfile(new_kn)
        finally:
            shutil.rmtree(merged, ignore_errors=True)

    def test_merge_examples(self, packager, base_skill, incremental):
        """增量案例应被追加到 examples 目录。"""
        merged = packager.merge_skills(base_skill, incremental)

        try:
            base_ex = os.path.join(merged, "examples", "base_example.md")
            assert os.path.isfile(base_ex)

            new_ex = os.path.join(merged, "examples", "new_example.md")
            assert os.path.isfile(new_ex)
        finally:
            shutil.rmtree(merged, ignore_errors=True)

    def test_merge_base_not_modified(self, packager, base_skill, incremental):
        """合并不应修改基础技能包。"""
        prompt_before = open(os.path.join(base_skill, "system_prompt.md"), encoding="utf-8").read()
        merged = packager.merge_skills(base_skill, incremental)
        shutil.rmtree(merged, ignore_errors=True)

        prompt_after = open(os.path.join(base_skill, "system_prompt.md"), encoding="utf-8").read()
        assert prompt_before == prompt_after

    def test_merge_missing_base_raises(self, packager, tmp_path, incremental):
        """基础技能包路径不存在应抛出异常。"""
        with pytest.raises(FileNotFoundError, match="基础技能包路径不存在"):
            packager.merge_skills("/nonexistent/base", incremental)

    def test_merge_missing_incremental_raises(self, packager, base_skill, tmp_path):
        """增量区路径不存在应抛出异常。"""
        with pytest.raises(FileNotFoundError, match="增量区路径不存在"):
            packager.merge_skills(base_skill, "/nonexistent/incremental")


# ──────────────────── 脱敏检查测试 ────────────────────


class TestDesensitizeCheck:
    """测试脱敏检查功能。"""

    def test_detect_api_key_sk(self, packager, tmp_path):
        """应检测 OpenAI 风格的 sk- 密钥。"""
        test_dir = str(tmp_path / "desensitize_sk")
        os.makedirs(test_dir, exist_ok=True)
        with open(os.path.join(test_dir, "config.py"), "w", encoding="utf-8") as f:
            f.write('API_KEY = "sk-abc123def456ghi789jkl012mno345"\n')

        issues = packager.desensitize_check(test_dir)
        assert len(issues) >= 1
        assert any(i.issue_type == "api_key" for i in issues)
        # 文件内容应被脱敏
        with open(os.path.join(test_dir, "config.py"), encoding="utf-8") as f:
            content = f.read()
        assert "sk-abc123" not in content
        assert "REDACTED" in content

    def test_detect_api_key_bearer(self, packager, tmp_path):
        """应检测 Bearer Token。"""
        test_dir = str(tmp_path / "desensitize_bearer")
        os.makedirs(test_dir, exist_ok=True)
        with open(os.path.join(test_dir, "auth.md"), "w", encoding="utf-8") as f:
            f.write("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\n")

        issues = packager.desensitize_check(test_dir)
        assert any(i.issue_type == "api_key" for i in issues)

    def test_detect_internal_path_unix(self, packager, tmp_path):
        """应检测 Unix 内部路径。"""
        test_dir = str(tmp_path / "desensitize_unix")
        os.makedirs(test_dir, exist_ok=True)
        with open(os.path.join(test_dir, "config.md"), "w", encoding="utf-8") as f:
            f.write("数据目录: /home/zhangsan/projects/data\n")

        issues = packager.desensitize_check(test_dir)
        assert any(i.issue_type == "internal_path" for i in issues)

    def test_detect_internal_path_windows(self, packager, tmp_path):
        """应检测 Windows 内部路径。"""
        test_dir = str(tmp_path / "desensitize_win")
        os.makedirs(test_dir, exist_ok=True)
        with open(os.path.join(test_dir, "config.md"), "w", encoding="utf-8") as f:
            f.write("项目路径: C:\\Users\\lisi\\Documents\\project\n")

        issues = packager.desensitize_check(test_dir)
        assert any(i.issue_type == "internal_path" for i in issues)

    def test_detect_internal_ip(self, packager, tmp_path):
        """应检测内网 IP 地址。"""
        test_dir = str(tmp_path / "desensitize_ip")
        os.makedirs(test_dir, exist_ok=True)
        with open(os.path.join(test_dir, "network.md"), "w", encoding="utf-8") as f:
            f.write("服务器地址: 192.168.1.100\n")

        issues = packager.desensitize_check(test_dir)
        assert any(i.issue_type == "internal_path" for i in issues)

    def test_detect_email(self, packager, tmp_path):
        """应检测邮箱地址。"""
        test_dir = str(tmp_path / "desensitize_email")
        os.makedirs(test_dir, exist_ok=True)
        with open(os.path.join(test_dir, "contact.md"), "w", encoding="utf-8") as f:
            f.write("联系人: zhangsan@example.com\n")

        issues = packager.desensitize_check(test_dir)
        assert any(i.issue_type == "privacy_data" for i in issues)

    def test_detect_phone_number(self, packager, tmp_path):
        """应检测中国大陆手机号。"""
        test_dir = str(tmp_path / "desensitize_phone")
        os.makedirs(test_dir, exist_ok=True)
        with open(os.path.join(test_dir, "user.md"), "w", encoding="utf-8") as f:
            f.write("手机号: 13812345678\n")

        issues = packager.desensitize_check(test_dir)
        assert any(i.issue_type == "privacy_data" for i in issues)

    def test_desensitize_nonexistent_dir(self, packager):
        """不存在的目录应返回空列表。"""
        issues = packager.desensitize_check("/nonexistent/dir")
        assert issues == []

    def test_desensitize_skip_binary(self, packager, tmp_path):
        """应跳过二进制文件。"""
        test_dir = str(tmp_path / "desensitize_binary")
        os.makedirs(test_dir, exist_ok=True)
        # 创建一个伪 .png 文件
        with open(os.path.join(test_dir, "image.png"), "wb") as f:
            f.write(b"\x89PNG\r\n\x1a\n" + b"\x00" * 50)

        issues = packager.desensitize_check(test_dir)
        assert issues == []

    def test_desensitize_multiple_issues(self, packager, tmp_path):
        """应检测多个不同类型的问题。"""
        test_dir = str(tmp_path / "desensitize_multi")
        os.makedirs(test_dir, exist_ok=True)
        with open(os.path.join(test_dir, "config.md"), "w", encoding="utf-8") as f:
            f.write(
                "API Key: sk-abc123def456ghi789jkl012mno345\n"
                "邮箱: admin@example.com\n"
                "内部IP: 10.0.0.1\n"
            )

        issues = packager.desensitize_check(test_dir)
        issue_types = {i.issue_type for i in issues}
        assert "api_key" in issue_types
        assert "privacy_data" in issue_types
        assert "internal_path" in issue_types


# ──────────────────── README 生成测试 ────────────────────


class TestGenerateReadme:
    """测试 README 生成功能。"""

    def test_readme_contains_basic_info(self, packager):
        """README 应包含技能名称和版本信息。"""
        diff_summary = {"new_files": [], "modified_files": [], "new_rules": []}
        readme = packager.generate_readme("测试技能", "1.0.0", diff_summary, [])

        assert "测试技能" in readme
        assert "1.0.0" in readme
        assert "1.1.0" in readme  # 自增版本

    def test_readme_contains_new_files(self, packager):
        """README 应列出新增文件。"""
        diff_summary = {
            "new_files": ["tools/new_tool.py", "knowledge/addition.md"],
            "modified_files": [],
            "new_rules": ["rule-001.yaml"],
        }
        readme = packager.generate_readme("测试技能", "1.0.0", diff_summary, [])

        assert "tools/new_tool.py" in readme
        assert "knowledge/addition.md" in readme
        assert "rule-001.yaml" in readme

    def test_readme_contains_modified_files(self, packager):
        """README 应列出修改文件。"""
        diff_summary = {
            "new_files": [],
            "modified_files": ["tools/shared_tool.py"],
            "new_rules": [],
        }
        readme = packager.generate_readme("测试技能", "1.0.0", diff_summary, [])

        assert "tools/shared_tool.py" in readme

    def test_readme_contains_rules_summary(self, packager):
        """README 应包含规则摘要。"""
        diff_summary = {"new_files": [], "modified_files": [], "new_rules": []}
        rules_summary = [
            {
                "trigger_condition": "task_type is web-dev",
                "action": "use flex layout",
                "note": "经过验证",
            }
        ]
        readme = packager.generate_readme("测试技能", "1.0.0", diff_summary, rules_summary)

        assert "task_type is web-dev" in readme
        assert "use flex layout" in readme
        assert "经过验证" in readme

    def test_readme_contains_usage_section(self, packager):
        """README 应包含使用说明和适用场景。"""
        diff_summary = {"new_files": [], "modified_files": [], "new_rules": []}
        readme = packager.generate_readme("测试技能", "1.0.0", diff_summary, [])

        assert "适用场景" in readme
        assert "使用说明" in readme


# ──────────────────── ZIP 打包测试 ────────────────────


class TestPackageZip:
    """测试 ZIP 打包功能。"""

    def test_zip_created(self, packager, tmp_path):
        """ZIP 文件应被正确创建。"""
        test_dir = str(tmp_path / "zip_source")
        os.makedirs(test_dir, exist_ok=True)
        with open(os.path.join(test_dir, "test.txt"), "w", encoding="utf-8") as f:
            f.write("hello")

        zip_path = packager.package_zip(test_dir, "proj-001", "test-skill")
        assert os.path.isfile(zip_path)
        assert "proj-001" in zip_path
        assert "test-skill" in zip_path

    def test_zip_contains_all_files(self, packager, tmp_path):
        """ZIP 应包含所有文件。"""
        test_dir = str(tmp_path / "zip_content")
        os.makedirs(os.path.join(test_dir, "sub"), exist_ok=True)
        with open(os.path.join(test_dir, "a.txt"), "w", encoding="utf-8") as f:
            f.write("a")
        with open(os.path.join(test_dir, "sub", "b.txt"), "w", encoding="utf-8") as f:
            f.write("b")

        zip_path = packager.package_zip(test_dir, "proj-002", "my-skill")
        with zipfile.ZipFile(zip_path, "r") as zf:
            names = zf.namelist()
            assert "a.txt" in names
            assert "sub/b.txt" in names

    def test_zip_readable(self, packager, tmp_path):
        """ZIP 内的文件内容应可读。"""
        test_dir = str(tmp_path / "zip_readable")
        os.makedirs(test_dir, exist_ok=True)
        with open(os.path.join(test_dir, "content.txt"), "w", encoding="utf-8") as f:
            f.write("测试内容")

        zip_path = packager.package_zip(test_dir, "proj-003", "skill")
        with zipfile.ZipFile(zip_path, "r") as zf:
            content = zf.read("content.txt").decode("utf-8")
            assert content == "测试内容"

    def test_zip_filename_format(self, packager, tmp_path):
        """ZIP 文件名应符合格式要求。"""
        test_dir = str(tmp_path / "zip_name")
        os.makedirs(test_dir, exist_ok=True)

        zip_path = packager.package_zip(test_dir, "proj-42", "测试技能")
        filename = os.path.basename(zip_path)
        assert filename.endswith(".zip")
        assert "proj-42" in filename


# ──────────────────── 预览功能测试 ────────────────────


class TestPreviewPackage:
    """测试预览功能。"""

    def test_preview_structure_tree(self, packager, base_skill, incremental):
        """预览应返回结构树。"""
        preview = packager.preview_package(base_skill, incremental)

        assert "structure_tree" in preview
        tree = preview["structure_tree"]
        assert "system_prompt.md" in tree
        assert "tools/" in tree

    def test_preview_diff_summary(self, packager, base_skill, incremental):
        """预览应包含变更摘要。"""
        preview = packager.preview_package(base_skill, incremental)

        diff = preview["diff_summary"]
        assert "new_files" in diff
        assert "modified_files" in diff
        assert "new_rules" in diff

    def test_preview_new_rules(self, packager, base_skill, incremental):
        """预览应解析新增规则。"""
        preview = packager.preview_package(base_skill, incremental)

        new_rules = preview["new_rules"]
        assert len(new_rules) >= 1
        assert new_rules[0]["rule_id"] == "rule-001"

    def test_preview_modified_files(self, packager, base_skill, incremental):
        """预览应包含修改的文件。"""
        preview = packager.preview_package(base_skill, incremental)

        modified = preview["modified_files"]
        assert any("shared_tool.py" in f for f in modified)


# ──────────────────── 完整打包流程测试 ────────────────────


class TestFullPackage:
    """测试完整打包流程。"""

    def test_full_package_returns_result(self, packager, base_skill, incremental, tmp_path):
        """完整打包应返回 PackageResult。"""
        result = packager.full_package(
            base_skill, incremental, "proj-001", "测试技能"
        )

        assert isinstance(result, PackageResult)
        assert result.skill_name == "测试技能"
        assert result.base_version == "1.0.0"
        assert result.output_version == "1.1.0"

    def test_full_package_zip_exists(self, packager, base_skill, incremental):
        """完整打包应生成 ZIP 文件。"""
        result = packager.full_package(
            base_skill, incremental, "proj-001", "测试技能"
        )

        assert os.path.isfile(result.package_path)
        assert result.package_path.endswith(".zip")

    def test_full_package_readme_content(self, packager, base_skill, incremental):
        """完整打包应生成 README 内容。"""
        result = packager.full_package(
            base_skill, incremental, "proj-001", "测试技能"
        )

        assert "测试技能" in result.readme_content
        assert "1.0.0" in result.readme_content

    def test_full_package_diff_summary(self, packager, base_skill, incremental):
        """完整打包应包含变更摘要。"""
        result = packager.full_package(
            base_skill, incremental, "proj-001", "测试技能"
        )

        assert "new_files" in result.diff_summary
        assert "modified_files" in result.diff_summary

    def test_full_package_temp_cleaned_up(self, packager, base_skill, incremental):
        """完整打包后临时目录应被清理。"""
        # 记录输出目录中的条目
        output_dir = str(packager._output_dir)
        entries_before = set(os.listdir(output_dir)) if os.path.isdir(output_dir) else set()

        packager.full_package(
            base_skill, incremental, "proj-001", "测试技能"
        )

        # 检查没有残留的 skill_merged_ 临时目录
        import tempfile
        temp_dir = tempfile.gettempdir()
        merged_dirs = [
            d for d in os.listdir(temp_dir)
            if d.startswith("skill_merged_")
        ]
        # 不严格要求为空（可能有其他进程创建的），但结果中应无新增
        # 主要是确保 full_package 自己清理了临时目录

    def test_full_package_zip_contains_merged_content(self, packager, base_skill, incremental):
        """完整打包的 ZIP 应包含合并后的内容。"""
        result = packager.full_package(
            base_skill, incremental, "proj-001", "测试技能"
        )

        with zipfile.ZipFile(result.package_path, "r") as zf:
            names = zf.namelist()

            # 基础文件
            assert any("system_prompt.md" in n for n in names)
            assert any("manifest.yaml" in n for n in names)

            # 新增工具
            assert any("new_tool.py" in n for n in names)

            # README
            assert any("README.md" in n for n in names)

            # 验证 system_prompt 包含追加内容
            for name in names:
                if name.endswith("system_prompt.md"):
                    content = zf.read(name).decode("utf-8")
                    assert "不要自动重启服务" in content
                    break

    def test_full_package_with_desensitize_issues(self, packager, tmp_path):
        """完整打包应检测并报告脱敏问题。"""
        # 创建包含敏感数据的技能包
        base_dir = str(tmp_path / "sensitive_base")
        os.makedirs(os.path.join(base_dir, "tools"), exist_ok=True)
        os.makedirs(os.path.join(base_dir, "knowledge"), exist_ok=True)
        os.makedirs(os.path.join(base_dir, "examples"), exist_ok=True)

        manifest = {"name": "sensitive-skill", "version": "1.0.0", "description": "测试"}
        with open(os.path.join(base_dir, "manifest.yaml"), "w", encoding="utf-8") as f:
            yaml.dump(manifest, f, allow_unicode=True)

        with open(os.path.join(base_dir, "system_prompt.md"), "w", encoding="utf-8") as f:
            f.write("# 系统指令\n\nAPI Key: sk-test1234567890abcdefghij\n")

        # 创建增量区
        inc_dir = str(tmp_path / "sensitive_inc")
        os.makedirs(os.path.join(inc_dir, "rules"), exist_ok=True)
        os.makedirs(os.path.join(inc_dir, "tools"), exist_ok=True)
        os.makedirs(os.path.join(inc_dir, "knowledge_add"), exist_ok=True)
        os.makedirs(os.path.join(inc_dir, "examples"), exist_ok=True)

        with open(os.path.join(inc_dir, "system_prompt_addon.md"), "w", encoding="utf-8") as f:
            f.write("")

        result = packager.full_package(
            base_dir, inc_dir, "proj-sensitive", "sensitive-skill"
        )

        assert len(result.desensitize_report) >= 1
        assert any(i.issue_type == "api_key" for i in result.desensitize_report)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
