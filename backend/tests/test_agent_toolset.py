import os
import shutil
import tempfile

import pytest

from agent_toolset import AgentToolset, load_roles_config


@pytest.fixture
def temp_workspace():
    d = tempfile.mkdtemp()
    yield d
    shutil.rmtree(d, ignore_errors=True)

def test_executor_has_all_tools(temp_workspace):
    """executor角色应该有所有开发工具"""
    toolset = AgentToolset("agent-1", "executor", temp_workspace)
    assert "read_file" in toolset.available_tools
    assert "write_file" in toolset.available_tools
    assert "edit_file" in toolset.available_tools
    assert "bash" in toolset.available_tools
    assert "git_commit" in toolset.available_tools

def test_planner_has_read_only_tools(temp_workspace):
    """planner角色应该只有只读工具"""
    toolset = AgentToolset("agent-2", "planner", temp_workspace)
    assert "read_file" in toolset.available_tools
    assert "write_file" not in toolset.available_tools
    assert "bash" not in toolset.available_tools

def test_reviewer_can_run_tests(temp_workspace):
    """reviewer角色应该能运行测试"""
    toolset = AgentToolset("agent-3", "reviewer", temp_workspace)
    assert "read_file" in toolset.available_tools
    assert "bash" in toolset.available_tools
    assert "run_tests" in toolset.available_tools

def test_write_and_read_file(temp_workspace):
    """测试写入和读取文件"""
    toolset = AgentToolset("agent-4", "executor", temp_workspace)

    # 写入文件
    result = toolset.write_file("test.txt", "Hello, World!")
    assert result.success is True

    # 读取文件
    result = toolset.read_file("test.txt")
    assert result.success is True
    assert "Hello, World!" in result.output

def test_list_directory(temp_workspace):
    """测试列出目录"""
    # 创建测试文件
    with open(os.path.join(temp_workspace, "test.txt"), "w") as f:
        f.write("test")

    toolset = AgentToolset("agent-5", "executor", temp_workspace)
    result = toolset.list_directory(".")
    assert result.success is True
    assert "test.txt" in result.output

def test_run_command(temp_workspace):
    """测试执行命令"""
    toolset = AgentToolset("agent-6", "executor", temp_workspace)
    result = toolset.run_command("echo hello")
    assert result.success is True
    assert "hello" in result.output

def test_unauthorized_tool(temp_workspace):
    """测试未授权工具调用"""
    toolset = AgentToolset("agent-7", "planner", temp_workspace)

    # planner不能写入文件
    result = toolset.write_file("test.txt", "content")
    assert result.success is False
    assert "权限" in result.error

def test_get_system_prompt(temp_workspace):
    """测试获取系统提示词"""
    toolset = AgentToolset("agent-8", "executor", temp_workspace)
    prompt = toolset.get_system_prompt()
    assert "read_file" in prompt
    assert "write_file" in prompt
    assert "tool_call" in prompt
    assert "全栈开发工程师" in prompt

def test_custom_role(temp_workspace):
    """测试自定义角色（安全开发工程师）"""
    toolset = AgentToolset("agent-9", "security_dev", temp_workspace)

    # 应该继承executor的工具
    assert "write_file" in toolset.available_tools
    assert "bash" in toolset.available_tools

    # 应该有额外的安全工具
    assert "grep_content" in toolset.available_tools
    assert "run_linter" in toolset.available_tools

    # 应该有安全技能
    assert "security_audit" in toolset.skills

def test_unknown_role_has_default_tools(temp_workspace):
    """未知角色应该有默认工具集"""
    toolset = AgentToolset("agent-10", "unknown_role", temp_workspace)
    assert "read_file" in toolset.available_tools
    assert "write_file" in toolset.available_tools

def test_role_name_and_description(temp_workspace):
    """测试获取角色名称和描述"""
    toolset = AgentToolset("agent-11", "executor", temp_workspace)
    assert "全栈开发工程师" in toolset.role_name
    assert len(toolset.role_description) > 0

