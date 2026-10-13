"""事件循环防护回归：同步热点必须让出 loop，提取器必须可熔断"""
import asyncio
import time
from types import SimpleNamespace

import pytest

import task_orchestrator as to
from code_extractor import extract_code_blocks
from task_orchestrator import TaskOrchestrator


def test_extractor_budget_on_pathological_input():
    """超大围栏输入必须快速返回（步数熔断 + 正常推进）"""
    # 模糊测试曾在此类输入上死循环 → 卡死整个服务
    text = "\n".join(["```json", "```tool_call", "```a.py", "text", "```"] * 800)
    st = time.time()
    blocks = extract_code_blocks(text)
    assert time.time() - st < 2.0
    assert isinstance(blocks, list)


def test_write_loop_extraction_runs_off_event_loop(monkeypatch):
    """extract_code_blocks 若在 loop 线程同步执行，ticker 会被饿死

    该回归锁住 await asyncio.to_thread(extract_code_blocks, ...) 模式——
    R6 的 P0 死循环之所以冻死全站，正是因为提取跑在事件循环上。
    """

    def slow_extract(text):
        time.sleep(0.4)  # 模拟病态提取耗时
        return []

    monkeypatch.setattr(to, "extract_code_blocks", slow_extract)

    async def fake_reply(model, conversation, timeout=None):
        return SimpleNamespace(content=[{"type": "text", "text": "```a.py\nprint(1)\n```"}])

    monkeypatch.setattr(to, "safe_llm_reply", fake_reply)

    orch = object.__new__(TaskOrchestrator)
    orch._workspace_root = None
    orch._kernel = None
    orch._on_agent_status_change = None
    orch._get_model = lambda role: object()
    orch._get_experience_context = lambda desc: ""
    orch._meeting = SimpleNamespace(
        get_agent=lambda aid: SimpleNamespace(role=SimpleNamespace(value="executor")),
        update_task_status=lambda *a, **k: None,
        update_agent_status=lambda *a, **k: None,
    )
    task = SimpleNamespace(id="t1", agent_id="a1", description="写点东西")

    ticks = 0

    async def ticker():
        nonlocal ticks
        for _ in range(12):
            await asyncio.sleep(0.05)
            ticks += 1

    async def main():
        await asyncio.gather(orch._execute_one_task(task, None), ticker())

    asyncio.run(main())
    # 提取 0.4s 若阻塞 loop，ticker 只会走 0 格；offload 后应 ≥4
    assert ticks >= 4, f"event loop blocked: ticks={ticks}"


@pytest.mark.asyncio
async def test_workflow_prev_context_off_event_loop(monkeypatch):
    """工作流节点的上一任务产物构建走 to_thread（文件遍历不卡 loop）"""
    import coordinator_workflow as cw
    import workspace_manager as wm

    def slow_build(current_root="", **kw):
        time.sleep(0.3)
        return "[上一任务产物] x"

    monkeypatch.setattr(wm, "build_previous_workspace_context", slow_build)
    # coordinator_workflow 内是函数内 import → patch to_thread 的目标需一致：
    # 函数内 `from workspace_manager import ...` 每次调用取最新属性 → patch 生效

    ticks = 0

    async def ticker():
        nonlocal ticks
        for _ in range(8):
            await asyncio.sleep(0.05)
            ticks += 1

    async def fake_loop(model, prompt, toolset, on_model_error=None):
        return {"result": "done", "files_written": [], "tool_outputs": [], "verification": []}

    coord = SimpleNamespace(
        _workspace=SimpleNamespace(root_path="/tmp/nowhere-eval"),
        _asset_context_builder=None,
        _approval_manager=None,
        _executor_url="",
        _get_model=lambda role: object(),
        meeting=SimpleNamespace(agents=[]),
        _run_agent_execution_loop=fake_loop,
        _find_agent_id=lambda role: None,
        _get_experience_extractor=lambda: SimpleNamespace(
            _infer_task_type=lambda t: "general",
            retrieve_relevant_rules=lambda tt, kw: [],
            build_experience_context=lambda rules: "",
        ),
    )
    from protocol import WorkflowNode, WorkflowNodeStatus
    node = WorkflowNode(node_id="n1", task_description="任务", dept_id="dept-backend",
                        status=WorkflowNodeStatus.PENDING)

    async def main():
        await asyncio.gather(cw.execute_workflow_node(coord, node, {}), ticker())

    await main()
    assert ticks >= 2, f"event loop blocked in workflow node: ticks={ticks}"
