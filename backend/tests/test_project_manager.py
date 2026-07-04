import json
import os
from unittest.mock import MagicMock

import pytest
import yaml

from project_manager import (
    EMPLOYEE_STATUS_DONE,
    EMPLOYEE_STATUS_IDLE,
    EMPLOYEE_STATUS_TERMINATED,
    EMPLOYEE_STATUS_WORKING,
    PROJECT_STATUS_ARCHIVED,
    PROJECT_STATUS_ARCHIVING,
    PROJECT_STATUS_CREATED,
    PROJECT_STATUS_INSTANTIATING,
    PROJECT_STATUS_RUNNING,
    EmployeeInstance,
    Project,
    ProjectManager,
)
from skill_registry import SkillRegistry
from skill_packager import PackageResult, SkillPackager


def _create_skill_package(base_dir: str, name: str = "test-skill",
                          version: str = "1.0.0", description: str = "测试技能包"):
    """在指定目录下创建一个合法的技能包结构。"""
    skill_dir = os.path.join(base_dir, name)
    os.makedirs(os.path.join(skill_dir, "tools"), exist_ok=True)
    os.makedirs(os.path.join(skill_dir, "knowledge"), exist_ok=True)

    manifest = {
        "name": name,
        "version": version,
        "description": description,
        "required_env": ["python>=3.10"],
        "dependencies": [],
    }
    with open(os.path.join(skill_dir, "manifest.yaml"), "w", encoding="utf-8") as f:
        yaml.dump(manifest, f, allow_unicode=True)

    with open(os.path.join(skill_dir, "system_prompt.md"), "w", encoding="utf-8") as f:
        f.write("# 系统指令")

    return skill_dir


@pytest.fixture
def skill_base(tmp_path):
    """提供一个临时的基础技能库目录。"""
    return str(tmp_path / "skill_base")


@pytest.fixture
def registry(skill_base, tmp_path):
    """提供一个已注册技能包的 SkillRegistry 实例。

    Returns:
        (registry, skill_ids) 元组，skill_ids 为 {"web-frontend": id, "web-backend": id} 映射。
    """
    reg = SkillRegistry(skill_base)
    # 注册两个测试技能包
    skill_a_dir = _create_skill_package(str(tmp_path), name="web-frontend", description="前端技能")
    skill_b_dir = _create_skill_package(str(tmp_path), name="web-backend", description="后端技能")
    pkg_a = reg.register(skill_a_dir)
    pkg_b = reg.register(skill_b_dir)
    skill_ids = {
        "web-frontend": pkg_a.skill_id,
        "web-backend": pkg_b.skill_id,
    }
    return reg, skill_ids


@pytest.fixture
def projects_dir(tmp_path):
    """提供一个临时的项目存储目录。"""
    return str(tmp_path / "projects")


@pytest.fixture
def manager(projects_dir, registry):
    """提供一个空的 ProjectManager 实例。"""
    reg, _ = registry
    return ProjectManager(projects_dir, reg)


@pytest.fixture
def sample_dag(registry):
    """提供一个使用实际 skill_id 的示例 DAG。"""
    _, skill_ids = registry
    return {
        "tasks": [
            {
                "task_id": "task-1",
                "name": "前端开发",
                "required_skills": [skill_ids["web-frontend"]],
                "description": "开发用户界面",
            },
            {
                "task_id": "task-2",
                "name": "后端开发",
                "required_skills": [skill_ids["web-backend"]],
                "description": "开发 API 接口",
            },
        ]
    }


