"""Tests for LLM-powered experience distillation (T3).

Verifies:
- _llm_distill returns rules from valid LLM response
- Fallback to template extraction on LLM failure
- Timeout handling
- JSON parse error handling
- extract_from_meeting integration with LLM
- extract_from_meeting fallback to template
"""

import json
import shutil
import tempfile
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from experience_extractor import (
    ExecutionLog,
    ExperienceExtractor,
    ExperienceRule,
    _now_iso,
)


@pytest.fixture
def tmp_inc_dir():
    d = tempfile.mkdtemp(prefix="test_llm_distill_")
    yield d
    shutil.rmtree(d, ignore_errors=True)


def _make_llm_caller(response_text: str):
    """Create a sync LLM caller that returns the given text."""
    def _call(prompt: str) -> str:
        return response_text
    return _call


def _make_async_llm_caller(response_text: str):
    """Create an async LLM caller that returns the given text."""
    async def _call(prompt: str) -> str:
        return response_text
    return _call


def _make_failing_llm_caller(exc_class=Exception, msg="API error"):
    """Create a sync LLM caller that raises."""
    def _call(prompt: str):
        raise exc_class(msg)
    return _call


def _make_timeout_llm_caller():
    """Create a sync LLM caller that simulates timeout."""
    import time
    def _call(prompt: str):
        time.sleep(5)
        return "[]"
    return _call


def _valid_llm_json():
    """Return a valid LLM JSON response with two rules."""
    return json.dumps([
        {
            "trigger_condition": "task involves frontend component development",
            "action": "Use CSS modules for scoped styling",
            "note": "CSS modules prevent style leakage in shared components",
            "rule_type": "success_pattern",
            "keywords": ["frontend", "css", "component"],
        },
        {
            "trigger_condition": "task requires API integration testing",
            "action": "Mock external APIs before integration tests",
            "note": "Avoids flaky tests from external service downtime",
            "rule_type": "failure_avoidance",
            "keywords": ["api", "testing", "mock"],
        },
    ])


def _make_success_log(**overrides) -> ExecutionLog:
    defaults = dict(
        task_id="task-llm-001",
        agent_id="agent-frontend",
        task_description="Build a responsive dashboard with charts",
        task_type="software-dev",
        status="success",
        steps=[
            {"command": "create_component", "action": "create dashboard component"},
            {"command": "add_chart", "action": "add chart library integration"},
        ],
        errors=[],
        corrections=[],
        final_output="Dashboard built successfully with 3 charts",
        created_at=_now_iso(),
    )
    defaults.update(overrides)
    return ExecutionLog(**defaults)


# ──────────────────── test_llm_distill_returns_rules ────────────────────

def test_llm_distill_returns_rules(tmp_inc_dir):
    """LLM distillation produces rules from valid JSON response."""
    caller = _make_llm_caller(_valid_llm_json())
    extractor = ExperienceExtractor(incremental_dir=tmp_inc_dir, llm_caller=caller)

    import asyncio
    rules = asyncio.run(extractor._llm_distill(
        "Build a dashboard", "Dashboard created with charts"
    ))

    assert len(rules) == 2
    assert rules[0].trigger_condition == "task involves frontend component development"
    assert rules[0].action == "Use CSS modules for scoped styling"
    assert rules[0].source_agent_id == "llm_distill"
    assert rules[0].rule_type == "success_pattern"
    assert rules[0].status == "pending_review"
    assert rules[1].rule_type == "failure_avoidance"
    assert "frontend" in rules[0].keywords


# ──────────────────── test_llm_distill_fallback_on_failure ────────────────────

def test_llm_distill_fallback_on_failure(tmp_inc_dir):
    """When LLM fails, extract_from_success falls back to template rules."""
    caller = _make_failing_llm_caller(RuntimeError, "API down")
    extractor = ExperienceExtractor(incremental_dir=tmp_inc_dir, llm_caller=caller)

    log = _make_success_log()
    rules = extractor.extract_from_success(log)

    # Should still produce template-based rules (not empty)
    assert len(rules) > 0
    # All template rules have source_agent_id="" (not "llm_distill")
    for rule in rules:
        assert rule.source_agent_id != "llm_distill"


# ──────────────────── test_llm_distill_timeout_fallback ────────────────────

@pytest.mark.filterwarnings("ignore::RuntimeWarning:coroutine")
def test_llm_distill_timeout_fallback(tmp_inc_dir):
    """When LLM times out, extract_from_success falls back to template rules."""
    import asyncio

    async def _slow_caller(prompt: str):
        await asyncio.sleep(999)
        return "[]"

    extractor = ExperienceExtractor(incremental_dir=tmp_inc_dir, llm_caller=_slow_caller)

    log = _make_success_log()
    # _try_llm_distill_sync should catch the timeout and return []
    # We patch asyncio.wait_for to simulate timeout immediately
    with patch("experience_extractor.asyncio.wait_for", side_effect=asyncio.TimeoutError):
        rules = extractor.extract_from_success(log)

    assert len(rules) > 0
    for rule in rules:
        assert rule.source_agent_id != "llm_distill"


# ──────────────────── test_llm_distill_parse_error_fallback ────────────────────

