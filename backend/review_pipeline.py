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
from protocol import AgentRole, MeetingAgentStatus, LLM_FALLBACK_TEMPLATE

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
        discussion_context: str = "",
        gate_result: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        执行审查流水线
        
        流程：CriticAgent自动审查 -> GroundingAgent自动接地 -> 多角色LLM审查
        
        Args:
            task_description: 任务描述
            execution_result: 执行结果
            on_message: 消息回调
            repo_context: 仓库上下文
            discussion_context: 团队讨论决策摘要
            gate_result: 确定性门禁结果（测试/lint）。failures 非空时强制 revision_required；
                工具缺失（基础设施不可用）由门禁记为 skipped，不触发 revision_required
            
        Returns:
            审查结果
        """
        # 1. CriticAgent 自动审查（规则兜底 + LLM 补充；失败时跳过，不阻断审查流程）
        try:
            critic_result = await self._critic.review_with_llm(
                {
                    "task_description": task_description,
                    "requirements": [],
                    "success_criteria": [],
                },
                get_model_fn=self._get_model,
                stage="review",
            )
            logger.info("Critic审查: severity=%s, findings=%d", critic_result.severity, len(critic_result.findings))
        except Exception as e:
            logger.warning("CriticAgent失败，跳过: %s", e, exc_info=True)
            critic_result = CriticResult(severity="unknown", findings=[])
        
        # 2. GroundingAgent 自动接地（失败时跳过，不阻断审查流程）
        try:
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
        except Exception as e:
            logger.warning("GroundingAgent失败，跳过: %s", e, exc_info=True)
            grounding_result = GroundingResult(grounded=False, sources=[])
        
        # 3. Reviewer LLM审查
        reviewer_feedback = await self._reviewer_review(
            task_description, execution_result, on_message, discussion_context
        )
        
        # 4. Monitor评估
        monitor_feedback = await self._monitor_evaluate(
            task_description, execution_result, reviewer_feedback, on_message, discussion_context
        )
        
        # 5. Coordinator总结
        coordinator_summary = await self._coordinator_summarize(
            task_description, execution_result, reviewer_feedback, monitor_feedback, on_message
        )
        
        # 6. 结构化验收反馈（整合 LLM 审查意见 + 确定性门禁结果）
        structured_feedback = self._generate_structured_feedback(
            task_description, execution_result, reviewer_feedback, monitor_feedback,
            gate_result=gate_result,
        )
        
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
        discussion_context: str = "",
    ) -> str:
        """Reviewer审查"""
        reviewer_id = self._find_agent_id(AgentRole.REVIEWER)
        if not reviewer_id:
            return ""
        
        self._meeting.update_agent_status(reviewer_id, MeetingAgentStatus.SPEAKING)
        model = self._get_model(AgentRole.REVIEWER)
        
        context_block = f"\n\n团队讨论确定的方案：\n{discussion_context}" if discussion_context else ""
        prompt = (
            f"你是团队的审查者。以下是一位同事的工作成果，请审查并提出改进建议。\n\n"
            f"任务：{task_description}{context_block}\n"
            f"执行结果：{execution_result}\n\n"
            f"请从以下角度审查：\n"
            f"1. 代码是否符合团队讨论确定的方案\n"
            f"2. 方案的完整性和可行性\n"
            f"3. 潜在的问题和风险\n"
            f"4. 具体的改进建议\n\n"
            f"请用 2-3 句话给出你的审查意见。"
        )
        msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
        try:
            response = await model.reply(msg)
            feedback = _extract_text(response)
        except Exception as e:
            logger.warning("Reviewer LLM调用失败: %s", e)
            feedback = LLM_FALLBACK_TEMPLATE.format(role="reviewer", content_type="审查意见")
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
        discussion_context: str = "",
    ) -> str:
        """Monitor评估"""
        monitor_id = self._find_agent_id(AgentRole.MONITOR)
        if not monitor_id:
            return ""
        
        self._meeting.update_agent_status(monitor_id, MeetingAgentStatus.SPEAKING)
        model = self._get_model(AgentRole.MONITOR)
        
        context_block = f"\n\n团队讨论确定的方案：\n{discussion_context}" if discussion_context else ""
        prompt = (
            f"你是团队的监控者。请评估以下任务的执行情况。\n\n"
            f"任务：{task_description}{context_block}\n"
            f"执行结果：{execution_result}\n"
            f"审查意见：{reviewer_feedback}\n\n"
            f"请评估：\n"
            f"1. 实现是否符合讨论确定的方案\n"
            f"2. 任务完成度\n"
            f"3. 潜在风险\n"
            f"4. 是否需要补充\n\n"
            f"请用 2-3 句话给出你的评估。"
        )
        msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
        try:
            response = await model.reply(msg)
            feedback = _extract_text(response)
        except Exception as e:
            logger.warning("Monitor LLM调用失败: %s", e)
            feedback = LLM_FALLBACK_TEMPLATE.format(role="monitor", content_type="评估")
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
        try:
            response = await model.reply(msg)
            summary = _extract_text(response)
        except Exception as e:
            logger.warning("Coordinator LLM调用失败: %s", e)
            summary = LLM_FALLBACK_TEMPLATE.format(role="coordinator", content_type="总结")
        await on_message(coordinator_id, summary, "")
        self._meeting.add_message("agent", summary, coordinator_id)
        self._meeting.update_agent_status(coordinator_id, MeetingAgentStatus.MEETING)
        return summary
    
    def _generate_structured_feedback(
        self,
        task_description: str,
        execution_result: str,
        reviewer_feedback: str = "",
        monitor_feedback: str = "",
        gate_result: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """生成结构化验收反馈，整合 LLM 审查意见与确定性门禁结果"""
        if self._planner:
            subtask = SubTask(
                name=task_description[:100],
                description=task_description,
            )
            result = self._planner.generate_review_feedback(
                task=subtask,
                output=execution_result,
                context={"reviewer_feedback": reviewer_feedback, "monitor_feedback": monitor_feedback},
            )
            # 如果 LLM 审查发现了严重问题但 planner 关键词匹配未捕获，降级为 revision_required
            if result.get("status") == "approved" and reviewer_feedback:
                critical_signals = ["严重", "致命", "阻塞", "critical", "fatal", "blocker", "必须修复", "不能发布"]
                if any(sig in reviewer_feedback.lower() for sig in critical_signals):
                    result["status"] = "revision_required"
                    result.setdefault("issues", [])
                    result["issues"].append({
                        "type": "logic_error",
                        "location": "reviewer",
                        "detail": "审查者发现严重问题",
                        "suggestion": reviewer_feedback[:200],
                    })
        else:
            result = {"status": "approved", "issues": [], "max_iterations": 3}

        # 确定性门禁合并：真实测试/lint 失败强制 revision_required（仅降级，不覆盖 LLM 通过结论）。
        # 工具缺失被门禁标记为 skipped（fail-open），不会进入 failures，因此不强制 revision。
        if gate_result and not gate_result.get("passed", True):
            result["status"] = "revision_required"
            result.setdefault("issues", [])
            for failure in gate_result.get("failures", []):
                result["issues"].append({
                    "type": failure.get("type", "gate_failure"),
                    "location": failure.get("location", "deterministic_gate"),
                    "detail": failure.get("detail", "确定性门禁未通过"),
                    "suggestion": "请修复后重新运行测试/代码检查",
                })

        # 门禁跳过（工具缺失 fail-open）对下游可见（前端/日志），不影响 status
        if gate_result and gate_result.get("skipped"):
            result["gate_skipped"] = gate_result.get("skipped", [])
        return result
