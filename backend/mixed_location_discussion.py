"""
MixedLocationDiscussion - 支持混合本地/远端智能体的并行讨论引擎

核心改进：
1. 并行调用所有Agent的LLM（使用asyncio.gather）
2. 感知Agent的location（local/remote），优化调用策略
3. 支持混合团队：本地TS智能体 + 远端Python智能体
4. 流式推送讨论进度到前端
"""

import asyncio
import logging
import re
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from agentscope.agent import Agent
from agentscope.message import Msg

from agenda import AgendaStateMachine
from agent import _extract_text
from discussion_utils import is_coordinator_agent, strip_stance_tags
from negotiation import NegotiationEngine
from protocol import LLM_FALLBACK_TEMPLATE
from team import AgentLocation, Team, TeamMember

logger = logging.getLogger("mixed_location_discussion")


@dataclass
class DiscussionEntry:
    """单条讨论记录"""
    agent_id: str
    agent_name: str
    role: str
    location: str  # 'local' | 'remote'
    content: str
    stance: str
    confidence: float
    round: int
    duration_ms: float
    error: str | None = None


class MixedLocationDiscussion:
    """
    支持混合本地/远端智能体的并行讨论引擎

    特性：
    - 并行调用所有Agent的LLM
    - 感知Agent的location，优化调用策略
    - 支持混合团队讨论
    - 流式推送讨论进度
    """

    def __init__(
        self,
        team: Team,
        agenda: AgendaStateMachine,
        negotiation: NegotiationEngine,
        get_model_fn: Callable[[str], Agent],
        meeting: Any | None = None,
        max_concurrent: int = 6,
        timeout: float = 30.0,
    ):
        """
        初始化混合位置讨论引擎

        Args:
            team: Team实例，包含成员的location信息
            agenda: 议程状态机
            negotiation: 协商引擎
            get_model_fn: 获取模型的函数
            meeting: MeetingSession 实例（P3：previous_context 从 SessionEvent 事件流投影）
            max_concurrent: 最大并发数
            timeout: 单个Agent响应超时时间（秒）
        """
        self._team = team
        self._agenda = agenda
        self._negotiation = negotiation
        self._get_model = get_model_fn
        self._meeting = meeting
        self._max_concurrent = max_concurrent
        self._timeout = timeout
        self._semaphore = asyncio.Semaphore(max_concurrent)

        # 构建成员信息索引
        self._member_info: dict[str, TeamMember] = {}
        for member in team.members:
            self._member_info[member.agent_id] = member

        logger.info("MixedLocationDiscussion 初始化完成 (成员数=%d, max_concurrent=%d)",
                    len(team.members), max_concurrent)

    async def run(
        self,
        topic: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
        max_rounds: int = 2,
    ) -> list[dict[str, Any]]:
        """
        运行并行讨论

        Args:
            topic: 讨论主题
            on_message: 消息回调
            max_rounds: 最大轮数

        Returns:
            讨论结果列表
        """
        self._agenda.open_topic(topic)
        self._agenda.start_discussion()

        all_discussions: list[dict[str, Any]] = []

        # 过滤出可讨论的成员（排除CEO和Coordinator）
        discussable_members = [
            m for m in self._team.members
            if m.team_role in ['Planner', 'Executor', 'Reviewer', 'Monitor']
        ]

        if not discussable_members:
            logger.warning("没有可讨论的成员")
            return all_discussions

        # 按location分组统计
        local_count = sum(1 for m in discussable_members if m.location == 'local')
        remote_count = sum(1 for m in discussable_members if m.location == 'remote')
        logger.info("讨论团队组成: 本地=%d, 远端=%d", local_count, remote_count)

        for current_round in range(1, max_rounds + 1):
            logger.info("开始第 %d 轮讨论", current_round)
            round_start_time = time.time()

            # 构建上下文
            previous_context = self._build_previous_context(all_discussions)

            # 并行调用所有成员
            tasks = [
                self._ask_member(
                    member=member,
                    topic=topic,
                    round_num=current_round,
                    previous_context=previous_context,
                )
                for member in discussable_members
            ]

            # 使用asyncio.gather并行执行
            results = await asyncio.gather(*tasks, return_exceptions=True)

            # 处理结果
            round_results = []
            for member, result in zip(discussable_members, results):
                if isinstance(result, Exception):
                    logger.error("成员 %s 在第 %d 轮讨论中失败: %s",
                               member.agent_id, current_round, result)
                    entry = DiscussionEntry(
                        agent_id=member.agent_id,
                        agent_name=member.role_name,
                        role=member.team_role,
                        location=member.location,
                        content=f"[讨论失败: {result!s}]",
                        stance="neutral",
                        confidence=0.0,
                        round=current_round,
                        duration_ms=0,
                        error=str(result),
                    )
                else:
                    text, stance, confidence, duration_ms = result
                    entry = DiscussionEntry(
                        agent_id=member.agent_id,
                        agent_name=member.role_name,
                        role=member.team_role,
                        location=member.location,
                        content=text,
                        stance=stance,
                        confidence=confidence,
                        round=current_round,
                        duration_ms=duration_ms,
                    )

                    # 推送消息到前端
                    if on_message:
                        try:
                            await on_message(member.agent_id, text, "",
                                          stance=stance, confidence=confidence)
                        except Exception as e:
                            logger.error("消息推送失败: %s", e)

                round_results.append(entry.__dict__)
                all_discussions.append(entry.__dict__)

                # P3 统一写入口：讨论发言同步写入 SessionEvent 事件流（与串行
                # DiscussionManager 一致），使 previous_context 的 deriveMessages
                # 投影能看到本轮讨论内容（否则并行讨论的后续轮次将丢失前序发言）。
                if self._meeting is not None:
                    try:
                        self._meeting.add_message("agent", entry.content, member.agent_id)
                    except Exception as e:
                        logger.warning("讨论发言写入会议事件流失败: %s", e)

            round_elapsed = time.time() - round_start_time
            logger.info("第 %d 轮讨论完成，耗时 %.2f 秒", current_round, round_elapsed)

            # 检查是否达成共识
            if current_round < max_rounds:
                should_continue = await self._evaluate_convergence(
                    topic, all_discussions
                )
                if not should_continue:
                    logger.info("讨论已在第 %d 轮达成共识", current_round)
                    break

        # 协调者总结
        await self._coordinator_summarize(topic, all_discussions, on_message)

        logger.info("讨论完成，共 %d 轮，%d 条讨论",
                   max_rounds, len(all_discussions))

        return all_discussions

    async def _ask_member(
        self,
        member: TeamMember,
        topic: str,
        round_num: int,
        previous_context: str,
    ) -> tuple[str, str, float, float]:
        """
        向单个成员提问

        Args:
            member: TeamMember实例
            topic: 讨论主题
            round_num: 当前轮数
            previous_context: 之前的讨论上下文

        Returns:
            (text, stance, confidence, duration_ms) 元组
        """
        async with self._semaphore:
            start_time = time.time()

            # 获取模型
            model = self._get_model(member.role_name)

            # 构建提示词
            role_desc = f"{member.role_name}（{member.team_role}）"
            if round_num == 1:
                prompt = (
                    f"当前讨论议题：{topic}\n"
                    f"之前的讨论：\n{previous_context}\n\n"
                    f"请以{role_desc}的身份发表你的看法和建议（2-3句话）。"
                    f"请在回复末尾用 [STANCE:support/oppose/modify/neutral] 和 [CONFIDENCE:0.0-1.0] 标注你的立场和置信度。"
                )
            else:
                prompt = (
                    f"当前讨论议题：{topic}\n"
                    f"当前是第{round_num}轮讨论\n"
                    f"之前的讨论：\n{previous_context}\n\n"
                    f"请基于之前的讨论，以{role_desc}的身份发表你的进一步看法。"
                    f"你可以引用或回应其他同事的观点，提出补充建议或修正意见（2-3句话）。"
                    f"请在回复末尾用 [STANCE:support/oppose/modify/neutral] 和 [CONFIDENCE:0.0-1.0] 标注你的立场和置信度。"
                )

            # 发送消息并等待响应
            msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])

            try:
                response = await asyncio.wait_for(
                    model.reply(msg),
                    timeout=self._timeout
                )
                text = _extract_text(response)

                # 解析立场和置信度
                stance, confidence = self._parse_stance(text)

                duration_ms = (time.time() - start_time) * 1000
                return text, stance, confidence, duration_ms

            except asyncio.TimeoutError:
                raise RuntimeError(f"成员 {member.agent_id} ({member.role_name}) 响应超时")
            except Exception as e:
                raise RuntimeError(f"成员 {member.agent_id} ({member.role_name}) 响应失败: {e!s}")

    def _parse_stance(self, text: str) -> tuple[str, float]:
        """
        从响应中解析立场和置信度
        """
        stance_match = re.search(r'\[STANCE:(support|oppose|modify|neutral)\]', text, re.IGNORECASE)
        stance = stance_match.group(1).lower() if stance_match else "neutral"

        confidence_match = re.search(r'\[CONFIDENCE:([\d.]+)\]', text)
        confidence = min(1.0, max(0.0, float(confidence_match.group(1)))) if confidence_match else 0.5

        return stance, confidence

    def _build_previous_context(self, discussions: list[dict[str, Any]]) -> str:
        """
        构建之前的讨论上下文
        P3：优先从 SessionEvent 事件流投影（保留既有 10 条/80 字语义）；
        无事件流时回退到既有讨论列表拼装。
        """
        projected = self._project_previous_context()
        if projected is not None:
            return projected
        return self._build_legacy_previous_context(discussions)

    def _project_previous_context(self) -> str | None:
        """从 SessionEvent 事件流投影 previous_context（event_types=agent_message, window=10, max_content_len=80）。

        P3-T2 I2：仅投影 agent_message 讨论发言并排除协调者状态消息，避免
        coordinator 状态消息（analysis_text/plan_text/组织团队讨论 等）占用窗口。

        Returns:
            投影文本；无 meeting 引用或事件流为空时返回 None（由调用方回退）。
        """
        if self._meeting is None:
            return None
        try:
            projected = self._meeting.deriveMessages(
                event_types=["agent_message"], window=10, max_content_len=80
            )
        except Exception as e:
            logger.warning("previous_context 事件投影失败，回退既有实现: %s", e)
            return None
        if not projected:
            return None

        context_parts = []
        for m in projected:
            content = m.get("content", "") or ""
            agent_id = m.get("agent_id")
            member = self._member_info.get(agent_id) if agent_id else None
            # 协调者状态消息不混入讨论上下文（P3-T2 I2）
            if member and member.team_role == "Coordinator":
                continue
            if is_coordinator_agent(self._meeting, agent_id):
                continue
            if member:
                agent_name = member.role_name
                location = "local" if member.location == AgentLocation.LOCAL else "remote"
            else:
                agent_name = "用户" if m.get("role") == "user" else (agent_id or "未知")
                location = "unknown"
            location_icon = "💻" if location == "local" else "☁️"
            # 截取核心观点，去掉STANCE/CONFIDENCE标签（截断由 deriveMessages 的 80 字限制承担）
            core = strip_stance_tags(content)
            if core:
                context_parts.append(f"{location_icon} {agent_name}: {core}")
        if not context_parts:
            return None
        return "\n".join(context_parts)

    def _build_legacy_previous_context(self, discussions: list[dict[str, Any]]) -> str:
        """既有实现：从讨论结果列表拼装（无事件流时的回退路径）"""
        if not discussions:
            return "（暂无讨论）"

        context_parts = []
        for entry in discussions[-10:]:  # 只取最近10条
            agent_name = entry.get("agent_name", entry.get("role", "未知"))
            content = entry.get("content", "")
            round_num = entry.get("round", 0)
            location = entry.get("location", "unknown")
            location_icon = "💻" if location == "local" else "☁️"
            # 截取核心观点，去掉STANCE/CONFIDENCE标签
            core = re.sub(r'\[STANCE:.*?\]', '', content)
            core = re.sub(r'\[CONFIDENCE:.*?\]', '', core).strip()
            if len(core) > 80:
                core = core[:80] + "..."
            context_parts.append(f"[第{round_num}轮] {location_icon} {agent_name}: {core}")

        return "\n".join(context_parts)

    async def _evaluate_convergence(
        self,
        topic: str,
        discussions: list[dict[str, Any]]
    ) -> bool:
        """
        评估讨论是否达成共识
        """
        if len(discussions) < 2:
            return True

        # 获取最近一轮的讨论
        recent_round = max(d.get("round", 0) for d in discussions)
        recent_discussions = [
            d for d in discussions if d.get("round") == recent_round
        ]

        if len(recent_discussions) < 2:
            return True

        # 检查立场一致性
        stances = [d.get("stance", "neutral") for d in recent_discussions]
        unique_stances = set(stances)

        # 如果所有立场相同，认为达成共识
        if len(unique_stances) == 1:
            logger.info("所有成员立场一致: %s", unique_stances.pop())
            return False

        # 检查置信度
        confidences = [d.get("confidence", 0.5) for d in recent_discussions]
        avg_confidence = sum(confidences) / len(confidences)

        # 如果平均置信度很高，认为达成共识
        if avg_confidence > 0.8:
            logger.info("平均置信度很高: %.2f", avg_confidence)
            return False

        return True

    async def _coordinator_summarize(
        self,
        topic: str,
        discussions: list[dict[str, Any]],
        on_message: Callable[[str, str, str], Awaitable[None]],
    ):
        """
        协调者总结
        """
        # 查找Coordinator成员
        coordinator_member = None
        for member in self._team.members:
            if member.team_role == 'Coordinator':
                coordinator_member = member
                break

        if not coordinator_member:
            logger.warning("没有找到Coordinator成员，跳过总结")
            return

        model = self._get_model(coordinator_member.role_name)
        discussion_summary = self._build_previous_context(discussions)
        prompt = (
            f"你是团队的协调者。以下是关于「{topic}」的多轮讨论内容，请给出最终总结。\n\n"
            f"讨论内容：\n{discussion_summary}\n\n"
            f"请综合各方观点，给出简洁的总结和最终结论（3-4句话）。"
        )
        msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])

        try:
            response = await asyncio.wait_for(
                model.reply(msg),
                timeout=self._timeout
            )
            summary_text = _extract_text(response)
        except Exception as e:
            logger.warning("Coordinator总结失败: %s", e)
            summary_text = LLM_FALLBACK_TEMPLATE.format(role="coordinator", content_type="总结")

        # 推送总结到前端
        if on_message:
            try:
                await on_message(coordinator_member.agent_id, summary_text, "")
            except Exception as e:
                logger.error("总结推送失败: %s", e)

        # 记录到讨论结果
        discussions.append({
            "agent_id": coordinator_member.agent_id,
            "agent_name": coordinator_member.role_name,
            "role": coordinator_member.team_role,
            "location": coordinator_member.location,
            "content": summary_text,
            "stance": "neutral",
            "confidence": 0.5,
            "round": 0,
            "duration_ms": 0,
        })

        # 协商共识：按 agent_id 去重（取最后一次发言的立场），避免多轮讨论重复投票
        # 排除协调者——其角色是总结者，不应投票
        proposal = self._negotiation.create_proposal(
            coordinator_member.agent_id, discussion_summary
        )
        last_stance_by_agent = {}
        for d in discussions:
            aid = d.get('agent_id', '')
            if aid and aid != coordinator_member.agent_id:
                last_stance_by_agent[aid] = d

        for agent_id, d in last_stance_by_agent.items():
            stance_str = d.get('stance', 'neutral')
            approve = stance_str in ('support', 'modify')
            self._negotiation.cast_vote(
                proposal.id, agent_id, approve,
                reason=f"立场: {stance_str}",
            )
        vote_result = self._negotiation.evaluate_consensus(proposal.id)
        logger.info("Consensus result: %s", vote_result)
