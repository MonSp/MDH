"""
ProgramCompiler — 成功任务轨迹沉淀为候选程序包 (program-pivot T3)

流程（spec [S2] 架构总览「沉淀钩子」）：
    成功任务轨迹 → LLM 生成 (main.py + 自带测试 + manifest 字段)
                → ProgramRegistry 登记为 candidate 草稿

契约：
- 仅沉淀 success=True 的轨迹（失败轨迹不产出程序）。
- 产物为 candidate：manifest 完整 + main.py（含 def run）+ tests/ 非空，
  后续由 T4 promotion_gate 测试门禁晋升。
- LLM 生成器以注入方式提供（`generate: (prompt) -> str`），便于测试与
  复用 skill_generator 同款 model_factory 编排。
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from pydantic import BaseModel, Field, field_validator

from program_registry import (
    PROGRAM_ID_RE,
    ProgramManifest,
    ProgramRegistry,
    ProgramTrigger,
)

logger = logging.getLogger(__name__)

# 异步生成器签名：prompt -> LLM 原始文本
GenerateFn = Callable[[str], Awaitable[str]]


class GenerationError(Exception):
    """LLM 输出无法解析为合法程序草稿。"""


class TaskTrajectory(BaseModel):
    """成功任务轨迹（沉淀输入）。"""

    task_description: str = Field(..., description="原始任务描述")
    steps: list[str] = Field(
        default_factory=list, description="执行步骤（工具调用/决策摘要）"
    )
    input_example: Any = Field(None, description="任务输入样例（JSON）")
    output_example: Any = Field(None, description="任务输出样例（JSON）")
    success: bool = Field(True, description="任务是否成功（仅成功轨迹可沉淀）")

    @field_validator("task_description")
    @classmethod
    def _non_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("task_description must be non-empty")
        return v


class GeneratedProgram(BaseModel):
    """LLM 生成的程序草稿（JSON 响应契约）。"""

    program_id: str
    version: str = "1.0.0"
    description: str = ""
    trigger_keywords: list[str] = Field(default_factory=list)
    io_schema: dict[str, Any] = Field(
        default_factory=dict,
        description="输入输出 schema（T11）：inputs 含 task/workspace_path 等字段声明",
    )
    main_py: str
    test_py: str

    @field_validator("program_id")
    @classmethod
    def _check_id(cls, v: str) -> str:
        if not PROGRAM_ID_RE.match(v):
            raise ValueError(f"invalid program_id: {v!r}")
        return v

    @field_validator("io_schema")
    @classmethod
    def _check_io_schema(cls, v: dict[str, Any]) -> dict[str, Any]:
        """T11: 校验 io_schema 形状；task 必标 required。"""
        if not v:
            return v
        inputs = v.get("inputs")
        if inputs is None:
            return v
        if not isinstance(inputs, dict):
            raise ValueError("io_schema.inputs must be a mapping")
        for name, spec in inputs.items():
            if not isinstance(spec, dict) or "type" not in spec:
                raise ValueError(
                    f"io_schema.inputs.{name} must be a mapping with type"
                )
        task_spec = inputs.get("task")
        if isinstance(task_spec, dict) and not task_spec.get("required", False):
            raise ValueError("io_schema.inputs.task must declare required: true")
        return v

    @field_validator("main_py")
    @classmethod
    def _check_main(cls, v: str) -> str:
        if "def run(" not in v:
            raise ValueError("main_py must define def run(")
        if len(v) > 50_000:
            raise ValueError("main_py exceeds 50KB limit")
        return v

    @field_validator("test_py")
    @classmethod
    def _check_test(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("test_py must be non-empty")
        if len(v) > 50_000:
            raise ValueError("test_py exceeds 50KB limit")
        return v


class ProgramCompiler:
    """轨迹 → candidate 程序包草稿。"""

    def __init__(self, registry: ProgramRegistry) -> None:
        self._registry = registry

    def build_prompt(self, trajectory: TaskTrajectory) -> str:
        # 定界防护：轨迹内容截断，降低 prompt injection/超长输入影响
        desc = trajectory.task_description[:2000]
        steps_text = "\n".join(
            f"{i + 1}. {s[:500]}" for i, s in enumerate(trajectory.steps[:30])
        ) or "（无分步记录）"
        return f"""你是一位程序合成专家。请把下面一次**成功**的任务执行轨迹，
固化为一个可复用的确定性 Python 程序包（candidate 草稿）。

## 任务描述
{desc}

## 执行步骤
{steps_text}

## 输入样例
{json.dumps(trajectory.input_example, ensure_ascii=False, default=str)[:2000]}

## 输出样例
{json.dumps(trajectory.output_example, ensure_ascii=False, default=str)[:2000]}

## 硬性要求
1. main_py：定义 `def run(data): ...`，**仅用标准库**；禁止依赖时间/随机数/
   环境变量/网络；程序从 stdin 读 JSON、向 stdout 写 JSON 的
   `if __name__ == "__main__"` 块必须提供。
