"""Tests for review_pipeline.py — structured feedback integration with LLM review"""
import pytest
from unittest.mock import MagicMock, AsyncMock
from review_pipeline import ReviewPipeline
from collaboration.planner_agent import PlannerAgent, SubTask


class _FakeMsg:
    def __init__(self, text):
        self.content = [{"type": "text", "text": text}]


@pytest.fixture
def pipeline():
    """Create a ReviewPipeline with mocked LLM models"""
    meeting = MagicMock()
    meeting.agents = []

    def get_model(role):
        m = MagicMock()
        m.reply = AsyncMock(return_value=_FakeMsg("审查通过，没有问题。"))
        return m

    return ReviewPipeline(
        get_model_fn=get_model,
        meeting=meeting,
        planner=PlannerAgent(name="test_planner"),
    )


class TestStructuredFeedbackIntegration:
    """验证 LLM 审查意见整合到结构化反馈"""

    def test_normal_review_approves(self, pipeline):
        """普通审查结果 → approved"""
        result = pipeline._generate_structured_feedback(
            "开发登录页面", "<html>login</html>",
            reviewer_feedback="实现正确，符合需求",
        )
        assert result["status"] == "approved"

    def test_critical_reviewer_feedback_overrides(self, pipeline):
        """审查者发现严重问题 → revision_required 即使 planner 关键词匹配通过"""
        result = pipeline._generate_structured_feedback(
            "开发登录页面", "<html>login</html>",
            reviewer_feedback="严重安全漏洞：SQL注入风险，必须修复",
        )
        assert result["status"] == "revision_required"
        issue_types = [i["type"] for i in result["issues"]]
        assert "logic_error" in issue_types

    def test_critical_keyword_variants(self, pipeline):
        """测试各种严重问题关键词"""
        critical_feedbacks = [
            "这是一个 critical 的 bug",
            "fatal error in authentication",
            "功能存在阻塞问题",
            "不能发布到生产环境",
        ]
        for feedback in critical_feedbacks:
            result = pipeline._generate_structured_feedback(
                "task", "output", reviewer_feedback=feedback,
            )
            assert result["status"] == "revision_required", f"应标记为 revision_required: {feedback}"

    def test_monitor_feedback_does_not_override(self, pipeline):
        """monitor 反馈中的关键词不应触发覆盖（只有 reviewer 的才覆盖）"""
        result = pipeline._generate_structured_feedback(
            "task", "<html>ok</html>",
            reviewer_feedback="实现正确",
            monitor_feedback="严重风险需要关注",
        )
        # monitor_feedback 不触发覆盖逻辑
        assert result["status"] == "approved"

    def test_empty_feedback_no_change(self, pipeline):
        """无审查反馈时行为不变"""
        result = pipeline._generate_structured_feedback(
            "开发登录页面", "<html>login</html>",
        )
        assert result["status"] == "approved"

    def test_non_critical_reviewer_preserves_approved(self, pipeline):
        """审查无严重关键词时保持 approved"""
        result = pipeline._generate_structured_feedback(
            "task", "<html>ok</html>", reviewer_feedback="小问题，建议优化样式",
        )
        assert result["status"] == "approved"


# ── 完整 review() 流程 ──


