import pytest
from collaboration.planner_agent import (
    PlannerAgent,
    SubTask,
    TaskStatus,
    TaskPriority,
)


@pytest.fixture
def planner():
    return PlannerAgent(name="test_planner")


class TestSubTaskNewFields:
    """测试 SubTask 新增字段的默认值和创建。"""

    def test_default_values(self):
        """新增字段应有正确的默认值。"""
        task = SubTask(name="test", description="desc")
        assert task.acceptance_criteria == []
        assert task.required_skills == []
        assert task.input_spec == {}
        assert task.output_spec == {}

    def test_create_with_new_fields(self):
        """应能使用新字段创建 SubTask。"""
        criteria = ["功能完整", "无严重缺陷"]
        skills = ["frontend", "python"]
        input_s = {"name": "设计稿", "type": "dict", "description": "UI规格"}
        output_s = {"name": "代码", "type": "str", "description": "前端代码"}

        task = SubTask(
            name="前端开发",
            description="负责界面开发",
            acceptance_criteria=criteria,
            required_skills=skills,
            input_spec=input_s,
            output_spec=output_s,
        )
        assert task.acceptance_criteria == criteria
        assert task.required_skills == skills
        assert task.input_spec == input_s
        assert task.output_spec == output_s

    def test_backward_compatibility(self):
        """旧的调用方式应不受影响。"""
        task = SubTask(
            name="old_task",
            description="old style",
            status=TaskStatus.PENDING,
            priority=TaskPriority.HIGH,
            assigned_to="agent1",
            dependencies=["dep1"],
        )
        assert task.name == "old_task"
        assert task.acceptance_criteria == []
        assert task.required_skills == []
        assert task.input_spec == {}
        assert task.output_spec == {}

    def test_decompose_web_task_has_new_fields(self):
        """网站类任务的子任务应包含新增字段。"""
        plan_task = PlannerAgent._decompose_task.__wrapped__ if hasattr(PlannerAgent._decompose_task, '__wrapped__') else None
        planner = PlannerAgent()
        subtasks = planner._decompose_task("开发一个网站")

        for st in subtasks:
            assert isinstance(st, SubTask)
            assert len(st.acceptance_criteria) > 0
            assert len(st.required_skills) > 0
            assert "name" in st.input_spec
            assert "name" in st.output_spec

    def test_decompose_data_task_has_new_fields(self):
        """数据分析类任务的子任务应包含新增字段。"""
        planner = PlannerAgent()
        subtasks = planner._decompose_task("进行数据分析")

        for st in subtasks:
            assert len(st.acceptance_criteria) > 0
            assert len(st.required_skills) > 0
            assert "data" in st.required_skills

    def test_decompose_default_task_has_new_fields(self):
        """默认任务分支的子任务应包含新增字段。"""
        planner = PlannerAgent()
        subtasks = planner._decompose_task("完成某项工作")

        for st in subtasks:
            assert len(st.acceptance_criteria) > 0
            assert len(st.required_skills) > 0


