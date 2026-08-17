"""Tests for SkillRouter — skill routing bridge"""
import pytest
import tempfile
from pathlib import Path

from skill_bridge import SkillBridge
from progressive_skill_loader import ProgressiveSkillLoader
from dynamic_router import DynamicRouter, RouteEntry
from skill_router import SkillRouter


@pytest.fixture
def skill_router(tmp_path):
    """创建 SkillRouter 测试实例"""
    # 创建技能目录
    skill_dir = tmp_path / "skills"
    skill_dir.mkdir()

    # 技能 1: API 设计
    api = skill_dir / "api_design"
    api.mkdir()
    (api / "SKILL.md").write_text(
        "---\nname: api_design\ndescription: REST API 设计\n"
        "category: architecture\nkeywords: [api, rest, design]\n"
        "required_tools: [read_file, write_file]\n---\n\nAPI 设计专家",
        encoding="utf-8",
    )

    # 技能 2: 前端开发
    fe = skill_dir / "frontend_dev"
    fe.mkdir()
    (fe / "SKILL.md").write_text(
        "---\nname: frontend_dev\ndescription: 前端开发\n"
        "category: development\nkeywords: [react, frontend, typescript]\n"
        "required_tools: [read_file, write_file]\n---\n\n前端开发专家",
        encoding="utf-8",
    )

    # 创建路由表
    routing_file = tmp_path / "routing.json"
    routing_file.write_text('{"departments": []}', encoding="utf-8")

    loader = ProgressiveSkillLoader(str(skill_dir))
    router = DynamicRouter(str(routing_file))
    return SkillRouter(loader, router)


class TestSkillRouter:
    def test_inject_skills(self, skill_router):
        count = skill_router.inject_skills()
        assert count == 2

    def test_route_by_skill_api(self, skill_router):
        results = skill_router.route_by_skill("设计一个 REST API 接口")
        assert len(results) > 0
        names = [name for name, _ in results]
        assert "api_design" in names

    def test_route_by_skill_frontend(self, skill_router):
        results = skill_router.route_by_skill("用 React 创建前端组件")
        assert len(results) > 0
        names = [name for name, _ in results]
        assert "frontend_dev" in names

    def test_route_by_skill_no_match(self, skill_router):
        results = skill_router.route_by_skill("完全无关的任务 xyz")
        # 应返回空或低分结果
        assert isinstance(results, list)

    def test_get_skill_route_table(self, skill_router):
        skill_router.inject_skills()
        table = skill_router.get_skill_route_table()
        assert "skill:api_design" in table
        assert "skill:frontend_dev" in table
        assert table["skill:api_design"]["name"] == "api_design"
