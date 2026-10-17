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
    """按 data_dir 取（缓存）默认 ProgramRegistry；data_dir 缺失返回 None。"""
    global _DEFAULT_REGISTRY, _DEFAULT_BASE_DIR
    try:
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
    """registry 命中 → 程序上下文片段；未命中/异常 → ""（绝不抛）。"""
    try:
        reg = registry or get_default_registry(data_dir)
        if reg is None or not task_text:
            return ""
        matches = reg.match(task_text, current_model=model)
        if not matches:
            return ""
        best = matches[0]
        return (
            "\n\n[program-context] 已命中成熟程序 "
            f"{best.program_id} v{best.version}：{best.description}。"
            "该任务可优先复用此程序的确定性行为；勿重复发明流程。"
        )
    except Exception as e:
        logger.debug("program injection skipped: %s", e)
        return ""
