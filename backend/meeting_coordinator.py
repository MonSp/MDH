import asyncio
import json
import logging
import re
import uuid
from typing import Any, Awaitable, Callable, Dict, List, Optional

from agentscope.agent import Agent
from agentscope.message import Msg

from agent import PROVIDER_REGISTRY, _extract_text
from agenda import AgendaStateMachine, AgendaPhase
from meeting import MeetingSession
from negotiation import NegotiationEngine, ConsensusStrategy, Stance
from protocol import AgentRole, MeetingAgentStatus

AGENT_ROLE_PROMPTS = {
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

    def _create_model(self, role: AgentRole) -> Agent:
        reg = PROVIDER_REGISTRY.get(self.provider)
        if reg is None:
            raise ValueError(f"不支持的模型提供商: {self.provider}")

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
        msg = Msg(name="user", role="user", content=prompt)
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
    ) -> List[Dict[str, str]]:
        self.agenda.open_topic(topic)
        self.agenda.start_discussion()

        results: List[Dict[str, Any]] = []

        planning_roles = [AgentRole.PLANNER]
        discussion_roles = [
            AgentRole.EXECUTOR,
            AgentRole.MONITOR,
            AgentRole.REVIEWER,
            AgentRole.COORDINATOR,
        ]

        for role in planning_roles:
            agent_id = self._find_agent_id(role)
            if agent_id is None:
                continue

            self.meeting.update_agent_status(agent_id, MeetingAgentStatus.SPEAKING)

            model = self._get_model(role)
            previous_context = self._build_previous_context(results)
            prompt = (
                f"当前会议议题：{topic}\n"
                f"当前议程阶段：{self.agenda.get_phase().value}\n"
                f"之前的讨论：\n{previous_context}\n\n"
                f"请以{role.value}的身份发表你的看法和建议（2-3句话）。"
                f"请在回复末尾用 [STANCE:support/oppose/modify/neutral] 和 [CONFIDENCE:0.0-1.0] 标注你的立场和置信度。"
            )
            msg = Msg(name="user", role="user", content=prompt)
            response = await model.reply(msg)
            text = _extract_text(response)

            self.agenda.request_token(agent_id, 0.8)

            await on_message(agent_id, text, text)
            self.meeting.add_message("agent", text, agent_id)
            self.meeting.update_agent_status(agent_id, MeetingAgentStatus.MEETING)

            stance, confidence = self._parse_stance_from_response(text)
            results.append({
                "agent_id": agent_id,
                "role": role.value,
                "content": text,
                "parsed_stance": stance,
                "parsed_confidence": confidence,
            })

        for role in discussion_roles:
            agent_id = self._find_agent_id(role)
            if agent_id is None:
                continue

            self.meeting.update_agent_status(agent_id, MeetingAgentStatus.SPEAKING)

            model = self._get_model(role)
            previous_context = self._build_previous_context(results)
            prompt = (
                f"当前会议议题：{topic}\n"
                f"当前议程阶段：{self.agenda.get_phase().value}\n"
                f"之前的讨论：\n{previous_context}\n\n"
                f"请以{role.value}的身份发表你的看法和建议（2-3句话）。"
                f"请在回复末尾用 [STANCE:support/oppose/modify/neutral] 和 [CONFIDENCE:0.0-1.0] 标注你的立场和置信度。"
            )
            msg = Msg(name="user", role="user", content=prompt)
            response = await model.reply(msg)
            text = _extract_text(response)

            self.agenda.request_token(agent_id, 0.8)

            await on_message(agent_id, text, text)
            self.meeting.add_message("agent", text, agent_id)
            self.meeting.update_agent_status(agent_id, MeetingAgentStatus.MEETING)

            stance, confidence = self._parse_stance_from_response(text)
            results.append({
                "agent_id": agent_id,
                "role": role.value,
                "content": text,
                "parsed_stance": stance,
                "parsed_confidence": confidence,
            })

        coordinator_id = self._find_agent_id(AgentRole.COORDINATOR)
        if coordinator_id:
            summary = "\n".join([
                f"[{r['role']}]: {r['content']}" for r in results
            ])
            proposal = self.negotiation.create_proposal(coordinator_id, summary)
            for r in results:
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
        return results

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
            msg = Msg(name="user", role="user", content=prompt)
            response = await model.reply(msg)
            text = _extract_text(response)
            await on_message(planner_id, text, text)
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
                continue

            role = AgentRole(agent_info.role.value)
            model = self._get_model(role)
            prompt = f"请执行以下任务：\n{task.description}\n\n请给出你的执行方案和结果。"
            msg = Msg(name="user", role="user", content=prompt)
            response = await model.reply(msg)
            text = _extract_text(response)

            self.meeting.update_task_status(task.id, "completed")
            self.meeting.update_agent_status(task.agent_id, MeetingAgentStatus.MEETING)

            results.append({
                "task_id": task.id,
                "agent_id": task.agent_id,
                "result": text,
            })

        return results
