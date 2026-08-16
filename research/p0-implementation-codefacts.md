# P0 阶段实施计划 — 精确代码事实提取

> 提取日期：2026-08-13。来源：/home/test/MDH。仅取证，未修改任何文件。
> 说明：`mock-sso/` 目录中存在 backend 的全量镜像副本（parallel_meeting_coordinator.py、parallel_discussion_manager.py、meeting_coordinator.py、review_pipeline.py、approval_manager.py、collaboration/critic_agent.py 等），改造 backend 时需同步镜像或确认 mock-sso 独立使用。

---

## A. 死代码清理（parallel_meeting_coordinator / parallel_discussion_manager）

### A.1 谁 import 了这两个模块（全仓结果）

- 唯一 import 点：`backend/parallel_meeting_coordinator.py:13`
  ```python
  from parallel_discussion_manager import ParallelDiscussionManager
  ```
  （`mock-sso/parallel_meeting_coordinator.py:13` 为镜像副本，同样 import。）
- **生产代码（server.py / ceo_agent.py / meeting_coordinator.py）均不 import 两者。**
- 测试文件仅在 docstring 中提及（见 A.2），**并未 import 或实例化**这两个类。
- 类实例化搜索 `ParallelMeetingCoordinator(` / `ParallelDiscussionManager(` 全仓仅命中：
  - `backend/parallel_meeting_coordinator.py:75`（模块内部自建）
  - `mock-sso/parallel_meeting_coordinator.py:75`（镜像）

结论：两者互为唯一引用方，构成与生产线完全隔离的孤立代码，可整体删除（连同 mock-sso 镜像副本）。

### A.2 两个测试文件的内容概要

#### backend/tests/test_e2e_parallel.py（203 行）
- 头部 mock `agentscope.*`（`sys.modules['agentscope'] = MagicMock()` 等，行 17-25）。
- 三个测试类，**实际测试对象与 parallel 模块无关**：
  - `TestKeyManagerE2E`：KeyManager 多角色密钥配置 / rate limit / 统计。
  - `TestMessageQueueE2E`：MessageQueue 发布-持久化-清空生命周期、多主题。
  - `TestIntegrationE2E`：KeyManager 与 MessageQueue 集成（模拟讨论流程）。
- docstring 行 4 提到 "测试ParallelMeetingCoordinator的完整流程"，但代码未引用它。
- 结论：该文件名义上是 parallel 的 e2e，实际覆盖的是仍存活的 KeyManager/MessageQueue。删除它不损失 parallel 特有覆盖，但会损失一组 KeyManager/MessageQueue 用例（另有 test_message_queue.py、test_agent_pool.py 覆盖）。

#### backend/tests/test_parallel_modules.py（242 行）
- 同样 mock agentscope，docstring 行 4 提到 "测试KeyManager、MessageQueue、AgentPool和ParallelDiscussionManager"。
- `TestKeyManager`：默认/自定义配置、rate limit、统计、重置、移除配置。
- `TestMessageQueue`：发布、队列大小、持久化、清空、多主题。
- `TestIntegration`：KeyManager 与 MessageQueue 集成。
- **未 import / 未测试 ParallelDiscussionManager。** 结论同上。

### A.3 两个模块的类名与公开接口

#### backend/parallel_discussion_manager.py（368 行）
```python
class ParallelDiscussionManager:                                    # :21
    def __init__(
        self,
        agent_pool: AgentPool,
        agenda: Optional[AgendaStateMachine] = None,
        max_concurrent: int = 5,
        timeout: float = 30.0
    ):                                                                # :29-35
    async def run_discussion(
        self,
        topic: str,
        agent_ids: List[str],
        max_rounds: int = 2,
        on_message: Optional[Callable[[str, str, str], Awaitable[None]]] = None
    ) -> List[Dict[str, Any]]:                                        # :54-60
    async def summarize_discussion(self, topic, discussions, summarizer_id) -> str  # :321
```
- 私有：`_ask_agent`(:157)、`_parse_stance`(:224)、`_build_previous_context`(:252)、`_evaluate_convergence`(:274)。核心并行机制：`asyncio.gather`(:94) + `asyncio.Semaphore`(:49) + `asyncio.wait_for`(:208)。

#### backend/parallel_meeting_coordinator.py（259 行）
```python
class ParallelMeetingCoordinator:                                    # :19
    def __init__(
        self,
        provider: str,
        model_name: str,
        api_key: str,
        base_url: str = "",
        max_concurrent: int = 5,
        timeout: float = 30.0,
        max_instances_per_role: int = 3,
        role_prompts: Optional[Dict[str, str]] = None
    ):                                                                # :27-37
    def create_team(self, team_template: Optional[List[Dict[str, Any]]] = None) -> List[str]  # :87
    def create_personal_assistant(self) -> str                        # :109
    def get_team_ids(self) -> List[str]                               # :126
    def configure_role_key(self, role: str, config: KeyConfig) -> None  # :130
    async def run_parallel_discussion(self, topic, agent_ids=None, max_rounds=2, on_message=None) -> Dict[str, Any]  # :141
    def _find_coordinator_id(self) -> Optional[str]                   # :202
    def get_pool_status(self) -> Dict                                 # :210
    def get_key_stats(self) -> Dict                                   # :214
    async def health_check(self) -> Dict[str, bool]                   # :218
    def scale_up(self, role: str, count: int = 1) -> List[str]        # :222
    def scale_down(self, role: str, count: int = 1) -> List[str]      # :226
    def add_agent(self, agent_def: Dict[str, Any]) -> str             # :230
    def remove_agent(self, agent_id: str) -> bool                     # :246
```

### A.4 该改造点相关测试文件清单
- backend/tests/test_e2e_parallel.py
- backend/tests/test_parallel_modules.py
- （镜像：mock-sso/tests/ 下同名副本不存在，仅模块文件存在）

