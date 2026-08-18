"""
MeetingCoordinator 工作流执行子模块

提取自 meeting_coordinator.py 的工作流相关方法：
- setup_workflow_engine: 配置节点执行器和回调
- run_agent_execution_loop: LLM + 工具执行循环
- extract_tool_calls_from_text: 从 LLM 文本提取工具调用
- execute_workflow_node: 执行单个工作流节点
- run_node_gate: 节点把关
- on_workflow_status_change: 工作流状态变化回调
- on_workflow_node_status_change: 节点状态变化回调
- execute_workflow: 执行完整工作流
"""

import asyncio
import json
import logging
from typing import Any, Callable, Dict, List, Optional

from agent import _extract_text
from protocol import AgentRole, WorkflowNode, WorkflowDefinition, LLM_FALLBACK_TEMPLATE


logger = logging.getLogger("coordinator_workflow")


def setup_workflow_engine(coordinator):
    """配置 WorkflowEngine 的节点执行器和回调函数"""
    # 用闭包捕获 coordinator 实例，直接调用 coordinator 方法（支持测试 monkeypatch）
    async def _node_executor(node, input_data):
        return await coordinator._execute_workflow_node(node, input_data)

    async def _status_callback(execution):
        await coordinator._on_workflow_status_change(execution)

    async def _node_status_callback(execution, node_id):
        await coordinator._on_workflow_node_status_change(execution, node_id)

    for dept in ("dept-frontend", "dept-backend", "dept-qa", "dept-devops", "dept-data", "dept-docs", "dept-fullstack"):
        coordinator.workflow_engine.register_node_executor(dept, _node_executor)
    coordinator.workflow_engine.set_status_change_callback(_status_callback)
    coordinator.workflow_engine.set_node_status_change_callback(_node_status_callback)


async def run_agent_execution_loop(
    coordinator,
    model,
    prompt: str,
    agent_toolset,
    max_tool_rounds: int = 5,
    on_model_error: Optional[Callable[[], None]] = None,
) -> Dict[str, Any]:
    """LLM + 工具执行循环：代码块写文件、工具调用、产物收集"""
    from agentscope.message import Msg
    from code_extractor import extract_code_blocks
    from llm_guard import safe_llm_reply

    msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
    conversation = [msg]
    files_written: List[str] = []
    tool_outputs: List[Dict[str, Any]] = []
    last_text = ""

    for _ in range(max_tool_rounds + 1):
        try:
            response = await safe_llm_reply(model, conversation, timeout=120)
        except Exception:
            if on_model_error:
                try:
                    on_model_error()
                except Exception as e:
                    logger.warning("模型失败通知回调异常: %s", e)
            raise
        last_text = _extract_text(response)

        code_blocks = extract_code_blocks(last_text)
        if code_blocks and agent_toolset:
            for block in code_blocks:
                wf = agent_toolset.write_file(block["filename"], block["content"])
                if wf.success:
                    files_written.append(block["filename"])
                else:
                    logger.warning("工作流节点写文件失败: %s", block["filename"])

        if not code_blocks and agent_toolset:
            tool_calls = extract_tool_calls_from_text(last_text)
            for call in tool_calls:
                tc = agent_toolset.execute(call["tool"], call.get("arguments", {}))
                tool_outputs.append({"tool": call["tool"], "success": tc.success, "output": tc.output})

        conversation.append(Msg(name="assistant", role="assistant", content=[{"type": "text", "text": last_text}]))
        if files_written or tool_outputs:
            break
        if "完成" in last_text or "done" in last_text.lower():
            break

    return {"result": last_text, "files_written": files_written, "tool_outputs": tool_outputs}


