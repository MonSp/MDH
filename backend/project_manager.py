"""项目生命周期管理 - 管理项目的创建、实例化、状态查询和归档。

每个项目包含多个员工实例（EmployeeInstance），每个员工绑定一组技能包。
技能包通过 SkillRegistry 克隆，形成只读基础库 + 可写增量区的结构。
"""

import datetime
import json
import logging
import os
import shutil
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Optional

from skill_registry import SkillRegistry
from skill_packager import SkillPackager

logger = logging.getLogger(__name__)

# 项目状态常量
PROJECT_STATUS_CREATED = "created"
PROJECT_STATUS_INSTANTIATING = "instantiating"
PROJECT_STATUS_RUNNING = "running"
PROJECT_STATUS_ARCHIVING = "archiving"
PROJECT_STATUS_ARCHIVED = "archived"
PROJECT_STATUS_FAILED = "failed"

# 员工状态常量
EMPLOYEE_STATUS_IDLE = "idle"
EMPLOYEE_STATUS_WORKING = "working"
EMPLOYEE_STATUS_DONE = "done"
EMPLOYEE_STATUS_TERMINATED = "terminated"


@dataclass
class EmployeeInstance:
    """员工实例，代表一个负责特定任务的智能体。"""

    employee_id: str
    agent_id: str
    skill_id: str
    base_skill_path: str        # 只读基础技能包路径
    incremental_path: str       # 可写增量区路径
    status: str                 # idle / working / done / terminated
    task_history: list = field(default_factory=list)    # 任务执行历史


@dataclass
class Project:
    """项目数据类，描述一个完整的项目实例。"""

    project_id: str
    name: str
    status: str                 # created / instantiating / running / archiving / archived / failed
    brief: dict                 # 项目简报（用户偏好、约束条件）
    created_at: str
    category: str = ""          # 项目分类（如 "软件开发", "AI影视", "数据分析" 等）
    skill_packages: list = field(default_factory=list)   # 关联的技能包信息
    employees: list = field(default_factory=list)        # EmployeeInstance 列表
    execution_logs: list = field(default_factory=list)   # 执行日志
    dag: dict = field(default_factory=dict)              # 任务依赖图


