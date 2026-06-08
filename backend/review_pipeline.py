"""
Review Pipeline - 审查流水线

从 MeetingCoordinator 的 review_task_execution() 提取，
并集成 CriticAgent 和 GroundingAgent。
"""

import logging
from typing import Any, Awaitable, Callable, Dict, List, Optional

from agentscope.agent import Agent
from agentscope.message import Msg

from agent import _extract_text
from collaboration.planner_agent import PlannerAgent, SubTask
from collaboration.critic_agent import CriticAgent, CriticResult
from collaboration.grounding_agent import GroundingAgent, GroundingResult
from protocol import AgentRole, MeetingAgentStatus

logger = logging.getLogger("review_pipeline")


class ReviewPipeline:
    """审查流水线"""
    
    def __init__(
        self,
        get_model_fn,
        meeting,
        planner: Optional[PlannerAgent] = None,
        critic: Optional[CriticAgent] = None,
        grounding: Optional[GroundingAgent] = None,
    ):
        self._get_model = get_model_fn
        self._meeting = meeting
        self._planner = planner or PlannerAgent(name="review_planner")
        self._critic = critic or CriticAgent()
        self._grounding = grounding or GroundingAgent()
    
    async def review(
        self,
        task_description: str,
        execution_result: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
        repo_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        执行审查流水线
        
        流程：CriticAgent自动审查 -> GroundingAgent自动接地 -> 多角色LLM审查
        
        Args:
            task_description: 任务描述
            execution_result: 执行结果
            on_message: 消息回调
            repo_context: 仓库上下文
            
        Returns:
            审查结果
        """
        # 1. CriticAgent 自动审查
        critic_result = self._critic.review(
            {
                "task_description": task_description,
                "requirements": [],
                "success_criteria": [],
            },
            stage="review",
        )
        logger.info("Critic审查: severity=%s, findings=%d", critic_result.severity, len(critic_result.findings))
        
        # 2. GroundingAgent 自动接地
        grounding_result = self._grounding.verify(
            {
                "conclusions": [{"text": execution_result[:200]}],
                "decisions": [],
                "evidence": [],
            },
            repo_context=repo_context,
            stage="review",
        )
        logger.info("Grounding审查: grounded=%s, sources=%d", grounding_result.grounded, len(grounding_result.sources))
        
        # 3. Reviewer LLM审查
        reviewer_feedback = await self._reviewer_review(task_description, execution_result, on_message)
        
        # 4. Monitor评估
        monitor_feedback = await self._monitor_evaluate(
            task_description, execution_result, reviewer_feedback, on_message
        )
        
        # 5. Coordinator总结
        coordinator_summary = await self._coordinator_summarize(
            task_description, execution_result, reviewer_feedback, monitor_feedback, on_message
        )
        
        # 6. 结构化验收反馈
        structured_feedback = self._generate_structured_feedback(task_description, execution_result)
        
        return {
            "critic_result": {
                "severity": critic_result.severity,
                "findings": critic_result.findings,
            },
            "grounding_result": {
                "grounded": grounding_result.grounded,
                "sources": grounding_result.sources,
            },
            "reviewer_feedback": reviewer_feedback,
            "monitor_feedback": monitor_feedback,
            "coordinator_summary": coordinator_summary,
            "structured_feedback": structured_feedback,
        }
    
    def _find_agent_id(self, role: AgentRole) -> Optional[str]:
        for a in self._meeting.agents:
            if a.role == role:
                return a.id
        return None
    
    async def _reviewer_review(
        self,
        task_description: str,
        execution_result: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
    ) -> str:
        """Reviewer审查"""
        reviewer_id = self._find_agent_id(AgentRole.REVIEWER)
        if not reviewer_id:
            return ""
        
        self._meeting.update_agent_status(reviewer_id, MeetingAgentStatus.SPEAKING)
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
        feedback = _extract_text(response)
        await on_message(reviewer_id, feedback, "")
        self._meeting.add_message("agent", feedback, reviewer_id)
        self._meeting.update_agent_status(reviewer_id, MeetingAgentStatus.MEETING)
        return feedback
    
    async def _monitor_evaluate(
        self,
        task_description: str,
        execution_result: str,
        reviewer_feedback: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
    ) -> str:
        """Monitor评估"""
        monitor_id = self._find_agent_id(AgentRole.MONITOR)
        if not monitor_id:
            return ""
        
        self._meeting.update_agent_status(monitor_id, MeetingAgentStatus.SPEAKING)
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
        feedback = _extract_text(response)
        await on_message(monitor_id, feedback, "")
        self._meeting.add_message("agent", feedback, monitor_id)
        self._meeting.update_agent_status(monitor_id, MeetingAgentStatus.MEETING)
        return feedback
    
    async def _coordinator_summarize(
        self,
        task_description: str,
        execution_result: str,
        reviewer_feedback: str,
        monitor_feedback: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
    ) -> str:
        """Coordinator总结"""
        coordinator_id = self._find_agent_id(AgentRole.COORDINATOR)
        if not coordinator_id:
            return ""
        
        self._meeting.update_agent_status(coordinator_id, MeetingAgentStatus.SPEAKING)
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
        summary = _extract_text(response)
        await on_message(coordinator_id, summary, "")
        self._meeting.add_message("agent", summary, coordinator_id)
        self._meeting.update_agent_status(coordinator_id, MeetingAgentStatus.MEETING)
        return summary
    
    def _generate_structured_feedback(self, task_description: str, execution_result: str) -> Dict[str, Any]:
        """生成结构化验收反馈"""
        if self._planner:
            subtask = SubTask(
                name=task_description[:100],
                description=task_description,
            )
            return self._planner.generate_review_feedback(task=subtask, output=execution_result)
        
        return {"status": "approved", "issues": [], "max_iterations": 3}
