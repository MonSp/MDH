"""
Agent routing and capability matching for MeetingCoordinator.

Extracted from meeting_coordinator.py to isolate routing logic behind a clean interface.
"""

import json
import logging
import os
from typing import Dict, Optional, Set

from protocol import AgentRole

logger = logging.getLogger("coordinator_routing")

AGENT_ROLE_TOOLS = {
    AgentRole.CEO: {"read_file", "list_directory", "git_status"},
    AgentRole.PLANNER: {"read_file", "list_directory", "search_files", "grep_content", "git_status", "git_diff", "git_log"},
    AgentRole.EXECUTOR: {"read_file", "write_file", "edit_file", "list_directory", "bash", "git_status", "git_commit"},
    AgentRole.MONITOR: {"read_file", "write_file", "list_directory", "bash", "git_status", "git_commit"},
    AgentRole.REVIEWER: {"read_file", "list_directory", "bash", "grep_content", "run_tests", "run_linter", "git_status", "git_diff"},
    AgentRole.COORDINATOR: {"read_file", "list_directory", "git_status", "git_log", "create_document"},
}


def estimate_task_complexity(task_description: str) -> int:
    """估算任务复杂度（1-5），用于匹配 agent 技能等级"""
    lower = task_description.lower()
    score = 1
    complex_signals = ['首先', '然后', '最后', '前端', '后端', '数据库', '部署',
                       '架构', '设计', '重构', '优化', 'first', 'then', 'finally',
                       'frontend', 'backend', 'database', 'deploy', 'architecture']
    score += sum(1 for kw in complex_signals if kw in lower)
    if any(kw in lower for kw in ['多个', '多个文件', '多个模块', 'all files', 'entire']):
        score += 1
    return min(5, max(1, score))


def setup_agent_isolation(coordinator) -> Dict[str, str]:
    """为会议中的每个 agent 创建隔离工作区"""
    agent_workspaces = {}
    if not coordinator._workspace or not coordinator._workspace.root_path:
        return agent_workspaces

    base = coordinator._workspace.root_path
    isolation_dir = os.path.join(base, ".agent_isolation")
    os.makedirs(isolation_dir, exist_ok=True)

    for agent in coordinator.meeting.agents:
        if agent.role == AgentRole.CEO:
            continue
        agent_dir = os.path.join(isolation_dir, agent.id)
        os.makedirs(agent_dir, exist_ok=True)
        for subdir in ["workspace", "memory", "notes"]:
            os.makedirs(os.path.join(agent_dir, subdir), exist_ok=True)
        agent_workspaces[agent.id] = agent_dir

    logger.info("Agent 隔离工作区已创建: %d 个 agent", len(agent_workspaces))
    return agent_workspaces


def find_agent_id(coordinator, role: AgentRole) -> Optional[str]:
    for a in coordinator.meeting.agents:
        if a.role == role:
            return a.id
    return None


def resolve_agent(coordinator, agent_id: str):
    """解析Agent ID，支持多种格式（直接ID、带前缀、不带前缀）"""
    if not agent_id:
        return None
    agent = coordinator.meeting.get_agent(agent_id)
    if agent:
        return agent
    if not agent_id.startswith("agent-"):
        agent = coordinator.meeting.get_agent(f"agent-{agent_id}")
        if agent:
            return agent
    if agent_id.startswith("agent-"):
        agent = coordinator.meeting.get_agent(agent_id[len("agent-"):])
        if agent:
            return agent
    for a in coordinator.meeting.agents:
        if a.role.value == agent_id:
            return a
    return None


def get_agent_tools(coordinator, agent) -> Set[str]:
    """获取Agent实际可用的工具集。优先使用AGENT_ROLE_TOOLS，回退到角色配置。"""
    role_tools = AGENT_ROLE_TOOLS.get(agent.role)
    if role_tools is not None:
        return role_tools
    from agent_toolset import load_roles_config
    config = load_roles_config()
    all_roles = {**config.get("base_roles", {}), **config.get("custom_roles", {})}
    role_config_id = agent.id.replace("agent-", "") if agent.id.startswith("agent-") else agent.id
    role_cfg = all_roles.get(role_config_id, {})
    return set(role_cfg.get("permissions", {}).get("tools", []))