class TestProjectCreation:
    """测试项目创建功能。"""

    def test_create_project_returns_project(self, manager):
        """创建项目应返回 Project 对象。"""
        project = manager.create_project("测试项目", {"language": "zh"})

        assert isinstance(project, Project)
        assert project.name == "测试项目"
        assert project.brief == {"language": "zh"}
        assert project.status == PROJECT_STATUS_CREATED
        assert project.project_id  # uuid 不为空
        assert project.created_at  # 时间戳不为空

    def test_create_project_generates_unique_ids(self, manager):
        """多次创建应生成不同的 project_id。"""
        p1 = manager.create_project("项目A", {})
        p2 = manager.create_project("项目B", {})

        assert p1.project_id != p2.project_id

    def test_create_project_directory_structure(self, manager, projects_dir):
        """创建项目后应生成正确的目录结构。"""
        project = manager.create_project("目录测试", {})
        project_dir = os.path.join(projects_dir, project.project_id)

        assert os.path.isdir(project_dir)
        assert os.path.isfile(os.path.join(project_dir, "metadata.json"))
        assert os.path.isfile(os.path.join(project_dir, "brief.json"))
        assert os.path.isfile(os.path.join(project_dir, "dag.json"))
        assert os.path.isdir(os.path.join(project_dir, "employees"))
        assert os.path.isdir(os.path.join(project_dir, "logs"))

    def test_create_project_brief_persisted(self, manager, projects_dir):
        """项目简报应正确持久化到 brief.json。"""
        brief = {"language": "zh", "style": "formal"}
        project = manager.create_project("持久化测试", brief)

        brief_path = os.path.join(projects_dir, project.project_id, "brief.json")
        with open(brief_path, encoding="utf-8") as f:
            saved_brief = json.load(f)

        assert saved_brief == brief


class TestProjectInstantiation:
    """测试项目实例化（DAG → 员工实例 + 技能克隆）功能。"""

    def test_instantiate_creates_employees(self, manager, sample_dag):
        """实例化项目应为每个任务的每个技能创建员工实例。"""
        project = manager.create_project("实例化测试", {})
        employees = manager.instantiate_project(project.project_id, sample_dag)

        # 2 个任务各 1 个技能 → 2 个员工
        assert len(employees) == 2
        for emp in employees:
            assert isinstance(emp, EmployeeInstance)
            assert emp.employee_id
            assert emp.status == EMPLOYEE_STATUS_IDLE

    def test_instantiate_clones_skill_packages(self, manager, sample_dag):
        """实例化应克隆技能包到员工目录。"""
        project = manager.create_project("技能克隆测试", {})
        employees = manager.instantiate_project(project.project_id, sample_dag)

        for emp in employees:
            # 基础技能包路径应存在
            assert os.path.isdir(emp.base_skill_path)
            assert os.path.isfile(os.path.join(emp.base_skill_path, "manifest.yaml"))

            # 增量区路径应存在
            assert os.path.isdir(emp.incremental_path)
            assert os.path.isdir(os.path.join(emp.incremental_path, "rules"))
            assert os.path.isdir(os.path.join(emp.incremental_path, "tools"))
            assert os.path.isdir(os.path.join(emp.incremental_path, "knowledge_add"))

    def test_instantiate_updates_project_status(self, manager, sample_dag):
        """实例化后项目状态应变为 running。"""
        project = manager.create_project("状态测试", {})
        manager.instantiate_project(project.project_id, sample_dag)

        reloaded = manager.get_project(project.project_id)
        assert reloaded.status == PROJECT_STATUS_RUNNING

    def test_instantiate_records_task_history(self, manager, sample_dag):
        """实例化后员工应有任务历史记录。"""
        project = manager.create_project("历史测试", {})
        employees = manager.instantiate_project(project.project_id, sample_dag)

        for emp in employees:
            assert len(emp.task_history) == 1
            assert "task_id" in emp.task_history[0]
            assert "assigned_at" in emp.task_history[0]

    def test_instantiate_populates_skill_packages(self, manager, sample_dag):
        """实例化后项目应包含关联的技能包信息。"""
        project = manager.create_project("技能包信息测试", {})
        manager.instantiate_project(project.project_id, sample_dag)

        reloaded = manager.get_project(project.project_id)
        assert len(reloaded.skill_packages) == 2
        skill_names = {sp["name"] for sp in reloaded.skill_packages}
        assert "web-frontend" in skill_names
        assert "web-backend" in skill_names

    def test_instantiate_invalid_dag_raises(self, manager):
        """非法 DAG 应抛出 ValueError。"""
        project = manager.create_project("非法DAG测试", {})

        with pytest.raises(ValueError, match="DAG 格式不合法"):
            manager.instantiate_project(project.project_id, {"tasks": "not-a-list"})

        with pytest.raises(ValueError, match="DAG 格式不合法"):
            manager.instantiate_project(project.project_id, {})

    def test_instantiate_nonexistent_project_raises(self, manager, sample_dag):
        """对不存在的项目实例化应抛出 KeyError。"""
        with pytest.raises(KeyError, match="项目不存在"):
            manager.instantiate_project("nonexistent-id", sample_dag)

    def test_instantiate_persists_after_reload(self, projects_dir, registry, sample_dag):
        """实例化后的项目数据应在重新加载后保持。"""
        reg, _ = registry
        manager1 = ProjectManager(projects_dir, reg)
        project = manager1.create_project("持久化实例化测试", {})
        employees = manager1.instantiate_project(project.project_id, sample_dag)
        emp_ids = {e.employee_id for e in employees}

        # 重新创建管理器（模拟重启）
        manager2 = ProjectManager(projects_dir, reg)
        reloaded = manager2.get_project(project.project_id)
        assert reloaded.status == PROJECT_STATUS_RUNNING
        assert len(reloaded.employees) == 2
        reloaded_ids = {e.employee_id for e in reloaded.employees}
        assert reloaded_ids == emp_ids


