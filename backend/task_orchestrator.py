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
from llm_guard import safe_llm_reply

from agent import _extract_text
from agent_toolset import AgentToolset
from code_extractor import extract_code_blocks
from protocol import AgentRole, MeetingAgentStatus
from dynamic_router import DynamicRouter
from spec_manager import SpecManager
from evidence_chain import EvidenceChain, Evidence
from fallback_chain import FallbackChain, FallbackExecutor, RoutingFallbackBuilder
from experience_extractor import ExperienceExtractor

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
        response = await safe_llm_reply(planner, msg, timeout=60)
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
    
    async def execute(self, on_progress: Callable = None, parallel: bool = False) -> List[Dict[str, Any]]:
        """
        执行已分配的任务
        
        Args:
            on_progress: 进度回调函数 (agent_id, message, delta) -> None
            parallel: 是否并行执行（默认串行）
            
        Returns:
            执行结果
        """
        assigned_tasks = [t for t in self._meeting.tasks if t.status == "assigned"]
        
        if parallel and len(assigned_tasks) > 1:
            return await self._execute_parallel(assigned_tasks, on_progress)
        return await self._execute_sequential(assigned_tasks, on_progress)

    async def _execute_sequential(self, tasks, on_progress):
        """串行执行任务"""
        results = []
        total_tasks = len(tasks)
        completed_tasks = 0

        for task in tasks:
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
            
            # 注入历史经验规则
            experience_context = self._get_experience_context(task.description)
            
            prompt = (
                f"请执行以下任务：\n{task.description}\n\n"
                f"重要：直接使用代码块写入文件，格式为：\n"
                f"```文件路径.扩展名\n文件内容\n```\n"
                f"例如：\n```backend/app/main.py\nfrom fastapi import FastAPI\n...\n```\n"
                f"注意：\n"
                f"- 不要使用bash/mkdir创建目录，write_file会自动创建父目录\n"
                f"- 每个文件单独一个代码块\n"
                f"- 不要使用tool_call格式\n"
                f"- 代码必须完整可运行，不要省略"
                f"{experience_context}{tool_prompt}"
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
                    response = await safe_llm_reply(model, conversation, timeout=120)
                    last_text = _extract_text(response)

                    files_this_round = []

                    # 提取agent的计划说明（代码块/tool_call之前的文字）
                    plan_text = self._extract_plan(last_text)
                    if plan_text and on_progress:
                        await on_progress(task.agent_id, plan_text, "")

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

                    # 3. 通知前端本轮写入了什么文件
                    if files_this_round and on_progress:
                        file_list = ", ".join(files_this_round)
                        char_count = sum(len(b.get("content", "")) for b in code_blocks if b.get("filename") in files_this_round) if code_blocks else 0
                        await on_progress(
                            task.agent_id,
                            f"[写入文件] {file_list} ({char_count} 字符)",
                            "",
                        )

                    # 4. 反馈本轮结果，请求继续
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

                results.append({
                    "task_id": task.id,
                    "agent_id": task.agent_id,
                    "result": f"任务执行失败: {e}",
                })
        
        return results

    async def _execute_parallel(self, tasks, on_progress):
        """并行执行任务"""
        import asyncio

        async def execute_one(task):
            agent_info = self._meeting.get_agent(task.agent_id)
            if agent_info is None:
                return None

            role = AgentRole(agent_info.role.value)
            model = self._get_model(role)

            agent_toolset = None
            if self._workspace_root:
                agent_toolset = AgentToolset(
                    agent_id=task.agent_id,
                    agent_role=role.value,
                    workspace_root=self._workspace_root,
                )

            prompt = self._build_prompt(task, agent_info, agent_toolset)
            msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])

            try:
                response = await safe_llm_reply(model, msg, timeout=120)
                last_text = _extract_text(response)
                self._meeting.update_task_status(task.id, "completed")
                return {
                    "task_id": task.id,
                    "agent_id": task.agent_id,
                    "result": last_text,
                    "written_files": [],
                    "code_blocks_count": 0,
                    "tool_calls": [],
                    "verification": [],
                    "agent_role": role.value,
                }
            except Exception as e:
                self._meeting.update_task_status(task.id, "failed")
                return {
                    "task_id": task.id,
                    "agent_id": task.agent_id,
                    "result": f"任务执行失败: {e}",
                }

        if on_progress:
            await on_progress("agent-coordinator", f"项目经理：并行执行 {len(tasks)} 个任务", "")

        coros = [execute_one(t) for t in tasks]
        raw_results = await asyncio.gather(*coros, return_exceptions=True)

        results = []
        for r in raw_results:
            if isinstance(r, Exception):
                results.append({"result": f"任务执行异常: {r}"})
            elif r is not None:
                results.append(r)

        return results

    def _build_prompt(self, task, agent_info, agent_toolset=None) -> str:
        """构建包含工具说明和经验上下文的提示词"""
        tool_prompt = ""
        if agent_toolset:
            tool_prompt = f"\n\n{agent_toolset.get_system_prompt()}"

        experience_context = self._get_experience_context(task.description)

        return (
            f"请执行以下任务：\n{task.description}\n\n"
            f"重要：直接使用代码块写入文件，格式为：\n"
            f"```文件路径.扩展名\n文件内容\n```\n"
            f"例如：\n```backend/app/main.py\nfrom fastapi import FastAPI\n...\n```\n"
            f"注意：\n"
            f"- 不要使用bash/mkdir创建目录，write_file会自动创建父目录\n"
            f"- 每个文件单独一个代码块\n"
            f"- 不要使用tool_call格式\n"
            f"- 代码必须完整可运行，不要省略"
            f"{experience_context}{tool_prompt}"
        )

    @staticmethod
    def _extract_plan(text: str) -> str:
        """从Agent回复中提取计划说明（代码块/tool_call之前的文字）"""
        import re
        # 找到第一个代码块或tool_call的位置
        match = re.search(r'```', text)
        if match:
            plan = text[:match.start()].strip()
        else:
            plan = text.strip()
        # 截断过长的说明
        if len(plan) > 200:
            plan = plan[:200] + "..."
        return plan if len(plan) > 10 else ""

    def _get_experience_context(self, task_description: str) -> str:
        """从经验库中检索相关规则，格式化为提示上下文
        （本期保留现有实现，P3 后续可事件化）
        """
        try:
            import os
            data_dir = os.path.join(os.path.dirname(__file__), "data")
            extractor = ExperienceExtractor(incremental_dir=os.path.join(data_dir, "experience"))

            # 提取关键词
            import re
            words = re.findall(r'[\u4e00-\u9fff]{2,}|[a-zA-Z]{3,}', task_description)
            keywords = set(w.lower() for w in words)

            # 推断任务类型
            task_type = extractor._infer_task_type(task_description)

            # 检索相关规则
            rules = extractor.retrieve_relevant_rules(task_type, keywords)
            if not rules:
                return ""

            context = extractor.build_experience_context(rules)
            logger.info("注入 %d 条经验规则 (task_type=%s)", len(rules), task_type)
            return f"\n\n{context}" if context else ""
        except Exception as e:
            logger.debug("经验注入跳过: %s", e)
            return ""

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