---

## B. 双引擎合并（server.py 全局 workflow_engine 与 MeetingCoordinator 内置引擎）

### B.1 server.py 全局实例与 REST 端点（2186-2298）

```python
# ──────────────────── WorkflowEngine REST API ────────────────────   # server.py:2186

from workflow_engine import WorkflowEngine                              # server.py:2188
from protocol import WorkflowDefinition, WorkflowNode, WorkflowEdge, workflow_execution_to_dict, workflow_definition_to_dict  # :2189

workflow_engine = WorkflowEngine()                                      # server.py:2191
```
端点列表（全部操作同一全局 `workflow_engine` 实例）：
| 端点 | server.py 行号 | 处理器 |
|---|---|---|
| `POST /api/workflow/create` | 2194-2225 | `create_workflow(definition: dict)` → `workflow_engine.create_workflow(wf_def)` |
| `POST /api/workflow/execute/{execution_id}` | 2228-2238 | `await workflow_engine.execute_workflow(execution_id)` |
| `POST /api/workflow/pause/{execution_id}` | 2241-2248 | `await workflow_engine.pause_workflow(execution_id)` |
| `POST /api/workflow/resume/{execution_id}` | 2251-2258 | `await workflow_engine.resume_workflow(execution_id)` |
| `POST /api/workflow/cancel/{execution_id}` | 2261-2268 | `await workflow_engine.cancel_workflow(execution_id)` |
| `POST /api/workflow/retry/{execution_id}/{node_id}` | 2271-2278 | `await workflow_engine.retry_node(...)` |
| `GET /api/workflow/status/{execution_id}` | 2281-2288 | `workflow_engine.get_workflow_status(...)` |
| `GET /api/workflow/visualization/{execution_id}` | 2291-2298 | `workflow_engine.get_workflow_visualization(...)` |

### B.2 server.py 创建/注入 MeetingCoordinator（start_meeting WS 处理内, 1262-1272）

```python
                coordinator = MeetingCoordinator(                       # server.py:1262
                    meeting_session=meeting,
                    provider=session.provider,
                    model_name=session.model_name or "",
                    api_key=session.api_key,
                    base_url=session.base_url or "",
                    workspace=workspace,
                    agent_pool=agent_pool,
                    max_iterations=msg.get("max_iterations", 3),
                )
                session._meeting_coordinator = coordinator               # server.py:1272
```
- server.py 顶部 `from meeting_coordinator import MeetingCoordinator`（另有 35 行 `from approval_manager import ApprovalManager`）。
- 注意：MeetingCoordinator 构造时**未传入** server 的全局 `workflow_engine`，引擎在协调器内部自建。

### B.3 meeting_coordinator.py __init__ 中的 workflow_engine 创建（105-107）

```python
        # WorkflowEngine 初始化
        self.workflow_engine = WorkflowEngine()                         # meeting_coordinator.py:106
        self._setup_workflow_engine()
```
`_setup_workflow_engine`（141-154）为 7 个部门注册 `self._execute_workflow_node` 并设置状态回调：
```python
        self.workflow_engine.register_node_executor("dept-frontend", self._execute_workflow_node)
        self.workflow_engine.register_node_executor("dept-backend", self._execute_workflow_node)
        self.workflow_engine.register_node_executor("dept-qa", self._execute_workflow_node)
        self.workflow_engine.register_node_executor("dept-devops", self._execute_workflow_node)
        self.workflow_engine.register_node_executor("dept-data", self._execute_workflow_node)
        self.workflow_engine.register_node_executor("dept-docs", self._execute_workflow_node)
        self.workflow_engine.register_node_executor("dept-fullstack", self._execute_workflow_node)
        self.workflow_engine.set_status_change_callback(self._on_workflow_status_change)
        self.workflow_engine.set_node_status_change_callback(self._on_workflow_node_status_change)
```

### B.4 meeting_coordinator.py 执行工作流的调用点（1362-1423 逐字）

```python
    async def _execute_workflow(
        self,
        workflow_definition: WorkflowDefinition,
        on_message: Callable[[str, str, str], Awaitable[None]],
    ) -> Dict[str, Any]:                                               # meeting_coordinator.py:1362-1366
        """执行工作流

        Args:
            workflow_definition: 工作流定义
            on_message: 消息回调函数

        Returns:
            工作流执行结果
        """
        try:
            # 创建工作流执行实例
            execution = self.workflow_engine.create_workflow(workflow_definition)   # :1378

            # 推送工作流创建消息
            ceo_id = self._find_agent_id(AgentRole.CEO) or "agent-ceo"
            create_msg = f"工作流已创建: {workflow_definition.name} (ID: {execution.execution_id})"
            await self._msg(ceo_id, create_msg)
            self.meeting.add_message("agent", create_msg, ceo_id)

            # 执行工作流
            await self.workflow_engine.execute_workflow(execution.execution_id)     # :1387

            # 获取执行结果
            status = self.workflow_engine.get_workflow_status(execution.execution_id)  # :1390

            # 推送工作流完成消息
            complete_msg = f"工作流执行完成: {status.status.value}"
            await self._msg(ceo_id, complete_msg)
            self.meeting.add_message("agent", complete_msg, ceo_id)

            # 汇总结果
            results_summary = []
            for node_id, result in status.results.items():
                if isinstance(result, dict) and "result" in result:
                    results_summary.append(f"- {node_id}: {result['result'][:100]}...")

            if results_summary:
                summary_msg = "工作流执行结果汇总:\n" + "\n".join(results_summary)
                await self._msg(ceo_id, summary_msg)
                self.meeting.add_message("agent", summary_msg, ceo_id)

            return {
                "execution_id": execution.execution_id,
                "status": status.status.value,
                "results": status.results,
            }

        except Exception as e:
            self.logger.error("工作流执行失败: %s", str(e))
            ceo_id = self._find_agent_id(AgentRole.CEO) or "agent-ceo"
            error_msg = f"工作流执行失败: {str(e)}"
            await self._msg(ceo_id, error_msg)
            self.meeting.add_message("agent", error_msg, ceo_id)

            return {
                "error": str(e),
```
- 上游触发点：`meeting_coordinator.py:813` `if analysis.is_workflow and analysis.workflow_definition:` → `:825 workflow_result = await self._execute_workflow(analysis.workflow_definition, on_message)`，返回 `{"type": "workflow_executed", ...}`。