class TestReviewFlow:
    @pytest.mark.asyncio
    async def test_full_review_returns_all_sections(self, pipeline):
        """完整 review 流程应返回所有章节"""
        messages = []

        async def on_message(agent_id, text, extra, **kwargs):
            messages.append({"agent_id": agent_id, "text": text})

        result = await pipeline.review(
            task_description="开发登录页面",
            execution_result="<html>login form</html>",
            on_message=on_message,
        )

        assert "critic_result" in result
        assert "grounding_result" in result
        assert "reviewer_feedback" in result
        assert "monitor_feedback" in result
        assert "coordinator_summary" in result
        assert "structured_feedback" in result

    @pytest.mark.asyncio
    async def test_review_with_no_agents(self):
        """无 agent 时 review 不应崩溃"""
        meeting = MagicMock()
        meeting.agents = []

        def get_model(role):
            m = MagicMock()
            m.reply = AsyncMock(return_value=_FakeMsg("OK"))
            return m

        pipeline = ReviewPipeline(
            get_model_fn=get_model,
            meeting=meeting,
            planner=None,
        )

        result = await pipeline.review(
            task_description="test",
            execution_result="output",
            on_message=AsyncMock(),
        )
        assert "structured_feedback" in result

    @pytest.mark.asyncio
    async def test_review_with_discussion_context(self, pipeline):
        """review 应接受 discussion_context 参数且不崩溃"""
        result = await pipeline.review(
            task_description="test",
            execution_result="output",
            on_message=AsyncMock(),
            discussion_context="团队决定使用 React",
        )
        # 无 agent 时 feedback 为空字符串，但不应崩溃
        assert "reviewer_feedback" in result

    @pytest.mark.asyncio
    async def test_reviewer_llm_failure_uses_fallback(self):
        """LLM 调用失败（critic 审查通道）时流程不应崩溃，回退纯规则"""
        meeting = MagicMock()
        meeting.agents = []

        call_count = 0

        def get_model(role):
            nonlocal call_count
            m = MagicMock()
            if call_count == 0:
                # 首次 get_model 由 critic review_with_llm 消费，令其失败
                m.reply = AsyncMock(side_effect=Exception("LLM error"))
            else:
                m.reply = AsyncMock(return_value=_FakeMsg("OK"))
            call_count += 1
            return m

        pipeline = ReviewPipeline(
            get_model_fn=get_model,
            meeting=meeting,
            planner=None,
        )

        result = await pipeline.review(
            task_description="test",
            execution_result="output",
            on_message=AsyncMock(),
        )
        # 不应崩溃，应有 fallback 反馈
        assert "reviewer_feedback" in result


# ── CriticAgent review_with_llm（规则兜底 + LLM 补充审查）──


class _FindingMsg:
    def __init__(self, text):
        self._text = text

    @property
    def content(self):
        return [{"type": "text", "text": self._text}]


@pytest.mark.asyncio
async def test_review_with_llm_merges_findings(pipeline):
    """LLM 审查 findings 与规则 findings 合并"""
    # type("M", ..., {"reply": fn})() 使 fn 作为实例方法绑定，需接收 self
    async def llm_reply(self, conversation):
        return _FindingMsg('[{"finding": "缺少回滚方案", "severity": "high"}]')

    pipeline._get_model = lambda role: type("M", (), {"reply": llm_reply})()
    result = await pipeline._critic.review_with_llm(
        {"task_description": "重构登录模块", "requirements": []},
        get_model_fn=pipeline._get_model,
        stage="review",
    )
    assert "缺少回滚方案" in result.findings
    assert result.details["llm_findings"][0]["severity"] == "high"


@pytest.mark.asyncio
async def test_review_with_llm_fallback_on_llm_error(pipeline):
    """LLM 失败时回退到纯规则结果，不崩溃"""
    async def failing_reply(self, conversation):
        raise RuntimeError("llm down")

    pipeline._get_model = lambda role: type("M", (), {"reply": failing_reply})()
    result = await pipeline._critic.review_with_llm(
        {"task_description": "重构登录模块", "requirements": []},
        get_model_fn=pipeline._get_model,
        stage="review",
    )
    assert isinstance(result.findings, list)
    assert result.details is None or "llm_findings" not in result.details


@pytest.mark.asyncio
async def test_review_with_llm_parses_array_after_prose_bracket(pipeline):
    """prose 中先出现方括号时仍能解析 LLM findings"""
    async def llm_reply(self, conversation):
        return _FindingMsg('参考文档[3] 的建议：[{"finding": "缺少测试", "severity": "High"}]')

    pipeline._get_model = lambda role: type("M", (), {"reply": llm_reply})()
    result = await pipeline._critic.review_with_llm(
        {"task_description": "重构登录模块", "requirements": []},
        get_model_fn=pipeline._get_model,
        stage="review",
    )
    assert "缺少测试" in result.findings