class TestGenerateReviewFeedback:
    """测试 generate_review_feedback 方法。"""

    def test_output_format(self):
        """返回值应包含所有必需的键。"""
        planner = PlannerAgent()
        task = SubTask(
            name="测试任务",
            description="desc",
            acceptance_criteria=["功能完整"],
        )
        result = planner.generate_review_feedback(task, "这是一段足够长的产出内容用于验证功能完整性检查")

        assert "status" in result
        assert "issues" in result
        assert "max_iterations" in result
        assert "current_iteration" in result
        assert "overall_comment" in result
        assert isinstance(result["issues"], list)
        assert result["max_iterations"] == 3
        assert result["current_iteration"] == 1

    def test_approved_when_output_matches(self):
        """产出满足验收标准时应返回 approved。"""
        planner = PlannerAgent()
        task = SubTask(
            name="前端开发",
            description="负责前端界面和交互开发",
            acceptance_criteria=["页面布局符合设计稿"],
        )
        output = "已完成页面布局开发，页面布局符合设计稿，所有元素对齐正确"
        result = planner.generate_review_feedback(task, output)

        assert result["status"] == "approved"
        assert len(result["issues"]) == 0
        assert "验收通过" in result["overall_comment"]

    def test_revision_required_when_output_empty(self):
        """产出为空时应返回 revision_required。"""
        planner = PlannerAgent()
        task = SubTask(
            name="前端开发",
            description="desc",
            acceptance_criteria=["页面布局符合设计稿"],
        )
        result = planner.generate_review_feedback(task, "")

        assert result["status"] == "revision_required"
        assert len(result["issues"]) > 0
        assert "需要修改" in result["overall_comment"]

    def test_revision_required_when_none_output(self):
        """产出为 None 时应返回 revision_required。"""
        planner = PlannerAgent()
        task = SubTask(
            name="测试任务",
            description="desc",
            acceptance_criteria=["功能完整"],
        )
        result = planner.generate_review_feedback(task, None)

        assert result["status"] == "revision_required"
        assert len(result["issues"]) > 0

    def test_issue_types(self):
        """不同类型的验收标准应生成对应类型的 issue。"""
        planner = PlannerAgent()
        task = SubTask(
            name="测试任务",
            description="desc",
            acceptance_criteria=["接口响应时间符合要求"],
        )
        result = planner.generate_review_feedback(task, "")

        issues = result["issues"]
        assert len(issues) > 0
        for issue in issues:
            assert "type" in issue
            assert "location" in issue
            assert "detail" in issue
            assert "suggestion" in issue
            assert issue["type"] in ("logic_error", "style_issue", "missing_feature", "performance")

    def test_custom_iteration_context(self):
        """应能通过 context 传递 current_iteration。"""
        planner = PlannerAgent()
        task = SubTask(
            name="测试任务",
            description="desc",
            acceptance_criteria=["功能完整"],
        )
        result = planner.generate_review_feedback(
            task, "产出内容", context={"current_iteration": 2}
        )

        assert result["current_iteration"] == 2

    def test_no_acceptance_criteria(self):
        """无验收标准时，非空产出应通过。"""
        planner = PlannerAgent()
        task = SubTask(name="测试任务", description="desc", acceptance_criteria=[])
        result = planner.generate_review_feedback(task, "这是产出内容")

        assert result["status"] == "approved"

    def test_no_acceptance_criteria_empty_output(self):
        """无验收标准但产出为空时应不通过。"""
        planner = PlannerAgent()
        task = SubTask(name="测试任务", description="desc", acceptance_criteria=[])
        result = planner.generate_review_feedback(task, "")

        assert result["status"] == "revision_required"

    def test_multiple_criteria_partial_match(self):
        """多个验收标准时，应逐一检查。"""
        planner = PlannerAgent()
        task = SubTask(
            name="后端开发",
            description="desc",
            acceptance_criteria=[
                "API接口返回格式正确",
                "数据校验和错误处理完善",
            ],
        )
        output = "API接口已开发完成，返回格式正确，包含JSON数据结构，数据校验处理完善，包含完善的错误处理和异常捕获机制，已通过全部单元测试"
        result = planner.generate_review_feedback(task, output)

        assert result["status"] == "approved"


class TestPlannerSkillRegistryIntegration:
    """测试 PlannerAgent 与 SkillRegistry 的集成。"""

    def test_query_matching_skills_no_registry(self):
        """没有 SkillRegistry 时应返回空列表。"""
        planner = PlannerAgent()
        result = planner._query_matching_skills(["frontend", "python"])
        assert result == []

    def test_planner_accepts_skill_registry(self):
        """PlannerAgent 应能接受 skill_registry 参数。"""
        planner = PlannerAgent(skill_registry=None)
        assert planner.skill_registry is None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
