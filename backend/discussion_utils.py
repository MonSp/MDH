"""
discussion_utils - 讨论投影共享辅助函数

串行讨论（DiscussionManager._project_previous_context）、并行讨论
（MixedLocationDiscussion._project_previous_context）与审查决策投影
（MeetingCoordinator._project_discussion_decisions）三处共享的 STANCE 标签
剥离 / 立场解析 / 角色解析工具，消除重复实现（P3-T2 I3）。

统一语义：
- strip_stance_tags: 剥离 STANCE/CONFIDENCE 标签（含截断后残留的未闭合片段）。
- parse_stance_from_content: 必须在内容截断前调用——>80 字发言的尾标签若先被
  截断将解析失败，导致投影图标退化为 '='（见 P3-T2 I1）。
- resolve_agent_role: 回退顺序为 meeting 解析 → msg_role → agent_id → "?"。
  历史分歧：MeetingCoordinator 对 None agent_id 返回 ""、DiscussionManager 返回
  "?"——统一为 "?" 并优先 msg_role；对已过滤 agent_message 的决策投影路径
  （agent_id 恒有值）无行为差异。
- is_coordinator_agent: 协调者状态消息（analysis_text/plan_text/组织团队讨论 等）
  不应混入讨论 previous_context 占用窗口（见 P3-T2 I2）。
"""

import re

from protocol import AgentRole

# STANCE 完整标签（解析用；剥离正则见 strip_stance_tags）
_STANCE_TAG_RE = re.compile(r'\[STANCE:(support|oppose|modify|neutral)\]', re.IGNORECASE)


def strip_stance_tags(text: str) -> str:
    """剥离 STANCE/CONFIDENCE 标签（含内容被截断后残留的未闭合标签片段）。"""
    core = re.sub(r'\[STANCE:.*?\]', '', text)
    core = re.sub(r'\[CONFIDENCE:.*?\]', '', core)
    # 内容被截断在标签中间时（如 "[STANCE:su"）无闭合括号，上面的正则匹配不到，
    # 这里兜底剥离残留片段，避免下游 prompt 出现残缺标签。
    core = re.sub(r'\[STANCE:[^\]]*$', '', core)
    core = re.sub(r'\[CONFIDENCE:[^\]]*$', '', core)
    return core.strip()


def parse_stance_from_content(content: str) -> str:
    """从完整内容解析 STANCE 标签（缺失视为 neutral）。"""
    match = _STANCE_TAG_RE.search(content)
    return match.group(1).lower() if match else "neutral"


def resolve_agent_role(
    meeting,
    agent_id: str | None,
    msg_role: str | None = None,
) -> str:
    """从 agent_id 解析角色名（统一三处调用点的回退语义）。

    回退顺序：
    1. meeting.get_agent(agent_id) 命中 → 返回 agent.role.value；
    2. 提供非空 msg_role → 返回 msg_role（消息自带 role 字段）；
    3. agent_id 非空 → 返回 agent_id 本身（未注册 agent 的兜底）；
    4. 兜底返回 "?"。
    """
    if agent_id and meeting is not None:
        agent = meeting.get_agent(agent_id)
        if agent is not None:
            return agent.role.value
    if msg_role:
        return msg_role
    if agent_id:
        return agent_id
    return "?"


def is_coordinator_agent(meeting, agent_id: str | None) -> bool:
    """判断 agent_id 是否对应协调者角色。

    协调者状态消息（analysis_text/plan_text/组织团队讨论 等）不应混入讨论
    previous_context 占用窗口；讨论发言均来自 planner/executor/monitor/reviewer。
    """
    if not agent_id or meeting is None:
        return False
    agent = meeting.get_agent(agent_id)
    return agent is not None and agent.role == AgentRole.COORDINATOR