@pytest.mark.asyncio
async def test_review_with_llm_severity_merge_normalized(pipeline):
    """severity 大小写变体归一化后参与合并（rule low + LLM critical → critical）"""
    async def llm_reply(self, conversation):
        return _FindingMsg('[{"finding": "致命缺陷", "severity": "Critical!"}]')

    pipeline._get_model = lambda role: type("M", (), {"reply": llm_reply})()
    result = await pipeline._critic.review_with_llm(
        {"task_description": "添加注册功能", "requirements": []},
        get_model_fn=pipeline._get_model,
        stage="review",
    )
    assert result.severity == "critical"


# ── 确定性门禁（测试/lint 失败并入结构化反馈）──


@pytest.mark.asyncio
async def test_gate_failure_forces_revision_required(pipeline):
    """确定性门禁失败 → structured_feedback.status == revision_required"""
    result = await pipeline.review(
        "测试任务",
        "执行结果文本",
        lambda *a, **k: None,
        gate_result={"passed": False, "failures": [{"type": "test_failure", "detail": "tests/test_x.py 失败"}]},
    )
    sf = result["structured_feedback"]
    assert sf["status"] == "revision_required"
    assert any(i["type"] == "test_failure" for i in sf["issues"])


@pytest.mark.asyncio
async def test_gate_pass_keeps_status(pipeline):
    """确定性门禁通过 → 不覆盖 LLM 审查结论（approved 保持）"""
    result = await pipeline.review(
        "测试任务",
        "执行结果文本",
        lambda *a, **k: None,
        gate_result={"passed": True, "failures": []},
    )
    # fixture 下审查无严重关键词，确定性 approved
    assert result["structured_feedback"]["status"] == "approved"


@pytest.mark.asyncio
async def test_gate_skipped_exposed_and_status_kept(pipeline):
    """门禁 skipped（工具缺失 fail-open）→ gate_skipped 可见，不影响 status"""
    skipped = [
        {"type": "lint_skipped", "location": ".", "detail": "[Errno 2] No such file or directory: 'pylint'"},
        {"type": "test_skipped", "location": ".", "detail": "[Errno 2] No such file or directory: 'pytest'"},
    ]
    result = await pipeline.review(
        "测试任务",
        "执行结果文本",
        lambda *a, **k: None,
        gate_result={"passed": True, "failures": [], "skipped": skipped},
    )
    sf = result["structured_feedback"]
    assert sf["gate_skipped"] == skipped
    # skipped 不强制 revision：无 failures 时保持 LLM 审查结论（approved）
    assert sf["status"] == "approved"


@pytest.mark.asyncio
async def test_gate_no_skipped_key_absent(pipeline):
    """门禁无 skipped → 返回 dict 不含 gate_skipped 键"""
    result = await pipeline.review(
        "测试任务",
        "执行结果文本",
        lambda *a, **k: None,
        gate_result={"passed": True, "failures": []},
    )
    assert "gate_skipped" not in result["structured_feedback"]


# ── planner issues 加固：result 无 issues 键时 setdefault 兜底 ──


def test_gate_failure_without_planner_issues_key_no_keyerror(pipeline):
    """planner 返回无 issues 键的 result + gate 失败 → 不 KeyError，status revision_required"""
    pipeline._planner.generate_review_feedback = MagicMock(return_value={
        "status": "approved", "max_iterations": 3,
    })
    gate_result = {
        "passed": False,
        "failures": [
            {"type": "test_failure", "location": ".", "detail": "tests/test_x.py 失败"},
        ],
    }
    result = pipeline._generate_structured_feedback(
        "任务", "产出", reviewer_feedback="实现正确", gate_result=gate_result,
    )
    assert result["status"] == "revision_required"
    assert any(i["type"] == "test_failure" for i in result["issues"])


def test_critical_reviewer_without_planner_issues_key_no_keyerror(pipeline):
    """planner result 无 issues 键 + reviewer 严重反馈 → 不 KeyError，revision_required"""
    pipeline._planner.generate_review_feedback = MagicMock(return_value={
        "status": "approved", "max_iterations": 3,
    })
    result = pipeline._generate_structured_feedback(
        "任务", "产出", reviewer_feedback="存在致命缺陷，不能发布",
    )
    assert result["status"] == "revision_required"
    assert any(i["type"] == "logic_error" for i in result["issues"])