class TestProjectStatus:
    """测试项目状态查询功能。"""

    def test_get_project_status_basic(self, manager, sample_dag):
        """状态查询应包含基本字段。"""
        project = manager.create_project("状态查询测试", {})
        manager.instantiate_project(project.project_id, sample_dag)

        status = manager.get_project_status(project.project_id)

        assert status["project_id"] == project.project_id
        assert status["name"] == "状态查询测试"
        assert status["status"] == PROJECT_STATUS_RUNNING
        assert status["employee_count"] == 2

    def test_task_stats(self, manager, sample_dag):
        """任务统计应反映员工状态。"""
        project = manager.create_project("任务统计测试", {})
        employees = manager.instantiate_project(project.project_id, sample_dag)

        # 更新一个员工为 done
        manager.update_employee_status(
            project.project_id, employees[0].employee_id, EMPLOYEE_STATUS_DONE
        )

        status = manager.get_project_status(project.project_id)
        assert status["task_stats"]["total"] == 2
        assert status["task_stats"]["completed"] == 1
        assert status["task_stats"]["failed"] == 0

    def test_iteration_stats_default(self, manager, sample_dag):
        """无执行日志时迭代统计应为零。"""
        project = manager.create_project("迭代统计测试", {})
        manager.instantiate_project(project.project_id, sample_dag)

        status = manager.get_project_status(project.project_id)
        assert status["iteration_stats"]["total_iterations"] == 0
        assert status["iteration_stats"]["avg_iterations_per_task"] == 0.0

    def test_iteration_stats_with_logs(self, manager, sample_dag):
        """有执行日志时应正确统计迭代次数。"""
        project = manager.create_project("迭代日志测试", {})
        employees = manager.instantiate_project(project.project_id, sample_dag)

        # 模拟添加迭代日志
        for _ in range(3):
            manager.add_execution_log(
                project.project_id,
                employees[0].employee_id,
                {"type": "iteration", "task_id": "task-1", "result": "ok"},
            )
        for _ in range(2):
            manager.add_execution_log(
                project.project_id,
                employees[1].employee_id,
                {"type": "iteration", "task_id": "task-2", "result": "ok"},
            )

        status = manager.get_project_status(project.project_id)
        assert status["iteration_stats"]["total_iterations"] == 5
        assert status["iteration_stats"]["avg_iterations_per_task"] == 2.5

    def test_skill_increment_stats(self, manager, sample_dag):
        """技能增量统计应正确计算。"""
        project = manager.create_project("增量统计测试", {})
        employees = manager.instantiate_project(project.project_id, sample_dag)

        manager.add_execution_log(
            project.project_id,
            employees[0].employee_id,
            {"type": "skill_increment", "rules_count": 5, "approved_count": 3},
        )
        manager.add_execution_log(
            project.project_id,
            employees[1].employee_id,
            {"type": "skill_increment", "rules_count": 2, "approved_count": 2},
        )

        status = manager.get_project_status(project.project_id)
        assert status["skill_increment_stats"]["total_rules"] == 7
        assert status["skill_increment_stats"]["approved_rules"] == 5

    def test_get_project_status_nonexistent_raises(self, manager):
        """查询不存在的项目状态应抛出 KeyError。"""
        with pytest.raises(KeyError, match="项目不存在"):
            manager.get_project_status("nonexistent-id")