### B.5 workflow_engine.py 生命周期方法签名与 _running_tasks 填充

```python
    async def execute_workflow(self, execution_id: str):              # workflow_engine.py:105
    async def pause_workflow(self, execution_id: str):                # :629
    async def resume_workflow(self, execution_id: str):               # :652
    async def cancel_workflow(self, execution_id: str):               # :674
    async def retry_node(self, execution_id: str, node_id: str):      # :702
    def get_workflow_status(self, execution_id: str) -> WorkflowExecution:  # :744
    def get_workflow_visualization(self, execution_id: str) -> dict:  # :759
```
**_running_tasks 填充逻辑（关键代码事实）**：
- 声明：`:39 self._running_tasks: Dict[str, asyncio.Task] = {}`
- **唯一写入点**在 `resume_workflow`（669-670）：
  ```python
          # 重新执行工作流
          task = asyncio.create_task(self.execute_workflow(execution_id))
          self._running_tasks[execution_id] = task                     # workflow_engine.py:670
  ```
- `execute_workflow` 本身**不创建 asyncio.Task、不写入 _running_tasks**（被同步 await 执行）。
- 读取/删除点：`pause_workflow`（646-648）与 `cancel_workflow`（696-698）：
  ```python
          # 取消正在运行的任务
          if execution_id in self._running_tasks:
              self._running_tasks[execution_id].cancel()
              del self._running_tasks[execution_id]
  ```
- 后果：直接调用 `/api/workflow/execute` 的流程，任务不在 `_running_tasks` 中，pause/cancel 只能改状态位、无法真正取消正在执行的任务。

### B.6 该改造点相关测试文件清单
- backend/tests/test_workflow_engine.py（WorkflowEngine 生命周期、执行器注册、回调、拓扑排序，均用 mock_executor 注册节点执行器）
- backend/tests/test_workflow_integration.py（fixture `meeting_coordinator`；`test_workflow_engine_integration` :108、`test_workflow_engine_setup` :156 断言 `_node_executors` 数量 > 0）
- backend/tests/test_meeting_coordinator_router.py（MeetingCoordinator 路由测试，596 行）
- backend/tests/test_split_modules.py（mock 依赖后测拆分子模块结构，其中 :26 mock `'workflow_engine'`）

---

## C. 工作流节点真执行（_execute_workflow_node 目前只调 LLM，不调工具）

### C.1 workflow_engine.py 的 register_node_executor 与 _node_executors 结构（36-54）

```python
    def __init__(self):
        self._definitions: Dict[str, WorkflowDefinition] = {}
        self._executions: Dict[str, WorkflowExecution] = {}
        self._running_tasks: Dict[str, asyncio.Task] = {}
        self._node_executors: Dict[str, Callable] = {}                 # workflow_engine.py:40
        self._on_status_change: Optional[Callable] = None
        self._on_node_status_change: Optional[Callable] = None

        # 集成agentscope Task系统
        self._task_bridge = AgentscopeTaskBridge()

    def register_node_executor(self, dept_id: str, executor: Callable):  # :47
        """注册节点执行器

        Args:
            dept_id: 部门ID
            executor: 执行器函数，签名：async def executor(node: WorkflowNode, input_data: dict) -> dict
        """
        self._node_executors[dept_id] = executor                       # :54
```

### C.2 执行节点时如何调用 executor（_execute_node, 335-394 关键段）

```python
        try:
            # 获取输入数据
            input_data = self._get_node_input(node, execution)          # :355

            # 获取执行器
            executor = self._node_executors.get(node.dept_id)           # :358
            if not executor:
                raise ValueError(f"未找到部门 {node.dept_id} 的执行器")

            # 执行节点
            result = await executor(node, input_data)                   # :363

            # 保存结果
            execution.results[node.node_id] = result
            execution.node_states[node.node_id] = WorkflowNodeStatus.COMPLETED
            node.status = WorkflowNodeStatus.COMPLETED
            node.result = result
```
- `_execute_node` 被三种策略调用：`_execute_sequential`(:185)、`_execute_parallel`(:210-213, asyncio.gather)、`_execute_mixed`(:269-281)。
- 输入组装 `_get_node_input`(:590-612)：`node.input_spec` 默认值 + 依赖节点 `execution.results` 合并。

### C.3 meeting_coordinator.py 的 _execute_workflow_node（156-202 逐字）