def test_skills_list(temp_workspace):
    """测试获取技能列表"""
    toolset = AgentToolset("agent-12", "executor", temp_workspace)
    skills = toolset.skills
    assert "frontend_dev" in skills
    assert "backend_dev" in skills

def test_skill_descriptions(temp_workspace):
    """测试获取技能描述"""
    toolset = AgentToolset("agent-13", "executor", temp_workspace)
    desc = toolset.skill_descriptions
    assert "前端开发" in desc or "frontend_dev" in desc

def test_custom_prompt_injection(temp_workspace):
    """测试自定义提示词注入"""
    toolset = AgentToolset("agent-14", "security_dev", temp_workspace)
    prompt = toolset.get_system_prompt(name="安全专家")

    # 应该包含自定义提示词内容
    assert "安全" in prompt
    assert "安全专家" in prompt

    # 应该包含工具说明
    assert "grep_content" in prompt
    assert "run_linter" in prompt


def test_load_roles_config_caching():
    """load_roles_config 应该缓存结果，文件未变化时返回同一对象"""
    from agent_toolset import invalidate_roles_config_cache

    invalidate_roles_config_cache()
    config1 = load_roles_config()
    config2 = load_roles_config()
    # 同一文件未变化时应返回缓存对象（同一引用）
    assert config1 is config2, "缓存未生效：两次调用返回不同对象"


def test_load_roles_config_cache_invalidation():
    """invalidate_roles_config_cache 后应重新加载"""
    from agent_toolset import invalidate_roles_config_cache

    invalidate_roles_config_cache()
    config1 = load_roles_config()
    invalidate_roles_config_cache()
    config2 = load_roles_config()
    # invalidate 后应返回新对象
    assert config1 is not config2, "缓存未被正确清除"


# ── 属性访问 ──

def test_agent_id_and_role(temp_workspace):
    """agent_id 和 agent_role 应返回构造时的值"""
    toolset = AgentToolset("agent-42", "executor", temp_workspace)
    assert toolset.agent_id == "agent-42"
    assert toolset.agent_role == "executor"


def test_tool_descriptions_not_empty(temp_workspace):
    """tool_descriptions 应返回非空字符串"""
    toolset = AgentToolset("agent-1", "executor", temp_workspace)
    desc = toolset.tool_descriptions
    assert isinstance(desc, str)
    assert len(desc) > 0
    assert "read_file" in desc


def test_skill_descriptions_not_empty(temp_workspace):
    """skill_descriptions 应返回非空字符串"""
    toolset = AgentToolset("agent-1", "executor", temp_workspace)
    desc = toolset.skill_descriptions
    assert isinstance(desc, str)
    assert len(desc) > 0


# ── execute 方法 ──

def test_execute_read_file(temp_workspace):
    """execute 应能执行 read_file"""
    toolset = AgentToolset("agent-1", "executor", temp_workspace)
    with open(os.path.join(temp_workspace, "test.txt"), "w") as f:
        f.write("hello")
    result = toolset.execute("read_file", {"path": "test.txt"})
    assert result.success is True
    assert result.output == "hello"


def test_execute_write_file(temp_workspace):
    """execute 应能执行 write_file"""
    toolset = AgentToolset("agent-1", "executor", temp_workspace)
    result = toolset.execute("write_file", {"path": "new.txt", "content": "world"})
    assert result.success is True
    with open(os.path.join(temp_workspace, "new.txt")) as f:
        assert f.read() == "world"


def test_execute_unknown_tool(temp_workspace):
    """execute 对未知工具应返回失败"""
    toolset = AgentToolset("agent-1", "executor", temp_workspace)
    result = toolset.execute("nonexistent_tool", {})
    assert result.success is False


# ── 系统提示词 ──

def test_get_system_prompt_with_custom_name(temp_workspace):
    """get_system_prompt 应接受自定义名称"""
    toolset = AgentToolset("agent-1", "executor", temp_workspace)
    prompt = toolset.get_system_prompt(name="超级开发")
    assert "超级开发" in prompt