def agent_can_execute(coordinator, agent, task_description: str) -> bool:
    """检查Agent是否有能力执行该任务"""
    task_lower = task_description.lower()
    needs_write = any(kw in task_lower for kw in [
        '写', '创作', '生成', '编写', '撰写', 'write', 'create', 'generate',
        '文件', '代码', '文章', '小说', '剧本', 'file', 'code',
    ])
    if not needs_write:
        return True
    tools = get_agent_tools(coordinator, agent)
    return "write_file" in tools


def find_best_agent_for_task(coordinator, task_description: str):
    """根据任务内容和复杂度选择最有能力执行的Agent

    晋升驱动分配策略：
    - 简单任务（complexity ≤ 2）：倾向分配给初级 agent（需要积累 XP）
    - 复杂任务（complexity ≥ 4）：倾向分配给高级 agent（能力匹配）
    - 中等任务：按技能等级加权自然选择
    """
    task_lower = task_description.lower()
    task_complexity = estimate_task_complexity(task_description)

    needs_write = any(kw in task_lower for kw in [
        '写', '创作', '生成', '编写', '撰写', 'write', 'create', 'generate',
        '文件', '代码', '文章', '小说', '剧本', 'file', 'code',
    ])
    needs_review = any(kw in task_lower for kw in [
        '审查', '审核', '校对', 'review', 'edit', '检查', '质量',
    ])

    from agent_toolset import load_roles_config
    config = load_roles_config()
    all_roles = {**config.get("base_roles", {}), **config.get("custom_roles", {})}

    profile_mgr = None
    try:
        from agent_profile_manager import AgentProfileManager
        data_dir = os.path.join(os.path.dirname(__file__), "data")
        profile_mgr = AgentProfileManager(os.path.join(data_dir, "agent_profiles"))
    except Exception as e:
        logger.debug("AgentProfileManager 初始化跳过: %s", e)

    candidates = []
    for agent in coordinator.meeting.agents:
        if agent.role == AgentRole.CEO:
            continue
        tools = get_agent_tools(coordinator, agent)
        role_config_id = agent.id.replace("agent-", "") if agent.id.startswith("agent-") else agent.id
        role_cfg = all_roles.get(role_config_id, {})
        skills = set(role_cfg.get("skills", []))
        score = 0

        if needs_write:
            if "write_file" in tools:
                score += 10
            if "content_writing" in skills or "script_writing" in skills:
                score += 5
            if agent.role == AgentRole.EXECUTOR:
                score += 3
        elif needs_review:
            if "edit_file" in tools:
                score += 5
            if agent.role == AgentRole.REVIEWER:
                score += 5
        else:
            if agent.role == AgentRole.EXECUTOR:
                score += 5

        if profile_mgr:
            try:
                profile = profile_mgr.get_profile(agent.id)
                if profile:
                    max_skill_level = 0
                    for skill_id in skills:
                        sp = profile.skill_progress.get(skill_id, {})
                        level = sp.get("level", 0) if isinstance(sp, dict) else 0
                        if level > max_skill_level:
                            max_skill_level = level

                    if task_complexity <= 2:
                        if max_skill_level <= 1:
                            score += 5
                        elif max_skill_level >= 3:
                            score -= 3
                    elif task_complexity >= 4:
                        score += max_skill_level * 4
                    else:
                        score += max_skill_level * 3
            except Exception as e:
                logger.debug("技能等级查询跳过: %s", e)

        candidates.append((agent, score))

    if not candidates:
        return None
    candidates.sort(key=lambda x: x[1], reverse=True)
    best_agent, best_score = candidates[0]
    logger.info("能力匹配: 选择 %s (score=%d, complexity=%d)", best_agent.id, best_score, task_complexity)
    return best_agent


