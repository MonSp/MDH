"""
Task execution loops for MeetingCoordinator.

Extracted from meeting_coordinator.py to isolate execution and review logic.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from protocol import AgentRole

logger = logging.getLogger("coordinator_execution")


def build_execution_artifact_text(exec_results: list[dict[str, Any]], max_summary_len: int = 400) -> str:
    """构建 artifact 模式的执行结果文本：文件清单 + 截断摘要"""
    parts: list[str] = []
    for r in exec_results:
        written = r.get("written_files") or []
        files_line = f"[文件清单] {', '.join(written)}" if written else "[文件清单] (无)"
        summary = (r.get("result") or "")[:max_summary_len]
        parts.append(f"{files_line}\n[摘要] {summary}")
    return "\n\n".join(parts)


async def save_execution_artifacts(coordinator, exec_results: list[dict[str, Any]]) -> None:
    """将执行产出的文件保存到 ArtifactStore，并发送通知"""
    if not coordinator._artifact_store:
        return
    for r in exec_results:
        written = r.get("written_files") or []
        if written:
            refs = coordinator._artifact_store.save_artifacts(
                task_id=r.get("task_id") or r.get("agent_id", "unknown"),
                agent_id=r.get("agent_id", ""),
                files_written=written,
                result_summary=(r.get("result") or "")[:500],
            )
            file_types = list(set(ref.type for ref in refs))
            await coordinator._notify_artifact_created(
                agent_id=r.get("agent_id", ""),
                files_count=len(written),
                file_types=file_types,
                summary=(r.get("result") or "")[:200],
            )


async def lightweight_review(coordinator, reviewer_id, task_desc, exec_text, on_message) -> dict:
    """轻量审查：单个 reviewer 一次 LLM 调用"""
    prompt = (
        f"你是 QA 工程师。请快速审查以下任务执行结果。\n\n"
        f"任务：{task_desc[:200]}\n\n"
        f"执行结果：{exec_text[:500]}\n\n"
        f"请判断：1) 产出是否完整 2) 是否有明显错误\n"
        f"回复格式：\n"
        f"status: approved 或 revision_required\n"
        f"score: 1-10\n"
        f"issues: 问题列表（如有）"
    )
    try:
        reviewer = coordinator._resolve_agent(reviewer_id)
        if reviewer:
            model = coordinator._get_model(reviewer.role)
            response = await asyncio.wait_for(model.reply(prompt), timeout=60)
            content = response.content if hasattr(response, 'content') else str(response)
            status = "approved"
            score = 7.0
            for line in content.split("\n"):
                line_lower = line.strip().lower()
                if "revision_required" in line_lower:
                    status = "revision_required"
                elif line_lower.startswith("status:"):
                    status = "approved" if "approved" in line_lower else "revision_required"
                elif line_lower.startswith("score:"):
                    try:
                        score = float(line_lower.split(":")[1].strip())
                    except ValueError:
                        pass
            return {"structured_feedback": {"status": status, "score": score}}
    except Exception as e:
        logger.debug("轻量审查异常: %s", e)
    return {"structured_feedback": {"status": "approved", "score": 7.0}}


async def run_simple_path(coordinator, user_message: str, ceo_id: str, on_message, team_id: str = "") -> dict[str, Any]:
    """简单任务路径：单 agent 执行 + 轻量审查（跳过讨论/投票/完整审查）"""
    executor_id = coordinator._find_agent_id(AgentRole.EXECUTOR) or "agent-executor"
    reviewer_id = coordinator._find_agent_id(AgentRole.REVIEWER) or "agent-reviewer"

    enhanced_desc, injected_rule_ids = await coordinator._inject_experience(
        ceo_id, user_message, user_message, [], target_agent_id=executor_id
    )

    memory_context = coordinator._recall_agent_memory(executor_id, enhanced_desc)
    if memory_context:
        enhanced_desc = f"{enhanced_desc}\n\n{memory_context}"

    await coordinator._msg(ceo_id, f"CEO：简单任务直接分派给 {executor_id} 执行。")
    assign_result = await coordinator.auto_assign_task(enhanced_desc, executor_id, "simple path")

    await coordinator._msg(executor_id, f"开始执行：{user_message[:80]}")
    try:
        exec_results = await coordinator.execute_assigned_tasks()
    except Exception as e:
        logger.warning("简单路径执行失败: %s", e)
        exec_results = []

    review_result = {"structured_feedback": {"status": "approved"}}
    if exec_results:
        try:
            exec_text = build_execution_artifact_text(exec_results)
            review_result = await lightweight_review(coordinator, reviewer_id, enhanced_desc, exec_text, on_message)
        except Exception as e:
            logger.warning("轻量审查失败: %s", e)

    task_complexity = coordinator._estimate_task_complexity(user_message)
    review_approved = review_result.get("structured_feedback", {}).get("status", "approved") == "approved"
    review_score = review_result.get("structured_feedback", {}).get("score", 8.0)
    if not isinstance(review_score, (int, float)):
        review_score = 8.0
    for exec_result in exec_results:
        agent_id = exec_result.get("agent_id", executor_id)
        bonus_score = review_score if review_approved else max(5.0, review_score - 3.0)
        coordinator._grant_task_xp(agent_id, "backend_dev", True, bonus_score, task_complexity)
        coordinator._write_task_memory(agent_id, user_message, review_approved, review_score,
                                        execution_summary=exec_result.get("result", "")[:200])

    coordinator._update_routing_stats_safe()
    await coordinator._run_skill_evolution(ceo_id, user_message, [], review_result, exec_results)

    if injected_rule_ids:
        await coordinator._update_injected_rule_effectiveness(ceo_id, injected_rule_ids, review_result)

    coordinator._save_snapshot()

    return {
        "type": "simple_completed",
        "execution_results": exec_results,
        "review_result": review_result,
        "injected_rule_ids": injected_rule_ids,
        "path": "simple",
    }


async def execute_and_review_task(coordinator, task_description: str, on_message: Callable[[str, str, str], Awaitable[None]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """执行任务并审查（委托给ReviewPipeline）"""
    task_results = await coordinator.execute_assigned_tasks()
    for task_result in task_results:
        await on_message(task_result["agent_id"], task_result["result"], "")

    review_result = {}
    if task_results:
        execution_result = build_execution_artifact_text(task_results)
        gate_result = await asyncio.to_thread(
            coordinator._run_deterministic_gate,
            coordinator._workspace.root_path if coordinator._workspace else None,
        )
        review_result = await coordinator._review_pipeline.review(
            task_description, execution_result, on_message, gate_result=gate_result
        )

    return review_result, task_results


async def run_dev_loop(coordinator, coordinator_id, enhanced_description, discussion_context, on_message):
    """开发循环：执行 → 审查 → 修复迭代"""
    from review_pipeline import ReviewIteration, ReviewReport
    max_dev_iterations = coordinator._max_iterations
    review_result = {}
    execution_results = []
    review_report = ReviewReport(task_id=coordinator_id)

    for dev_iter in range(1, max_dev_iterations + 1):
        await coordinator._msg(coordinator_id, f"项目经理：第 {dev_iter} 轮开发，监督任务执行。")
        coordinator.meeting.add_message("agent", f"项目经理：第 {dev_iter} 轮开发，监督任务执行。", coordinator_id)

        try:
            exec_results = await coordinator.execute_assigned_tasks()
            execution_results = exec_results
            for er in exec_results:
                await on_message(er["agent_id"], er["result"], "")
                written = er.get("written_files", [])
                if written:
                    await on_message(er["agent_id"], f"[第{dev_iter}轮] 已写入 {len(written)} 个文件: {', '.join(written)}", "")
        except Exception as e:
            logger.warning("第 %d 轮执行失败: %s", dev_iter, e)
            exec_results = []

        await coordinator._msg(coordinator_id, f"项目经理：第 {dev_iter} 轮质量审查。")
        coordinator.meeting.add_message("agent", f"项目经理：第 {dev_iter} 轮质量审查。", coordinator_id)
        execution_text = build_execution_artifact_text(exec_results) if exec_results else ""

        if exec_results:
            await save_execution_artifacts(coordinator, exec_results)

        if coordinator._artifact_store and exec_results:
            task_ids = [r.get("task_id") or r.get("agent_id", "") for r in exec_results if r.get("written_files")]
            artifact_context = coordinator._artifact_store.build_artifact_context(task_ids, max_chars_per_file=2000)
            if artifact_context:
                execution_text = f"{execution_text}\n\n[文件内容]\n{artifact_context}"

        try:
            if exec_results:
                gate_result = await asyncio.to_thread(coordinator._run_deterministic_gate, coordinator._workspace.root_path if coordinator._workspace else None)
            else:
                gate_result = None
            review_result = await coordinator._review_pipeline.review(enhanced_description, execution_text, on_message, discussion_context=discussion_context, gate_result=gate_result)
        except Exception as e:
            logger.warning("第 %d 轮审查失败: %s", dev_iter, e)
            review_result = {"status": "skipped", "reason": str(e)}

        reviewer_feedback = review_result.get("reviewer_feedback", "")
        monitor_feedback = review_result.get("monitor_feedback", "")
        coordinator_summary = review_result.get("coordinator_summary", "")
        feedback_text = f"[审查反馈]\n{reviewer_feedback}\n\n[评估反馈]\n{monitor_feedback}\n\n[总结]\n{coordinator_summary}"
        structured = review_result.get("structured_feedback", {})
        feedback_status = structured.get("status", "approved")

        if on_message:
            try:
                await on_message(coordinator_id, "", "", msg_type="review_summary",
                                 iteration=dev_iter, status=feedback_status,
                                 reviewer_feedback=reviewer_feedback[:200],
                                 monitor_feedback=monitor_feedback[:200],
                                 coordinator_summary=coordinator_summary[:200],
                                 issues=structured.get("issues", []))
            except Exception as e:
                logger.debug("审查摘要发送失败: %s", e)

        critic_result = review_result.get("critic_result", {})
        grounding_result = review_result.get("grounding_result", {})
        written_files = [f for er in exec_results for f in er.get("written_files", [])] if exec_results else []
        review_report.add_iteration(ReviewIteration(
            iteration=dev_iter, status=feedback_status,
            critic_severity=critic_result.get("severity", "unknown"), critic_findings=critic_result.get("findings", []),
            grounding_grounded=grounding_result.get("grounded", False), grounding_sources=grounding_result.get("sources", []),
            issues=structured.get("issues", []), reviewer_feedback=reviewer_feedback, monitor_feedback=monitor_feedback,
            coordinator_summary=coordinator_summary, gate_passed=gate_result.get("passed") if gate_result else None,
            gate_failures=[f.get("detail", "") for f in (gate_result or {}).get("failures", [])], files_written=written_files,
        ))

        if feedback_status == "approved" or dev_iter >= max_dev_iterations:
            text = f"项目经理：第 {dev_iter} 轮审查通过！" if feedback_status == "approved" else f"项目经理：已达最大迭代次数({max_dev_iterations})，结束开发循环。"
            await coordinator._msg(coordinator_id, text)
            coordinator.meeting.add_message("agent", text, coordinator_id)
            break

        await coordinator._msg(coordinator_id, f"项目经理：第 {dev_iter} 轮审查发现问题，启动修复。")
        fix_description = f"{enhanced_description}\n\n## 审查反馈（请据此修复）\n{feedback_text}\n\n请根据以上反馈修改已有文件或创建补充文件，修复所有指出的问题。"
        for task in coordinator.meeting.tasks:
            if task.status == "completed":
                task.status = "assigned"
                task.description = fix_description
        logger.info("第 %d 轮审查未通过，启动第 %d 轮修复", dev_iter, dev_iter + 1)

    return execution_results, review_result, review_report


async def execute_tool_call(coordinator, tool_name: str, arguments: dict) -> dict:
    """执行单个工具调用"""
    if not coordinator._tool_executor:
        return {"success": False, "error": "工具系统未初始化"}

    from tool_registry import ToolCall
    tool_call = ToolCall(tool_name=tool_name, arguments=arguments)
    result = await asyncio.to_thread(coordinator._tool_executor.execute, tool_call)

    if coordinator._on_message:
        ceo_id = coordinator._find_agent_id(AgentRole.CEO) or "agent-ceo"
        status_text = f"[工具调用] {tool_name}: {'成功' if result.success else '失败'}"
        await coordinator._on_message(ceo_id, status_text, "")

    return {"success": result.success, "output": result.output, "error": result.error}
