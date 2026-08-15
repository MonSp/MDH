"""WorkflowEngine - 动态工作流引擎

支持动态工作流的定义、执行和管理。
支持顺序执行、并行执行和条件分支。
"""

import asyncio
import json
import logging
import os
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Set

from protocol import (
    WorkflowDefinition,
    WorkflowEdge,
    WorkflowExecution,
    WorkflowExecutionStatus,
    WorkflowNode,
    WorkflowNodeStatus,
    workflow_definition_to_dict,
    workflow_execution_to_dict,
)
from agentscope_task_bridge import AgentscopeTaskBridge

logger = logging.getLogger("workflow_engine")


class WorkflowEngine:
    """工作流引擎

    负责工作流的定义、执行和管理。
    支持顺序执行、并行执行和条件分支。
    """

    def __init__(self, persistence_dir: Optional[str] = None):
        self._definitions: Dict[str, WorkflowDefinition] = {}
        self._executions: Dict[str, WorkflowExecution] = {}
        self._running_tasks: Dict[str, asyncio.Task] = {}
        self._node_executors: Dict[str, Callable] = {}
        self._on_status_change: Optional[Callable] = None
        self._on_node_status_change: Optional[Callable] = None
        # 执行状态磁盘持久化目录（None 表示不持久化）
        self._persistence_dir = persistence_dir
        if persistence_dir:
            os.makedirs(persistence_dir, exist_ok=True)

        # per-execution 持久化锁：串行化同一 execution 的并发落盘（execution_id → asyncio.Lock）
        self._persist_locks: Dict[str, asyncio.Lock] = {}

        # 集成agentscope Task系统
        self._task_bridge = AgentscopeTaskBridge()

    def register_node_executor(self, dept_id: str, executor: Callable):
        """注册节点执行器

        Args:
            dept_id: 部门ID
            executor: 执行器函数，签名：async def executor(node: WorkflowNode, input_data: dict) -> dict
        """
        self._node_executors[dept_id] = executor

    def set_status_change_callback(self, callback: Callable):
        """设置状态变化回调"""
        self._on_status_change = callback

    def set_node_status_change_callback(self, callback: Callable):
        """设置节点状态变化回调"""
        self._on_node_status_change = callback

    def create_workflow(self, definition: WorkflowDefinition) -> WorkflowExecution:
        """创建工作流执行实例

        Args:
            definition: 工作流定义

        Returns:
            工作流执行实例
        """
        execution_id = str(uuid.uuid4())[:8]
        now = datetime.now(timezone.utc).isoformat()

        # 初始化节点状态
        node_states = {}
        for node in definition.nodes:
            node_states[node.node_id] = WorkflowNodeStatus.PENDING

        execution = WorkflowExecution(
            execution_id=execution_id,
            workflow_id=definition.workflow_id,
            status=WorkflowExecutionStatus.CREATED,
            started_at=now,
            node_states=node_states,
            results={},
        )

        self._definitions[definition.workflow_id] = definition
        self._executions[execution_id] = execution

        # 集成agentscope Task系统：将工作流节点转换为Task
        tasks = []
        for node in definition.nodes:
            task = self._task_bridge.workflow_node_to_task(node)
            tasks.append(task)

        # 更新Task的依赖关系
        self._task_bridge.update_task_dependencies(tasks, definition.edges)

        # 落盘：创建即持久化（供断点恢复）；创建时独占、无并发，走同步写无需锁
        self._persist_execution_sync(execution_id)

        logger.info("创建工作流执行实例: %s (workflow_id=%s)", execution_id, definition.workflow_id)
        return execution

    async def persist_execution(self, execution_id: str) -> bool:
        """将 execution 状态落盘（JSON），供进程重启后恢复（并发安全）

        恢复语义：恢复时跳过已完成（COMPLETED）节点，FAILED/中断节点按重试语义重新执行。
        写入采用"临时文件 + 原子替换（os.replace）"，防止崩溃导致 JSON 截断。

        并发安全：per-execution asyncio.Lock（`self._persist_locks`）串行化同一 execution
        的并发落盘。并行节点先后完成时多个 persist_execution 并发进入事件循环——锁保证磁盘
        快照按获取顺序串行写入，最终落盘为最后一个写入者看到的最新内存状态，消除
        last-writer-wins 竞态（原实现并行节点并发落盘可能使磁盘快照相对内存略旧）。

        _persist_locks 条目保留策略：条目保留（不清理），后续再次落盘时复用同一把锁，
        避免重复创建；每引擎实例的 executions 数量有限，条目占用可忽略。
        """
        if not self._persistence_dir:
            return False
        lock = self._persist_locks.setdefault(execution_id, asyncio.Lock())
        async with lock:
            return self._persist_execution_sync(execution_id)

    def _persist_execution_sync(self, execution_id: str) -> bool:
        """同步原子写核心（tmp + os.replace + 异常捕获），不持有 _persist_locks

        仅被 async persist_execution 在锁内调用，以及 create_workflow 同步调用
        （创建时独占，无需锁）。
        """
        if not self._persistence_dir:
            return False
        execution = self._executions.get(execution_id)
        if execution is None:
            return False
        from protocol import workflow_execution_to_dict, workflow_definition_to_dict
        data = workflow_execution_to_dict(execution)
        definition = self._definitions.get(execution.workflow_id)
        if definition is not None:
            # 附带工作流定义，保证新进程恢复后可直接继续执行（无需重建定义）
            data["definition"] = workflow_definition_to_dict(definition)
        path = os.path.join(self._persistence_dir, f"{execution_id}.json")
        tmp_path = f"{path}.tmp"
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, path)
        except (OSError, TypeError, ValueError) as e:
            # TypeError/ValueError：结果含不可序列化对象或数据形态异常——返回 False 不传播
            logger.warning("持久化 execution %s 失败: %s", execution_id, e)
            return False
        return True

    def load_execution(self, execution_id: str) -> Optional[WorkflowExecution]:
        """从磁盘恢复 execution（不存在或文件损坏返回 None）

        恢复语义：恢复时跳过已完成（COMPLETED）节点，FAILED/中断节点按重试语义重新执行。
        损坏/截断的 JSON 不崩溃，记录 warning 并返回 None。
        """
        if not self._persistence_dir:
            return None
        path = os.path.join(self._persistence_dir, f"{execution_id}.json")
        if not os.path.exists(path):
            return None
        from protocol import dict_to_workflow_execution, dict_to_workflow_definition
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("加载 execution %s 失败（%s），返回 None", execution_id, e)
            return None
        try:
            execution = dict_to_workflow_execution(data)
        except Exception as e:
            logger.warning("解析 execution %s 数据失败（%s），返回 None", execution_id, e)
            return None
        self._executions[execution_id] = execution
        definition_data = data.get("definition")
        if definition_data is not None:
            self._definitions[execution.workflow_id] = dict_to_workflow_definition(definition_data)
        return execution

    def load_all_executions(self) -> List[str]:
        """列出磁盘上已持久化的 execution_id 列表（仅匹配 execution-id 形态文件名）"""
        import re as _re

        if not self._persistence_dir or not os.path.isdir(self._persistence_dir):
            return []
        pattern = _re.compile(r'^[0-9a-fA-F]{8}\.json$')
        return [f[:-5] for f in os.listdir(self._persistence_dir) if pattern.match(f)]

    async def execute_workflow(self, execution_id: str):
        """执行工作流

        Args:
            execution_id: 执行实例ID
        """
        execution = self._executions.get(execution_id)
        if not execution:
            raise KeyError(f"工作流执行实例不存在: {execution_id}")

        definition = self._definitions.get(execution.workflow_id)
        if not definition:
            raise KeyError(f"工作流定义不存在: {execution.workflow_id}")

        # 更新状态为运行中
        execution.status = WorkflowExecutionStatus.RUNNING
        execution.started_at = datetime.now(timezone.utc).isoformat()
        await self._notify_status_change(execution)

        try:
            if definition.execution_strategy == "sequential":
                await self._execute_sequential(execution, definition)
            elif definition.execution_strategy == "parallel":
                await self._execute_parallel(execution, definition)
            elif definition.execution_strategy == "mixed":
                await self._execute_mixed(execution, definition)
            else:
                raise ValueError(f"不支持的执行策略: {definition.execution_strategy}")

            # 检查是否所有节点都已完成
            # 只有在不是CANCELLED状态时才检查
            if execution.status != WorkflowExecutionStatus.CANCELLED:
                all_completed = all(
                    state == WorkflowNodeStatus.COMPLETED
                    for state in execution.node_states.values()
                )

                if all_completed:
                    execution.status = WorkflowExecutionStatus.COMPLETED
                else:
                    execution.status = WorkflowExecutionStatus.FAILED

            execution.completed_at = datetime.now(timezone.utc).isoformat()
            await self._notify_status_change(execution)
            # 最终状态落盘（供重启后按最终状态恢复）
            await self.persist_execution(execution_id)

        except asyncio.CancelledError:
            # 保持CANCELLED状态，不覆盖
            execution.completed_at = datetime.now(timezone.utc).isoformat()
            await self._notify_status_change(execution)
            await self.persist_execution(execution_id)
            raise

        except Exception as e:
            logger.error("工作流执行失败: %s, 错误: %s", execution_id, str(e))
            # 只有在不是CANCELLED状态时才设置为FAILED
            if execution.status != WorkflowExecutionStatus.CANCELLED:
                execution.status = WorkflowExecutionStatus.FAILED
                execution.completed_at = datetime.now(timezone.utc).isoformat()
                await self._notify_status_change(execution)
                await self.persist_execution(execution_id)
            raise

    def start_workflow(self, execution_id: str) -> asyncio.Task:
        """启动工作流执行并注册为可中断任务（pause/cancel 真正生效）"""
        task = asyncio.create_task(self.execute_workflow(execution_id))
        self._running_tasks[execution_id] = task

        # 提取为带名闭包：任务完成时仅移除仍指向该任务自身的注册项
        def _on_task_done(done_task):
            if self._running_tasks.get(execution_id) is done_task:
                self._running_tasks.pop(execution_id, None)

        task.add_done_callback(_on_task_done)
        return task

    async def _execute_sequential(self, execution: WorkflowExecution, definition: WorkflowDefinition):
        """顺序执行策略

        按照拓扑排序顺序依次执行节点。
        """
        sorted_nodes = self._topological_sort(definition)
        logger.info("顺序执行工作流，节点顺序: %s", [n.node_id for n in sorted_nodes])

        for node in sorted_nodes:
            if execution.status == WorkflowExecutionStatus.CANCELLED:
                break

            # 恢复执行时跳过已完成节点（防重复执行）
            if execution.node_states.get(node.node_id) == WorkflowNodeStatus.COMPLETED:
                continue

            # 检查依赖是否满足
            if not self._check_dependencies(node, execution, definition):
                logger.warning("节点 %s 的依赖未满足，跳过", node.node_id)
                execution.node_states[node.node_id] = WorkflowNodeStatus.SKIPPED
                await self._notify_node_status_change(execution, node.node_id)
                continue

            # 执行节点
            await self._execute_node(execution, node)

    async def _execute_parallel(self, execution: WorkflowExecution, definition: WorkflowDefinition):
        """并行执行策略

        无依赖关系的节点并行执行。
        """
        # 构建依赖图
        dependency_graph = self._build_dependency_graph(definition)
        in_degree = self._calculate_in_degree(definition)

        # 找出所有入度为0的节点（无依赖）
        ready_nodes = [
            node for node in definition.nodes
            if in_degree[node.node_id] == 0
        ]

        logger.info("并行执行工作流，初始就绪节点: %s", [n.node_id for n in ready_nodes])

        while ready_nodes:
            if execution.status == WorkflowExecutionStatus.CANCELLED:
                break

            # 并行执行所有就绪节点（跳过已完成节点，防重复执行）
            tasks = [
                self._execute_node(execution, node)
                for node in ready_nodes
                if execution.node_states.get(node.node_id) != WorkflowNodeStatus.COMPLETED
            ]
            await asyncio.gather(*tasks, return_exceptions=True)

            # 更新入度，找出新的就绪节点
            new_ready_nodes = []
            for node in ready_nodes:
                for dependent_node_id in dependency_graph[node.node_id]:
                    in_degree[dependent_node_id] -= 1
                    if in_degree[dependent_node_id] == 0:
                        dependent_node = next(
                            n for n in definition.nodes
                            if n.node_id == dependent_node_id
                        )
                        if self._check_dependencies(dependent_node, execution, definition):
                            new_ready_nodes.append(dependent_node)
                        else:
                            await self._propagate_skip(
                                dependent_node_id, execution, definition,
                                dependency_graph, in_degree, new_ready_nodes,
                            )

            ready_nodes = new_ready_nodes

    async def _execute_mixed(self, execution: WorkflowExecution, definition: WorkflowDefinition):
        """混合执行策略

        支持并行和条件分支。
        """
        # 构建依赖图
        dependency_graph = self._build_dependency_graph(definition)
        in_degree = self._calculate_in_degree(definition)

        # 找出所有入度为0的节点（无依赖）
        ready_nodes = [
            node for node in definition.nodes
            if in_degree[node.node_id] == 0
        ]

        logger.info("混合执行工作流，初始就绪节点: %s", [n.node_id for n in ready_nodes])

        while ready_nodes:
            if execution.status == WorkflowExecutionStatus.CANCELLED:
                break

            # 检查是否有条件分支
            conditional_nodes = [
                node for node in ready_nodes
                if self._has_condition(node, definition)
            ]
            unconditional_nodes = [
                node for node in ready_nodes
                if not self._has_condition(node, definition)
            ]

            # 并行执行无条件节点（跳过已完成节点，防重复执行）
            if unconditional_nodes:
                tasks = [
                    self._execute_node(execution, node)
                    for node in unconditional_nodes
                    if execution.node_states.get(node.node_id) != WorkflowNodeStatus.COMPLETED
                ]
                await asyncio.gather(*tasks, return_exceptions=True)

            # 顺序执行条件节点
            for node in conditional_nodes:
                if execution.status == WorkflowExecutionStatus.CANCELLED:
                    break

                # 恢复执行时跳过已完成节点（防重复执行）
                if execution.node_states.get(node.node_id) == WorkflowNodeStatus.COMPLETED:
                    continue

                # 检查条件是否满足
                if self._evaluate_condition(node, execution, definition):
                    await self._execute_node(execution, node)
                else:
                    logger.info("节点 %s 的条件不满足，跳过", node.node_id)
                    execution.node_states[node.node_id] = WorkflowNodeStatus.SKIPPED
                    await self._notify_node_status_change(execution, node.node_id)

            # 更新入度，找出新的就绪节点
            new_ready_nodes = []
            for node in ready_nodes:
                for dependent_node_id in dependency_graph[node.node_id]:
                    in_degree[dependent_node_id] -= 1
                    if in_degree[dependent_node_id] == 0:
                        dependent_node = next(
                            n for n in definition.nodes
                            if n.node_id == dependent_node_id
                        )
                        if self._check_dependencies(dependent_node, execution, definition):
                            new_ready_nodes.append(dependent_node)
                        else:
                            await self._propagate_skip(
                                dependent_node_id, execution, definition,
                                dependency_graph, in_degree, new_ready_nodes,
                            )

            ready_nodes = new_ready_nodes

    async def _propagate_skip(
        self,
        node_id: str,
        execution: WorkflowExecution,
        definition: WorkflowDefinition,
        dependency_graph: Dict[str, List[str]],
        in_degree: Dict[str, int],
        new_ready_nodes: list,
    ):
        """标记节点为跳过，并传播到所有下游节点"""
        execution.node_states[node_id] = WorkflowNodeStatus.SKIPPED
        await self._notify_node_status_change(execution, node_id)
        logger.warning("节点 %s 被跳过", node_id)

        for dependent_id in dependency_graph.get(node_id, []):
            in_degree[dependent_id] -= 1
            if in_degree[dependent_id] == 0:
                dependent_node = next(
                    n for n in definition.nodes if n.node_id == dependent_id
                )
                if self._check_dependencies(dependent_node, execution, definition):
                    new_ready_nodes.append(dependent_node)
                else:
                    await self._propagate_skip(
                        dependent_id, execution, definition,
                        dependency_graph, in_degree, new_ready_nodes,
                    )

    async def _execute_node(self, execution: WorkflowExecution, node: WorkflowNode):
        """执行单个节点

        Args:
            execution: 工作流执行实例
            node: 工作流节点
        """
        logger.info("执行节点: %s (部门: %s)", node.node_id, node.dept_id)

        # 更新节点状态为运行中
        execution.node_states[node.node_id] = WorkflowNodeStatus.RUNNING
        node.status = WorkflowNodeStatus.RUNNING

        # 同步状态到agentscope Task
        self._task_bridge.update_node_status(node.node_id, WorkflowNodeStatus.RUNNING)

        await self._notify_node_status_change(execution, node.node_id)

        try:
            # 获取输入数据
            input_data = self._get_node_input(node, execution)

            # 获取执行器
            executor = self._node_executors.get(node.dept_id)
            if not executor:
                raise ValueError(f"未找到部门 {node.dept_id} 的执行器")

            # 执行节点
            result = await executor(node, input_data)

            # 把关强制力：executor 返回结果含 gate.status == "rejected" 时节点置 FAILED
            # （结果原样入 results），复用既有 FAILED 机制收尾：下游 SKIPPED、
            # execution FAILED、可经 retry_node 重试。拒绝路径不抛异常。
            gate_rejected = (
                isinstance(result, dict)
                and isinstance(result.get("gate"), dict)
                and result["gate"].get("status") == "rejected"
            )
            if gate_rejected:
                execution.results[node.node_id] = result
                execution.node_states[node.node_id] = WorkflowNodeStatus.FAILED
                node.status = WorkflowNodeStatus.FAILED
                node.result = result

                # 同步状态到agentscope Task
                self._task_bridge.update_node_status(node.node_id, WorkflowNodeStatus.FAILED)

                logger.info("节点 %s 把关拒绝，置 FAILED: %s", node.node_id, result["gate"].get("reason", ""))
            else:
                execution.results[node.node_id] = result
                execution.node_states[node.node_id] = WorkflowNodeStatus.COMPLETED
                node.status = WorkflowNodeStatus.COMPLETED
                node.result = result

                # 同步状态到agentscope Task
                self._task_bridge.update_node_status(node.node_id, WorkflowNodeStatus.COMPLETED)

                logger.info("节点 %s 执行完成", node.node_id)

        except asyncio.CancelledError:
            execution.node_states[node.node_id] = WorkflowNodeStatus.FAILED
            node.status = WorkflowNodeStatus.FAILED

            # 同步状态到agentscope Task
            self._task_bridge.update_node_status(node.node_id, WorkflowNodeStatus.FAILED)

            raise

        except Exception as e:
            logger.error("节点 %s 执行失败: %s", node.node_id, str(e))
            execution.node_states[node.node_id] = WorkflowNodeStatus.FAILED
            node.status = WorkflowNodeStatus.FAILED
            execution.results[node.node_id] = {"error": str(e)}

            # 同步状态到agentscope Task
            self._task_bridge.update_node_status(node.node_id, WorkflowNodeStatus.FAILED)

        # 节点完成/失败即落盘（节点级持久化）
        await self.persist_execution(execution.execution_id)
        await self._notify_node_status_change(execution, node.node_id)

    def _topological_sort(self, definition: WorkflowDefinition) -> List[WorkflowNode]:
        """拓扑排序

        按照依赖关系对节点进行拓扑排序。

        Returns:
            排序后的节点列表
        """
        # 构建邻接表和入度表
        adjacency = defaultdict(list)
        in_degree = defaultdict(int)

        for node in definition.nodes:
            in_degree[node.node_id] = 0

        for edge in definition.edges:
            adjacency[edge.source_node_id].append(edge.target_node_id)
            in_degree[edge.target_node_id] += 1

        # 使用Kahn算法进行拓扑排序
        queue = deque()
        for node_id, degree in in_degree.items():
            if degree == 0:
                queue.append(node_id)

        sorted_node_ids = []
        while queue:
            node_id = queue.popleft()
            sorted_node_ids.append(node_id)

            for neighbor in adjacency[node_id]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        # 检查是否有环
        if len(sorted_node_ids) != len(definition.nodes):
            raise ValueError("工作流定义中存在循环依赖")

        # 按照拓扑顺序返回节点
        node_map = {node.node_id: node for node in definition.nodes}
        return [node_map[node_id] for node_id in sorted_node_ids]

    def _build_dependency_graph(self, definition: WorkflowDefinition) -> Dict[str, List[str]]:
        """构建依赖图

        Returns:
            邻接表，key为节点ID，value为依赖此节点的节点ID列表
        """
        graph = defaultdict(list)
        for edge in definition.edges:
            graph[edge.source_node_id].append(edge.target_node_id)
        return graph

    def _calculate_in_degree(self, definition: WorkflowDefinition) -> Dict[str, int]:
        """计算入度

        Returns:
            入度表，key为节点ID，value为入度
        """
        in_degree = {node.node_id: 0 for node in definition.nodes}
        for edge in definition.edges:
            in_degree[edge.target_node_id] += 1
        return in_degree

    def _check_dependencies(
        self,
        node: WorkflowNode,
        execution: WorkflowExecution,
        definition: WorkflowDefinition,
    ) -> bool:
        """检查节点的依赖是否满足

        Args:
            node: 工作流节点
            execution: 工作流执行实例
            definition: 工作流定义

        Returns:
            依赖是否满足
        """
        # 找出所有指向此节点的边
        incoming_edges = [
            edge for edge in definition.edges
            if edge.target_node_id == node.node_id
        ]

        # 检查所有源节点是否已完成
        for edge in incoming_edges:
            source_state = execution.node_states.get(edge.source_node_id)
            if source_state != WorkflowNodeStatus.COMPLETED:
                return False

        return True

    def _has_condition(self, node: WorkflowNode, definition: WorkflowDefinition) -> bool:
        """检查节点是否有条件分支

        Args:
            node: 工作流节点
            definition: 工作流定义

        Returns:
            是否有条件分支
        """
        # 找出所有指向此节点的边
        incoming_edges = [
            edge for edge in definition.edges
            if edge.target_node_id == node.node_id
        ]

        # 检查是否有条件边
        return any(edge.condition for edge in incoming_edges)

    def _evaluate_condition(
        self,
        node: WorkflowNode,
        execution: WorkflowExecution,
        definition: WorkflowDefinition,
    ) -> bool:
        """评估条件分支

        Args:
            node: 工作流节点
            execution: 工作流执行实例
            definition: 工作流定义

        Returns:
            条件是否满足
        """
        # 找出所有指向此节点的条件边
        incoming_edges = [
            edge for edge in definition.edges
            if edge.target_node_id == node.node_id and edge.condition
        ]

        # 如果没有条件边，返回True
        if not incoming_edges:
            return True

        # 评估所有条件（目前简单实现：所有条件都满足才返回True）
        for edge in incoming_edges:
            source_result = execution.results.get(edge.source_node_id)
            if not source_result:
                return False

            # 简单的条件评估：检查结果中是否有指定的字段
            # 实际应用中可以使用更复杂的条件表达式解析器
            if edge.condition and not self._evaluate_simple_condition(edge.condition, source_result):
                return False

        return True

    def _evaluate_simple_condition(self, condition: str, result: dict) -> bool:
        """评估简单条件

        Args:
            condition: 条件表达式，格式为 "field=value" 或 "field!=value"
            result: 节点执行结果

        Returns:
            条件是否满足
        """
        # 简单的条件解析
        if "=" in condition:
            field, value = condition.split("=", 1)
            field = field.strip()
            value = value.strip()

            # 获取字段值
            field_value = result.get(field)
            if field_value is None:
                return False

            # 比较值
            return str(field_value) == value

        elif "!=" in condition:
            field, value = condition.split("!=", 1)
            field = field.strip()
            value = value.strip()

            # 获取字段值
            field_value = result.get(field)
            if field_value is None:
                return True

            # 比较值
            return str(field_value) != value

        else:
            logger.warning("不支持的条件表达式: %s", condition)
            return True

    def _get_node_input(self, node: WorkflowNode, execution: WorkflowExecution) -> dict:
        """获取节点的输入数据

        Args:
            node: 工作流节点
            execution: 工作流执行实例

        Returns:
            输入数据
        """
        input_data = {}

        # 从节点的输入规范中获取默认值
        if node.input_spec:
            input_data.update(node.input_spec)

        # 从依赖节点的结果中获取数据
        for edge in self._get_incoming_edges(node, execution):
            source_result = execution.results.get(edge.source_node_id)
            if source_result:
                input_data.update(source_result)

        return input_data

    def _get_incoming_edges(self, node: WorkflowNode, execution: WorkflowExecution) -> List[WorkflowEdge]:
        """获取指向节点的边

        Args:
            node: 工作流节点
            execution: 工作流执行实例

        Returns:
            边列表
        """
        definition = self._definitions.get(execution.workflow_id)
        if not definition:
            return []
        return [e for e in definition.edges if e.target_node_id == node.node_id]

    async def pause_workflow(self, execution_id: str):
        """暂停工作流

        Args:
            execution_id: 执行实例ID
        """
        execution = self._executions.get(execution_id)
        if not execution:
            raise KeyError(f"工作流执行实例不存在: {execution_id}")

        if execution.status != WorkflowExecutionStatus.RUNNING:
            raise ValueError(f"工作流状态不是运行中: {execution.status}")

        execution.status = WorkflowExecutionStatus.PAUSED
        await self._notify_status_change(execution)
        # 暂停状态落盘
        await self.persist_execution(execution_id)

        # 取消正在运行的任务
        if execution_id in self._running_tasks:
            self._running_tasks[execution_id].cancel()
            del self._running_tasks[execution_id]

        logger.info("工作流已暂停: %s", execution_id)

    async def resume_workflow(self, execution_id: str):
        """恢复工作流

        Args:
            execution_id: 执行实例ID
        """
        execution = self._executions.get(execution_id)
        if not execution:
            raise KeyError(f"工作流执行实例不存在: {execution_id}")

        if execution.status != WorkflowExecutionStatus.PAUSED:
            raise ValueError(f"工作流状态不是暂停: {execution.status}")

        execution.status = WorkflowExecutionStatus.RUNNING
        await self._notify_status_change(execution)

        # 重新执行工作流（委托 start_workflow，获得注册与 done_callback 清理）
        self.start_workflow(execution_id)

        logger.info("工作流已恢复: %s", execution_id)

    async def cancel_workflow(self, execution_id: str):
        """取消工作流

        Args:
            execution_id: 执行实例ID
        """
        execution = self._executions.get(execution_id)
        if not execution:
            raise KeyError(f"工作流执行实例不存在: {execution_id}")

        if execution.status in [
            WorkflowExecutionStatus.COMPLETED,
            WorkflowExecutionStatus.FAILED,
            WorkflowExecutionStatus.CANCELLED,
        ]:
            raise ValueError(f"工作流已结束: {execution.status}")

        execution.status = WorkflowExecutionStatus.CANCELLED
        execution.completed_at = datetime.now(timezone.utc).isoformat()
        await self._notify_status_change(execution)
        # 取消状态落盘
        await self.persist_execution(execution_id)

        # 取消正在运行的任务
        if execution_id in self._running_tasks:
            self._running_tasks[execution_id].cancel()
            del self._running_tasks[execution_id]

        logger.info("工作流已取消: %s", execution_id)

    async def retry_node(self, execution_id: str, node_id: str):
        """重试失败/跳过节点：重置目标节点为 PENDING 后重跑。

        Args:
            execution_id: 执行实例ID
            node_id: 节点ID

        注意：仅恢复目标节点。下游因依赖不满足而 SKIPPED 的节点与 execution 终态
        不随本次重试恢复——需完整重跑（start_workflow）或手动逐节点重试下游。
        """
        execution = self._executions.get(execution_id)
        if not execution:
            raise KeyError(f"工作流执行实例不存在: {execution_id}")

        definition = self._definitions.get(execution.workflow_id)
        if not definition:
            raise KeyError(f"工作流定义不存在: {execution.workflow_id}")

        # 找到节点
        node = next(
            (n for n in definition.nodes if n.node_id == node_id),
            None,
        )
        if not node:
            raise KeyError(f"节点不存在: {node_id}")

        # 检查节点状态
        current_state = execution.node_states.get(node_id)
        if current_state not in [WorkflowNodeStatus.FAILED, WorkflowNodeStatus.SKIPPED]:
            raise ValueError(f"节点状态不是失败或跳过: {current_state}")

        # 重置节点状态
        execution.node_states[node_id] = WorkflowNodeStatus.PENDING
        node.status = WorkflowNodeStatus.PENDING
        node.result = None
        if node_id in execution.results:
            del execution.results[node_id]

        await self._notify_node_status_change(execution, node_id)

        # 重新执行节点
        await self._execute_node(execution, node)

        logger.info("节点已重试: %s", node_id)

    def get_workflow_status(self, execution_id: str) -> WorkflowExecution:
        """获取工作流状态

        Args:
            execution_id: 执行实例ID

        Returns:
            工作流执行实例
        """
        execution = self._executions.get(execution_id)
        if not execution:
            raise KeyError(f"工作流执行实例不存在: {execution_id}")

        return execution

    def get_workflow_visualization(self, execution_id: str) -> dict:
        """获取工作流可视化数据

        Args:
            execution_id: 执行实例ID

        Returns:
            可视化数据
        """
        execution = self._executions.get(execution_id)
        if not execution:
            raise KeyError(f"工作流执行实例不存在: {execution_id}")

        definition = self._definitions.get(execution.workflow_id)
        if not definition:
            raise KeyError(f"工作流定义不存在: {execution.workflow_id}")

        return {
            "execution": workflow_execution_to_dict(execution),
            "definition": workflow_definition_to_dict(definition),
        }

    async def _notify_status_change(self, execution: WorkflowExecution):
        """通知状态变化"""
        if self._on_status_change:
            await self._on_status_change(execution)

    async def _notify_node_status_change(self, execution: WorkflowExecution, node_id: str):
        """通知节点状态变化"""
        if self._on_node_status_change:
            await self._on_node_status_change(execution, node_id)