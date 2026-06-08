"""
Discussion Manager - 讨论管理器

从 MeetingCoordinator 的 run_discussion() 提取。
负责多角色讨论、立场解析、共识评估。
"""

import json
import logging
import re
from typing import Any, Awaitable, Callable, Dict, List, Optional

from agentscope.agent import Agent
from agentscope.message import Msg

from agent import _extract_text
from agenda import AgendaStateMachine
from negotiation import NegotiationEngine, ConsensusStrategy, Stance
from protocol import AgentRole, MeetingAgentStatus

logger = logging.getLogger("discussion_manager")


class DiscussionManager:
    """讨论管理器"""
    
    def __init__(
        self,
        agenda: AgendaStateMachine,
        negotiation: NegotiationEngine,
        get_model_fn,
        meeting,
    ):
        self._agenda = agenda
        self._negotiation = negotiation
        self._get_model = get_model_fn
        self._meeting = meeting
    
    async def run(
        self,
        topic: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
        max_rounds: int = 2,
    ) -> List[Dict[str, str]]:
        """
        运行多角色讨论
        
        Args:
            topic: 讨论主题
            on_message: 消息回调
            max_rounds: 最大轮数
            
        Returns:
            讨论结果列表
        """
        self._agenda.open_topic(topic)
        self._agenda.start_discussion()
        
        all_discussions: List[Dict[str, Any]] = []
        discussion_roles = [
            AgentRole.PLANNER,
            AgentRole.EXECUTOR,
            AgentRole.MONITOR,
            AgentRole.REVIEWER,
        ]
        
        for current_round in range(1, max_rounds + 1):
            logger.info("讨论第 %d 轮", current_round)
            round_results: List[Dict[str, Any]] = []
            
            for role in discussion_roles:
                agent_id = self._find_agent_id(role)
                if agent_id is None:
                    continue
                
                self._meeting.update_agent_status(agent_id, MeetingAgentStatus.SPEAKING)
                model = self._get_model(role)
                
                previous_context = self._build_previous_context(all_discussions)
                if current_round == 1:
                    prompt = (
                        f"当前会议议题：{topic}\n"
                        f"当前议程阶段：{self._agenda.get_phase().value}\n"
                        f"之前的讨论：\n{previous_context}\n\n"
                        f"请以{role.value}的身份发表你的看法和建议（2-3句话）。"
                        f"请在回复末尾用 [STANCE:support/oppose/modify/neutral] 和 [CONFIDENCE:0.0-1.0] 标注你的立场和置信度。"
                    )
                else:
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
                
                self._agenda.request_token(agent_id, 0.8)

                stance, confidence = self._parse_stance_from_response(text)
                await on_message(agent_id, text, "", stance=stance, confidence=confidence)
                self._meeting.add_message("agent", text, agent_id)
                self._meeting.update_agent_status(agent_id, MeetingAgentStatus.MEETING)

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
                should_continue = await self._evaluate_convergence(topic, all_discussions)
                if not should_continue:
                    logger.info("讨论已在第 %d 轮达成共识，无需继续", current_round)
                    break
        
        # 协调者总结
        await self._coordinator_summarize(topic, all_discussions, on_message)
        
        self._agenda.close()
        return all_discussions
    
    async def _coordinator_summarize(
        self,
        topic: str,
        all_discussions: List[Dict[str, Any]],
        on_message: Callable[[str, str, str], Awaitable[None]],
    ):
        """协调者总结"""
        coordinator_id = self._find_agent_id(AgentRole.COORDINATOR)
        if not coordinator_id:
            return
        
        self._meeting.update_agent_status(coordinator_id, MeetingAgentStatus.SPEAKING)
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
        self._meeting.add_message("agent", summary_text, coordinator_id)
        self._meeting.update_agent_status(coordinator_id, MeetingAgentStatus.MEETING)
        
        all_discussions.append({
            "agent_id": coordinator_id,
            "role": AgentRole.COORDINATOR.value,
            "content": summary_text,
            "parsed_stance": "neutral",
            "parsed_confidence": 0.5,
            "round": 0,
        })
        
        # 协商共识
        proposal = self._negotiation.create_proposal(coordinator_id, discussion_summary)
        for r in all_discussions:
            stance_str = r.get('parsed_stance', 'neutral')
            self._negotiation.add_argument(
                proposal.id, r['agent_id'],
                Stance(stance_str),
                r.get('parsed_confidence', 0.5),
                r['content']
            )
        vote_result = self._negotiation.evaluate_consensus(proposal.id)
        logger.info(f"Consensus result: {vote_result}")
    
    def _find_agent_id(self, role: AgentRole) -> Optional[str]:
        for a in self._meeting.agents:
            if a.role == role:
                return a.id
        return None
    
    def _build_previous_context(self, results: List[Dict[str, Any]]) -> str:
        if not results:
            return "（尚无发言）"
        return "\n".join([f"[{r['role']}]: {r['content']}" for r in results])
    
    def _parse_stance_from_response(self, text: str) -> tuple[str, float]:
        stance_match = re.search(r'\[STANCE:(support|oppose|modify|neutral)\]', text, re.IGNORECASE)
        confidence_match = re.search(r'\[CONFIDENCE:([\d.]+)\]', text)
        stance = stance_match.group(1).lower() if stance_match else 'neutral'
        confidence = min(1.0, max(0.0, float(confidence_match.group(1)))) if confidence_match else 0.5
        return stance, confidence
    
    async def _evaluate_convergence(self, topic: str, all_discussions: List[Dict[str, Any]]) -> bool:
        """评估讨论是否收敛"""
        ceo_id = self._find_agent_id(AgentRole.CEO)
        if not ceo_id:
            return False
        
        discussion_summary = "\n".join([
            f"[第{d.get('round', '?')}轮 - {d['role']}]: {d['content']}" for d in all_discussions
        ])
        
        self._meeting.update_agent_status(ceo_id, MeetingAgentStatus.SPEAKING)
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
        self._meeting.update_agent_status(ceo_id, MeetingAgentStatus.MEETING)
        
        json_match = re.search(r'\{[^{}]*\}', text, re.DOTALL)
        if json_match:
            try:
                data = json.loads(json_match.group())
                return bool(data.get("continue_discussion", False))
            except (json.JSONDecodeError, TypeError):
                pass
        
        return False