def extract_tool_calls_from_text(text: str) -> List[Dict[str, Any]]:
    """从 LLM 文本提取工具调用 JSON（花括号配对扫描）"""
    calls: List[Dict[str, Any]] = []
    start = 0
    while True:
        begin = text.find("{", start)
        if begin == -1:
            break
        depth = 0
        in_str = False
        escape = False
        end = -1
        for i in range(begin, len(text)):
            ch = text[i]
            if in_str:
                if escape:
                    escape = False
                elif ch == "\\":
                    escape = True
                elif ch == '"':
                    in_str = False
            else:
                if ch == '"':
                    in_str = True
                elif ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        end = i
                        break
        if end == -1:
            start = begin + 1
            continue
        candidate = text[begin:end + 1]
        if '"tool"' in candidate:
            try:
                parsed = json.loads(candidate)
                if isinstance(parsed, dict) and parsed.get("tool"):
                    calls.append(parsed)
                    start = end + 1
                    continue
            except Exception:
                pass
        start = begin + 1
    return calls


async def execute_workflow_node(coordinator, node: WorkflowNode, input_data: dict) -> dict:
    """执行工作流节点：LLM + 工具调用 + 产物写入工作区"""

    logger.info("执行工作流节点: %s (部门: %s)", node.node_id, node.dept_id)

    role_map = {
        "dept-frontend": AgentRole.EXECUTOR,
        "dept-backend": AgentRole.EXECUTOR,
        "dept-qa": AgentRole.REVIEWER,
        "dept-devops": AgentRole.MONITOR,
        "dept-data": AgentRole.EXECUTOR,
        "dept-docs": AgentRole.COORDINATOR,
        "dept-fullstack": AgentRole.EXECUTOR,
    }
    role = role_map.get(node.dept_id, AgentRole.EXECUTOR)
    model = coordinator._get_model(role)

    agent_toolset = None
    if coordinator._workspace:
        from agent_toolset import create_agent_toolset
        agent_toolset = create_agent_toolset(
            agent_id=node.node_id, agent_role=role.value, workspace_root=coordinator._workspace.root_path,
        )

    tool_prompt = f"\n\n{agent_toolset.get_system_prompt()}" if agent_toolset else ""
    asset_context = ""
    if coordinator._asset_context_builder is not None and node.dept_id == "dept-docs":
        try:
            team_id = (input_data or {}).get("team_id", "")
            if team_id:
                asset_context = coordinator._asset_context_builder(team_id, "minutes", ["纪要", "待办"])
        except Exception as exc:
            logger.warning("资产参考注入失败: %s", exc)

    prompt = (
        f"请执行以下任务：\n"
        f"任务描述：{node.task_description}\n"
        f"输入数据：{json.dumps(input_data, ensure_ascii=False)}\n"
        f"{tool_prompt}{asset_context}\n\n"
        f"需要产出文件时，用代码块输出：```文件名\n内容\n```；需要调用工具时输出 JSON："
        f'{{"tool": "工具名", "arguments": {{...}}}}。'
    )

    try:
        loop_result = await coordinator._run_agent_execution_loop(
            model, prompt, agent_toolset,
            on_model_error=lambda: coordinator._mark_model_failed(role),
        )
    except Exception as e:
        logger.warning("工作流节点执行失败: %s", e)
        loop_result = {
            "result": LLM_FALLBACK_TEMPLATE.format(role=node.dept_id, content_type="执行结果"),
            "files_written": [], "tool_outputs": [],
        }

    node_result = {
        "result": loop_result["result"], "node_id": node.node_id, "dept_id": node.dept_id,
        "files_written": loop_result["files_written"], "tool_outputs": loop_result["tool_outputs"],
    }

    gate_result = await run_node_gate(coordinator, node)
    if gate_result:
        return {**node_result, "gate": gate_result}
    return node_result


async def run_node_gate(coordinator, node: WorkflowNode) -> Optional[dict]:
    """节点把关：node.gate 非空且已注入 approval_manager 时发起把关"""
    gate = node.gate
    if not gate or coordinator._approval_manager is None:
        return None

    from meeting_coordinator import _build_approval_send_fn, _noop_on_message
    gate_id = f"{node.node_id}:{gate.get('stage', 'review')}"
    approval = await coordinator._approval_manager.request_gate(
        requester_id=coordinator._find_agent_id(AgentRole.CEO) or "agent",
        operation="node_gate",
        description=gate.get("reason") or f"节点 {node.node_id} 待把关",
        task_id=node.node_id, gate_id=gate_id, approver=gate.get("approver", ""),
        send_fn=_build_approval_send_fn(getattr(coordinator, "_on_message", None) or _noop_on_message),
    )
    try:
        decision = await coordinator._approval_manager.wait_for_decision(approval.id, timeout=coordinator._approval_timeout)
    except asyncio.TimeoutError:
        return None
    if decision.get("approved") is False:
        return {"status": "rejected", "reason": decision.get("reason", "")}
    return None


