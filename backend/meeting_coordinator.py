import asyncio
import json
import logging
import os
import re
import uuid
from typing import Any, Awaitable, Callable, Dict, List, Optional

from agentscope.agent import Agent
from agentscope.message import Msg

from agent import PROVIDER_REGISTRY, _extract_text
from agenda import AgendaStateMachine, AgendaPhase
from collaboration.planner_agent import PlannerAgent, SubTask
from dynamic_router import DynamicRouter, RouteEntry
from meeting import MeetingSession
from negotiation import NegotiationEngine, ConsensusStrategy, Stance
from protocol import AgentRole, MeetingAgentStatus, SemanticAnalysisResult, semantic_analysis_to_dict, WorkflowDefinition, WorkflowNode, WorkflowEdge, WorkflowNodeStatus
from workflow_engine import WorkflowEngine

AGENT_ROLE_PROMPTS = {
    AgentRole.CEO: "你是编程团队的CTO（技术总监）。你的职责是分析用户技术需求、判断技术意图、将开发任务自动分配给最合适的团队成员。你熟悉前后端技术栈、系统架构和团队成员能力。请用简洁果断的技术语言发言。",
    AgentRole.PLANNER: "你是团队的系统架构师。你的职责是分析技术任务、设计系统架构、将复杂需求分解为可执行的开发子任务，并为每个子任务定义验收标准和所需技能标签。请用专业的技术语言发言。",
    AgentRole.EXECUTOR: "你是团队的全栈开发工程师。你的职责是评估任务的技术可行性、提出实现方案、负责代码编写和功能实现。你精通前后端开发技术和最佳实践。请用务实高效的开发语言发言。",
    AgentRole.MONITOR: "你是团队的DevOps工程师。你的职责是评估部署风险、监控系统性能、提出CI/CD和运维建议。你熟悉容器化、部署流水线和性能调优。请用严谨细致的语言发言。",
    AgentRole.REVIEWER: "你是团队的QA工程师。你的职责是审查代码质量、编写测试用例、发现潜在bug和安全漏洞、提出改进建议。你精通代码审查和测试方法论。请用客观公正的语言发言。",
    AgentRole.COORDINATOR: "你是团队的项目经理。你的职责是协调开发各方意见、整合技术方案、跟踪项目进度、管理风险和依赖。请用简明果断的语言发言。",
}

logger = logging.getLogger("meeting_coordinator")