class ProjectManager:
    """项目生命周期管理器。

    负责项目的创建、实例化（基于 DAG 生成员工实例并克隆技能包）、
    状态查询、执行日志记录和归档。

    Args:
        projects_dir: 项目存储根目录。
        skill_registry: 技能注册中心实例。
        skill_packager: 技能打包器实例（可选），用于归档时触发技能打包。
    """

    def __init__(self, projects_dir: str, skill_registry: SkillRegistry,
                 skill_packager: Optional[SkillPackager] = None):
        """初始化项目管理器。

        Args:
            projects_dir: 项目存储根目录。
            skill_registry: 技能注册中心实例。
            skill_packager: 技能打包器实例（可选），用于归档时触发技能打包。
        """
        self._projects_dir = Path(projects_dir)
        self._projects_dir.mkdir(parents=True, exist_ok=True)
        self._skill_registry = skill_registry
        self._skill_packager = skill_packager
        # 内存索引：project_id -> Project
        self._projects: dict[str, Project] = {}
        # 加载已有项目
        self._load_existing()

    def _load_existing(self) -> None:
        """扫描 projects_dir 目录，加载已有的项目。"""
        for entry in self._projects_dir.iterdir():
            if not entry.is_dir():
                continue
            metadata_path = entry / "metadata.json"
            if not metadata_path.exists():
                continue
            try:
                with open(metadata_path, "r", encoding="utf-8") as f:
                    metadata = json.load(f)
                project = self._metadata_to_project(metadata, entry)
                self._projects[project.project_id] = project
            except Exception as e:
                logger.warning("跳过无效项目 %s: %s", entry.name, e)

    def _metadata_to_project(self, metadata: dict, project_dir: Path) -> Project:
        """从元数据字典构建 Project 对象。"""
        employees = []
        for emp_data in metadata.get("employees", []):
            employees.append(EmployeeInstance(**emp_data))

        return Project(
            project_id=metadata["project_id"],
            name=metadata["name"],
            status=metadata["status"],
            brief=metadata.get("brief", {}),
            created_at=metadata.get("created_at", ""),
            category=metadata.get("category", ""),
            skill_packages=metadata.get("skill_packages", []),
            employees=employees,
            execution_logs=metadata.get("execution_logs", []),
            dag=metadata.get("dag", {}),
        )

    def _save_project(self, project: Project) -> None:
        """将项目数据持久化到磁盘。"""
        project_dir = self._projects_dir / project.project_id
        project_dir.mkdir(parents=True, exist_ok=True)

        metadata = self._project_to_metadata(project)
        metadata_path = project_dir / "metadata.json"
        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)

    def _project_to_metadata(self, project: Project) -> dict:
        """将 Project 对象转为可序列化的字典。"""
        return {
            "project_id": project.project_id,
            "name": project.name,
            "status": project.status,
            "brief": project.brief,
            "created_at": project.created_at,
            "category": project.category,
            "skill_packages": project.skill_packages,
            "employees": [asdict(e) for e in project.employees],
            "execution_logs": project.execution_logs,
            "dag": project.dag,
        }

    def _get_project_dir(self, project_id: str) -> Path:
        """获取项目目录路径。"""
        return self._projects_dir / project_id

    def _get_or_raise(self, project_id: str) -> Project:
        """获取项目，不存在则抛出 KeyError。"""
        if project_id not in self._projects:
            raise KeyError(f"项目不存在: {project_id}")
        return self._projects[project_id]

    def create_project(self, name: str, brief: dict) -> Project:
        """创建新项目。

        生成唯一 project_id (uuid)，创建项目目录结构：
        projects_dir/{project_id}/
        ├── metadata.json       # 项目元数据
        ├── brief.json          # 项目简报
        ├── dag.json            # 任务依赖图
        ├── employees/          # 员工实例目录
        └── logs/               # 执行日志

        Args:
            name: 项目名称。
            brief: 项目简报（用户偏好、约束条件等）。

        Returns:
            创建的 Project 对象。
        """
        project_id = str(uuid.uuid4())
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()

        project = Project(
            project_id=project_id,
            name=name,
            status=PROJECT_STATUS_CREATED,
            brief=brief,
            created_at=now,
        )

        # 创建项目目录结构
        project_dir = self._get_project_dir(project_id)
        project_dir.mkdir(parents=True, exist_ok=True)
        (project_dir / "employees").mkdir(exist_ok=True)
        (project_dir / "logs").mkdir(exist_ok=True)

        # 写入 brief.json
        brief_path = project_dir / "brief.json"
        with open(brief_path, "w", encoding="utf-8") as f:
            json.dump(brief, f, ensure_ascii=False, indent=2)

        # 写入 dag.json（空占位）
        dag_path = project_dir / "dag.json"
        with open(dag_path, "w", encoding="utf-8") as f:
            json.dump({}, f, ensure_ascii=False, indent=2)

        # 持久化并索引
        self._save_project(project)
        self._projects[project_id] = project

        logger.info("已创建项目: %s (%s)", name, project_id)
        return project

    def create_lightweight_project(self, name: str, brief: dict) -> Project:
        """创建轻量项目容器（不实例化员工）。

        仅创建项目目录和 metadata.json，不创建 employees/ 和 logs/ 目录，
        不调用 SkillRegistry.clone()。项目 brief 中标记 mode='lightweight'。

        Args:
            name: 项目名称。
            brief: 项目简报。

        Returns:
            创建的 Project 对象。
        """
        project_id = str(uuid.uuid4())
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()

        lightweight_brief = {**brief, "mode": "lightweight"}

        project = Project(
            project_id=project_id,
            name=name,
            status=PROJECT_STATUS_RUNNING,  # 直接标记为运行中
            brief=lightweight_brief,
            created_at=now,
        )

        # 仅创建项目目录和 metadata.json
        project_dir = self._get_project_dir(project_id)
        project_dir.mkdir(parents=True, exist_ok=True)

        # 持久化并索引
        self._save_project(project)
        self._projects[project_id] = project

        logger.info("已创建轻量项目: %s (%s)", name, project_id)
        return project

    def instantiate_project(self, project_id: str, dag: dict) -> list:
        """根据 DAG 实例化项目。

        Args:
            project_id: 项目 ID。
            dag: 任务依赖图，格式：
                {
                    "tasks": [
                        {
                            "task_id": "task-1",
                            "name": "前端开发",
                            "required_skills": ["web-frontend"],
                            "description": "..."
                        }
                    ]
                }

        Returns:
            创建的 EmployeeInstance 列表。

        Raises:
            KeyError: 项目不存在。
            ValueError: DAG 格式不合法。
        """
        project = self._get_or_raise(project_id)

        tasks = dag.get("tasks")
        if not isinstance(tasks, list):
            raise ValueError("DAG 格式不合法: 'tasks' 应为列表")

        # 更新状态为 instantiating
        project.status = PROJECT_STATUS_INSTANTIATING
        project.dag = dag
        self._save_project(project)

        project_dir = self._get_project_dir(project_id)
        employees_dir = project_dir / "employees"
        employees: list[EmployeeInstance] = []
        skill_packages: list[dict] = []

        try:
            for task in tasks:
                task_id = task.get("task_id", "")
                task_name = task.get("name", "")
                required_skills = task.get("required_skills", [])
                description = task.get("description", "")

                for skill_id in required_skills:
                    employee_id = str(uuid.uuid4())
                    agent_id = f"agent-{task_id}-{skill_id}"

                    # 为每个员工创建独立的技能克隆目录
                    skill_clone_dir = str(employees_dir / employee_id / "skill")

                    # 通过 SkillRegistry 克隆技能包
                    base_skill_path = self._skill_registry.clone(skill_id, skill_clone_dir)
                    incremental_path = os.path.join(skill_clone_dir, "incremental")

                    emp = EmployeeInstance(
                        employee_id=employee_id,
                        agent_id=agent_id,
                        skill_id=skill_id,
                        base_skill_path=base_skill_path,
                        incremental_path=incremental_path,
                        status=EMPLOYEE_STATUS_IDLE,
                        task_history=[{
                            "task_id": task_id,
                            "task_name": task_name,
                            "description": description,
                            "assigned_at": datetime.datetime.now(
                                datetime.timezone.utc
                            ).isoformat(),
                        }],
                    )
                    employees.append(emp)

                    skill_pkg = self._skill_registry.get_skill(skill_id)
                    skill_packages.append({
                        "skill_id": skill_id,
                        "name": skill_pkg.name,
                        "version": skill_pkg.version,
                        "task_id": task_id,
                        "employee_id": employee_id,
                    })

                    logger.info(
                        "为任务 %s 创建员工 %s，技能包 %s",
                        task_id, employee_id, skill_id,
                    )

            project.employees = employees
            project.skill_packages = skill_packages
            project.status = PROJECT_STATUS_RUNNING
            self._save_project(project)

            logger.info(
                "项目 %s 实例化完成，共创建 %d 个员工实例",
                project_id, len(employees),
            )
            return employees

        except Exception as e:
            project.status = PROJECT_STATUS_FAILED
            self._save_project(project)
            logger.error("项目 %s 实例化失败: %s", project_id, e)
            raise

    def get_project_status(self, project_id: str) -> dict:
        """获取项目状态概览。

        Args:
            project_id: 项目 ID。

        Returns:
            项目状态字典，包含：
            - project_id: 项目 ID
            - name: 项目名称
            - status: 项目状态
            - employee_count: 员工数量
            - task_stats: 任务统计
            - iteration_stats: 迭代统计
            - skill_increment_stats: 技能增量统计

        Raises:
            KeyError: 项目不存在。
        """
        project = self._get_or_raise(project_id)

        employees = project.employees

        # 任务统计：基于员工状态
        total_tasks = len(employees)
        completed_tasks = sum(
            1 for e in employees if e.status == EMPLOYEE_STATUS_DONE
        )
        failed_tasks = sum(
            1 for e in employees if e.status == EMPLOYEE_STATUS_TERMINATED
        )

        # 迭代统计：从执行日志中提取
        total_iterations = 0
        task_iteration_counts: dict[str, int] = {}
        for log in project.execution_logs:
            if log.get("type") == "iteration":
                task_id = log.get("task_id", "unknown")
                task_iteration_counts[task_id] = task_iteration_counts.get(task_id, 0) + 1
                total_iterations += 1

        avg_iterations = (
            round(total_iterations / len(task_iteration_counts), 2)
            if task_iteration_counts
            else 0.0
        )

        # 技能增量统计：从执行日志中提取
        total_rules = 0
        approved_rules = 0
        for log in project.execution_logs:
            if log.get("type") == "skill_increment":
                total_rules += log.get("rules_count", 0)
                approved_rules += log.get("approved_count", 0)

        return {
            "project_id": project.project_id,
            "name": project.name,
            "status": project.status,
            "employee_count": len(employees),
            "task_stats": {
                "total": total_tasks,
                "completed": completed_tasks,
                "failed": failed_tasks,
            },
            "iteration_stats": {
                "total_iterations": total_iterations,
                "avg_iterations_per_task": avg_iterations,
            },
            "skill_increment_stats": {
                "total_rules": total_rules,
                "approved_rules": approved_rules,
            },
        }

    def archive_project(self, project_id: str) -> dict:
        """归档项目。

        流程：
        1. 更新状态为 archiving
        2. 收集所有员工的增量区路径
        3. 保留执行日志到 logs/
        4. 对每个员工触发技能打包（如果 skill_packager 可用）
        5. 销毁员工实例记录
        6. 更新状态为 archived

        Args:
            project_id: 项目 ID。

        Returns:
            归档信息字典，包含 project_id、skill_packages、logs_path、package_results。

        Raises:
            KeyError: 项目不存在。
        """
        project = self._get_or_raise(project_id)

        # 更新状态为 archiving
        project.status = PROJECT_STATUS_ARCHIVING
        self._save_project(project)

        project_dir = self._get_project_dir(project_id)
        logs_dir = project_dir / "logs"
        logs_dir.mkdir(exist_ok=True)

        # 保留执行日志到 logs/
        if project.execution_logs:
            logs_path = logs_dir / "execution_logs.json"
            with open(logs_path, "w", encoding="utf-8") as f:
                json.dump(project.execution_logs, f, ensure_ascii=False, indent=2)
            logger.info("执行日志已保存到 %s", logs_path)

        # 收集增量区路径信息
        incremental_info = []
        for emp in project.employees:
            incremental_info.append({
                "employee_id": emp.employee_id,
                "skill_id": emp.skill_id,
                "incremental_path": emp.incremental_path,
            })

        # 归档增量区信息
        incremental_path = logs_dir / "incremental_areas.json"
        with open(incremental_path, "w", encoding="utf-8") as f:
            json.dump(incremental_info, f, ensure_ascii=False, indent=2)

        # 对每个员工的技能包执行打包
        package_results = []
        for emp in project.employees:
            if self._skill_packager and emp.base_skill_path and emp.incremental_path:
                try:
                    result = self._skill_packager.full_package(
                        base_skill_path=emp.base_skill_path,
                        incremental_path=emp.incremental_path,
                        project_id=project_id,
                        skill_name=f"skill-{emp.skill_id}",
                    )
                    package_results.append({
                        "employee_id": emp.employee_id,
                        "package_path": result.package_path,
                        "diff_summary": result.diff_summary,
                    })
                except Exception as e:
                    logger.warning(
                        "员工 %s 技能打包失败: %s", emp.employee_id, e,
                    )
                    package_results.append({
                        "employee_id": emp.employee_id,
                        "error": str(e),
                    })

        # 销毁员工实例记录
        project.employees = []
        project.status = PROJECT_STATUS_ARCHIVED
        self._save_project(project)

        logger.info("项目 %s 已归档", project_id)

        return {
            "project_id": project.project_id,
            "skill_packages": project.skill_packages,
            "logs_path": str(logs_dir),
            "package_results": package_results,
        }

    def list_projects(self) -> list:
        """返回所有项目列表。

        Returns:
            项目摘要列表，每个元素包含 project_id、name、status、created_at、category。
        """
        return [
            {
                "project_id": p.project_id,
                "name": p.name,
                "status": p.status,
                "created_at": p.created_at,
                "category": p.category,
            }
            for p in self._projects.values()
        ]

    def get_categories(self) -> dict:
        """获取所有项目分类及每个分类下的项目。

        Returns:
            分类字典，key为分类名，value为该分类下的项目列表。
        """
        categories = {}
        for p in self._projects.values():
            try:
                cat = getattr(p, 'category', '') or "未分类"
            except Exception:
                cat = "未分类"
            if cat not in categories:
                categories[cat] = []
            categories[cat].append({
                "project_id": p.project_id,
                "name": p.name,
                "status": p.status,
                "created_at": p.created_at,
            })
        return categories

    def set_project_category(self, project_id: str, category: str) -> None:
        """设置项目分类。

        Args:
            project_id: 项目 ID。
            category: 分类名称。

        Raises:
            KeyError: 项目不存在。
        """
        project = self._get_or_raise(project_id)
        project.category = category
        self._save_project(project)
        logger.info("项目 %s 分类设置为: %s", project_id, category)

    def auto_classify_project(self, project_id: str) -> str:
        """根据项目名称和简报自动分类。

        Args:
            project_id: 项目 ID。

        Returns:
            分类结果。

        Raises:
            KeyError: 项目不存在。
        """
        project = self._get_or_raise(project_id)
        name_lower = project.name.lower()
        brief_str = json.dumps(project.brief, ensure_ascii=False).lower()
        combined = name_lower + " " + brief_str

        # 分类规则
        category_rules = [
            ("软件开发", ["软件", "系统", "平台", "网站", "app", "api", "后端", "前端", "全栈", "开发", "代码", "编程"]),
            ("AI影视", ["视频", "影视", "宣传片", "电影", "动画", "特效", "拍摄", "剪辑"]),
            ("数据分析", ["数据", "分析", "统计", "可视化", "报表", "大屏", "bi", "dashboard"]),
            ("内容创作", ["文章", "博客", "内容", "写作", "文案", "编辑"]),
            ("PPT设计", ["ppt", "演示", "汇报", "路演", "幻灯片"]),
            ("物流系统", ["物流", "运输", "仓储", "供应链", "配送", "快递"]),
            ("客服系统", ["客服", "对话", "聊天", "问答", "支持"]),
        ]

        for category, keywords in category_rules:
            if any(kw in combined for kw in keywords):
                project.category = category
                self._save_project(project)
                logger.info("项目 %s 自动分类为: %s", project_id, category)
                return category

        # 默认分类
        project.category = "其他"
        self._save_project(project)
        return "其他"

    def get_project(self, project_id: str) -> Project:
        """获取项目详情。

        Args:
            project_id: 项目 ID。

        Returns:
            Project 对象。

        Raises:
            KeyError: 项目不存在。
        """
        return self._get_or_raise(project_id)

    def update_employee_status(
        self, project_id: str, employee_id: str, status: str
    ) -> None:
        """更新员工状态。

        Args:
            project_id: 项目 ID。
            employee_id: 员工 ID。
            status: 新状态（idle / working / done / terminated）。

        Raises:
            KeyError: 项目不存在或员工不存在。
            ValueError: 状态值不合法。
        """
        valid_statuses = {
            EMPLOYEE_STATUS_IDLE,
            EMPLOYEE_STATUS_WORKING,
            EMPLOYEE_STATUS_DONE,
            EMPLOYEE_STATUS_TERMINATED,
        }
        if status not in valid_statuses:
            raise ValueError(
                f"无效的员工状态: {status}，合法值: {valid_statuses}"
            )

        project = self._get_or_raise(project_id)

        for emp in project.employees:
            if emp.employee_id == employee_id:
                old_status = emp.status
                emp.status = status
                self._save_project(project)
                logger.info(
                    "员工 %s 状态更新: %s -> %s",
                    employee_id, old_status, status,
                )
                return

        raise KeyError(f"员工不存在: {employee_id}")

    def add_execution_log(
        self, project_id: str, employee_id: str, log_entry: dict
    ) -> None:
        """添加执行日志。

        Args:
            project_id: 项目 ID。
            employee_id: 员工 ID。
            log_entry: 日志条目字典，会自动添加 employee_id、project_id、timestamp。

        Raises:
            KeyError: 项目不存在。
        """
        project = self._get_or_raise(project_id)

        enriched_entry = {
            "employee_id": employee_id,
            "project_id": project_id,
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            **log_entry,
        }

        project.execution_logs.append(enriched_entry)

        # 同时更新对应员工的 task_history
        for emp in project.employees:
            if emp.employee_id == employee_id:
                emp.task_history.append(enriched_entry)
                break

        self._save_project(project)
        logger.debug("已添加执行日志: 项目 %s, 员工 %s", project_id, employee_id)
