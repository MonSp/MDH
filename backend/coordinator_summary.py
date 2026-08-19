"""
MeetingCoordinator 项目总结子模块

提取自 meeting_coordinator.py 的项目总结报告生成：
- generate_project_summary: 生成项目总结报告
"""

from typing import Any, Dict, List


def generate_project_summary(
    user_message: str,
    analysis,
    discussion_results: list,
    assign_result: dict,
    review_result: dict,
    execution_results: list,
) -> str:
    """生成项目总结报告

    模拟人类公司的项目总结流程：
    1. 项目概述
    2. 完成的工作
    3. 遇到的问题
    4. 交付物清单
    5. 后续建议
    """
    summary_parts = []

    # 1. 项目概述
    summary_parts.append("📋 项目总结报告")
    summary_parts.append("=" * 40)
    summary_parts.append(f"需求：{user_message[:100]}")
    summary_parts.append(f"意图：{analysis.intent}")
    summary_parts.append("")

    # 2. 团队讨论要点
    if discussion_results:
        summary_parts.append("💬 团队讨论要点")
        summary_parts.append("-" * 40)
        for i, result in enumerate(discussion_results[:3], 1):
            agent_id = result.get("agent_id", result.get("agentId", "unknown"))
            content = result.get("content", "")[:80]
            stance = result.get("parsed_stance", result.get("stance", "neutral"))
            stance_icon = "✅" if stance == "support" else "🔄" if stance == "modify" else "❓"
            summary_parts.append(f"{i}. {stance_icon} [{agent_id}] {content}")
        summary_parts.append("")

    # 3. 任务分配
    if assign_result:
        summary_parts.append("📝 任务分配")
        summary_parts.append("-" * 40)
        summary_parts.append(f"执行者：{assign_result.get('agent_id', 'unknown')}")
        summary_parts.append(f"任务ID：{assign_result.get('task_id', 'unknown')}")
        summary_parts.append(f"状态：{assign_result.get('status', 'unknown')}")
        summary_parts.append("")

    # 4. 执行结果
    if execution_results:
        summary_parts.append("⚡ 执行结果")
        summary_parts.append("-" * 40)
        total_files = 0
        for result in execution_results:
            agent_id = result.get("agent_id", "unknown")
            written_files = result.get("written_files", [])
            code_blocks = result.get("code_blocks_count", 0)
            total_files += len(written_files)
            summary_parts.append(f"• [{agent_id}] 写入 {len(written_files)} 个文件，{code_blocks} 个代码块")
        summary_parts.append(f"总计写入文件：{total_files}")
        summary_parts.append("")

    # 5. 质量审查
    if review_result:
        summary_parts.append("🔍 质量审查")
        summary_parts.append("-" * 40)
        critic_result = review_result.get("critic_result", {})
        grounding_result = review_result.get("grounding_result", {})
        severity = critic_result.get("severity", "unknown")
        findings = critic_result.get("findings", [])
        grounded = grounding_result.get("grounded", False)
        summary_parts.append(f"严重度：{severity}")
        summary_parts.append(f"发现问题：{len(findings)} 个")
        summary_parts.append(f"代码接地：{'是' if grounded else '否'}")
        summary_parts.append("")

    # 6. 交付物清单
    summary_parts.append("📦 交付物清单")
    summary_parts.append("-" * 40)
    all_files = []
    for result in execution_results:
        all_files.extend(result.get("written_files", []))
    if all_files:
        for file in all_files[:10]:
            summary_parts.append(f"• {file}")
        if len(all_files) > 10:
            summary_parts.append(f"... 还有 {len(all_files) - 10} 个文件")
    else:
        summary_parts.append("无文件交付")
    summary_parts.append("")

    # 7. 后续建议
    summary_parts.append("💡 后续建议")
    summary_parts.append("-" * 40)
    summary_parts.append("1. 检查生成的代码是否符合预期")
    summary_parts.append("2. 运行测试验证功能正确性")
    summary_parts.append("3. 如需修改，请提供具体反馈")

    return "\n".join(summary_parts)