```python
    async def _execute_workflow_node(self, node: WorkflowNode, input_data: dict) -> dict:
        """执行工作流节点

        Args:
            node: 工作流节点
            input_data: 输入数据

        Returns:
            执行结果
        """
        self.logger.info("执行工作流节点: %s (部门: %s)", node.node_id, node.dept_id)

        # 根据部门ID选择对应的Agent角色
        role_map = {
            "dept-frontend": AgentRole.EXECUTOR,
            "dept-backend": AgentRole.EXECUTOR,
            "dept-qa": AgentRole.REVIEWER,
            "dept-devops": AgentRole.MONITOR,
            "dept-data": AgentRole.EXECUTOR,
            "dept-docs": AgentRole.COORDINATOR,
            "dept-fullstack": AgentRole.EXECUTOR,
        }                                                                # meeting_coordinator.py:169-177

        role = role_map.get(node.dept_id, AgentRole.EXECUTOR)
        model = self._get_model(role)

        # 构建提示词
        prompt = (
            f"请执行以下任务：\n"
            f"任务描述：{node.task_description}\n"
            f"输入数据：{json.dumps(input_data, ensure_ascii=False)}\n\n"
            f"请给出你的执行方案和结果。"
        )

        msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
        try:
            response = await model.reply(msg)
            result_text = _extract_text(response)
        except Exception as e:
            self.logger.warning("工作流节点执行失败: %s", e)
            result_text = LLM_FALLBACK_TEMPLATE.format(role=node.dept_id, content_type="执行结果")

        return {
            "result": result_text,
            "node_id": node.node_id,
            "dept_id": node.dept_id,
        }
```
> 关键事实：节点执行器**只调用 model.reply，未创建 AgentToolset、未调用任何工具、未写文件**——这正是"C. 工作流节点真执行"改造点要替换/增强的路径。

### C.4 task_orchestrator.py 核心执行循环（可复用最小接口）

类签名（30-51）：
```python
class TaskOrchestrator:
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
```
核心执行循环 `_execute_sequential`（175-390）关键调用序列（逐字摘录）：
```python
            role = AgentRole(agent_info.role.value)                     # :192
            model = self._get_model(role)                               # :193

            # 为当前Agent创建工具集
            agent_toolset = None
            if self._workspace_root:
                agent_toolset = AgentToolset(
                    agent_id=task.agent_id,
                    agent_role=role.value,
                    workspace_root=self._workspace_root,
                )                                                        # :198-202

            # 构建包含工具说明的提示词
            tool_prompt = ""
            if agent_toolset:
                tool_prompt = f"\n\n{agent_toolset.get_system_prompt()}"  # :207
            ...
            msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
            conversation = [msg]                                         # :224-225

            # ── 阶段A: 环境检查 ──
            if agent_toolset:
                ls_result = agent_toolset.list_directory(".")            # :235

            # ── 阶段B: 文件创建循环 ──
            for tool_round in range(max_tool_rounds + 1):               # max_tool_rounds = 5
                response = await model.reply(conversation)               # :245
                last_text = _extract_text(response)

                # 1. 从代码块提取文件（优先）
                code_blocks = extract_code_blocks(last_text)             # :256
                if code_blocks and agent_toolset:
                    for block in code_blocks:
                        cb_result = agent_toolset.write_file(block["filename"], block["content"])  # :259

                # 2. 提取tool_call（备用）
                if not files_this_round:
                    tool_calls = self._extract_tool_calls(last_text)     # :269
                    if tool_calls and agent_toolset:
                        tc_result = agent_toolset.execute(call["tool"], call.get("arguments", {}))  # :273
```
- 验证阶段（321-355）：写文件后按 `requirements.txt/package.json/Pipfile/pyproject.toml` 映射 `agent_toolset.run_command(...)` 装依赖；`.py` 用 `python -c "import ast; ..."`、`.json` 用 `json.load` 做语法检查。
- 并行路径 `_execute_parallel`(392-450) 复用 `AgentToolset` + `model.reply(msg)`（416）单轮调用。
- **可复用最小接口**：`get_model_fn(role) -> Agent`、`AgentToolset(agent_id, agent_role, workspace_root)`、`agent_toolset.get_system_prompt()`、`agent_toolset.list_directory/write_file/execute/run_command`、`model.reply(conversation) -> msg`、`_extract_text(response)`、`extract_code_blocks(text)`（来自 code_extractor.py）。

### C.5 agent_toolset.py 公开接口（agent_toolset.py, 71-458）

```python
class AgentToolset:                                                     # :71
    def __init__(
        self,
        agent_id: str,
        agent_role: str,
        workspace_root: str,
        config_path: str = None,
    ):                                                                    # :86-92
    def execute(self, tool_name: str, arguments: Dict[str, Any]) -> ToolResult   # :264
    def read_file(self, path: str) -> ToolResult                        # :299
    def write_file(self, path: str, content: str) -> ToolResult         # :303
    def edit_file(self, path: str, old_text: str, new_text: str) -> ToolResult   # :307
    def list_directory(self, path: str = ".") -> ToolResult             # :315
    def run_command(self, command: str) -> ToolResult                   # :319
    def git_status(self) -> ToolResult                                  # :323
    def git_commit(self, message: str) -> ToolResult                    # :327
    def git_push(self, remote="origin", branch="") -> ToolResult        # :331
    def git_branch(self, branch_name="") -> ToolResult                  # :338
    def git_diff(self, staged=False) -> ToolResult                      # :344
    def git_log(self, count=10) -> ToolResult                           # :348
    def search_files(self, pattern, path=".") -> ToolResult             # :352
    def grep_content(self, pattern, path=".", include="") -> ToolResult # :356
    def run_tests(self, test_path="", verbose=False) -> ToolResult      # :363
    def run_linter(self, path=".") -> ToolResult                        # :370
    def create_document(self, path, content) -> ToolResult              # :374
    def edit_document(self, path, old_text, new_text) -> ToolResult     # :378
    def web_fetch(self, url) -> ToolResult                              # :382
    def get_system_prompt(self, name=None, task_context=None) -> str    # :386
```
- 属性：`agent_id`/`agent_role`/`role_name`/`role_description`/`available_tools`/`skills`/`tool_descriptions`/`skill_descriptions`（:190-262）。
- 模块级便捷函数：`create_agent_toolset(agent_id, agent_role, workspace_root, custom_config=None) -> AgentToolset`（:461-482）。
- `workspace_root` 为构造必填参数，传入 ToolExecutor 做工作区隔离（:107-110）。