def test_llm_distill_parse_error_fallback(tmp_inc_dir):
    """When LLM returns unparseable text, _llm_distill returns empty list."""
    caller = _make_llm_caller("Sorry, I cannot produce JSON right now.")
    extractor = ExperienceExtractor(incremental_dir=tmp_inc_dir, llm_caller=caller)

    import asyncio
    rules = asyncio.run(extractor._llm_distill(
        "Build a dashboard", "Done"
    ))

    assert rules == []


# ──────────────────── test_llm_distill_with_markdown_code_blocks ────────────────────

def test_llm_distill_with_markdown_code_blocks(tmp_inc_dir):
    """_parse_llm_rules handles markdown code block wrapping."""
    extractor = ExperienceExtractor(incremental_dir=tmp_inc_dir)

    raw = "```json\n" + _valid_llm_json() + "\n```"
    rules = extractor._parse_llm_rules(raw)

    assert len(rules) == 2
    assert rules[0].source_agent_id == "llm_distill"


# ──────────────────── test_extract_from_meeting_uses_llm_when_available ────────────────────

def test_extract_from_meeting_uses_llm_when_available(tmp_inc_dir):
    """extract_from_meeting uses LLM rules when LLM succeeds."""
    caller = _make_llm_caller(_valid_llm_json())
    extractor = ExperienceExtractor(incremental_dir=tmp_inc_dir, llm_caller=caller)

    rules = extractor.extract_from_meeting(
        project_id="proj-001",
        task_description="Build a dashboard",
        discussion_results=[],
        review_result={"reviewer_feedback": "Looks good"},
        execution_results=[{"output": "Dashboard created", "written_files": ["dashboard.tsx"]}],
    )

    # LLM rules should be used (source_agent_id = "llm_distill")
    assert len(rules) > 0
    assert any(r.source_agent_id == "llm_distill" for r in rules)


# ──────────────────── test_extract_from_meeting_falls_back_to_template ────────────────────

def test_extract_from_meeting_falls_back_to_template(tmp_inc_dir):
    """extract_from_meeting falls back to template rules when LLM fails."""
    caller = _make_failing_llm_caller(RuntimeError, "API error")
    extractor = ExperienceExtractor(incremental_dir=tmp_inc_dir, llm_caller=caller)

    rules = extractor.extract_from_meeting(
        project_id="proj-002",
        task_description="Build a dashboard",
        discussion_results=[
            {
                "parsed_stance": "support",
                "role": "planner",
                "content": "We should use React with TypeScript for the dashboard implementation",
            }
        ],
        review_result={"reviewer_feedback": "Good approach"},
        execution_results=[{"written_files": ["app.tsx", "styles.css"]}],
    )

    # Template rules should be produced
    assert len(rules) > 0
    # None should be from LLM
    assert all(r.source_agent_id != "llm_distill" for r in rules)


# ──────────────────── test_no_llm_caller_skips_distillation ────────────────────

def test_no_llm_caller_skips_distillation(tmp_inc_dir):
    """When llm_caller is None, LLM distillation is skipped entirely."""
    extractor = ExperienceExtractor(incremental_dir=tmp_inc_dir, llm_caller=None)

    log = _make_success_log()
    rules = extractor.extract_from_success(log)

    assert len(rules) > 0
    assert all(r.source_agent_id != "llm_distill" for r in rules)


# ──────────────────── test_llm_distill_async_caller ────────────────────

def test_llm_distill_async_caller(tmp_inc_dir):
    """_llm_distill works with async callers too."""
    caller = _make_async_llm_caller(_valid_llm_json())
    extractor = ExperienceExtractor(incremental_dir=tmp_inc_dir, llm_caller=caller)

    import asyncio
    rules = asyncio.run(extractor._llm_distill(
        "Build a dashboard", "Dashboard created"
    ))

    assert len(rules) == 2
    assert rules[0].source_agent_id == "llm_distill"


# ──────────────────── test_llm_distill_partial_json ────────────────────

def test_llm_distill_partial_json(tmp_inc_dir):
    """_parse_llm_rules handles JSON embedded in extra text."""
    extractor = ExperienceExtractor(incremental_dir=tmp_inc_dir)

    raw = "Here are the rules:\n" + _valid_llm_json() + "\nHope this helps!"
    rules = extractor._parse_llm_rules(raw)

    assert len(rules) == 2


# ──────────────────── test_llm_distill_empty_list ────────────────────

def test_llm_distill_empty_list(tmp_inc_dir):
    """_parse_llm_rules handles valid JSON empty array."""
    extractor = ExperienceExtractor(incremental_dir=tmp_inc_dir)

    rules = extractor._parse_llm_rules("[]")
    assert rules == []


# ──────────────────── test_llm_rules_saved_to_db ────────────────────

def test_llm_rules_saved_to_db(tmp_inc_dir):
    """When LLM distillation succeeds in extract_from_success, rules are persisted."""
    caller = _make_llm_caller(_valid_llm_json())
    extractor = ExperienceExtractor(incremental_dir=tmp_inc_dir, llm_caller=caller)

    log = _make_success_log()
    rules = extractor.extract_from_success(log)

    assert len(rules) > 0
    # Verify rules are in the database
    all_rules = extractor.get_all_rules()
    assert len(all_rules) >= len(rules)
    llm_rules = [r for r in all_rules if r.source_agent_id == "llm_distill"]
    assert len(llm_rules) == len(rules)