class TestProjectArchive:
    """测试项目归档功能。"""

    def test_archive_project_success(self, manager, sample_dag):
        """归档项目应成功并返回归档信息。"""
        project = manager.create_project("归档测试", {})
        employees = manager.instantiate_project(project.project_id, sample_dag)

        result = manager.archive_project(project.project_id)

        assert result["project_id"] == project.project_id
        assert isinstance(result["skill_packages"], list)
        assert len(result["skill_packages"]) == 2
        assert "logs_path" in result
        assert os.path.isdir(result["logs_path"])

    def test_archive_updates_status(self, manager, sample_dag):
        """归档后项目状态应变为 archived。"""
        project = manager.create_project("归档状态测试", {})
        manager.instantiate_project(project.project_id, sample_dag)
        manager.archive_project(project.project_id)

        reloaded = manager.get_project(project.project_id)
        assert reloaded.status == PROJECT_STATUS_ARCHIVED

    def test_archive_clears_employees(self, manager, sample_dag):
        """归档后员工实例应被清除。"""
        project = manager.create_project("归档清除测试", {})
        manager.instantiate_project(project.project_id, sample_dag)

        assert len(project.employees) == 2

        manager.archive_project(project.project_id)

        reloaded = manager.get_project(project.project_id)
        assert len(reloaded.employees) == 0

    def test_archive_preserves_execution_logs(self, manager, sample_dag, projects_dir):
        """归档后执行日志应被保存到 logs 目录。"""
        project = manager.create_project("归档日志测试", {})
        employees = manager.instantiate_project(project.project_id, sample_dag)

        manager.add_execution_log(
            project.project_id,
            employees[0].employee_id,
            {"type": "test", "message": "测试日志"},
        )

        result = manager.archive_project(project.project_id)
        logs_path = result["logs_path"]

        logs_file = os.path.join(logs_path, "execution_logs.json")
        assert os.path.isfile(logs_file)

        with open(logs_file, encoding="utf-8") as f:
            saved_logs = json.load(f)
        assert len(saved_logs) == 1
        assert saved_logs[0]["message"] == "测试日志"

    def test_archive_nonexistent_raises(self, manager):
        """归档不存在的项目应抛出 KeyError。"""
        with pytest.raises(KeyError, match="项目不存在"):
            manager.archive_project("nonexistent-id")


class TestProjectList:
    """测试项目列表功能。"""

    def test_list_empty(self, manager):
        """无项目时应返回空列表。"""
        assert manager.list_projects() == []

    def test_list_after_create(self, manager):
        """创建项目后列表应包含对应项目。"""
        manager.create_project("项目A", {})
        manager.create_project("项目B", {})

        projects = manager.list_projects()
        assert len(projects) == 2
        names = {p["name"] for p in projects}
        assert names == {"项目A", "项目B"}

    def test_list_contains_expected_fields(self, manager):
        """列表条目应包含必要字段。"""
        manager.create_project("字段测试", {})

        projects = manager.list_projects()
        entry = projects[0]

        assert "project_id" in entry
        assert "name" in entry
        assert "status" in entry
        assert "created_at" in entry

    def test_list_persists_after_reload(self, projects_dir, registry):
        """项目列表应在重新加载后保持。"""
        reg, _ = registry
        manager1 = ProjectManager(projects_dir, reg)
        manager1.create_project("持久化列表测试", {})

        manager2 = ProjectManager(projects_dir, reg)
        projects = manager2.list_projects()

        assert len(projects) == 1
        assert projects[0]["name"] == "持久化列表测试"


class TestGetProject:
    """测试项目详情获取。"""

    def test_get_project_success(self, manager):
        """获取已创建的项目详情应成功。"""
        project = manager.create_project("详情测试", {"key": "value"})

        retrieved = manager.get_project(project.project_id)

        assert retrieved.project_id == project.project_id
        assert retrieved.name == "详情测试"
        assert retrieved.brief == {"key": "value"}

    def test_get_project_nonexistent_raises(self, manager):
        """获取不存在的项目应抛出 KeyError。"""
        with pytest.raises(KeyError, match="项目不存在"):
            manager.get_project("nonexistent-id")