### C.6 该改造点相关测试文件清单
- backend/tests/test_workflow_engine.py（mock_executor 注册后测顺序/并行/混合、pause/resume/cancel、retry）
- backend/tests/test_workflow_integration.py（验证 MeetingCoordinator 与 WorkflowEngine 接线、`_node_executors` 数量）
- backend/tests/test_agent_toolset.py（角色工具权限过滤、write/read/list/run_command 等）
- backend/tests/test_task_orchestrator_fix.py（TaskOrchestrator `_build_prompt` 与 ExperienceExtractor import 修复）
- backend/tests/test_tool_executor.py、backend/tests/test_executor_server.py、test_executor_enhanced.py（工具执行层）

---

## D. 审查 LLM 通道

### D.1 backend/review_pipeline.py 全文（281 行，逐字）

```python
"""
Review Pipeline - 审查流水线

从 MeetingCoordinator 的 review_task_execution() 提取，
并集成 CriticAgent 和 GroundingAgent。
"""

import logging
from typing import Any, Awaitable, Callable, Dict, List, Optional

from agentscope.agent import Agent
from agentscope.message import Msg

from agent import _extract_text
from collaboration.planner_agent import PlannerAgent, SubTask
from collaboration.critic_agent import CriticAgent, CriticResult
from collaboration.grounding_agent import GroundingAgent, GroundingResult
from protocol import AgentRole, MeetingAgentStatus, LLM_FALLBACK_TEMPLATE

logger = logging.getLogger("review_pipeline")


class ReviewPipeline:
    """审查流水线"""
    
    def __init__(
        self,
        get_model_fn,
        meeting,
        planner: Optional[PlannerAgent] = None,
        critic: Optional[CriticAgent] = None,
        grounding: Optional[GroundingAgent] = None,
    ):
        self._get_model = get_model_fn
        self._meeting = meeting
        self._planner = planner or PlannerAgent(name="review_planner")
        self._critic = critic or CriticAgent()
        self._grounding = grounding or GroundingAgent()
    
    async def review(
        self,
        task_description: str,
        execution_result: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
        repo_context: Optional[Dict[str, Any]] = None,
        discussion_context: str = "",
    ) -> Dict[str, Any]:
        """
        执行审查流水线
        
        流程：CriticAgent自动审查 -> GroundingAgent自动接地 -> 多角色LLM审查
        
        Args:
            task_description: 任务描述
            execution_result: 执行结果
            on_message: 消息回调
            repo_context: 仓库上下文
            discussion_context: 团队讨论决策摘要
            
        Returns:
            审查结果
        """
        # 1. CriticAgent 自动审查（失败时跳过，不阻断审查流程）
        try:
            critic_result = self._critic.review(
                {
                    "task_description": task_description,
                    "requirements": [],
                    "success_criteria": [],
                },
                stage="review",
            )
            logger.info("Critic审查: severity=%s, findings=%d", critic_result.severity, len(critic_result.findings))
        except Exception as e:
            logger.warning("CriticAgent失败，跳过: %s", e, exc_info=True)
            critic_result = CriticResult(severity="unknown", findings=[])
        
        # 2. GroundingAgent 自动接地（失败时跳过，不阻断审查流程）
        try:
            grounding_result = self._grounding.verify(
                {
                    "conclusions": [{"text": execution_result[:200]}],
                    "decisions": [],
                    "evidence": [],
                },
                repo_context=repo_context,
                stage="review",
            )
            logger.info("Grounding审查: grounded=%s, sources=%d", grounding_result.grounded, len(grounding_result.sources))
        except Exception as e:
            logger.warning("GroundingAgent失败，跳过: %s", e, exc_info=True)
            grounding_result = GroundingResult(grounded=False, sources=[])
        
        # 3. Reviewer LLM审查
        reviewer_feedback = await self._reviewer_review(
            task_description, execution_result, on_message, discussion_context
        )
        
        # 4. Monitor评估
        monitor_feedback = await self._monitor_evaluate(
            task_description, execution_result, reviewer_feedback, on_message, discussion_context
        )
        
        # 5. Coordinator总结
        coordinator_summary = await self._coordinator_summarize(
            task_description, execution_result, reviewer_feedback, monitor_feedback, on_message
        )
        
        # 6. 结构化验收反馈（整合 LLM 审查意见）
        structured_feedback = self._generate_structured_feedback(
            task_description, execution_result, reviewer_feedback, monitor_feedback,
        )
        
        return {
            "critic_result": {
                "severity": critic_result.severity,
                "findings": critic_result.findings,
            },
            "grounding_result": {
                "grounded": grounding_result.grounded,
                "sources": grounding_result.sources,
            },
            "reviewer_feedback": reviewer_feedback,
            "monitor_feedback": monitor_feedback,
            "coordinator_summary": coordinator_summary,
            "structured_feedback": structured_feedback,
        }
    
    def _find_agent_id(self, role: AgentRole) -> Optional[str]:
        for a in self._meeting.agents:
            if a.role == role:
                return a.id
        return None
    
    async def _reviewer_review(
        self,
        task_description: str,
        execution_result: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
        discussion_context: str = "",
    ) -> str:
        """Reviewer审查"""
        reviewer_id = self._find_agent_id(AgentRole.REVIEWER)
        if not reviewer_id:
            return ""
        
        self._meeting.update_agent_status(reviewer_id, MeetingAgentStatus.SPEAKING)
        model = self._get_model(AgentRole.REVIEWER)
        
        context_block = f"\n\n团队讨论确定的方案：\n{discussion_context}" if discussion_context else ""
        prompt = (
            f"你是团队的审查者。以下是一位同事的工作成果，请审查并提出改进建议。\n\n"
            f"任务：{task_description}{context_block}\n"
            f"执行结果：{execution_result}\n\n"
            f"请从以下角度审查：\n"
            f"1. 代码是否符合团队讨论确定的方案\n"
            f"2. 方案的完整性和可行性\n"
            f"3. 潜在的问题和风险\n"
            f"4. 具体的改进建议\n\n"
            f"请用 2-3 句话给出你的审查意见。"
        )
        msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
        try:
            response = await model.reply(msg)
            feedback = _extract_text(response)
        except Exception as e:
            logger.warning("Reviewer LLM调用失败: %s", e)
            feedback = LLM_FALLBACK_TEMPLATE.format(role="reviewer", content_type="审查意见")
        await on_message(reviewer_id, feedback, "")
        self._meeting.add_message("agent", feedback, reviewer_id)
        self._meeting.update_agent_status(reviewer_id, MeetingAgentStatus.MEETING)
        return feedback
    
    async def _monitor_evaluate(
        self,
        task_description: str,
        execution_result: str,
        reviewer_feedback: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
        discussion_context: str = "",
    ) -> str:
        """Monitor评估"""
        monitor_id = self._find_agent_id(AgentRole.MONITOR)
        if not monitor_id:
            return ""
        
        self._meeting.update_agent_status(monitor_id, MeetingAgentStatus.SPEAKING)
        model = self._get_model(AgentRole.MONITOR)
        
        context_block = f"\n\n团队讨论确定的方案：\n{discussion_context}" if discussion_context else ""
        prompt = (
            f"你是团队的监控者。请评估以下任务的执行情况。\n\n"
            f"任务：{task_description}{context_block}\n"
            f"执行结果：{execution_result}\n"
            f"审查意见：{reviewer_feedback}\n\n"
            f"请评估：\n"
            f"1. 实现是否符合讨论确定的方案\n"
            f"2. 任务完成度\n"
            f"3. 潜在风险\n"
            f"4. 是否需要补充\n\n"
            f"请用 2-3 句话给出你的评估。"
        )
        msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
        try:
            response = await model.reply(msg)
            feedback = _extract_text(response)
        except Exception as e:
            logger.warning("Monitor LLM调用失败: %s", e)
            feedback = LLM_FALLBACK_TEMPLATE.format(role="monitor", content_type="评估")
        await on_message(monitor_id, feedback, "")
        self._meeting.add_message("agent", feedback, monitor_id)
        self._meeting.update_agent_status(monitor_id, MeetingAgentStatus.MEETING)
        return feedback
    
    async def _coordinator_summarize(
        self,
        task_description: str,
        execution_result: str,
        reviewer_feedback: str,
        monitor_feedback: str,
        on_message: Callable[[str, str, str], Awaitable[None]],
    ) -> str:
        """Coordinator总结"""
        coordinator_id = self._find_agent_id(AgentRole.COORDINATOR)
        if not coordinator_id:
            return ""
        
        self._meeting.update_agent_status(coordinator_id, MeetingAgentStatus.SPEAKING)
        model = self._get_model(AgentRole.COORDINATOR)
        prompt = (
            f"你是团队的协调者。请综合以下讨论内容，给出最终总结。\n\n"
            f"任务：{task_description}\n"
            f"执行结果：{execution_result}\n"
            f"审查意见：{reviewer_feedback}\n"
            f"监控评估：{monitor_feedback}\n\n"
            f"请给出简洁的总结和最终结论。"
        )
        msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
        try:
            response = await model.reply(msg)
            summary = _extract_text(response)
        except Exception as e:
            logger.warning("Coordinator LLM调用失败: %s", e)
            summary = LLM_FALLBACK_TEMPLATE.format(role="coordinator", content_type="总结")
        await on_message(coordinator_id, summary, "")
        self._meeting.add_message("agent", summary, coordinator_id)
        self._meeting.update_agent_status(coordinator_id, MeetingAgentStatus.MEETING)
        return summary
    
    def _generate_structured_feedback(
        self,
        task_description: str,
        execution_result: str,
        reviewer_feedback: str = "",
        monitor_feedback: str = "",
    ) -> Dict[str, Any]:
        """生成结构化验收反馈，整合 LLM 审查意见"""
        if self._planner:
            subtask = SubTask(
                name=task_description[:100],
                description=task_description,
            )
            result = self._planner.generate_review_feedback(
                task=subtask,
                output=execution_result,
                context={"reviewer_feedback": reviewer_feedback, "monitor_feedback": monitor_feedback},
            )
            # 如果 LLM 审查发现了严重问题但 planner 关键词匹配未捕获，降级为 revision_required
            if result.get("status") == "approved" and reviewer_feedback:
                critical_signals = ["严重", "致命", "阻塞", "critical", "fatal", "blocker", "必须修复", "不能发布"]
                if any(sig in reviewer_feedback.lower() for sig in critical_signals):
                    result["status"] = "revision_required"
                    result["issues"].append({
                        "type": "logic_error",
                        "location": "reviewer",
                        "detail": "审查者发现严重问题",
                        "suggestion": reviewer_feedback[:200],
                    })
            return result

        return {"status": "approved", "issues": [], "max_iterations": 3}
```

