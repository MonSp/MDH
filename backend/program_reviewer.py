"""
ProgramReviewer — LLM 只审阅程序执行结果，不执行任务 (program-pivot T5)

契约（spec [S2] 审阅—升级闭环）：
- 输入：程序执行结果（T2 output/error）+ 任务上下文 + 期望；输出结构化
  verdict（pass/fail）+ issues 列表 —— 审阅是轻量单次 LLM 调用（llm_calls=1）。
- LLM 只审阅不执行：审阅失败的意见（issues）交给 ProgramEvolver 修订程序。
- 生成器以注入方式提供（测试不碰网络）；默认 llm 走 model_factory 编排。
"""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

GenerateFn = Callable[[str], Awaitable[str]]

MAX_CONTEXT_CHARS = 4000


class ReviewIssue(BaseModel):
    """兼容对象形态的 issue（契约主形态为字符串列表）。"""

    line: str = Field("", description="问题描述")
    severity: str = Field("major", description="minor|major|blocker")


class ReviewVerdict(BaseModel):
    verdict: str = Field(..., description="pass|fail")
    issues: list[Any] = Field(default_factory=list)  # str 或 ReviewIssue
    summary: str = ""

    @property
    def issue_lines(self) -> list[str]:
        lines: list[str] = []
        for item in self.issues:
            if isinstance(item, str):
                lines.append(item)
            elif isinstance(item, dict):
                lines.append(str(item.get("line") or item.get("text") or item))
            else:
                lines.append(str(item))
        return lines


@dataclass
class ReviewResult:
    """审阅结构化结果。"""

    verdict: str  # pass | fail
    issues: list[str] = field(default_factory=list)
    summary: str = ""
    error: str | None = None
    error_code: str | None = None
    duration_ms: int = 0
    llm_calls: int = 1  # 审阅本身是一次 LLM 调用（区别于执行/门禁的恒 0）


class ProgramReviewer:
    """LLM 审阅执行结果 → 结构化 verdict/issue。"""

    def build_prompt(
        self,
        program_id: str,
        task_description: str,
        output: Any,
        error: str | None,
        expectation: str | None,
    ) -> str:
        output_text = json.dumps(output, ensure_ascii=False, default=str)
        return f"""你是一位严格的程序结果审阅者。请审阅下面**已由本地程序执行完成**
的结果（你只审阅，不需要重新执行任务）。

## 程序
{program_id}

## 任务描述
{task_description[:MAX_CONTEXT_CHARS]}

## 执行结果
{output_text[:MAX_CONTEXT_CHARS]}

## 执行错误（如有）
{(error or "无")[:MAX_CONTEXT_CHARS]}

## 期望/验收点（如有）
{(expectation or "无——按任务描述与常识判断正确性")[:MAX_CONTEXT_CHARS]}

判断标准：结果是否正确完成任务、输出结构是否完整、有无明显错误或遗漏。
严格按 JSON 返回，不包含其他内容：
{{"verdict": "pass 或 fail", "issues": ["问题1（fail 时必填，具体可执行）"],
 "summary": "一句话结论"}}"""

    def parse_response(self, text: str) -> ReviewVerdict:
        start = (text or "").find("{")
        data: Any = None
        if start >= 0:
            try:
                data, _ = json.JSONDecoder().raw_decode(text[start:])
            except json.JSONDecodeError:
                data = None
        if data is None:
            match = re.search(r"\{[\s\S]*\}", text or "")
            if not match:
                raise ValueError(f"no JSON in review response: {text[:200]!r}")
            data = json.loads(match.group())
        parsed = ReviewVerdict.model_validate(data)
        if parsed.verdict not in ("pass", "fail"):
            raise ValueError(f"invalid verdict: {parsed.verdict}")
        if parsed.verdict == "fail" and not parsed.issue_lines:
            raise ValueError("fail verdict must carry at least one issue")
        return parsed

    async def review(
        self,
        program_id: str,
        task_description: str,
        output: Any,
        error: str | None,
        expectation: str | None,
        generate: GenerateFn,
    ) -> ReviewResult:
        start = time.monotonic()
        prompt = self.build_prompt(
            program_id, task_description, output, error, expectation
        )
        try:
            raw = await generate(prompt)
            verdict = self.parse_response(raw)
        except ValueError as e:
            return ReviewResult(
                verdict="fail",
                error=str(e),
                error_code="REVIEW_INVALID",
                duration_ms=int((time.monotonic() - start) * 1000),
            )
        except Exception as e:
            logger.exception("review failed")
            return ReviewResult(
                verdict="fail",
                error=str(e),
                error_code="REVIEW_FAILED",
                duration_ms=int((time.monotonic() - start) * 1000),
            )
        return ReviewResult(
            verdict=verdict.verdict,
            issues=verdict.issue_lines,
            summary=verdict.summary,
            duration_ms=int((time.monotonic() - start) * 1000),
        )


async def llm_review_fn(
    prompt: str,
    *,
    provider: str = "deepseek",
    api_key: str = "",
    base_url: str = "",
    model_name: str = "",
) -> str:
    """默认 LLM 审阅生成器（model_factory 编排，同 skill_generator 模式）。"""
    if not api_key:
        raise ValueError("未配置API密钥")

    from agent import _extract_text
    from chat_agent import ChatAgent as Agent
    from chat_agent import Msg
    from model_factory import create_agent, get_default_base_url

    if base_url and not base_url.startswith(("http://", "https://")):
        base_url = "https://" + base_url
    if not base_url:
        base_url = get_default_base_url(provider)

    agent = create_agent(
        provider=provider,
        api_key=api_key,
        base_url=base_url,
        model_name=model_name,
        system_prompt="你是程序结果审阅者，严格只返回 JSON。",
        agent_name="program-reviewer",
        stream=False,
    )
    llm_agent = Agent(
        name="program_reviewer",
        system_prompt="严格只返回 JSON，不要 Markdown 代码块。",
        model=agent.model,
    )
    msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
    response = await llm_agent.reply(msg)
    return _extract_text(response)