class TestEmployeeStatusUpdate:
    """测试员工状态更新功能。"""

    def test_update_status_success(self, manager, sample_dag):
        """更新员工状态应成功。"""
        project = manager.create_project("员工状态测试", {})
        employees = manager.instantiate_project(project.project_id, sample_dag)

        manager.update_employee_status(
            project.project_id, employees[0].employee_id, EMPLOYEE_STATUS_WORKING
        )

        reloaded = manager.get_project(project.project_id)
        emp = next(
            e for e in reloaded.employees
            if e.employee_id == employees[0].employee_id
        )
        assert emp.status == EMPLOYEE_STATUS_WORKING

    def test_update_status_invalid_value_raises(self, manager, sample_dag):
        """无效状态值应抛出 ValueError。"""
        project = manager.create_project("无效状态测试", {})
        employees = manager.instantiate_project(project.project_id, sample_dag)

        with pytest.raises(ValueError, match="无效的员工状态"):
            manager.update_employee_status(
                project.project_id, employees[0].employee_id, "invalid_status"
            )

    def test_update_status_nonexistent_employee_raises(self, manager, sample_dag):
        """更新不存在的员工状态应抛出 KeyError。"""
        project = manager.create_project("不存在员工测试", {})
        manager.instantiate_project(project.project_id, sample_dag)

        with pytest.raises(KeyError, match="员工不存在"):
            manager.update_employee_status(
                project.project_id, "nonexistent-emp", EMPLOYEE_STATUS_DONE
            )


class TestExecutionLog:
    """测试执行日志功能。"""

    def test_add_execution_log(self, manager, sample_dag):
        """添加执行日志应成功。"""
        project = manager.create_project("日志测试", {})
        employees = manager.instantiate_project(project.project_id, sample_dag)

        log_entry = {"type": "task_result", "result": "success", "output": "完成"}
        manager.add_execution_log(
            project.project_id, employees[0].employee_id, log_entry
        )

        reloaded = manager.get_project(project.project_id)
        assert len(reloaded.execution_logs) == 1

        saved_log = reloaded.execution_logs[0]
        assert saved_log["type"] == "task_result"
        assert saved_log["employee_id"] == employees[0].employee_id
        assert saved_log["project_id"] == project.project_id
        assert "timestamp" in saved_log

    def test_add_execution_log_updates_task_history(self, manager, sample_dag):
        """添加执行日志应同时更新员工的 task_history。"""
        project = manager.create_project("历史更新测试", {})
        employees = manager.instantiate_project(project.project_id, sample_dag)

        # 实例化时已有 1 条 task_history
        assert len(employees[0].task_history) == 1

        manager.add_execution_log(
            project.project_id,
            employees[0].employee_id,
            {"type": "test", "result": "ok"},
        )

        reloaded = manager.get_project(project.project_id)
        emp = next(
            e for e in reloaded.employees
            if e.employee_id == employees[0].employee_id
        )
        # 现在应有 2 条（1 条初始 + 1 条新日志）
        assert len(emp.task_history) == 2

    def test_add_multiple_logs(self, manager, sample_dag):
        """应能添加多条日志。"""
        project = manager.create_project("多日志测试", {})
        employees = manager.instantiate_project(project.project_id, sample_dag)

        for i in range(5):
            manager.add_execution_log(
                project.project_id,
                employees[0].employee_id,
                {"type": "iteration", "index": i},
            )

        reloaded = manager.get_project(project.project_id)
        assert len(reloaded.execution_logs) == 5


@pytest.fixture
def mock_skill_packager(tmp_path):
    """提供一个模拟的 SkillPackager 实例。"""
    packager = MagicMock(spec=SkillPackager)
    output_dir = str(tmp_path / "packages")

    def _full_package(base_skill_path, incremental_path, project_id, skill_name):
        return PackageResult(
            package_path=os.path.join(output_dir, f"{project_id}_{skill_name}.zip"),
            readme_content="# Test README",
            desensitize_report=[],
            diff_summary={"new_files": [], "modified_files": [], "new_rules": []},
            skill_name=skill_name,
            base_version="1.0.0",
            output_version="1.1.0",
        )

    packager.full_package = MagicMock(side_effect=_full_package)
    return packager


@pytest.fixture
def manager_with_packager(projects_dir, registry, mock_skill_packager):
    """提供一个带有 SkillPackager 的 ProjectManager 实例。"""
    reg, _ = registry
    return ProjectManager(projects_dir, reg, skill_packager=mock_skill_packager)