### D.2 CriticAgent( 与 .review( 的调用方

`CriticAgent(` 实例化点：
- `backend/review_pipeline.py:37` `self._critic = critic or CriticAgent()`（生产唯一）
- `backend/collaboration/critic_agent.py:228`（`__main__` 自测块）
- `backend/tests/test_critic_agent.py:18`、`backend/tests/test_whybuddy_integration.py:54`
- 镜像：`mock-sso/review_pipeline.py:37`、`mock-sso/collaboration/critic_agent.py:228`

`.review(` 调用点：
- `backend/review_pipeline.py:65` `critic_result = self._critic.review({...}, stage="review")`（同步调用，非 async）
- `backend/tests/test_critic_agent.py`（17 处）、`backend/tests/test_whybuddy_integration.py:55`
- `ReviewPipeline.review(` 的调用方：`backend/meeting_coordinator.py:653`（`execute_and_review_task`）与 `:1034`（串行开发循环内审查）

### D.3 meeting_coordinator.py 模型获取方式（_get_model, 268-278）与 LLM 调用风格

```python
    def _get_model(self, role: AgentRole) -> Agent:                    # meeting_coordinator.py:268
        key = role.value
        if key not in self._models:
            # 优先从 AgentPool 获取（支持复用和负载均衡）
            if self._agent_pool:
                instance = self._agent_pool.get_agent_by_role(key)
                if instance:
                    self._models[key] = instance.agent
                    return instance.agent
            self._models[key] = self._create_model(role)
        return self._models[key]
```
`_create_model`（236-266）经 `PROVIDER_REGISTRY` 取 credential/formatter/model 构造 agentscope `Agent(name=role.value, system_prompt=AGENT_ROLE_PROMPTS[role], model=model)`。