2. 载荷契约（T11）：`data` 恒含 `task`（str）与 `workspace_path`（绝对路径
   或 null）。若任务需要写文件，必须把文件写到 `workspace_path` 之下（用
   os.path.join），禁止写其他路径；无 workspace 时不得假设路径存在。
3. test_py：pytest 测试，导入 main 中的 run，用输出样例做断言；必须非空可运行。
   文件副作用一律用 pytest 的 `tmp_path` fixture 作为 workspace_path，
   禁止依赖真实磁盘上的固定目录。
4. program_id：英文 snake_case（^[a-z0-9_][a-z0-9_-]{{0,63}}$），勿与已有重复。
5. trigger_keywords：2-6 个用于路由匹配的中文/英文关键词。
6. io_schema：结构化声明输入输出——`inputs` 至少含
   `{{"task": {{"type": "string", "required": true}}}}`；产出文件的任务必须
   增加 `{{"workspace_path": {{"type": "string", "required": true}}}}`。
   `outputs.description` 一句话描述输出形状。
7. 输出的 main_py/test_py 各不超过 50KB；总体只返回一个 JSON 对象。

严格按以下 JSON 返回，不要包含其他内容：
{{
  "program_id": "...",
  "version": "1.0.0",
  "description": "一句话描述",
  "trigger_keywords": ["..."],
  "io_schema": {{
    "inputs": {{
      "task": {{"type": "string", "required": true}},
      "workspace_path": {{"type": "string", "required": false}}
    }},
    "outputs": {{"description": "输出形状"}}
  }},
  "main_py": "完整 Python 源码（JSON 转义）",
  "test_py": "完整 pytest 源码（JSON 转义）"
}}"""

    def parse_response(self, text: str) -> GeneratedProgram:
        # 优先从第一个 '{' 起 raw_decode（避免贪婪匹配误吞尾部内容）；
        # 失败时回退贪婪正则（容忍前缀说明文字）
        data: Any = None
        start = (text or "").find("{")
        if start >= 0:
            try:
                data, _ = json.JSONDecoder().raw_decode(text[start:])
            except json.JSONDecodeError:
                data = None
        if data is None:
            match = re.search(r"\{[\s\S]*\}", text or "")
            if not match:
                raise GenerationError(f"no JSON object in response: {text[:200]!r}")
            try:
                data = json.loads(match.group())
            except json.JSONDecodeError as e:
                raise GenerationError(f"invalid JSON: {e}") from e
        try:
            return GeneratedProgram.model_validate(data)
        except ValueError as e:
            raise GenerationError(f"invalid program draft: {e}") from e

    async def compile(
        self, trajectory: TaskTrajectory, generate: GenerateFn
    ) -> ProgramManifest:
        """沉淀成功轨迹 → candidate 草稿（manifest + main.py + tests/）。"""
        if not trajectory.success:
            raise ValueError("only successful trajectories can be compiled")

        raw = await generate(self.build_prompt(trajectory))
        draft = self.parse_response(raw)

        manifest = ProgramManifest(
            program_id=draft.program_id,
            version=draft.version,
            description=draft.description,
            trigger=ProgramTrigger(keywords=draft.trigger_keywords),
            io_schema=draft.io_schema or {},
        )
        # registry.create 内部校验重复/状态机，重复 id 抛 FileExistsError
        created = self._registry.create(manifest)

        # 写盘失败必须回滚 registry 登记，否则留下无 main.py 的半成品 candidate
        try:
            pack_dir = self._registry.pack_dir(created.program_id)
            _write_atomic(os.path.join(pack_dir, "main.py"), draft.main_py)
            tests_dir = os.path.join(pack_dir, "tests")
            os.makedirs(tests_dir, exist_ok=True)
            _write_atomic(
                os.path.join(tests_dir, "test_generated.py"), draft.test_py
            )
        except Exception:
            logger.exception(
                "compile write failed, rolling back %s", created.program_id
            )
            self._registry.delete(created.program_id)
            raise

        logger.info(
            "compiled candidate program %s v%s (tests non-empty=%s)",
            created.program_id,
            created.version,
            bool(draft.test_py.strip()),
        )
        return created


async def llm_generate_fn(
    prompt: str,
    *,
    provider: str = "deepseek",
    api_key: str = "",
    base_url: str = "",
    model_name: str = "",
) -> str:
    """默认 LLM 生成器（复用 skill_generator 同款 model_factory 编排）。"""
    if not api_key:
        raise GenerationError("未配置API密钥")

    from agent import _extract_text
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
        system_prompt="你是程序合成专家，严格只返回 JSON。",
        agent_name="program-compiler",
        stream=False,
    )
    msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
    response = await agent.reply(msg)
    return _extract_text(response)


def _write_atomic(path: str, content: str) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(content)
    os.replace(tmp, path)


@dataclass
class CompileResult:
    """compile 的结构化结果（供路由/钩子直接消费）。"""

    success: bool
    manifest: ProgramManifest | None = None
    error: str | None = None
    error_code: str | None = None
