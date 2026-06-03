import asyncio
import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional
import uuid
from datetime import datetime

from .communication import CommunicationInterface, CommunicationManager, Message, MessageType

try:
    from experience_extractor import ExecutionLog, ExperienceExtractor
except ImportError:
    ExecutionLog = None
    ExperienceExtractor = None

logger = logging.getLogger("executor_agent")


class AgentStatus(str, Enum):
    IDLE = "idle"
    BUSY = "busy"
    WAITING = "waiting"
    ERROR = "error"
    OFFLINE = "offline"


@dataclass
class TaskResult:
    task_id: str = ""
    success: bool = True
    result: Any = None
    error: Optional[str] = None
    duration: float = 0.0
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class AgentStats:
    tasks_completed: int = 0
    tasks_failed: int = 0
    total_duration: float = 0.0
    last_active: Optional[datetime] = None


class ExecutorAgent:
    def __init__(
        self,
        name: str = "executor",
        capabilities: List[str] = None,
        communication: CommunicationInterface = None,
        communication_manager: CommunicationManager = None,
        auto_report: bool = True,
        max_retries: int = 3,
        base_skill_path: str = None,
        incremental_path: str = None,
        experience_extractor=None,
    ):
        """初始化 ExecutorAgent

        Args:
            name: 智能体名称
            capabilities: 能力列表
            communication: 通信接口
            communication_manager: 通信管理器
            auto_report: 是否自动上报结果
            max_retries: 最大重试次数
            base_skill_path: 基础技能包路径（只读参考）
            incremental_path: 增量区路径（可写）
            experience_extractor: ExperienceExtractor 实例
        """
        self.name = name
        self.capabilities = capabilities or []
        self.communication = communication
        self.communication_manager = communication_manager
        self.auto_report = auto_report
        self.max_retries = max_retries
        self.base_skill_path = base_skill_path
        self.incremental_path = incremental_path
        self.experience_extractor = experience_extractor
        self.status = AgentStatus.IDLE
        self.current_task: Optional[Dict[str, Any]] = None
        self.task_history: List[TaskResult] = []
        self.stats = AgentStats()
        self._parent_agent: Optional[str] = None
        self._task_executor: Optional[Callable] = None
        self._running = False
        self._message_task: Optional[asyncio.Task] = None

    @property
    def agent_id(self) -> str:
        return self.name

    def set_parent_agent(self, parent_id: str) -> None:
        self._parent_agent = parent_id

    def set_task_executor(self, executor: Callable) -> None:
        self._task_executor = executor

    async def start(self) -> None:
        self._running = True
        if self.communication_manager:
            self.communication_manager.register_agent(self.name, self)
            self.communication_manager.register_handler(self.name, self._handle_message)
            self._message_task = asyncio.create_task(self._message_listener())

    async def stop(self) -> None:
        self._running = False
        if self._message_task:
            self._message_task.cancel()
            try:
                await self._message_task
            except asyncio.CancelledError:
                pass

    async def _message_listener(self) -> None:
        while self._running:
            try:
                if self.communication_manager:
                    await self.communication_manager.process_messages(self.name)
                await asyncio.sleep(0.1)
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Error in message listener: {e}")

    async def _handle_message(self, message: Message) -> None:
        if message.type == MessageType.TASK_DELEGATION:
            await self._handle_task_delegation(message)
        elif message.type == MessageType.COLLABORATION_REQUEST:
            await self._handle_collaboration_request(message)
        elif message.type == MessageType.STATUS_REPORT:
            pass

    async def _handle_task_delegation(self, message: Message) -> None:
        task_data = message.content
        task_id = task_data.get("task_id")
        task_name = task_data.get("task_name")
        description = task_data.get("description")

        self.current_task = {
            "task_id": task_id,
            "task_name": task_name,
            "description": description,
            "assigned_by": message.sender,
            "assigned_at": datetime.now(),
        }
        self.status = AgentStatus.BUSY

        try:
            result = await self.execute_task(task_id, task_name, description)
            await self._report_result(task_id, result, success=True)
        except Exception as e:
            await self._report_result(task_id, error=str(e), success=False)
        finally:
            self.current_task = None
            self.status = AgentStatus.IDLE

    async def _handle_collaboration_request(self, message: Message) -> None:
        request_type = message.content.get("type")

        if request_type == "review":
            result = {"status": "approved", "comments": "Looks good"}
        elif request_type == "assist":
            result = {"status": "assisted", "help": "Provided assistance"}
        elif request_type == "consult":
            result = {"status": "consulted", "advice": "Provided advice"}
        else:
            result = {"status": "unknown_request"}

        if self.communication_manager:
            response = Message(
                type=MessageType.COLLABORATION_REQUEST,
                sender=self.name,
                receiver=message.sender,
                content={"type": "response", "request_type": request_type, "result": result},
                correlation_id=message.id,
            )
            await self.communication_manager.send_message(response)

    async def execute_task(self, task_id: str, task_name: str, description: str) -> Any:
        start_time = datetime.now()

        if self._task_executor:
            result = await self._task_executor(task_id, task_name, description)
        else:
            result = await self._default_task_execution(task_id, task_name, description)

        duration = (datetime.now() - start_time).total_seconds()

        task_result = TaskResult(
            task_id=task_id,
            success=True,
            result=result,
            duration=duration,
        )
        self.task_history.append(task_result)
        self.stats.tasks_completed += 1
        self.stats.total_duration += duration
        self.stats.last_active = datetime.now()

        return result

    async def _default_task_execution(self, task_id: str, task_name: str, description: str) -> Any:
        await asyncio.sleep(0.1)
        return {
            "task_id": task_id,
            "task_name": task_name,
            "status": "completed",
            "output": f"Task '{task_name}' completed by {self.name}",
        }

    async def _report_result(self, task_id: str, result: Any = None, success: bool = True, error: str = None) -> None:
        if not self.auto_report or not self._parent_agent:
            return

        if not success:
            self.stats.tasks_failed += 1

        if self.communication_manager:
            message = Message(
                type=MessageType.TASK_RESULT,
                sender=self.name,
                receiver=self._parent_agent,
                content={
                    "task_id": task_id,
                    "success": success,
                    "result": result,
                    "error": error,
                    "agent_name": self.name,
                },
            )
            await self.communication_manager.send_message(message)

    async def request_collaboration(self, target_agent: str, request_type: str, data: Dict[str, Any] = None) -> Optional[Dict[str, Any]]:
        if not self.communication_manager:
            return None

        message = Message(
            type=MessageType.COLLABORATION_REQUEST,
            sender=self.name,
            receiver=target_agent,
            content={"type": request_type, "data": data or {}},
            requires_response=True,
        )
        await self.communication_manager.send_message(message)

        response = await self.communication_manager.receive_message(self.name, timeout=30.0)
        if response and response.type == MessageType.COLLABORATION_REQUEST:
            return response.content.get("result")
        return None

    def get_status(self) -> Dict[str, Any]:
        return {
            "agent_id": self.name,
            "status": self.status.value,
            "capabilities": self.capabilities,
            "current_task": self.current_task,
            "stats": {
                "tasks_completed": self.stats.tasks_completed,
                "tasks_failed": self.stats.tasks_failed,
                "total_duration": self.stats.total_duration,
                "last_active": self.stats.last_active.isoformat() if self.stats.last_active else None,
            },
        }

    def get_task_history(self) -> List[Dict[str, Any]]:
        return [
            {
                "task_id": r.task_id,
                "success": r.success,
                "result": r.result,
                "error": r.error,
                "duration": r.duration,
                "timestamp": r.timestamp.isoformat(),
            }
            for r in self.task_history
        ]

    def clear_history(self) -> None:
        self.task_history.clear()
        self.stats = AgentStats()

    # ──────────────────── 经验注入 ────────────────────

    def _inject_experience(self, task_description: str, task_type: str = "") -> str:
        """检索并注入相关经验

        Args:
            task_description: 任务描述
            task_type: 任务类型

        Returns:
            格式化的经验上下文文本，可附加到任务提示中
        """
        if not self.experience_extractor or not self.incremental_path:
            return ""

        try:
            keywords = self._extract_keywords(task_description)
            rules = self.experience_extractor.retrieve_relevant_rules(task_type, keywords)
            return self.experience_extractor.build_experience_context(rules)
        except Exception:
            logger.warning("Failed to inject experience for task: %s", task_description[:50], exc_info=True)
            return ""

    # ──────────────────── 结构化反馈处理 ────────────────────

    def handle_revision_feedback(self, feedback: dict) -> dict:
        """处理结构化反馈

        Args:
            feedback: {
                "status": "revision_required",
                "issues": [
                    {
                        "type": "logic_error",
                        "location": "file:line",
                        "detail": "具体问题",
                        "suggestion": "修改建议"
                    }
                ],
                "max_iterations": 3,
                "current_iteration": 1
            }

        Returns:
            {
                "handled": True,
                "corrections": [...],
                "needs_retry": True/False
            }
        """
        result = {
            "handled": True,
            "corrections": [],
            "needs_retry": False,
        }

        if not isinstance(feedback, dict):
            return result

        status = feedback.get("status", "")
        if status != "revision_required":
            return result

        current_iteration = feedback.get("current_iteration", 1)
        max_iterations = feedback.get("max_iterations", 3)

        if current_iteration >= max_iterations:
            result["needs_retry"] = False
            return result

        issues = feedback.get("issues", [])
        for issue in issues:
            if not isinstance(issue, dict):
                continue
            correction = {
                "issue_type": issue.get("type", "unknown"),
                "location": issue.get("location", ""),
                "detail": issue.get("detail", ""),
                "suggestion": issue.get("suggestion", ""),
                "applied": False,
            }
            result["corrections"].append(correction)

        result["needs_retry"] = len(result["corrections"]) > 0
        return result

    # ──────────────────── 迭代修正循环 ────────────────────

    async def execute_with_iteration(
        self,
        task_description: str,
        task_context: dict = None,
        max_iterations: int = 3,
        review_callback: Callable = None,
    ) -> dict:
        """带迭代修正的任务执行

        流程：
        1. 注入经验上下文
        2. 执行任务
        3. 提交验收（调用 review_callback）
        4. 如果返回 revision_required，根据 issues 修正
        5. 重复 2-4 直到通过或达到 max_iterations
        6. 提炼经验（成功/失败）

        Args:
            task_description: 任务描述
            task_context: 任务上下文信息
            max_iterations: 最大迭代次数
            review_callback: 验收回调，接收 (task_output) -> dict

        Returns:
            {
                "status": "approved" | "max_iterations_reached",
                "output": ...,
                "iterations": int,
                "corrections": [...]
            }
        """
        task_context = task_context or {}
        task_id = task_context.get("task_id", str(uuid.uuid4()))
        task_type = task_context.get("task_type", "")
        all_corrections: List[dict] = []
        task_output = None

        # 1. 注入经验上下文
        experience_context = self._inject_experience(task_description, task_type)

        for iteration in range(1, max_iterations + 1):
            logger.info(
                "Executing task %s, iteration %d/%d",
                task_id, iteration, max_iterations,
            )

            # 2. 执行任务（首迭代附加经验上下文）
            try:
                if self._task_executor:
                    exec_description = task_description
                    if experience_context and iteration == 1:
                        exec_description = f"{task_description}\n\n{experience_context}"
                    task_output = await self._task_executor(
                        task_id, task_context.get("task_name", ""), exec_description
                    )
                else:
                    task_output = await self._default_task_execution(
                        task_id, task_context.get("task_name", ""), task_description
                    )
            except Exception as e:
                logger.error("Task execution failed at iteration %d: %s", iteration, e)
                task_output = {"error": str(e)}

            # 3. 提交验收
            if review_callback is None:
                # 无验收回调，视为直接通过
                self._extract_and_save_experience(
                    task_description, task_type, True, all_corrections
                )
                return {
                    "status": "approved",
                    "output": task_output,
                    "iterations": iteration,
                    "corrections": all_corrections,
                }

            try:
                if asyncio.iscoroutinefunction(review_callback):
                    review_result = await review_callback(task_output)
                else:
                    review_result = review_callback(task_output)
            except Exception as e:
                logger.error("Review callback failed: %s", e)
                review_result = {"status": "approved"}

            # 4. 处理验收结果
            if review_result.get("status") == "approved":
                self._extract_and_save_experience(
                    task_description, task_type, True, all_corrections
                )
                return {
                    "status": "approved",
                    "output": task_output,
                    "iterations": iteration,
                    "corrections": all_corrections,
                }

            # revision_required → 处理反馈
            review_result["current_iteration"] = iteration
            review_result["max_iterations"] = max_iterations
            feedback_result = self.handle_revision_feedback(review_result)
            all_corrections.extend(feedback_result.get("corrections", []))

            if not feedback_result.get("needs_retry"):
                break

        # 达到最大迭代次数
        self._extract_and_save_experience(
            task_description, task_type, False, all_corrections
        )
        return {
            "status": "max_iterations_reached",
            "output": task_output,
            "iterations": max_iterations,
            "corrections": all_corrections,
        }

    # ──────────────────── 经验沉淀 ────────────────────

    def _extract_and_save_experience(
        self,
        task_description: str,
        task_type: str,
        success: bool,
        corrections: list,
    ):
        """提取并保存经验

        Args:
            task_description: 任务描述
            task_type: 任务类型
            success: 是否成功
            corrections: 修正记录列表
        """
        if not self.experience_extractor or ExecutionLog is None:
            return

        try:
            status = "success" if success else "failure"
            error_list = []
            correction_list = []
            for c in corrections:
                if isinstance(c, dict):
                    correction_list.append({
                        "action": c.get("suggestion", ""),
                        "description": c.get("detail", ""),
                        "error_index": None,
                    })
                    if c.get("issue_type"):
                        error_list.append({
                            "type": c.get("issue_type", ""),
                            "message": c.get("detail", ""),
                        })

            log = ExecutionLog(
                task_id=str(uuid.uuid4()),
                agent_id=self.name,
                task_description=task_description,
                task_type=task_type,
                status=status,
                steps=[],
                errors=error_list,
                corrections=correction_list,
                final_output=task_description[:200],
                created_at=datetime.now().isoformat(),
            )

            if success:
                rules = self.experience_extractor.extract_from_success(log)
            else:
                rules = self.experience_extractor.extract_from_failure_recovery(log)

            for rule in rules:
                self.experience_extractor.submit_for_review(rule)

            logger.info(
                "Extracted %d experience rules from task (success=%s)", len(rules), success
            )
        except Exception:
            logger.warning("Failed to extract experience", exc_info=True)

    # ──────────────────── 辅助方法 ────────────────────

    @staticmethod
    def _extract_keywords(text: str) -> List[str]:
        """从文本中提取关键词

        简单实现：分词 + 过滤停用词。
        英文按空格/标点分词，中文按字符逐字拆分（无分词库场景下的简易方案）。

        Args:
            text: 输入文本

        Returns:
            关键词列表
        """
        if not text:
            return []

        stop_words = {
            "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
            "have", "has", "had", "do", "does", "did", "will", "would", "could",
            "should", "may", "might", "can", "shall", "to", "of", "in", "for",
            "on", "with", "at", "by", "from", "as", "into", "through", "during",
            "before", "after", "above", "below", "between", "and", "but", "or",
            "nor", "not", "so", "if", "then", "than", "too", "very", "just",
            "about", "up", "out", "it", "its", "this", "that", "these", "those",
            "i", "me", "my", "we", "our", "you", "your", "he", "him", "his",
            "she", "her", "they", "them", "their", "go", "am",
            "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都",
            "一", "上", "也", "很", "到", "说", "要", "去", "你",
            "会", "着", "看", "好", "这", "他", "她", "们",
            "请", "把", "从", "用", "对", "为", "与", "给", "等", "能",
            "个", "没", "被", "让",
        }

        # 中英文混合分词
        raw_tokens = re.findall(r'[\u4e00-\u9fff]+|[a-zA-Z_][a-zA-Z0-9_]*', text)
        tokens: List[str] = []
        for raw in raw_tokens:
            if re.match(r'[\u4e00-\u9fff]+', raw):
                # 中文：逐字拆分（每个汉字作为独立 token）
                for ch in raw:
                    tokens.append(ch)
            else:
                tokens.append(raw)

        keywords = []
        seen = set()
        for token in tokens:
            lower = token.lower()
            is_chinese = bool(re.match(r'[\u4e00-\u9fff]', lower))
            if not is_chinese and len(lower) < 2:
                continue
            if lower in stop_words:
                continue
            if lower not in seen:
                seen.add(lower)
                keywords.append(lower)

        return keywords