LLM 调用风格（统一模式：`await model.reply(msg)` + `_extract_text` + `LLM_FALLBACK_TEMPLATE` 兜底）示例 1（meeting_coordinator.py:281-295）：
```python
        planner = self._get_model(AgentRole.PLANNER)
        prompt = (
            f"请将以下任务分解为多个子任务，以JSON数组格式返回。"
            ...
        )
        msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
        try:
            response = await planner.reply(msg)
            text = _extract_text(response)
        except Exception as e:
            self.logger.warning("任务分解 LLM 调用失败: %s", e)
            text = "[]"
```
示例 2（review_pipeline.py:164-168，见 D.1）。

### D.4 测试结构概要

#### backend/tests/test_critic_agent.py（179 行）
- pytest 类 `TestCriticAgent`；`setup_method` 建 temp 目录 + `CriticAgent(companion_log_path=self.log_path)`。
- 行为分组：review 返回 `CriticResult` 且带 timestamp/stage；空上下文产生 findings；缺 requirements/success_criteria/acceptance 各产生对应关键词 findings；约束过多；时间+资源约束冲突→"可行性"；高风险关键词→"高风险/回滚"；依赖过多→"级联"；severity 取值 low/medium/high 及 critical 场景；日志写入 companion_log.json（role=critic、findings、ts）；多次 review 追加日志；`get_log_entries()`；`stage` 参数记录。

#### backend/tests/test_review_pipeline.py（183 行）
- fixture `pipeline`：`meeting = MagicMock(); meeting.agents = []`；`get_model(role)` 返回 `m.reply = AsyncMock(return_value=_FakeMsg("审查通过，没有问题。"))`；构造 `ReviewPipeline(get_model_fn, meeting, planner=PlannerAgent(name="test_planner"))`。
- `TestStructuredFeedbackIntegration`：普通→approved；reviewer 反馈含"严重/致命/critical/fatal/阻塞/不能发布"→revision_required 且加 logic_error issue；**monitor_feedback 不触发覆盖**；空反馈不变；无严重关键词保持 approved。
- `TestReviewFlow`（async）：完整 review 返回 6 个 section；无 agents 不崩溃；接受 discussion_context；reviewer LLM 抛异常时走 fallback 不崩溃。

#### 其他相关测试
- backend/tests/test_review_integration.py（201 行）：autouse mock agentscope，验证 ReviewPipeline.review() 时 Critic/Grounding 确实参与、降级机制。
- backend/tests/test_whybuddy_integration.py:54-55：直接构造 CriticAgent 调 review。
- backend/tests/test_grounding_agent.py、test_planner_enhanced.py、test_structured_feedback.py。

---

## E. 审批真阻塞等待

### E.1 meeting_coordinator.py 审批流程（955-984 逐字）

```python
        # ── 执行审批阶段 ──
        # 检测是否为高风险任务（涉及文件修改、bash命令等）
        risk_keywords = ['rm -rf', 'chmod', 'drop table', 'delete', 'remove all', 'format']
        is_high_risk = any(kw in enhanced_description.lower() for kw in risk_keywords)
        risk_level = 'high' if is_high_risk else 'medium'                # meeting_coordinator.py:955-959

        coordinator_approve_text = f"项目经理：提交任务执行审批（风险等级: {risk_level}）。"
        await self._msg(coordinator_id, coordinator_approve_text)
        self.meeting.add_message("agent", coordinator_approve_text, coordinator_id)

        # 创建审批请求
        approval_request = {
            "type": "human_approval_request",
            "request": {
                "id": str(uuid.uuid4()),
                "requesterId": target_agent_id,
                "operation": "task_execution",
                "description": enhanced_description[:200],
                "riskLevel": risk_level,
                "confidence": 0.8,
                "status": "pending",
                "createdAt": time.time(),
            },
        }
        await on_message("coordinator", f"[审批请求] 任务执行 - {risk_level}", "")

        # 自动审批（在真实场景中会等待人工审批）
        coordinator_auto_approve = f"项目经理：任务执行已自动审批通过。"     # :982
        await self._msg(coordinator_id, coordinator_auto_approve)
        self.meeting.add_message("agent", coordinator_auto_approve, coordinator_id)
```
> 关键事实：此处构造的 `approval_request` **只是普通 dict，仅经 `on_message` 回调推送**，未使用 `ApprovalManager`，**没有任何等待**，直接"自动审批通过"（注释自认"在真实场景中会等待人工审批"）。

### E.2 server.py 的 WS 审批消息处理（1828-1876 逐字）

