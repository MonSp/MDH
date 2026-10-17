"""
ProgramInjection — 任务前注入切换 (program-pivot T7, M2)

读侧契约（spec 迁移路径 M2）：
- 任务前注入优先走 ProgramRegistry 命中（promoted+新鲜+关键词）；
- 命中 → 返回程序上下文片段（program_id/version/description），替代经验规则注入；
- 未命中/异常 → 返回 ""，调用方回退旧规则注入路径（旧读路径保留，宁重勿轻）。
"""

from __future__ import annotations

import logging
import os

from program_registry import ProgramRegistry

logger = logging.getLogger(__name__)

_DEFAULT_REGISTRY: ProgramRegistry | None = None
_DEFAULT_BASE_DIR: str | None = None


def get_default_registry(data_dir: str | None = None) -> ProgramRegistry | None:
    """按 data_dir 取（缓存）默认 ProgramRegistry；data_dir 缺失返回 None。

    相对路径（如 MeetingCoordinator 默认 "data"）按 backend/ 目录归一，
    避免非 `cd backend` 启动时分叉到错误目录。
    """
    global _DEFAULT_REGISTRY, _DEFAULT_BASE_DIR
    try:
        if data_dir and not os.path.isabs(data_dir):
            data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), data_dir)
        if data_dir and data_dir != _DEFAULT_BASE_DIR:
            _DEFAULT_REGISTRY = ProgramRegistry(os.path.join(data_dir, "program_packs"))
            _DEFAULT_BASE_DIR = data_dir
        return _DEFAULT_REGISTRY
    except Exception as e:
        logger.debug("program registry unavailable: %s", e)
        return None


def build_program_context(
    task_text: str,
    registry: ProgramRegistry | None = None,
    model: str | None = None,
    data_dir: str | None = None,
) -> str:
    """registry 命中 → 程序上下文片段；未命中/异常 → ""（绝不抛）。

    注意语义：调用方（会议/工作流/orchestrator 注入点）处于 LLM 路径——
    即 T6 的 program 路径未采用（命中但回退，或未接线）。因此注入文案必须
    是"参考"而非"强制复用"，避免与 T6 回退语义冲突（误导 LLM）。
    """
    try:
        reg = registry or get_default_registry(data_dir)
        if reg is None or not task_text:
            return ""
        matches = reg.match(task_text, current_model=model)
        if not matches:
            return ""
        best = matches[0]
        return (
            "\n\n[program-context] 曾有成熟程序 "
            f"{best.program_id} v{best.version} 处理过类似任务：{best.description}。"
            "注意：本次任务已进入 LLM 路径执行——请将其历史行为要点作为参考，"
            "按本任务实际情况完成，无需强制复用该程序。"
        )
    except Exception as e:
        logger.debug("program injection skipped: %s", e)
        return ""
