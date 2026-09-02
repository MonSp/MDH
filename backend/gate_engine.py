"""
GateEngine — 确定性门禁引擎

从 MeetingCoordinator 提取的门禁检查逻辑。
负责 lint/test 工具的确定性检查，区分工具缺失（fail-open）和真实失败（fail-closed）。
"""

import logging
from typing import Any

logger = logging.getLogger("gate_engine")

# 门禁信号常量
# error 通道：工具缺失信号（fail-open）
GATE_ERROR_CHANNEL_SIGNALS = (
    "no module named pytest",
    "no module named pylint",
    "no such file or directory: 'pytest'",
    "no such file or directory: 'pylint'",
)

# output 通道：无测试信号（fail-open）
GATE_OUTPUT_CHANNEL_SIGNALS = (
    "no tests were collected",
    "no tests ran",
)


class GateEngine:
    """确定性门禁引擎

    职责：
    - 运行 lint 检查（pylint）
    - 运行测试检查（pytest）
    - 区分工具缺失（fail-open）和真实失败（fail-closed）
    """

    def run_gate(self, workspace_root: str | None = None) -> dict[str, Any]:
        """运行确定性门禁检查

        Args:
            workspace_root: 工作区根目录

        Returns:
            {"passed": bool, "failures": List, "skipped": List}
        """
        result: dict[str, Any] = {"passed": True, "failures": [], "skipped": []}
        if not workspace_root:
            return result

        try:
            from agent_toolset import create_agent_toolset
            toolset = create_agent_toolset(
                agent_id="gate", agent_role="reviewer", workspace_root=workspace_root
            )

            # Lint 检查
            lint = toolset.run_linter(".")
            if not lint.success:
                if self._check_unavailable(lint.error or "", lint.output or ""):
                    lint_detail = (lint.error or lint.output or "lint 工具不可用")[:200]
                    result["skipped"].append({
                        "type": "lint_skipped", "location": ".",
                        "detail": lint_detail,
                    })
                    logger.info("确定性门禁跳过: %s", lint_detail)
                else:
                    result["passed"] = False
                    result["failures"].append({
                        "type": "lint_failure", "location": ".",
                        "detail": (lint.error or lint.output or "lint 未通过")[:200],
                    })

            # 测试检查
            tests = toolset.run_tests(verbose=False)
            if not tests.success:
                if self._check_unavailable(tests.error or "", tests.output or ""):
                    test_detail = (tests.error or tests.output or "测试工具不可用")[:200]
                    result["skipped"].append({
                        "type": "test_skipped", "location": ".",
                        "detail": test_detail,
                    })
                    logger.info("确定性门禁跳过: %s", test_detail)
                else:
                    result["passed"] = False
                    result["failures"].append({
                        "type": "test_failure", "location": ".",
                        "detail": (tests.error or tests.output or "测试未通过")[:200],
                    })

        except Exception as e:
            result["passed"] = False
            result["failures"].append({"type": "gate_error", "location": ".", "detail": str(e)[:200]})

        return result

    @staticmethod
    def _check_unavailable(error: str, output: str) -> bool:
        """判断 lint/test 工具结果为工具缺失（基础设施不可用）

        通道感知 + 工具特定：
        - error 通道：只匹配 pytest/pylint 的缺失文本
        - output 通道：无测试信号

        返回 True 表示工具缺失/无测试（→ skipped/fail-open）。
        """
        error_text = (error or "").strip().lower()
        output_text = (output or "").strip().lower()
        return (
            any(sig in error_text for sig in GATE_ERROR_CHANNEL_SIGNALS)
            or any(sig in output_text for sig in GATE_OUTPUT_CHANNEL_SIGNALS)
        )