```python
            # === 人工审批系统 ===
            elif msg_type == "human_approval_response":                 # server.py:1829
                request_id = msg.get("requestId", "")
                approved = msg.get("approved", False)
                reason = msg.get("reason", "")

                if not session._approval_manager:
                    session._approval_manager = ApprovalManager()

                success = await session._approval_manager.handle_response(
                    request_id, approved, reason, session.send_and_buffer,
                )
                if not success:
                    await session.send_error(f"审批请求 {request_id} 不存在或已处理")

            elif msg_type == "get_pending_approvals":                   # server.py:1843
                if not session._approval_manager:
                    session._approval_manager = ApprovalManager()

                pending = session._approval_manager.get_pending_requests()
                await ws.send_json({
                    "type": "pending_approvals",
                    "requests": pending,
                    "count": len(pending),
                })

            elif msg_type == "request_approval":                        # server.py:1854
                # 创建审批请求（用于测试或 agent 主动请求审批）
                if not session._approval_manager:
                    session._approval_manager = ApprovalManager()

                from protocol import RiskLevel
                risk_map = {"low": RiskLevel.LOW, "medium": RiskLevel.MEDIUM, "high": RiskLevel.HIGH, "critical": RiskLevel.CRITICAL}

                requester_id = msg.get("requesterId", "agent-executor")
                operation = msg.get("operation", "unknown_operation")
                description = msg.get("description", "")
                risk_level = risk_map.get(msg.get("riskLevel", "medium"), RiskLevel.MEDIUM)
                confidence = msg.get("confidence", 0.5)

                approval = await session._approval_manager.request_approval(
                    requester_id=requester_id,
                    operation=operation,
                    description=description,
                    risk_level=risk_level,
                    confidence=confidence,
                    send_fn=session.send_and_buffer,
                )
                logger.info("审批请求已发送: id=%s operation=%s", approval.id, operation)
```
- 审批管理器为**每会话**实例：`session._approval_manager = ApprovalManager()`（1287、1835、1845、1857）。
- 前端侧：`src/hooks/useMeetingSocket.ts:733` 处理 `pending_approvals`，`:1019` 发送 `get_pending_approvals`；`src/modules/metricsCollector.ts:62` 注册 `pending_approvals` 指标。

### E.3 approval_manager.py 公开接口（approval_manager.py 全文 250 行）

```python
@dataclass
class PendingApproval:                                                  # :20-33
    id: str
    requester_id: str
    operation: str
    description: str
    risk_level: RiskLevel
    confidence: float
    status: ApprovalStatus = ApprovalStatus.PENDING
    created_at: float = 0.0
    resolved_at: float = 0.0
    resolution_reason: str = ""
    _future: Optional[asyncio.Future] = field(default=None, repr=False)

class ApprovalManager:                                                  # :36
    def __init__(self, default_timeout: float = 300.0):                 # :45
    async def request_approval(
        self,
        requester_id: str,
        operation: str,
        description: str,
        risk_level: RiskLevel = RiskLevel.MEDIUM,
        confidence: float = 0.5,
        send_fn: Optional[Callable[[dict], Awaitable[None]]] = None,
        timeout: Optional[float] = None,
    ) -> PendingApproval:                                                # :50-59
    async def handle_response(self, request_id, approved, reason="", send_fn=None) -> bool  # :108
    async def wait_for_decision(self, request_id, timeout=None) -> dict  # :164-168
    def get_pending_requests(self) -> list[dict]                        # :197
    def get_pending_count(self) -> int                                  # :213
    def get_history(self) -> list[dict]                                 # :217
    def cancel_request(self, request_id: str) -> bool                   # :231
```
- 等待机制核心（request_approval:85 建 future → wait_for_decision:185 `asyncio.wait_for(approval._future, timeout=effective_timeout)` → handle_response:145-150 `set_result`）。
- **`wait_for_decision` 在生产代码中无任何调用方**（全仓搜索仅定义处与 mock-sso 镜像）。即"等待机制存在但未接入"。

### E.4 meeting.py 等处的审批字段/回执机制

- `backend/meeting.py` **无审批相关字段**。`status="pending"`（:224）是任务状态（`MeetingTaskInfo`），非审批状态；`get_summary`（:265-271）统计 pending/completed/failed 任务数。
- `backend/protocol.py` 定义审批枚举：
  ```python
  class ApprovalStatus(str, Enum):            # :167-172
      PENDING = "pending"
      APPROVED = "approved"
      REJECTED = "rejected"
      EXPIRED = "expired"

  class RiskLevel(str, Enum):                 # :174-178
      LOW = "low"
      MEDIUM = "medium"
      HIGH = "high"
      CRITICAL = "critical"
  ```
- 消息类型常量：`protocol.py:98 HUMAN_APPROVAL_REQUEST = "human_approval_request"`。
- 回执机制：`ApprovalManager` 的 asyncio.Future 是唯一"等待队列"；`session._approval_manager` 挂在 WS 会话上，审批响应经 `handle_response` 解除 future 阻塞（E.3）。真正可阻塞的接口 `wait_for_decision` 已存在，但协调器流程未调用。

### E.5 该改造点相关测试文件清单
- backend/tests 中**无 approval_manager 专属测试文件**（全仓 grep `ApprovalManager` 未命中 tests/）。
- 前端测试：`src/modules/__tests__/metricsCollector.test.ts:30`（断言 `pending_approvals` 指标注册）。
- 相关间接覆盖：test_e2e_full_chain.py、test_meeting.py（MeetingSession 任务状态，无审批）。

---

## 附：改造点测试文件清单汇总

| 改造点 | 相关测试文件 |
|---|---|
| A 死代码清理 | backend/tests/test_e2e_parallel.py、test_parallel_modules.py |
| B 双引擎合并 | test_workflow_engine.py、test_workflow_integration.py、test_meeting_coordinator_router.py、test_split_modules.py |
| C 节点真执行 | test_workflow_engine.py、test_workflow_integration.py、test_agent_toolset.py、test_task_orchestrator_fix.py、test_tool_executor.py、test_executor_server.py |
| D 审查通道 | test_critic_agent.py、test_review_pipeline.py、test_review_integration.py、test_whybuddy_integration.py、test_grounding_agent.py、test_structured_feedback.py |
| E 审批阻塞 | 后端无专属测试；前端 metricsCollector.test.ts |