class TestArchiveWithSkillPackager:
    """测试归档流程中 SkillPackager 集成。"""

    def test_archive_triggers_packaging(self, manager_with_packager, sample_dag,
                                        mock_skill_packager):
        """归档项目应触发 SkillPackager 为每个员工打包。"""
        project = manager_with_packager.create_project("打包测试", {})
        employees = manager_with_packager.instantiate_project(
            project.project_id, sample_dag
        )

        result = manager_with_packager.archive_project(project.project_id)

        # 应调用 full_package 两次（每个员工一次）
        assert mock_skill_packager.full_package.call_count == 2

        # 验证调用参数
        call_args_list = mock_skill_packager.full_package.call_args_list
        called_employee_ids = set()
        for call in call_args_list:
            kwargs = call.kwargs
            assert kwargs["project_id"] == project.project_id
            assert kwargs["skill_name"].startswith("skill-")
            called_employee_ids.add(kwargs["base_skill_path"])

        # 每个员工应有不同的 base_skill_path
        assert len(called_employee_ids) == 2

    def test_archive_returns_package_results(self, manager_with_packager, sample_dag):
        """归档结果应包含 package_results 字段。"""
        project = manager_with_packager.create_project("结果测试", {})
        manager_with_packager.instantiate_project(project.project_id, sample_dag)

        result = manager_with_packager.archive_project(project.project_id)

        assert "package_results" in result
        assert len(result["package_results"]) == 2

        for pkg_result in result["package_results"]:
            assert "employee_id" in pkg_result
            assert "package_path" in pkg_result
            assert "diff_summary" in pkg_result
            assert "error" not in pkg_result

    def test_archive_package_failure_does_not_block(self, projects_dir, registry,
                                                    sample_dag):
        """打包失败不应阻止归档流程。"""
        reg, _ = registry
        failing_packager = MagicMock(spec=SkillPackager)
        failing_packager.full_package = MagicMock(
            side_effect=RuntimeError("模拟打包失败")
        )
        manager = ProjectManager(projects_dir, reg, skill_packager=failing_packager)

        project = manager.create_project("失败测试", {})
        employees = manager.instantiate_project(project.project_id, sample_dag)

        # 归档应成功完成，不抛出异常
        result = manager.archive_project(project.project_id)

        assert result["project_id"] == project.project_id
        assert result["logs_path"]
        assert "package_results" in result

        # 两个打包都应失败，结果中包含 error
        assert len(result["package_results"]) == 2
        for pkg_result in result["package_results"]:
            assert "error" in pkg_result
            assert "模拟打包失败" in pkg_result["error"]

        # 项目状态应正常变为 archived
        reloaded = manager.get_project(project.project_id)
        assert reloaded.status == PROJECT_STATUS_ARCHIVED

    def test_archive_without_packager_returns_empty_results(self, manager, sample_dag):
        """无 skill_packager 时归档应返回空 package_results。"""
        project = manager.create_project("无打包器测试", {})
        manager.instantiate_project(project.project_id, sample_dag)

        result = manager.archive_project(project.project_id)

        assert "package_results" in result
        assert result["package_results"] == []

    def test_archive_partial_packaging_failure(self, projects_dir, registry, sample_dag):
        """部分员工打包失败时，成功的应保留结果，失败的应记录错误。"""
        reg, skill_ids = registry

        # 获取 skill_id
        frontend_id = skill_ids["web-frontend"]
        backend_id = skill_ids["web-backend"]

        call_count = 0

        def _selective_package(base_skill_path, incremental_path,
                               project_id, skill_name):
            nonlocal call_count
            call_count += 1
            # 第一次调用成功，第二次失败
            if call_count == 1:
                return PackageResult(
                    package_path="/tmp/test.zip",
                    readme_content="# Test",
                    desensitize_report=[],
                    diff_summary={"new_files": [], "modified_files": [], "new_rules": []},
                    skill_name=skill_name,
                    base_version="1.0.0",
                    output_version="1.1.0",
                )
            raise RuntimeError("部分打包失败")

        partial_packager = MagicMock(spec=SkillPackager)
        partial_packager.full_package = MagicMock(side_effect=_selective_package)
        manager = ProjectManager(projects_dir, reg, skill_packager=partial_packager)

        project = manager.create_project("部分失败测试", {})
        manager.instantiate_project(project.project_id, sample_dag)

        result = manager.archive_project(project.project_id)

        assert len(result["package_results"]) == 2

        successes = [r for r in result["package_results"] if "package_path" in r]
        failures = [r for r in result["package_results"] if "error" in r]
        assert len(successes) == 1
        assert len(failures) == 1
        assert "部分打包失败" in failures[0]["error"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
