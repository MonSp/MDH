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
                f"工作流程：\n"
                f"1. 先用 list_directory 检查工作区现有文件\n"
                f"2. 用代码块写入所有文件（格式：```文件名.扩展名\n内容\n```）\n"
                f"3. 必须创建依赖文件（如 requirements.txt, package.json）\n"
                f"4. 每个代码文件必须包含完整可运行的代码\n"
                f"每个文件单独一个代码块，不要使用tool_call格式。{tool_prompt}"
            )
            msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
            conversation = [msg]

            try:
                written_files = []
                all_tool_results = []
                last_text = ""
                max_tool_rounds = 5

                # ── 阶段A: 环境检查 ──
                if agent_toolset:
                    ls_result = agent_toolset.list_directory(".")
                    env_info = ls_result.output if ls_result.success else "(空目录)"
                    conversation.append(Msg(
                        name="user", role="user",
                        content=[{"type": "text", "text": f"工作区当前内容：\n{env_info}\n\n请开始创建文件。"}],
                    ))
                    logger.info("Agent %s 环境检查: %s", task.agent_id, env_info[:100])

                # ── 阶段B: 文件创建循环 ──
                for tool_round in range(max_tool_rounds + 1):
                    response = await model.reply(conversation)
                    last_text = _extract_text(response)

                    files_this_round = []

                    # 1. 从代码块提取文件（优先，格式更紧凑）
                    code_blocks = extract_code_blocks(last_text)
                    if code_blocks and agent_toolset:
                        for block in code_blocks:
                            cb_result = agent_toolset.write_file(block["filename"], block["content"])
                            if cb_result.success:
                                written_files.append(block["filename"])
                                files_this_round.append(block["filename"])
                                logger.info("Agent %s 代码块写入: %s", task.agent_id, block["filename"])
                            else:
                                logger.warning("Agent %s 写入失败: %s - %s", task.agent_id, block["filename"], cb_result.error)

                    # 2. 提取tool_call（备用）
                    if not files_this_round:
                        tool_calls = self._extract_tool_calls(last_text)
                        if tool_calls and agent_toolset:
                            result_parts = []
                            for call in tool_calls:
                                tc_result = agent_toolset.execute(call["tool"], call.get("arguments", {}))
                                tool_result = {
                                    "tool": call["tool"],
                                    "success": tc_result.success,
                                    "output": tc_result.output if tc_result.success else tc_result.error,
                                }
                                all_tool_results.append(tool_result)
                                if call["tool"] == "write_file" and tc_result.success:
                                    path = call.get("arguments", {}).get("path", "")
                                    if path:
                                        written_files.append(path)
                                        files_this_round.append(path)
                                        logger.info("Agent %s tool_call写入: %s", task.agent_id, path)
                                output = tc_result.output if tc_result.success else f"ERROR: {tc_result.error}"
                                result_parts.append(f"[{call['tool']}]\n{output}")

                            if result_parts:
                                tool_feedback = "\n\n".join(result_parts)
                                followup = Msg(
                                    name="user", role="user",
                                    content=[{"type": "text", "text": f"工具执行结果：\n{tool_feedback}\n\n请继续创建下一个文件。"}],
                                )
                                conversation.append(followup)
                                continue

                    # 3. 反馈本轮结果，请求继续
                    if files_this_round:
                        followup = Msg(
                            name="user", role="user",
                            content=[{"type": "text", "text": f"已写入文件: {', '.join(files_this_round)}\n请继续创建下一个文件。如果没有更多文件需要创建，请回复'任务完成'。"}],
                        )
                        conversation.append(followup)
                        continue

                    # 4. 无文件写入 → 结束
                    break

                # ── 阶段C: 依赖安装与验证 ──
                verification_results = []
                if agent_toolset and written_files:
                    # 扫描依赖文件
                    dep_files = {
                        "requirements.txt": "pip install -r requirements.txt",
                        "package.json": "npm install --prefix .",
                        "Pipfile": "pipenv install",
                        "pyproject.toml": "pip install -e .",
                    }
                    for dep_file, install_cmd in dep_files.items():
                        if dep_file in written_files:
                            logger.info("Agent %s 安装依赖: %s", task.agent_id, dep_file)
                            install_result = agent_toolset.run_command(install_cmd)
                            status = "成功" if install_result.success else f"失败: {install_result.error[:200]}"
                            verification_results.append(f"依赖安装 {dep_file}: {status}")
                            if install_result.success:
                                logger.info("Agent %s 依赖安装成功: %s", task.agent_id, dep_file)
                            else:
                                logger.warning("Agent %s 依赖安装失败: %s - %s", task.agent_id, dep_file, install_result.error[:200])

                    # 语法检查
                    code_exts = {'.py', '.js', '.ts', '.json', '.yaml', '.yml'}
                    for fname in written_files:
                        ext = '.' + fname.rsplit('.', 1)[-1] if '.' in fname else ''
                        if ext == '.py':
                            check = agent_toolset.run_command(f'python -c "import ast; ast.parse(open(\'{fname}\', encoding=\'utf-8\').read()); print(\'OK\')"')
                            status = "通过" if check.success else f"语法错误: {check.error[:100]}"
                            verification_results.append(f"语法检查 {fname}: {status}")
                        elif ext == '.json':
                            check = agent_toolset.run_command(f'python -c "import json; json.load(open(\'{fname}\', encoding=\'utf-8\')); print(\'OK\')"')
                            status = "通过" if check.success else f"格式错误: {check.error[:100]}"
                            verification_results.append(f"语法检查 {fname}: {status}")

                    if verification_results:
                        logger.info("Agent %s 验证结果: %s", task.agent_id, "; ".join(verification_results))

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
                    "verification": verification_results,
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
            raw = match.group(1).strip()
            try:
                call_json = json.loads(raw)
                if "tool" in call_json:
                    tool_calls.append(call_json)
                    logger.info("提取工具调用: %s args=%s", call_json["tool"], list(call_json.get("arguments", {}).keys()))
            except json.JSONDecodeError:
                logger.warning("工具调用JSON解析失败: %s", raw[:100])

        if tool_calls:
            logger.info("共提取 %d 个工具调用", len(tool_calls))
        return tool_calls
