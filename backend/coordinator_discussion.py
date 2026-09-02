"""
MeetingCoordinator 讨论流程子模块

提取自 meeting_coordinator.py 的讨论相关方法：
- run_discussion: 运行多角色讨论
- _extract_discussion_decisions: 从讨论结果中提取结构化决策摘要
- _project_discussion_decisions: 从 SessionEvent 事件流投影讨论决策摘要
"""

import logging
import re
from collections.abc import Awaitable, Callable

from discussion_utils import (
    parse_stance_from_content,
    resolve_agent_role,
    strip_stance_tags,
)
from mixed_location_discussion import MixedLocationDiscussion
from team import Team

logger = logging.getLogger("coordinator_discussion")


async def run_discussion(
    coordinator,
    topic: str,
    on_message: Callable[[str, str, str], Awaitable[None]],
    max_rounds: int = 2,
    team: Team | None = None,
) -> list[dict[str, str]]:
    """运行多角色讨论

    如果提供了Team实例，使用MixedLocationDiscussion进行并行讨论；
    否则回退到串行的DiscussionManager。
    """
    # 如果有Team实例，使用并行讨论引擎
    if team and hasattr(team, 'members') and team.members:
        logger.info("使用并行讨论引擎 (成员数=%d)", len(team.members))
        try:
            if coordinator._mixed_discussion is None:
                coordinator._mixed_discussion = MixedLocationDiscussion(
                    team=team,
                    agenda=coordinator.agenda,
                    negotiation=coordinator.negotiation,
                    get_model_fn=coordinator._get_model,
                    meeting=coordinator.meeting,
                )
            return await coordinator._mixed_discussion.run(topic, on_message, max_rounds)
        except Exception as e:
            logger.warning("并行讨论引擎初始化失败，回退到串行: %s", e)

    # 回退到串行讨论
    logger.info("使用串行讨论引擎")
    return await coordinator._discussion_manager.run(topic, on_message, max_rounds)


def _extract_discussion_decisions(coordinator, discussion_results: list) -> str:
    """从讨论结果中提取结构化决策摘要

    优先从 SessionEvent 事件流投影（保留 support/modify 过滤与 8 条/120 字语义）；
    无事件流时回退到 discussion_results 既有实现。

    Args:
        coordinator: MeetingCoordinator 实例
        discussion_results: 讨论结果列表（回退路径使用）

    Returns:
        决策摘要文本（供审查阶段使用）
    """
    projected = _project_discussion_decisions(coordinator)
    if projected is not None:
        return projected

    if not discussion_results:
        return ""

    decisions = []
    for result in discussion_results:
        content = result.get("content", "")
        stance = result.get("parsed_stance", result.get("stance", "neutral"))
        role = result.get("role", "")
        if stance in ["support", "modify"] and content:
            core = re.sub(r'\[STANCE:.*?\]', '', content)
            core = re.sub(r'\[CONFIDENCE:.*?\]', '', core).strip()
            if len(core) > 120:
                core = core[:120] + "..."
            icon = "+" if stance == "support" else "~"
            decisions.append(f"  {icon} [{role}] {core}")

    if not decisions:
        return ""
    return "团队讨论确定的方案与约束：\n" + "\n".join(decisions[:8])


def _project_discussion_decisions(coordinator) -> str | None:
    """从 SessionEvent 事件流投影讨论决策摘要。

    保留 support/modify 过滤与 8 条/120 字语义：对投影到的 agent_message 事件
    解析内容中的 [STANCE:] 标签（先于截断），仅保留 support/modify，每条剥标签后
    截断到 120 字，最多取前 8 条。返回 None 时由调用方回退既有实现。
    """
    try:
        projected = coordinator.meeting.deriveMessages(
            event_types=["agent_message"], window=50
        )
    except Exception as e:
        logger.warning("讨论决策事件投影失败，回退既有实现: %s", e)
        return None
    if not projected:
        return None

    decisions = []
    for m in projected:
        content = m.get("content", "") or ""
        if not content:
            continue
        stance = parse_stance_from_content(content)
        if stance not in ("support", "modify"):
            continue
        role = resolve_agent_role(coordinator.meeting, m.get("agent_id"))
        core = strip_stance_tags(content)
        if len(core) > 120:
            core = core[:120] + "..."
        icon = "+" if stance == "support" else "~"
        decisions.append(f"  {icon} [{role}] {core}")

    if not decisions:
        return None
    return "团队讨论确定的方案与约束：\n" + "\n".join(decisions[:8])