async def on_workflow_status_change(coordinator, execution):
    """工作流状态变化回调"""
    if not coordinator._on_message:
        return
    status_value = execution.status.value if hasattr(execution.status, 'value') else str(execution.status)
    logger.info("工作流状态变化: %s -> %s", execution.execution_id, status_value)
    ceo_id = coordinator._find_agent_id(AgentRole.CEO) or "agent-ceo"
    await coordinator._on_message(
        ceo_id, f"工作流 {execution.workflow_id} 状态变更: {status_value}", "",
        msg_type="workflow_status_update", workflow_id=execution.workflow_id,
        execution_id=execution.execution_id, status=status_value,
    )


async def on_workflow_node_status_change(coordinator, execution, node_id):
    """工作流节点状态变化回调"""
    if not coordinator._on_message:
        return
    node_status = execution.node_states.get(node_id)
    status_value = node_status.value if node_status else "unknown"
    logger.info("工作流节点状态变化: %s -> %s", node_id, status_value)
    ceo_id = coordinator._find_agent_id(AgentRole.CEO) or "agent-ceo"
    await coordinator._on_message(
        ceo_id, f"节点 {node_id} 状态变更: {status_value}", "",
        msg_type="workflow_node_status_update", workflow_id=execution.workflow_id,
        execution_id=execution.execution_id, node_id=node_id, status=status_value,
    )


async def execute_workflow(coordinator, workflow_definition: WorkflowDefinition, on_message) -> Dict[str, Any]:
    """执行完整工作流"""
    try:
        execution = coordinator.workflow_engine.create_workflow(workflow_definition)
        ceo_id = coordinator._find_agent_id(AgentRole.CEO) or "agent-ceo"
        create_msg = f"工作流已创建: {workflow_definition.name} (ID: {execution.execution_id})"
        await coordinator._msg(ceo_id, create_msg)
        coordinator.meeting.add_message("agent", create_msg, ceo_id)

        task = coordinator.workflow_engine.start_workflow(execution.execution_id)
        try:
            await task
        except asyncio.CancelledError:
            cancelled_status = coordinator.workflow_engine.get_workflow_status(execution.execution_id)
            if cancelled_status.status.value == "paused":
                cancelled_msg, cancelled_result_status = "工作流已暂停", "paused"
            else:
                cancelled_msg, cancelled_result_status = "工作流已取消", "cancelled"
            await coordinator._msg(ceo_id, cancelled_msg)
            coordinator.meeting.add_message("agent", cancelled_msg, ceo_id)
            return {"execution_id": execution.execution_id, "status": cancelled_result_status, "results": cancelled_status.results}

        status = coordinator.workflow_engine.get_workflow_status(execution.execution_id)
        complete_msg = f"工作流执行完成: {status.status.value}"
        await coordinator._msg(ceo_id, complete_msg)
        coordinator.meeting.add_message("agent", complete_msg, ceo_id)

        results_summary = []
        for node_id, result in status.results.items():
            if isinstance(result, dict) and "result" in result:
                results_summary.append(f"- {node_id}: {result['result'][:100]}...")
        if results_summary:
            summary_msg = "工作流执行结果汇总:\n" + "\n".join(results_summary)
            await coordinator._msg(ceo_id, summary_msg)
            coordinator.meeting.add_message("agent", summary_msg, ceo_id)

        return {"execution_id": execution.execution_id, "status": status.status.value, "results": status.results}

    except Exception as e:
        logger.error("工作流执行失败: %s", str(e))
        ceo_id = coordinator._find_agent_id(AgentRole.CEO) or "agent-ceo"
        error_msg = f"工作流执行失败: {str(e)}"
        await coordinator._msg(ceo_id, error_msg)
        coordinator.meeting.add_message("agent", error_msg, ceo_id)
        return {"error": str(e)}
