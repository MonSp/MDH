"""
Task Orchestrator - 任务编排器

从 MeetingCoordinator 的 decompose_task()、assign_tasks()、
execute_assigned_tasks() 提取。
集成 SpecManager、GateManager、EvidenceChain。
"""

import json
import logging
import uuid
from typing import Any, Awaitable, Callable, Dict, List, Optional

from agentscope.agent import Agent
from agentscope.message import Msg

from agent import _extract_text
from agent_toolset import AgentToolset
from code_extractor import extract_code_blocks
from protocol import AgentRole, MeetingAgentStatus
from dynamic_router import DynamicRouter
from spec_manager import SpecManager
from evidence_chain import EvidenceChain, Evidence
from fallback_chain import FallbackChain, FallbackExecutor, RoutingFallbackBuilder

logger = logging.getLogger("task_orchestrator")


class TaskOrchestrator:
    """任务编排器"""
    
    def __init__(
        self,
        get_model_fn,
        meeting,
        router: DynamicRouter,
        spec_manager: Optional[SpecManager] = None,
        evidence_chain: Optional[EvidenceChain] = None,
        fallback_executor: Optional[FallbackExecutor] = None,
        workspace_root: Optional[str] = None,
    ):
        self._get_model = get_model_fn
        self._meeting = meeting
        self._router = router
        self._spec_manager = spec_manager or SpecManager()
        self._evidence_chain = evidence_chain or EvidenceChain()
        self._fallback_executor = fallback_executor or FallbackExecutor()
        self._tasks: List[Dict[str, Any]] = []
        self._task_routing: Dict[str, str] = {}
        self._workspace_root = workspace_root
    
    async def decompose(self, task_description: str) -> List[Dict[str, Any]]:
        """
        分解任务
        
        Args:
            task_description: 任务描述
            
        Returns:
            子任务列表
        """
        planner = self._get_model(AgentRole.PLANNER)
        prompt = (
            f"请将以下任务分解为多个子任务，以JSON数组格式返回。"
            f"每个子任务包含 name(名称)、description(描述)、priority(优先级：high/medium/low)、"
            f"dependencies(依赖的子任务名称列表)。\n\n"
            f"任务：{task_description}\n\n"
            f"请只返回JSON数组，不要其他内容。"
        )
        msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
        response = await planner.reply(msg)
        text = _extract_text(response)
        
        try:
            subtasks = json.loads(text)
        except (json.JSONDecodeError, TypeError):
            subtasks = [{
                "name": task_description[:50],
                "description": task_description,
                "priority": "high",
                "dependencies": [],
            }]
        
        for subtask in subtasks:
            subtask["id"] = str(uuid.uuid4())[:8]
        
        self._tasks = subtasks
        
        # 记录证据
        self._evidence_chain.add_evidence(str(uuid.uuid4())[:8], Evidence(
            stage="decomposition",
            decision=f"分解为{len(subtasks)}个子任务",
            inputs={"task_description": task_description},
            outputs={"subtasks": [s["name"] for s in subtasks]},
        ))
        
        return subtasks
    
    async def assign(self, subtasks: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
        """
        分配任务
        
        Args:
            subtasks: 子任务列表
            
        Returns:
            分配结果
        """
        if subtasks is None:
            subtasks = self._tasks
        
        assignments = []
        
        for subtask in subtasks:
            task_text = (subtask.get("name", "") + " " + subtask.get("description", "")).lower()
            
            # 使用DynamicRouter路由
            routing_decision = self._router.route(task_text)
            
            # 构建回退链
            if routing_decision.candidate_depts:
                fallback_chain = RoutingFallbackBuilder.build_from_candidates(
                    routing_decision.candidate_depts
                )
                target_dept = fallback_chain.primary
            else:
                target_dept = routing_decision.selected_dept or "dept-fullstack"
            
            # 映射到agent
            dept_to_agent = {
                "dept-frontend": "agent-executor",
                "dept-backend": "agent-executor",
                "dept-fullstack": "agent-executor",
                "dept-qa": "agent-reviewer",
                "dept-devops": "agent-monitor",
                "dept-data": "agent-executor",
                "dept-docs": "agent-coordinator",
            }
            agent_id = dept_to_agent.get(target_dept, "agent-executor")
            
            task = self._meeting.add_task(agent_id, subtask.get("description", ""))
            self._meeting.update_task_status(task.id, "assigned")
            self._meeting.update_agent_status(agent_id, MeetingAgentStatus.WORKING)
            
            self._task_routing[task.id] = target_dept
            
            assignments.append({
                "task_id": task.id,
                "agent_id": agent_id,
                "subtask": subtask,
                "dept_id": target_dept,
            })
        
        self._tasks = subtasks or self._tasks
        return assignments
    
    async def execute(self, on_progress: Callable = None) -> List[Dict[str, Any]]:
        """
        执行已分配的任务
        
        Args:
            on_progress: 进度回调函数 (agent_id, message, delta) -> None
            
        Returns:
            执行结果
        """
        results = []
        total_tasks = len([t for t in self._meeting.tasks if t.status == "assigned"])
        completed_tasks = 0
        
        for task in self._meeting.tasks:
            if task.status != "assigned":
                continue
            
            agent_info = self._meeting.get_agent(task.agent_id)
            if agent_info is None:
                continue
            
            # 进度汇报
            completed_tasks += 1
            if on_progress:
                progress_text = f"项目经理：正在执行任务 {completed_tasks}/{total_tasks} - {task.description[:30]}..."
                await on_progress("agent-coordinator", progress_text, "")
            
            role = AgentRole(agent_info.role.value)
            model = self._get_model(role)
            
            # 为当前Agent创建工具集
            agent_toolset = None
            if self._workspace_root:
                agent_toolset = AgentToolset(
                    agent_id=task.agent_id,
                    agent_role=role.value,
                    workspace_root=self._workspace_root,
                )
            
            # 构建包含工具说明的提示词
            tool_prompt = ""
            if agent_toolset:
                tool_prompt = f"\n\n{agent_toolset.get_system_prompt()}"
            
            prompt = (
                f"请执行以下任务：\n{task.description}\n\n"
                f"请使用工具将内容写入工作区。{tool_prompt}"
            )
            msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
            conversation = [msg]
            
            try:
                written_files = []
                all_tool_results = []
                last_text = ""
                max_tool_rounds = 5

                for tool_round in range(max_tool_rounds + 1):
                    response = await model.reply(conversation)
                    last_text = _extract_text(response)

                    # 提取代码块并写入
                    code_blocks = extract_code_blocks(last_text)
                    if code_blocks and agent_toolset:
                        for block in code_blocks:
                            result = agent_toolset.write_file(block["filename"], block["content"])
                            if result.success:
                                written_files.append(block["filename"])
                                logger.info("Agent %s 已写入文件: %s", task.agent_id, block["filename"])
                            else:
                                logger.warning("Agent %s 写入文件失败: %s - %s", task.agent_id, block["filename"], result.error)

                    # 提取工具调用并执行
                    tool_calls = self._extract_tool_calls(last_text)
                    if not tool_calls or not agent_toolset:
                        break

                    # 执行工具并收集结果
                    result_parts = []
                    for call in tool_calls:
                        result = agent_toolset.execute(call["tool"], call.get("arguments", {}))
                        tool_result = {
                            "tool": call["tool"],
                            "success": result.success,
                            "output": result.output if result.success else result.error,
                        }
                        all_tool_results.append(tool_result)
                        output = result.output if result.success else f"ERROR: {result.error}"
                        result_parts.append(f"[{call['tool']} result]\n{output}")

                    # 将工具结果反馈给Agent继续执行
                    tool_feedback = "\n\n".join(result_parts)
                    followup_msg = Msg(
                        name="user", role="user",
                        content=[{"type": "text", "text": f"工具执行结果：\n{tool_feedback}\n\n请继续执行任务，使用 write_file 写入文件。"}],
                    )
                    conversation.append(followup_msg)

                self._meeting.update_task_status(task.id, "completed")
                self._meeting.update_agent_status(task.agent_id, MeetingAgentStatus.MEETING)
                
                # 更新路由统计
                dept_id = self._task_routing.get(task.id)
                if dept_id:
                    self._router.update_stats(dept_id, success=True)
                
                results.append({
                    "task_id": task.id,
                    "agent_id": task.agent_id,
                    "result": last_text,
                    "written_files": written_files,
                    "code_blocks_count": len(extract_code_blocks(last_text)),
                    "tool_calls": all_tool_results,
                    "agent_role": role.value,
                })
            except Exception as e:
                logger.error("任务执行失败: task_id=%s error=%s", task.id, e)
                self._meeting.update_task_status(task.id, "failed")
                self._meeting.update_agent_status(task.agent_id, MeetingAgentStatus.MEETING)
                
                dept_id = self._task_routing.get(task.id)
                if dept_id:
                    self._router.update_stats(dept_id, success=False)
                
                results.append({
                    "task_id": task.id,
                    "agent_id": task.agent_id,
                    "result": f"任务执行失败: {e}",
                })
        
        return results
    
    def _extract_tool_calls(self, text: str) -> List[Dict[str, Any]]:
        """从Agent回复中提取工具调用
        
        支持格式：
        ```tool_call
        {"tool": "read_file", "arguments": {"path": "..."}}
        ```
        """
        import re
        import json
        
        tool_calls = []
        pattern = r'```tool_call\s*\n(.*?)```'
        
        for match in re.finditer(pattern, text, re.DOTALL):
            try:
                call_json = json.loads(match.group(1).strip())
                if "tool" in call_json:
                    tool_calls.append(call_json)
            except json.JSONDecodeError:
                continue
        
        return tool_calls