class MeetingCoordinator:
    def __init__(
        self,
        meeting_session: MeetingSession,
        provider: str,
        model_name: str,
        api_key: str,
        base_url: str = "",
        data_dir: str = "data",
    ):
        self.meeting = meeting_session
        self.provider = provider
        self.model_name = model_name
        self.api_key = api_key
        self.base_url = base_url
        self._models: Dict[str, Agent] = {}
        self._tasks: List[Dict[str, Any]] = []
        self.logger = logging.getLogger("meeting_coordinator")
        self.agenda = AgendaStateMachine()
        self.negotiation = NegotiationEngine(ConsensusStrategy.SIMPLE_MAJORITY)

        # DynamicRouter 初始化
        routing_table_path = os.path.join(data_dir, "routing_table.json")
        self._ensure_default_routing_table(routing_table_path)
        self.router = DynamicRouter(routing_table_path)
        self._task_routing: Dict[str, str] = {}  # task_id -> dept_id

        # PlannerAgent 用于生成结构化验收反馈
        self.planner = PlannerAgent(name="coordinator_planner")

        # WorkflowEngine 初始化
        self.workflow_engine = WorkflowEngine()
        self._setup_workflow_engine()

    def _setup_workflow_engine(self):
        """配置WorkflowEngine的节点执行器和回调函数"""
        # 注册各部门的节点执行器
        self.workflow_engine.register_node_executor("dept-frontend", self._execute_workflow_node)
        self.workflow_engine.register_node_executor("dept-backend", self._execute_workflow_node)
        self.workflow_engine.register_node_executor("dept-qa", self._execute_workflow_node)
        self.workflow_engine.register_node_executor("dept-devops", self._execute_workflow_node)
        self.workflow_engine.register_node_executor("dept-data", self._execute_workflow_node)
        self.workflow_engine.register_node_executor("dept-docs", self._execute_workflow_node)
        self.workflow_engine.register_node_executor("dept-fullstack", self._execute_workflow_node)

        # 设置状态变化回调
        self.workflow_engine.set_status_change_callback(self._on_workflow_status_change)
        self.workflow_engine.set_node_status_change_callback(self._on_workflow_node_status_change)

    async def _execute_workflow_node(self, node: WorkflowNode, input_data: dict) -> dict:
        """执行工作流节点

        Args:
            node: 工作流节点
            input_data: 输入数据

        Returns:
            执行结果
        """
        self.logger.info("执行工作流节点: %s (部门: %s)", node.node_id, node.dept_id)

        # 根据部门ID选择对应的Agent角色
        role_map = {
            "dept-frontend": AgentRole.EXECUTOR,
            "dept-backend": AgentRole.EXECUTOR,
            "dept-qa": AgentRole.REVIEWER,
            "dept-devops": AgentRole.MONITOR,
            "dept-data": AgentRole.EXECUTOR,
            "dept-docs": AgentRole.COORDINATOR,
            "dept-fullstack": AgentRole.EXECUTOR,
        }

        role = role_map.get(node.dept_id, AgentRole.EXECUTOR)
        model = self._get_model(role)

        # 构建提示词
        prompt = (
            f"请执行以下任务：\n"
            f"任务描述：{node.task_description}\n"
            f"输入数据：{json.dumps(input_data, ensure_ascii=False)}\n\n"
            f"请给出你的执行方案和结果。"
        )

        msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
        response = await model.reply(msg)
        result_text = _extract_text(response)

        return {
            "result": result_text,
            "node_id": node.node_id,
            "dept_id": node.dept_id,
        }

    async def _on_workflow_status_change(self, execution):
        """工作流状态变化回调"""
        self.logger.info("工作流状态变化: %s -> %s", execution.execution_id, execution.status.value)
        # 这里可以推送状态更新到前端
        # 暂时只记录日志

    async def _on_workflow_node_status_change(self, execution, node_id):
        """工作流节点状态变化回调"""
        node_status = execution.node_states.get(node_id)
        self.logger.info("工作流节点状态变化: %s -> %s", node_id, node_status.value if node_status else "unknown")
        # 这里可以推送节点状态更新到前端
        # 暂时只记录日志

    def _create_model(self, role: AgentRole) -> Agent:
        reg = PROVIDER_REGISTRY.get(self.provider)
        if reg is None:
            raise ValueError(f"不支持的模型提供商: {self.provider}")

        self.logger.info("创建模型: role=%s provider=%s model=%s api_key=%s",
                        role.value, self.provider, self.model_name or "(默认)",
                        "已设置" if self.api_key else "未设置")

        class _Session:
            pass

        session = _Session()
        session.api_key = self.api_key
        session.base_url = self.base_url

        credential = reg["credential_cls"](**reg["credential_kwargs"](session))
        formatter = reg["formatter_cls"]()
        model_name = self.model_name or reg["default_model"]
        model = reg["model_cls"](
            credential=credential,
            model=model_name,
            stream=True,
            formatter=formatter,
        )
        agent = Agent(
            name=role.value,
            system_prompt=AGENT_ROLE_PROMPTS[role],
            model=model,
        )
        return agent

    def _get_model(self, role: AgentRole) -> Agent:
        key = role.value
        if key not in self._models:
            self._models[key] = self._create_model(role)
        return self._models[key]

    async def decompose_task(self, task_description: str) -> List[Dict[str, Any]]:
        planner = self._get_model(AgentRole.PLANNER)
        prompt = (
            f"请将以下任务分解为多个子任务，以JSON数组格式返回。"
            f"每个子任务包含 name(名称)、description(描述)、priority(优先级：high/medium/low)、"
            f"dependencies(依赖的子任务名称列表)。\n\n"
            f"任务：{task_description}\n\n"
            f"请只返回JSON数组，不要其他内容。"
        )
        msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
        response = await planner.reply(msg)
        text = _extract_text(response)

        try:
            subtasks = json.loads(text)
        except (json.JSONDecodeError, TypeError):
            subtasks = [
                {
                    "name": task_description[:50],
                    "description": task_description,
                    "priority": "high",
                    "dependencies": [],
                }
            ]

        for i, subtask in enumerate(subtasks):
            subtask["id"] = str(uuid.uuid4())[:8]

        self._tasks = subtasks
        return subtasks

    async def run_discussion(
        self,
        topic: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
        max_rounds: int = 2,
    ) -> List[Dict[str, str]]:
        self.agenda.open_topic(topic)
        self.agenda.start_discussion()

        all_discussions: List[Dict[str, Any]] = []
        discussion_roles = [
            AgentRole.PLANNER,
            AgentRole.EXECUTOR,
            AgentRole.MONITOR,
            AgentRole.REVIEWER,
        ]

        for current_round in range(1, max_rounds + 1):
            self.logger.info("讨论第 %d 轮", current_round)
            round_results: List[Dict[str, Any]] = []

            for role in discussion_roles:
                agent_id = self._find_agent_id(role)
                if agent_id is None:
                    continue

                self.meeting.update_agent_status(agent_id, MeetingAgentStatus.SPEAKING)
                model = self._get_model(role)

                if current_round == 1:
                    previous_context = self._build_previous_context(all_discussions)
                    prompt = (
                        f"当前会议议题：{topic}\n"
                        f"当前议程阶段：{self.agenda.get_phase().value}\n"
                        f"之前的讨论：\n{previous_context}\n\n"
                        f"请以{role.value}的身份发表你的看法和建议（2-3句话）。"
                        f"请在回复末尾用 [STANCE:support/oppose/modify/neutral] 和 [CONFIDENCE:0.0-1.0] 标注你的立场和置信度。"
                    )
                else:
                    previous_context = self._build_previous_context(all_discussions)
                    prompt = (
                        f"当前会议议题：{topic}\n"
                        f"当前是第{current_round}轮讨论\n"
                        f"之前的讨论：\n{previous_context}\n\n"
                        f"请基于之前的讨论，以{role.value}的身份发表你的进一步看法。"
                        f"你可以引用或回应其他同事的观点，提出补充建议或修正意见（2-3句话）。"
                        f"请在回复末尾用 [STANCE:support/oppose/modify/neutral] 和 [CONFIDENCE:0.0-1.0] 标注你的立场和置信度。"
                    )

                msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
                response = await model.reply(msg)
                text = _extract_text(response)

                self.agenda.request_token(agent_id, 0.8)

                await on_message(agent_id, text, "")
                self.meeting.add_message("agent", text, agent_id)
                self.meeting.update_agent_status(agent_id, MeetingAgentStatus.MEETING)

                stance, confidence = self._parse_stance_from_response(text)
                entry = {
                    "agent_id": agent_id,
                    "role": role.value,
                    "content": text,
                    "parsed_stance": stance,
                    "parsed_confidence": confidence,
                    "round": current_round,
                }
                round_results.append(entry)
                all_discussions.append(entry)

            if current_round < max_rounds:
                should_continue = await self._evaluate_discussion_convergence(topic, all_discussions)
                if not should_continue:
                    self.logger.info("讨论已在第 %d 轮达成共识，无需继续", current_round)
                    break

        coordinator_id = self._find_agent_id(AgentRole.COORDINATOR)
        if coordinator_id:
            self.meeting.update_agent_status(coordinator_id, MeetingAgentStatus.SPEAKING)
            model = self._get_model(AgentRole.COORDINATOR)
            discussion_summary = self._build_previous_context(all_discussions)
            prompt = (
                f"你是团队的协调者。以下是关于「{topic}」的多轮讨论内容，请给出最终总结。\n\n"
                f"讨论内容：\n{discussion_summary}\n\n"
                f"请综合各方观点，给出简洁的总结和最终结论（3-4句话）。"
            )
            msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
            response = await model.reply(msg)
            summary_text = _extract_text(response)
            await on_message(coordinator_id, summary_text, "")
            self.meeting.add_message("agent", summary_text, coordinator_id)
            self.meeting.update_agent_status(coordinator_id, MeetingAgentStatus.MEETING)

            all_discussions.append({
                "agent_id": coordinator_id,
                "role": AgentRole.COORDINATOR.value,
                "content": summary_text,
                "parsed_stance": "neutral",
                "parsed_confidence": 0.5,
                "round": 0,
            })

            proposal = self.negotiation.create_proposal(coordinator_id, discussion_summary)
            for r in all_discussions:
                stance_str = r.get('parsed_stance', 'neutral')
                self.negotiation.add_argument(
                    proposal.id, r['agent_id'],
                    Stance(stance_str),
                    r.get('parsed_confidence', 0.5),
                    r['content']
                )
            vote_result = self.negotiation.evaluate_consensus(proposal.id)
            self.logger.info(f"Consensus result: {vote_result}")

        self.agenda.close()
        return all_discussions

    def _find_agent_id(self, role: AgentRole) -> Optional[str]:
        for a in self.meeting.agents:
            if a.role == role:
                return a.id
        return None

    def _build_previous_context(self, results: List[Dict[str, Any]]) -> str:
        if not results:
            return "（尚无发言）"
        return "\n".join([
            f"[{r['role']}]: {r['content']}" for r in results
        ])

    def _ensure_default_routing_table(self, path: str) -> None:
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
                    "total_tasks": 0,
                    "successful_tasks": 0,
                    "last_active": "",
                    "priority": 10,
                },
                {
                    "dept_id": "dept-backend",
                    "dept_name": "后端开发组",
                    "capability_desc": "Python/Java/Go 后端服务开发、RESTful API 设计、数据库设计与优化、微服务架构",
                    "capability_keywords": ["后端", "backend", "api", "python", "java", "go", "数据库", "database", "服务", "server", "接口", "微服务"],
                    "tools": ["code_generator", "test_runner", "linter", "docker"],
                    "success_rate": 0.85,
                    "total_tasks": 0,
                    "successful_tasks": 0,
                    "last_active": "",
                    "priority": 10,
                },
                {
                    "dept_id": "dept-fullstack",
                    "dept_name": "全栈开发组",
                    "capability_desc": "全栈 Web 应用开发、前后端联调、项目脚手架搭建、技术选型与集成",
                    "capability_keywords": ["全栈", "fullstack", "web", "开发", "开发", "应用", "项目", "脚手架", "搭建"],
                    "tools": ["code_generator", "test_runner", "linter", "webpack", "docker"],
                    "success_rate": 0.82,
                    "total_tasks": 0,
                    "successful_tasks": 0,
                    "last_active": "",
                    "priority": 9,
                },
                {
                    "dept_id": "dept-qa",
                    "dept_name": "质量保障组",
                    "capability_desc": "单元测试、集成测试、E2E 测试、代码审查、性能测试、安全测试",
                    "capability_keywords": ["测试", "test", "QA", "质量", "审查", "review", "bug", "缺陷", "安全", "性能测试"],
                    "tools": ["test_runner", "coverage_tool", "linter", "security_scanner"],
                    "success_rate": 0.92,
                    "total_tasks": 0,
                    "successful_tasks": 0,
                    "last_active": "",
                    "priority": 8,
                },
                {
                    "dept_id": "dept-devops",
                    "dept_name": "DevOps 运维组",
                    "capability_desc": "CI/CD 流水线、Docker 容器化、K8s 部署、监控告警、日志分析、性能调优",
                    "capability_keywords": ["部署", "deploy", "docker", "k8s", "kubernetes", "CI/CD", "运维", "监控", "日志", "性能", "服务器"],
                    "tools": ["docker", "k8s", "ci_cd", "monitoring"],
                    "success_rate": 0.87,
                    "total_tasks": 0,
                    "successful_tasks": 0,
                    "last_active": "",
                    "priority": 7,
                },
                {
                    "dept_id": "dept-data",
                    "dept_name": "数据工程组",
                    "capability_desc": "数据清洗、ETL 流程、数据分析、机器学习模型、数据可视化",
                    "capability_keywords": ["数据", "data", "分析", "analysis", "机器学习", "ML", "AI", "模型", "可视化", "图表", "统计"],
                    "tools": ["data_cleaner", "statistical_analyzer", "ml_trainer", "chart_maker"],
                    "success_rate": 0.80,
                    "total_tasks": 0,
                    "successful_tasks": 0,
                    "last_active": "",
                    "priority": 7,
                },
                {
                    "dept_id": "dept-docs",
                    "dept_name": "文档与演示组",
                    "capability_desc": "技术文档撰写、API 文档生成、README 编写、PPT 制作、演示材料准备",
                    "capability_keywords": ["文档", "document", "README", "PPT", "演示", "报告", "说明", "教程", "API文档"],
                    "tools": ["doc_writer", "ppt_generator", "api_doc_gen"],
                    "success_rate": 0.90,
                    "total_tasks": 0,
                    "successful_tasks": 0,
                    "last_active": "",
                    "priority": 6,
                },
            ]
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(default_table, f, ensure_ascii=False, indent=2)
        self.logger.info("已创建默认路由表: %s", path)

    def _parse_stance_from_response(self, text: str) -> tuple[str, float]:
        stance_match = re.search(r'\[STANCE:(support|oppose|modify|neutral)\]', text, re.IGNORECASE)
        confidence_match = re.search(r'\[CONFIDENCE:([\d.]+)\]', text)
        stance = stance_match.group(1).lower() if stance_match else 'neutral'
        confidence = min(1.0, max(0.0, float(confidence_match.group(1)))) if confidence_match else 0.5
        return stance, confidence

    async def handle_critical_blocker(
        self,
        agent_id: str,
        content: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
    ) -> None:
        self.agenda.declare_emergency(f"Critical blocker from {agent_id}")

        planner_id = None
        for a in self.meeting.agents:
            if a.role == AgentRole.PLANNER:
                planner_id = a.id
                break

        if planner_id:
            self.agenda.force_token(planner_id, "emergency response")
            model = self._get_model(AgentRole.PLANNER)
            prompt = (
                f"紧急情况！{agent_id}报告了关键阻塞问题：\n{content}\n\n"
                f"请作为规划者提出应急解决方案（2-3句话）。"
            )
            msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
            response = await model.reply(msg)
            text = _extract_text(response)
            await on_message(planner_id, text, "")
            self.meeting.add_message("agent", text, planner_id)

        if hasattr(self.agenda, 'resolveEmergency'):
            self.agenda.resolveEmergency()
        else:
            self.agenda.resolve_emergency()

    async def assign_tasks(
        self, subtasks: List[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        if subtasks is None:
            subtasks = self._tasks

        assignments = []

        for subtask in subtasks:
            task_text = (subtask.get("name", "") + " " + subtask.get("description", "")).lower()

            if "前端" in task_text or "frontend" in task_text:
                agent_id = "agent-executor"
            elif "监控" in task_text or "monitor" in task_text:
                agent_id = "agent-monitor"
            elif "审查" in task_text or "review" in task_text or "测试" in task_text or "test" in task_text:
                agent_id = "agent-reviewer"
            else:
                agent_id = "agent-executor"

            task = self.meeting.add_task(agent_id, subtask.get("description", ""))
            self.meeting.update_task_status(task.id, "assigned")
            self.meeting.update_agent_status(agent_id, MeetingAgentStatus.WORKING)

            assignments.append({
                "task_id": task.id,
                "agent_id": agent_id,
                "subtask": subtask,
            })

        self._tasks = subtasks or self._tasks
        return assignments

    async def execute_assigned_tasks(self) -> List[Dict[str, Any]]:
        results = []

        for task in self.meeting.tasks:
            if task.status != "assigned":
                continue

            agent_info = self.meeting.get_agent(task.agent_id)
            if agent_info is None:
                self.logger.warning("找不到 agent: %s", task.agent_id)
                continue

            role = AgentRole(agent_info.role.value)
            self.logger.info("执行任务: task_id=%s agent=%s role=%s", task.id, task.agent_id, role.value)
            model = self._get_model(role)
            prompt = f"请执行以下任务：\n{task.description}\n\n请给出你的执行方案和结果。"
            msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])

            try:
                response = await model.reply(msg)
                text = _extract_text(response)

                self.logger.info("任务执行完成: task_id=%s agent=%s result_length=%d", task.id, task.agent_id, len(text))
                self.meeting.update_task_status(task.id, "completed")
                self.meeting.update_agent_status(task.agent_id, MeetingAgentStatus.MEETING)

                # 更新路由统计：任务成功
                dept_id = self._task_routing.get(task.id)
                if dept_id:
                    self.router.update_stats(dept_id, success=True)

                results.append({
                    "task_id": task.id,
                    "agent_id": task.agent_id,
                    "result": text,
                })
            except Exception as e:
                self.logger.error("任务执行失败: task_id=%s error=%s", task.id, e)
                self.meeting.update_task_status(task.id, "failed")
                self.meeting.update_agent_status(task.agent_id, MeetingAgentStatus.MEETING)

                # 更新路由统计：任务失败
                dept_id = self._task_routing.get(task.id)
                if dept_id:
                    self.router.update_stats(dept_id, success=False)

                results.append({
                    "task_id": task.id,
                    "agent_id": task.agent_id,
                    "result": f"任务执行失败: {e}",
                })

        return results

    async def execute_and_review_task(
        self,
        task_description: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
    ) -> Dict[str, Any]:
        task_results = await self.execute_assigned_tasks()
        for task_result in task_results:
            await on_message(task_result["agent_id"], task_result["result"], "")

        review_result = {}
        if task_results:
            execution_result = task_results[0]["result"]
            review_result = await self.review_task_execution(task_description, execution_result, on_message)

        return review_result

    async def review_task_execution(
        self,
        task_description: str,
        execution_result: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
    ) -> Dict[str, Any]:
        reviewer_id = self._find_agent_id(AgentRole.REVIEWER)
        monitor_id = self._find_agent_id(AgentRole.MONITOR)
        coordinator_id = self._find_agent_id(AgentRole.COORDINATOR)

        reviewer_feedback = ""
        if reviewer_id:
            self.meeting.update_agent_status(reviewer_id, MeetingAgentStatus.SPEAKING)
            model = self._get_model(AgentRole.REVIEWER)
            prompt = (
                f"你是团队的审查者。以下是一位同事的工作成果，请审查并提出改进建议。\n\n"
                f"任务：{task_description}\n"
                f"执行结果：{execution_result}\n\n"
                f"请从以下角度审查：\n"
                f"1. 方案的完整性和可行性\n"
                f"2. 潜在的问题和风险\n"
                f"3. 具体的改进建议\n\n"
                f"请用 2-3 句话给出你的审查意见。"
            )
            msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
            response = await model.reply(msg)
            reviewer_feedback = _extract_text(response)
            await on_message(reviewer_id, reviewer_feedback, "")
            self.meeting.add_message("agent", reviewer_feedback, reviewer_id)
            self.meeting.update_agent_status(reviewer_id, MeetingAgentStatus.MEETING)

        monitor_feedback = ""
        if monitor_id:
            self.meeting.update_agent_status(monitor_id, MeetingAgentStatus.SPEAKING)
            model = self._get_model(AgentRole.MONITOR)
            prompt = (
                f"你是团队的监控者。请评估以下任务的执行情况。\n\n"
                f"任务：{task_description}\n"
                f"执行结果：{execution_result}\n"
                f"审查意见：{reviewer_feedback}\n\n"
                f"请评估：\n"
                f"1. 任务完成度\n"
                f"2. 潜在风险\n"
                f"3. 是否需要补充\n\n"
                f"请用 2-3 句话给出你的评估。"
            )
            msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
            response = await model.reply(msg)
            monitor_feedback = _extract_text(response)
            await on_message(monitor_id, monitor_feedback, "")
            self.meeting.add_message("agent", monitor_feedback, monitor_id)
            self.meeting.update_agent_status(monitor_id, MeetingAgentStatus.MEETING)

        coordinator_summary = ""
        if coordinator_id:
            self.meeting.update_agent_status(coordinator_id, MeetingAgentStatus.SPEAKING)
            model = self._get_model(AgentRole.COORDINATOR)
            prompt = (
                f"你是团队的协调者。请综合以下讨论内容，给出最终总结。\n\n"
                f"任务：{task_description}\n"
                f"执行结果：{execution_result}\n"
                f"审查意见：{reviewer_feedback}\n"
                f"监控评估：{monitor_feedback}\n\n"
                f"请给出简洁的总结和最终结论。"
            )
            msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
            response = await model.reply(msg)
            coordinator_summary = _extract_text(response)
            await on_message(coordinator_id, coordinator_summary, "")
            self.meeting.add_message("agent", coordinator_summary, coordinator_id)
            self.meeting.update_agent_status(coordinator_id, MeetingAgentStatus.MEETING)

        # 使用 PlannerAgent 生成结构化验收反馈
        structured_feedback = self._generate_structured_feedback(task_description, execution_result)

        return {
            "reviewer_feedback": reviewer_feedback,
            "monitor_feedback": monitor_feedback,
            "coordinator_summary": coordinator_summary,
            "structured_feedback": structured_feedback,
        }

    def _generate_structured_feedback(
        self, task_description: str, execution_result: str
    ) -> Dict[str, Any]:
        """使用 PlannerAgent 生成结构化验收反馈，无 PlannerAgent 时降级。"""
        if self.planner:
            # 将任务描述转换为 SubTask 以便调用 generate_review_feedback
            subtask = SubTask(
                name=task_description[:100],
                description=task_description,
            )
            feedback = self.planner.generate_review_feedback(
                task=subtask,
                output=execution_result,
            )
        else:
            feedback = {
                "status": "approved",
                "issues": [],
                "max_iterations": 3,
            }
        return feedback

    async def _evaluate_discussion_convergence(
        self,
        topic: str,
        all_discussions: List[Dict[str, Any]],
    ) -> bool:
        ceo_id = self._find_agent_id(AgentRole.CEO)
        if not ceo_id:
            return False

        discussion_summary = "\n".join([
            f"[第{d.get('round', '?')}轮 - {d['role']}]: {d['content']}" for d in all_discussions
        ])

        self.meeting.update_agent_status(ceo_id, MeetingAgentStatus.SPEAKING)
        model = self._get_model(AgentRole.CEO)
        prompt = (
            f"你是会议的CEO和组织者。请评估以下讨论是否已达成足够的共识。\n\n"
            f"议题：{topic}\n\n"
            f"讨论内容：\n{discussion_summary}\n\n"
            f"请判断：\n"
            f"1. 各方观点是否已经充分表达\n"
            f"2. 是否存在重大分歧需要进一步讨论\n"
            f"3. 是否可以进入总结阶段\n\n"
            f'请只返回 JSON 格式：{{"continue_discussion": true/false, "reason": "理由"}}'
        )
        msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
        response = await model.reply(msg)
        text = _extract_text(response)
        self.meeting.update_agent_status(ceo_id, MeetingAgentStatus.MEETING)

        json_match = re.search(r'\{[^{}]*\}', text, re.DOTALL)
        if json_match:
            try:
                data = json.loads(json_match.group())
                return bool(data.get("continue_discussion", False))
            except (json.JSONDecodeError, TypeError):
                pass

        return False

    def _build_agent_capability_list(self) -> str:
        lines = []
        for agent in self.meeting.agents:
            if agent.role == AgentRole.CEO:
                continue
            caps = ", ".join(agent.capabilities) if agent.capabilities else "通用"
            lines.append(f"- {agent.id} ({agent.name}, 角色:{agent.role.value}): 能力=[{caps}]")
        return "\n".join(lines)

    def _detect_complex_task(self, user_message: str) -> bool:
        """检测用户消息是否为跨部门复杂任务

        Args:
            user_message: 用户消息

        Returns:
            是否为复杂任务
        """
        # 复杂任务的关键词模式
        complex_patterns = [
            # 多步骤任务
            r'首先.*然后.*最后',
            r'第一步.*第二步.*第三步',
            r'先.*再.*后',
            # 多部门协作
            r'前端.*后端.*测试',
            r'设计.*开发.*部署',
            r'分析.*实现.*验证',
            # 依赖关系
            r'完成后.*开始',
            r'依赖.*之后',
            r'等待.*后.*执行',
            # 工作流相关
            r'工作流',
            r'流程',
            r'步骤.*顺序',
        ]

        for pattern in complex_patterns:
            if re.search(pattern, user_message, re.IGNORECASE):
                return True

        # 检查是否包含多个动词（可能表示多步骤）
        verbs = ['设计', '开发', '实现', '测试', '部署', '分析', '创建', '编写', '优化', '修复']
        verb_count = sum(1 for verb in verbs if verb in user_message)
        if verb_count >= 3:
            return True

        return False

    def _generate_workflow_definition(self, user_message: str, routing_decision) -> WorkflowDefinition:
        """根据用户消息生成工作流定义

        Args:
            user_message: 用户消息
            routing_decision: 路由决策

        Returns:
            工作流定义
        """
        workflow_id = str(uuid.uuid4())[:8]

        # 使用LLM分析任务步骤
        # 这里简化处理，实际应该调用LLM进行分析
        # 暂时使用简单的规则生成工作流

        nodes = []
        edges = []

        # 根据关键词生成节点
        if '前端' in user_message or 'frontend' in user_message:
            nodes.append(WorkflowNode(
                node_id=f"node-{str(uuid.uuid4())[:4]}",
                task_description="前端开发任务",
                dept_id="dept-frontend",
                status=WorkflowNodeStatus.PENDING,
            ))

        if '后端' in user_message or 'backend' in user_message or 'api' in user_message.lower():
            nodes.append(WorkflowNode(
                node_id=f"node-{str(uuid.uuid4())[:4]}",
                task_description="后端开发任务",
                dept_id="dept-backend",
                status=WorkflowNodeStatus.PENDING,
            ))

        if '测试' in user_message or 'test' in user_message:
            nodes.append(WorkflowNode(
                node_id=f"node-{str(uuid.uuid4())[:4]}",
                task_description="测试任务",
                dept_id="dept-qa",
                status=WorkflowNodeStatus.PENDING,
            ))

        if '部署' in user_message or 'deploy' in user_message:
            nodes.append(WorkflowNode(
                node_id=f"node-{str(uuid.uuid4())[:4]}",
                task_description="部署任务",
                dept_id="dept-devops",
                status=WorkflowNodeStatus.PENDING,
            ))

        # 如果没有匹配到特定部门，使用路由建议
        if not nodes and routing_decision.selected_dept:
            nodes.append(WorkflowNode(
                node_id=f"node-{str(uuid.uuid4())[:4]}",
                task_description=user_message[:100],
                dept_id=routing_decision.selected_dept,
                status=WorkflowNodeStatus.PENDING,
            ))

        # 如果还是没有节点，创建一个默认节点
        if not nodes:
            nodes.append(WorkflowNode(
                node_id=f"node-{str(uuid.uuid4())[:4]}",
                task_description=user_message[:100],
                dept_id="dept-fullstack",
                status=WorkflowNodeStatus.PENDING,
            ))

        # 生成边（依赖关系）
        # 假设顺序执行：前端 -> 后端 -> 测试 -> 部署
        dept_order = ["dept-frontend", "dept-backend", "dept-qa", "dept-devops"]
        sorted_nodes = sorted(nodes, key=lambda n: dept_order.index(n.dept_id) if n.dept_id in dept_order else 999)

        for i in range(len(sorted_nodes) - 1):
            edges.append(WorkflowEdge(
                source_node_id=sorted_nodes[i].node_id,
                target_node_id=sorted_nodes[i + 1].node_id,
            ))

        return WorkflowDefinition(
            workflow_id=workflow_id,
            name=f"工作流-{user_message[:30]}",
            description=user_message,
            nodes=nodes,
            edges=edges,
            execution_strategy="mixed",
        )

    async def semantic_analyze(self, user_message: str) -> SemanticAnalysisResult:
        """语义分析用户消息

        流程：
        1. 先用 DynamicRouter 做初步路由决策
        2. 检测是否为复杂任务
        3. 如果是复杂任务，生成工作流定义
        4. 否则，将路由结果作为上下文传给 LLM 进行最终决策
        """
        # 1. DynamicRouter 初步路由
        routing_decision = self.router.route(user_message)
        self._last_routing_decision = routing_decision
        self.logger.info(
            "DynamicRouter 路由: dept=%s confidence=%.4f reason=%s",
            routing_decision.selected_dept, routing_decision.confidence, routing_decision.reason,
        )

        # 2. 检测是否为复杂任务
        is_complex = self._detect_complex_task(user_message)
        if is_complex:
            self.logger.info("检测到复杂任务，生成工作流定义")
            workflow_definition = self._generate_workflow_definition(user_message, routing_decision)
            return SemanticAnalysisResult(
                is_task=True,
                is_workflow=True,
                intent="workflow",
                task_description=user_message,
                target_agent_id="",  # 工作流模式下不需要单个目标
                reason="检测到跨部门复杂任务，生成工作流",
                workflow_definition=workflow_definition,
            )

        # 3. LLM 分析（将路由结果作为上下文）
        ceo_model = self._get_model(AgentRole.CEO)
        agent_list = self._build_agent_capability_list()
        routing_context = ""
        if routing_decision.selected_dept:
            routing_context = (
                f"\n动态路由建议：\n"
                f"- 推荐部门：{routing_decision.selected_dept}\n"
                f"- 置信度：{routing_decision.confidence:.2f}\n"
                f"- 理由：{routing_decision.reason}\n"
                f"- 匹配关键词：{', '.join(routing_decision.matched_keywords) or '无'}\n"
            )

        prompt = (
            f"你是会议的CEO和组织者。请分析以下用户消息，判断其意图。\n\n"
            f"用户消息：{user_message}\n"
            f"{routing_context}\n"
            f"可用Agent：\n{agent_list}\n\n"
            f"请返回JSON格式分析结果：\n"
            f'{{"is_task": true/false, "intent": "task/discussion/question/feedback", '
            f'"task_description": "如果is_task为true，提取任务描述", '
            f'"target_agent_id": "最佳执行者的ID", '
            f'"reason": "选择该Agent的理由", '
            f'"confidence": 0.0-1.0, '
            f'"discussion_topic": "如果is_task为false，提取讨论主题"}}\n\n'
            f"分析规则：\n"
            f"1. 如果消息包含明确的行动指令（如'帮我...'、'请执行...'、'分析...'），判定为任务\n"
            f"2. 如果消息是征求意见（如'大家觉得...'、'你们怎么看'），判定为讨论\n"
            f"3. 根据任务内容匹配Agent能力，选择最合适的执行者\n"
            f"4. 参考动态路由建议，但可以覆盖它\n"
            f"5. 只返回JSON，不要其他内容"
        )
        msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
        response = await ceo_model.reply(msg)
        text = _extract_text(response)

        json_match = re.search(r'\{[^{}]*\}', text, re.DOTALL)
        if json_match:
            try:
                data = json.loads(json_match.group())
                llm_is_task = bool(data.get("is_task", False))
                llm_confidence = float(data.get("confidence", 0.5))

                # 4. 如果 LLM 置信度高且路由也认为是任务，使用路由建议
                if (llm_is_task
                        and routing_decision.selected_dept
                        and routing_decision.confidence >= 0.5
                        and llm_confidence >= 0.7):
                    self.logger.info("LLM 与路由一致，使用路由建议: %s", routing_decision.selected_dept)

                return SemanticAnalysisResult(
                    is_task=llm_is_task,
                    intent=str(data.get("intent", "discussion")),
                    task_description=str(data.get("task_description", "")),
                    target_agent_id=str(data.get("target_agent_id", "")),
                    reason=str(data.get("reason", "")),
                    discussion_topic=str(data.get("discussion_topic", "")),
                )
            except (json.JSONDecodeError, TypeError, KeyError):
                pass

        # 回退：如果路由置信度足够高，直接使用路由结果
        if routing_decision.selected_dept and routing_decision.confidence >= 0.6:
            self.logger.info("LLM 解析失败，回退到路由结果: %s", routing_decision.selected_dept)
            return SemanticAnalysisResult(
                is_task=True,
                intent="task",
                task_description=user_message,
                target_agent_id=routing_decision.selected_dept,
                reason=f"动态路由推荐: {routing_decision.reason}",
            )

        return SemanticAnalysisResult(
            is_task=False,
            intent="discussion",
            discussion_topic=user_message,
        )

    async def auto_assign_task(
        self,
        task_description: str,
        target_agent_id: str,
        reason: str,
    ) -> Dict[str, Any]:
        agent_info = self.meeting.get_agent(target_agent_id)
        if agent_info is None:
            for agent in self.meeting.agents:
                if agent.role != AgentRole.CEO:
                    target_agent_id = agent.id
                    break

        task = self.meeting.add_task(target_agent_id, task_description)
        self.meeting.update_task_status(task.id, "assigned")
        self.meeting.update_agent_status(target_agent_id, MeetingAgentStatus.WORKING)

        # 记录路由部门，用于后续统计更新
        if hasattr(self, '_last_routing_decision') and self._last_routing_decision.selected_dept:
            self._task_routing[task.id] = self._last_routing_decision.selected_dept

        ceo_id = self._find_agent_id(AgentRole.CEO)
        if ceo_id:
            self.meeting.add_message(
                "agent",
                f"CEO分析：{reason}。已将任务分配给{target_agent_id}。",
                ceo_id,
            )

        return {
            "task_id": task.id,
            "agent_id": target_agent_id,
            "description": task_description,
            "reason": reason,
            "status": "assigned",
        }

    async def process_user_message(
        self,
        user_message: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
    ) -> Dict[str, Any]:
        analysis = await self.semantic_analyze(user_message)

        ceo_id = self._find_agent_id(AgentRole.CEO) or "agent-ceo"

        # 检查是否为工作流模式
        if analysis.is_workflow and analysis.workflow_definition:
            self.logger.info("工作流模式: 创建并执行工作流")
            analysis_text = (
                f"CEO分析：检测到跨部门复杂任务，已创建工作流。\n"
                f"工作流名称：{analysis.workflow_definition.name}\n"
                f"节点数量：{len(analysis.workflow_definition.nodes)}\n"
                f"执行策略：{analysis.workflow_definition.execution_strategy}"
            )
            await on_message(ceo_id, analysis_text, "")
            self.meeting.add_message("agent", analysis_text, ceo_id)

            # 创建并执行工作流
            workflow_result = await self._execute_workflow(analysis.workflow_definition, on_message)

            return {
                "type": "workflow_executed",
                "analysis": semantic_analysis_to_dict(analysis),
                "workflow_result": workflow_result,
            }
        else:
            analysis_text = (
                f"CEO分析：意图={analysis.intent}"
                + (f"，任务={analysis.task_description}，指派给={analysis.target_agent_id}，理由={analysis.reason}" if analysis.is_task else f"，主题={analysis.discussion_topic}")
            )
            await on_message(ceo_id, analysis_text, "")
            self.meeting.add_message("agent", analysis_text, ceo_id)

            if analysis.is_task and analysis.target_agent_id:
                self.logger.info("任务模式: 指派给 %s", analysis.target_agent_id)
                assign_result = await self.auto_assign_task(
                    analysis.task_description or user_message,
                    analysis.target_agent_id,
                    analysis.reason,
                )

                return {
                    "type": "task_auto_assigned",
                    "analysis": semantic_analysis_to_dict(analysis),
                    "assignment": assign_result,
                }
            else:
                topic = analysis.discussion_topic or user_message
                discussion_results = await self.run_discussion(topic, on_message)
                return {
                    "type": "discussion",
                    "analysis": semantic_analysis_to_dict(analysis),
                    "discussion_results": discussion_results,
                }

    async def _execute_workflow(
        self,
        workflow_definition: WorkflowDefinition,
        on_message: Callable[[str, str, str], Awaitable[None]],
    ) -> Dict[str, Any]:
        """执行工作流

        Args:
            workflow_definition: 工作流定义
            on_message: 消息回调函数

        Returns:
            工作流执行结果
        """
        try:
            # 创建工作流执行实例
            execution = self.workflow_engine.create_workflow(workflow_definition)

            # 推送工作流创建消息
            ceo_id = self._find_agent_id(AgentRole.CEO) or "agent-ceo"
            create_msg = f"工作流已创建: {workflow_definition.name} (ID: {execution.execution_id})"
            await on_message(ceo_id, create_msg, "")
            self.meeting.add_message("agent", create_msg, ceo_id)

            # 执行工作流
            await self.workflow_engine.execute_workflow(execution.execution_id)

            # 获取执行结果
            status = self.workflow_engine.get_workflow_status(execution.execution_id)

            # 推送工作流完成消息
            complete_msg = f"工作流执行完成: {status.status.value}"
            await on_message(ceo_id, complete_msg, "")
            self.meeting.add_message("agent", complete_msg, ceo_id)

            # 汇总结果
            results_summary = []
            for node_id, result in status.results.items():
                if isinstance(result, dict) and "result" in result:
                    results_summary.append(f"- {node_id}: {result['result'][:100]}...")

            if results_summary:
                summary_msg = "工作流执行结果汇总:\n" + "\n".join(results_summary)
                await on_message(ceo_id, summary_msg, "")
                self.meeting.add_message("agent", summary_msg, ceo_id)

            return {
                "execution_id": execution.execution_id,
                "status": status.status.value,
                "results": status.results,
            }

        except Exception as e:
            self.logger.error("工作流执行失败: %s", str(e))
            ceo_id = self._find_agent_id(AgentRole.CEO) or "agent-ceo"
            error_msg = f"工作流执行失败: {str(e)}"
            await on_message(ceo_id, error_msg, "")
            self.meeting.add_message("agent", error_msg, ceo_id)

            return {
                "error": str(e),
            }
