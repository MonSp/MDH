"""
测试 MixedLocationDiscussion - 混合位置并行讨论引擎
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from mixed_location_discussion import MixedLocationDiscussion
from team import Team, TeamMember, TeamRuntime, RuntimeType, AgentLocation
from agenda import AgendaStateMachine
from negotiation import NegotiationEngine, ConsensusStrategy


def create_test_team():
    """创建测试团队"""
    runtime = TeamRuntime(
        runtime_id="test-runtime",
        runtime_type=RuntimeType.LOCAL_DOCKER,
        root_path="/tmp/test",
    )
    team = Team(
        team_id="test-team",
        project_id="test-project",
        runtime=runtime,
    )
    
    # 添加本地成员
    team.add_member(TeamMember(
        agent_id="agent-planner",
        role_name="planner",
        team_role="Planner",
        location=AgentLocation.LOCAL,
    ))
    team.add_member(TeamMember(
        agent_id="agent-executor",
        role_name="executor",
        team_role="Executor",
        location=AgentLocation.LOCAL,
    ))
    
    # 添加远端成员
    team.add_member(TeamMember(
        agent_id="agent-reviewer",
        role_name="reviewer",
        team_role="Reviewer",
        location=AgentLocation.REMOTE,
    ))
    
    # 添加Coordinator
    team.add_member(TeamMember(
        agent_id="agent-coordinator",
        role_name="coordinator",
        team_role="Coordinator",
        location=AgentLocation.LOCAL,
    ))
    
    return team


def create_mock_model(stance="support", confidence=0.8, content="我认为这个方案可行"):
    """创建模拟模型"""
    mock_model = MagicMock()
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text=f"{content} [STANCE:{stance}] [CONFIDENCE:{confidence}]")]
    mock_model.reply = AsyncMock(return_value=mock_response)
    return mock_model


@pytest.mark.asyncio
async def test_parallel_discussion_basic():
    """测试基本的并行讨论功能"""
    team = create_test_team()
    agenda = AgendaStateMachine()
    negotiation = NegotiationEngine(ConsensusStrategy.SIMPLE_MAJORITY)
    
    # 模拟get_model_fn
    def get_model_fn(role):
        return create_mock_model()
    
    discussion = MixedLocationDiscussion(
        team=team,
        agenda=agenda,
        negotiation=negotiation,
        get_model_fn=get_model_fn,
        max_concurrent=4,
        timeout=10.0,
    )
    
    # 模拟消息回调
    messages = []
    async def on_message(agent_id, text, delta, **kwargs):
        messages.append({"agent_id": agent_id, "text": text, **kwargs})
    
    # 运行讨论
    results = await discussion.run(
        topic="如何实现用户认证模块",
        on_message=on_message,
        max_rounds=1,
    )
    
    # 验证结果
    assert len(results) > 0
    # 应该有3个讨论成员（排除Coordinator）
    discussable_results = [r for r in results if r.get("round", 0) > 0]
    assert len(discussable_results) == 3  # planner, executor, reviewer
    
    # 验证消息推送
    assert len(messages) > 0


@pytest.mark.asyncio
async def test_mixed_location_team():
    """测试混合位置团队的讨论"""
    team = create_test_team()
    agenda = AgendaStateMachine()
    negotiation = NegotiationEngine(ConsensusStrategy.SIMPLE_MAJORITY)
    
    # 记录每个成员的位置
    location_calls = []
    
    def get_model_fn(role):
        model = create_mock_model()
        original_reply = model.reply
        
        async def tracking_reply(msg):
            # 找到对应角色的成员
            for member in team.members:
                if member.role_name == role:
                    location_calls.append({"role": role, "location": member.location.value})
                    break
            return await original_reply(msg)
        
        model.reply = tracking_reply
        return model
    
    discussion = MixedLocationDiscussion(
        team=team,
        agenda=agenda,
        negotiation=negotiation,
        get_model_fn=get_model_fn,
    )
    
    async def on_message(agent_id, text, delta, **kwargs):
        pass
    
    await discussion.run(
        topic="测试混合位置",
        on_message=on_message,
        max_rounds=1,
    )
    
    # 验证本地和远端成员都被调用
    local_calls = [c for c in location_calls if c["location"] == "local"]
    remote_calls = [c for c in location_calls if c["location"] == "remote"]
    
    assert len(local_calls) > 0
    assert len(remote_calls) > 0


@pytest.mark.asyncio
async def test_discussion_timeout():
    """测试讨论超时处理"""
    team = create_test_team()
    agenda = AgendaStateMachine()
    negotiation = NegotiationEngine(ConsensusStrategy.SIMPLE_MAJORITY)
    
    # 创建一个会超时的模型
    def get_model_fn(role):
        mock_model = MagicMock()
        
        async def slow_reply(msg):
            await asyncio.sleep(2)  # 模拟慢响应
            return MagicMock(content=[MagicMock(text="response")])
        
        mock_model.reply = slow_reply
        return mock_model
    
    discussion = MixedLocationDiscussion(
        team=team,
        agenda=agenda,
        negotiation=negotiation,
        get_model_fn=get_model_fn,
        timeout=0.1,  # 很短的超时时间
    )
    
    async def on_message(agent_id, text, delta, **kwargs):
        pass
    
    results = await discussion.run(
        topic="测试超时",
        on_message=on_message,
        max_rounds=1,
    )
    
    # 应该有错误结果
    error_results = [r for r in results if r.get("error")]
    assert len(error_results) > 0


@pytest.mark.asyncio
async def test_convergence_detection():
    """测试共识检测"""
    team = create_test_team()
    agenda = AgendaStateMachine()
    negotiation = NegotiationEngine(ConsensusStrategy.SIMPLE_MAJORITY)
    
    # 所有成员都支持
    def get_model_fn(role):
        return create_mock_model(stance="support", confidence=0.9)
    
    discussion = MixedLocationDiscussion(
        team=team,
        agenda=agenda,
        negotiation=negotiation,
        get_model_fn=get_model_fn,
    )
    
    async def on_message(agent_id, text, delta, **kwargs):
        pass
    
    # 运行2轮，但应该在第1轮后就达成共识
    results = await discussion.run(
        topic="共识测试",
        on_message=on_message,
        max_rounds=2,
    )
    
    # 检查是否只运行了1轮
    max_round = max(r.get("round", 0) for r in results if r.get("round", 0) > 0)
    assert max_round == 1  # 应该只运行了1轮


@pytest.mark.asyncio
async def test_coordinator_summary():
    """测试协调者总结"""
    team = create_test_team()
    agenda = AgendaStateMachine()
    negotiation = NegotiationEngine(ConsensusStrategy.SIMPLE_MAJORITY)
    
    summary_received = []
    
    def get_model_fn(role):
        model = create_mock_model()
        if role == "coordinator":
            original_reply = model.reply
            
            async def summary_reply(msg):
                result = await original_reply(msg)
                summary_received.append(True)
                return result
            
            model.reply = summary_reply
        return model
    
    discussion = MixedLocationDiscussion(
        team=team,
        agenda=agenda,
        negotiation=negotiation,
        get_model_fn=get_model_fn,
    )
    
    async def on_message(agent_id, text, delta, **kwargs):
        pass
    
    await discussion.run(
        topic="总结测试",
        on_message=on_message,
        max_rounds=1,
    )
    
    # 验证协调者总结被调用
    assert len(summary_received) > 0


# ── stance 解析测试 ──

class TestParseStance:
    def setup_method(self):
        from mixed_location_discussion import MixedLocationDiscussion
        from negotiation import NegotiationEngine, ConsensusStrategy
        from agenda import AgendaStateMachine
        from unittest.mock import MagicMock

        team = MagicMock()
        team.members = []
        self.discussion = MixedLocationDiscussion(
            team=team,
            agenda=AgendaStateMachine(),
            negotiation=NegotiationEngine(ConsensusStrategy.SIMPLE_MAJORITY),
            get_model_fn=lambda role: MagicMock(),
        )

    def test_valid_stances(self):
        for stance_val in ["support", "oppose", "modify", "neutral"]:
            text = f"我认为方案可行 [STANCE:{stance_val}] [CONFIDENCE:0.8]"
            stance, conf = self.discussion._parse_stance(text)
            assert stance == stance_val
            assert conf == 0.8

    def test_invalid_stance_defaults_to_neutral(self):
        """无效 stance 值应默认为 neutral"""
        text = "我同意 [STANCE:agreed] [CONFIDENCE:0.9]"
        stance, conf = self.discussion._parse_stance(text)
        assert stance == "neutral"
        assert conf == 0.9

    def test_confidence_clamped(self):
        """置信度应被限制在 [0.0, 1.0]"""
        text = "[STANCE:support] [CONFIDENCE:1.5]"
        _, conf = self.discussion._parse_stance(text)
        assert conf == 1.0

        # 负数不会被正则匹配到，走默认值 0.5
        text = "[STANCE:support] [CONFIDENCE:-0.3]"
        _, conf = self.discussion._parse_stance(text)
        assert conf == 0.5

    def test_missing_tags_default(self):
        """无标签时应返回 neutral + 0.5"""
        text = "这是一个普通的回复"
        stance, conf = self.discussion._parse_stance(text)
        assert stance == "neutral"
        assert conf == 0.5

    def test_case_insensitive(self):
        """stance 解析应不区分大小写"""
        text = "[STANCE:SUPPORT] [CONFIDENCE:0.7]"
        stance, conf = self.discussion._parse_stance(text)
        assert stance == "support"
        assert conf == 0.7


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
