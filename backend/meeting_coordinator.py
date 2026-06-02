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
from protocol import AgentRole, MeetingAgentStatus, SemanticAnalysisResult, semantic_analysis_to_dict

AGENT_ROLE_PROMPTS = {
    AgentRole.CEO: "你是会议的CEO和组织者。你的职责是分析用户需求、判断意图、将任务自动分配给最合适的团队成员。请用简洁果断的语言发言。",
    AgentRole.PLANNER: "你是团队的规划者。你的职责是分析任务、制定计划、将复杂任务分解为可执行的子任务。请用简洁专业的语言发言。",
    AgentRole.EXECUTOR: "你是团队的执行者。你的职责是评估任务的技术可行性、提出实施方案、负责具体执行。请用务实高效的语言发言。",
    AgentRole.MONITOR: "你是团队的监控者。你的职责是评估风险、监控进度、提出质量保障建议。请用严谨细致的语言发言。",
    AgentRole.REVIEWER: "你是团队的审查者。你的职责是审查方案质量、发现潜在问题、提出改进建议。请用客观公正的语言发言。",
    AgentRole.COORDINATOR: "你是团队的协调者。你的职责是协调各方意见、整合方案、做出最终决策。请用简明果断的语言发言。",
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
                    "dept_id": "dept-software",
                    "dept_name": "软件工程部",
                    "capability_desc": "Web 应用开发、API 设计、数据库设计、代码编写与测试",
                    "capability_keywords": ["代码", "编程", "开发", "web", "api", "python", "javascript", "react"],
                    "tools": ["code_generator", "test_runner", "linter"],
                    "success_rate": 0.85,
                    "total_tasks": 0,
                    "successful_tasks": 0,
                    "last_active": "",
                    "priority": 10,
                },
                {
                    "dept_id": "dept-content",
                    "dept_name": "内容演示部",
                    "capability_desc": "PPT 制作、文档撰写、数据可视化、演示材料准备",
                    "capability_keywords": ["ppt", "演示", "文档", "报告", "图表", "可视化"],
                    "tools": ["ppt_generator", "chart_maker", "doc_writer"],
                    "success_rate": 0.90,
                    "total_tasks": 0,
                    "successful_tasks": 0,
                    "last_active": "",
                    "priority": 8,
                },
                {
                    "dept_id": "dept-data",
                    "dept_name": "数据分析部",
                    "capability_desc": "数据清洗、统计分析、机器学习、数据挖掘",
                    "capability_keywords": ["数据", "分析", "统计", "机器学习", "模型", "预测"],
                    "tools": ["data_cleaner", "statistical_analyzer", "ml_trainer"],
                    "success_rate": 0.80,
                    "total_tasks": 0,
                    "successful_tasks": 0,
                    "last_active": "",
                    "priority": 7,
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

    async def semantic_analyze(self, user_message: str) -> SemanticAnalysisResult:
        """语义分析用户消息

        流程：
        1. 先用 DynamicRouter 做初步路由决策
        2. 将路由结果作为上下文传给 LLM 进行最终决策
        3. 如果 LLM 置信度高且与路由一致，直接使用路由结果
        """
        # 1. DynamicRouter 初步路由
        routing_decision = self.router.route(user_message)
        self._last_routing_decision = routing_decision
        self.logger.info(
            "DynamicRouter 路由: dept=%s confidence=%.4f reason=%s",
            routing_decision.selected_dept, routing_decision.confidence, routing_decision.reason,
        )

        # 2. LLM 分析（将路由结果作为上下文）
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

                # 3. 如果 LLM 置信度高且路由也认为是任务，使用路由建议
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
