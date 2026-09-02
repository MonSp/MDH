"""
测试 DiscussionManager 串行讨论的 previous_context 事件流投影。

覆盖 P3-T2 I1/I2/I4：
- I1: >80 字含尾标签 [STANCE:support] 的发言投影后图标为 "+"（先于截断解析，非 "="）
- I2: round-1 无讨论发言时 previous_context 不含 coordinator 状态消息
- ③: window=10 语义（只取最近 10 条讨论发言）
"""
import os
import sys
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agenda import AgendaStateMachine
from discussion_manager import DiscussionManager
from meeting import MeetingSession
from negotiation import NegotiationEngine


def _make_discussion_manager(meeting: MeetingSession) -> DiscussionManager:
    """构造带 meeting 引用的串行 DiscussionManager"""
    return DiscussionManager(
        agenda=AgendaStateMachine(),
        negotiation=NegotiationEngine(),
        get_model_fn=lambda role: MagicMock(),
        meeting=meeting,
    )


class TestSerialDiscussionProjection:
    def test_round1_context_excludes_coordinator_status_messages(self, tmp_path):
        """round-1 无讨论发言：协调者状态消息不进入 previous_context（空→回退占位）"""
        meeting = MeetingSession("m-serial-r1", session_log_dir=str(tmp_path))
        meeting.start()
        # 模拟讨论开始前的 coordinator 状态消息（analysis_text/plan_text/组织讨论）
        meeting.add_message("agent", "任务分析：需要开发一个用户管理模块", "agent-coordinator")
        meeting.add_message("agent", "制定项目计划：阶段1需求分析 阶段2任务分配", "agent-coordinator")

        manager = _make_discussion_manager(meeting)
        context = manager._build_previous_context([])

        # 投影路径被过滤为空 → 回退既有占位文本，且不含 coordinator 消息
        assert "任务分析" not in context
        assert "制定项目计划" not in context
        assert "尚无发言" in context

    def test_round1_context_keeps_discussion_entries_only(self, tmp_path):
        """协调者状态消息与讨论发言并存时：上下文仅含讨论发言条目"""
        meeting = MeetingSession("m-serial-r1b", session_log_dir=str(tmp_path))
        meeting.start()
        meeting.add_message("agent", "协调者状态：组织团队讨论", "agent-coordinator")
        meeting.add_message("agent", "我认为采用事件驱动架构 [STANCE:support] [CONFIDENCE:0.9]", "agent-planner")

        manager = _make_discussion_manager(meeting)
        context = manager._build_previous_context([])

        assert "组织团队讨论" not in context
        assert "事件驱动架构" in context
        assert "[planner](+)" in context

    def test_long_speech_stance_icon_parsed_pre_truncation(self, tmp_path):
        """>80 字含尾标签 [STANCE:support] 的发言：图标为 +（非 =）——先于截断解析"""
        meeting = MeetingSession("m-serial-i1", session_log_dir=str(tmp_path))
        meeting.start()
        # 标签在文尾且总长 > 80：若先截断再解析，标签丢失 → 图标退化为 =
        long_text = "详细观点" * 30 + " [STANCE:support] [CONFIDENCE:0.9]"
        assert len(long_text) > 80
        meeting.add_message("agent", long_text, "agent-executor")

        manager = _make_discussion_manager(meeting)
        context = manager._build_previous_context([])

        assert "[executor](+)" in context
        assert "[executor](=)" not in context
        assert "[STANCE:" not in context
        assert "[CONFIDENCE:" not in context

    def test_projection_window_limits_to_10(self, tmp_path):
        """window=10 语义：只取最近 10 条讨论发言，最早的被排除"""
        meeting = MeetingSession("m-serial-win", session_log_dir=str(tmp_path))
        meeting.start()
        for i in range(15):
            meeting.add_message("agent", f"讨论发言{i}", "agent-planner")

        manager = _make_discussion_manager(meeting)
        context = manager._build_previous_context([])

        assert "讨论发言14" in context
        assert "讨论发言0" not in context


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
