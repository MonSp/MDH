"""Tests for TaskOrchestrator _build_prompt and ExperienceExtractor import fix."""

from unittest.mock import MagicMock, patch


class TestBuildPromptMethod:
    """验证 _build_prompt 方法存在且正确构建提示词"""

    def _make_orchestrator(self):
        from task_orchestrator import TaskOrchestrator
        return TaskOrchestrator(
            get_model_fn=MagicMock(),
            meeting=MagicMock(),
            router=MagicMock(),
        )

    def test_build_prompt_exists(self):
        """_build_prompt 方法应存在"""
        orch = self._make_orchestrator()
        assert hasattr(orch, '_build_prompt')

    def test_build_prompt_returns_string(self):
        """_build_prompt 应返回包含任务描述的字符串"""
        orch = self._make_orchestrator()
        task = MagicMock()
        task.description = "创建一个 REST API"
        agent_info = MagicMock()
        result = orch._build_prompt(task, agent_info)
        assert isinstance(result, str)
        assert "创建一个 REST API" in result

    def test_build_prompt_includes_code_block_format(self):
        """_build_prompt 应包含代码块格式说明"""
        orch = self._make_orchestrator()
        task = MagicMock()
        task.description = "测试任务"
        result = orch._build_prompt(task, MagicMock())
        assert "```文件路径.扩展名" in result

    def test_build_prompt_with_toolset(self):
        """_build_prompt 传入 agent_toolset 时应包含工具提示"""
        orch = self._make_orchestrator()
        task = MagicMock()
        task.description = "测试任务"
        mock_toolset = MagicMock()
        mock_toolset.get_system_prompt.return_value = "## 可用工具\nread_file, write_file"
        result = orch._build_prompt(task, MagicMock(), mock_toolset)
        assert "可用工具" in result


class TestExperienceExtractorImport:
    """验证 ExperienceExtractor 在 task_orchestrator 中正确导入"""

    def test_experience_extractor_importable(self):
        """task_orchestrator 模块应能导入 ExperienceExtractor"""
        import task_orchestrator
        assert hasattr(task_orchestrator, 'ExperienceExtractor')

    def test_build_prompt_injects_experience(self):
        """_build_prompt 应在有经验规则时注入上下文"""
        orch = self._make_orchestrator()
        task = MagicMock()
        task.description = "开发一个 Python Web 应用"
        with patch.object(orch, '_get_experience_context', return_value="\n\n## 历史经验参考\n经验1: 使用 FastAPI"):
            result = orch._build_prompt(task, MagicMock())
            assert "历史经验参考" in result
            assert "FastAPI" in result

    def test_build_prompt_no_experience(self):
        """_build_prompt 在无经验时不应注入额外上下文"""
        orch = self._make_orchestrator()
        task = MagicMock()
        task.description = "测试任务"
        with patch.object(orch, '_get_experience_context', return_value=""):
            result = orch._build_prompt(task, MagicMock())
            assert "历史经验参考" not in result

    @staticmethod
    def _make_orchestrator():
        from task_orchestrator import TaskOrchestrator
        return TaskOrchestrator(
            get_model_fn=MagicMock(),
            meeting=MagicMock(),
            router=MagicMock(),
        )