def ensure_default_routing_table(path: str) -> None:
    """如果路由表文件不存在，自动创建默认路由表"""
    if os.path.isfile(path):
        return
    dir_name = os.path.dirname(path)
    if dir_name:
        os.makedirs(dir_name, exist_ok=True)
    default_table = {
        "departments": [
            {
                "dept_id": "dept-frontend",
                "dept_name": "前端开发组",
                "capability_desc": "React/Vue/Angular 组件开发、HTML/CSS/JS、响应式布局、前端性能优化、浏览器兼容性",
                "capability_keywords": ["前端", "frontend", "react", "vue", "angular", "html", "css", "javascript", "typescript", "组件", "页面", "UI", "界面", "样式"],
                "tools": ["code_generator", "linter", "webpack", "vite"],
                "success_rate": 0.88,
                "total_tasks": 0, "successful_tasks": 0, "last_active": "", "priority": 10,
            },
            {
                "dept_id": "dept-backend",
                "dept_name": "后端开发组",
                "capability_desc": "Python/Java/Go 后端服务开发、RESTful API 设计、数据库设计与优化、微服务架构",
                "capability_keywords": ["后端", "backend", "api", "python", "java", "go", "数据库", "database", "服务", "server", "接口", "微服务"],
                "tools": ["code_generator", "test_runner", "linter", "docker"],
                "success_rate": 0.85,
                "total_tasks": 0, "successful_tasks": 0, "last_active": "", "priority": 10,
            },
            {
                "dept_id": "dept-fullstack",
                "dept_name": "全栈开发组",
                "capability_desc": "全栈 Web 应用开发、前后端联调、项目脚手架搭建、技术选型与集成",
                "capability_keywords": ["全栈", "fullstack", "web", "开发", "应用", "项目", "脚手架", "搭建"],
                "tools": ["code_generator", "test_runner", "linter", "webpack", "docker"],
                "success_rate": 0.82,
                "total_tasks": 0, "successful_tasks": 0, "last_active": "", "priority": 9,
            },
            {
                "dept_id": "dept-qa",
                "dept_name": "质量保障组",
                "capability_desc": "单元测试、集成测试、E2E 测试、代码审查、性能测试、安全测试",
                "capability_keywords": ["测试", "test", "QA", "质量", "审查", "review", "bug", "缺陷", "安全", "性能测试"],
                "tools": ["test_runner", "coverage_tool", "linter", "security_scanner"],
                "success_rate": 0.92,
                "total_tasks": 0, "successful_tasks": 0, "last_active": "", "priority": 8,
            },
            {
                "dept_id": "dept-devops",
                "dept_name": "DevOps 运维组",
                "capability_desc": "CI/CD 流水线、Docker 容器化、K8s 部署、监控告警、日志分析、性能调优",
                "capability_keywords": ["部署", "deploy", "docker", "k8s", "kubernetes", "CI/CD", "运维", "监控", "日志", "性能", "服务器"],
                "tools": ["docker", "k8s", "ci_cd", "monitoring"],
                "success_rate": 0.87,
                "total_tasks": 0, "successful_tasks": 0, "last_active": "", "priority": 7,
            },
            {
                "dept_id": "dept-data",
                "dept_name": "数据工程组",
                "capability_desc": "数据清洗、ETL 流程、数据分析、机器学习模型、数据可视化",
                "capability_keywords": ["数据", "data", "分析", "analysis", "机器学习", "ML", "AI", "模型", "可视化", "图表", "统计"],
                "tools": ["data_cleaner", "statistical_analyzer", "ml_trainer", "chart_maker"],
                "success_rate": 0.80,
                "total_tasks": 0, "successful_tasks": 0, "last_active": "", "priority": 7,
            },
            {
                "dept_id": "dept-docs",
                "dept_name": "文档与演示组",
                "capability_desc": "技术文档撰写、API 文档生成、README 编写、PPT 制作、演示材料准备",
                "capability_keywords": ["文档", "document", "README", "PPT", "演示", "报告", "说明", "教程", "API文档"],
                "tools": ["doc_writer", "ppt_generator", "api_doc_gen"],
                "success_rate": 0.90,
                "total_tasks": 0, "successful_tasks": 0, "last_active": "", "priority": 6,
            },
        ]
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(default_table, f, ensure_ascii=False, indent=2)
    logger.info("已创建默认路由表: %s", path)
