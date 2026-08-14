"""
Semantic Analyzer - 语义分析器

从 MeetingCoordinator 的 semantic_analyze() 方法提取。
负责语义分析用户消息，判断意图并路由到合适的部门。
"""

import json
import logging
import re
from typing import Optional

from agentscope.agent import Agent
from agentscope.message import Msg

from agent import _extract_text
from dynamic_router import DynamicRouter, RoutingDecision
from minutes_workflow import MINUTES_KEYWORDS, build_minutes_workflow
from protocol import AgentRole, SemanticAnalysisResult

logger = logging.getLogger("semantic_analyzer")


class SemanticAnalyzer:
    """语义分析器"""
    
    def __init__(self, router: DynamicRouter, get_model_fn, meeting_agents=None):
        """
        Args:
            router: 动态路由器
            get_model_fn: 获取模型的函数
            meeting_agents: 会议中的agent列表
        """
        self._router = router
        self._get_model = get_model_fn
        self._meeting_agents = meeting_agents or []
        self._last_routing_decision: Optional[RoutingDecision] = None
    
    @property
    def last_routing_decision(self) -> Optional[RoutingDecision]:
        return self._last_routing_decision
    
    async def analyze(self, user_message: str) -> SemanticAnalysisResult:
        """
        语义分析用户消息
        
        Args:
            user_message: 用户消息
            
        Returns:
            SemanticAnalysisResult
        """
        # 0. 文档模式检测（确定性规则，命中即返回，不依赖 LLM/router）
        if self._detect_minutes_task(user_message):
            logger.info("检测到文档型任务（会议纪要），生成纪要 DAG")
            return SemanticAnalysisResult(
                is_task=True,
                intent="minutes",
                task_description="会议纪要+待办",
                is_workflow=True,
                workflow_definition=build_minutes_workflow(user_message),
                reason="文档任务规则命中",
            )

        # 1. DynamicRouter 初步路由
        routing_decision = self._router.route(user_message)
        self._last_routing_decision = routing_decision
        logger.info(
            "DynamicRouter 路由: dept=%s confidence=%.4f reason=%s",
            routing_decision.selected_dept, routing_decision.confidence, routing_decision.reason,
        )
        
        # 2. 检测是否为复杂任务
        is_complex = self._detect_complex_task(user_message)
        if is_complex:
            logger.info("检测到复杂任务，生成工作流定义")
            from workflow_engine import WorkflowEngine
            workflow_definition = self._generate_workflow_definition(user_message, routing_decision)
            return SemanticAnalysisResult(
                is_task=True,
                is_workflow=True,
                intent="workflow",
                task_description=user_message,
                target_agent_id="",
                reason="检测到跨部门复杂任务，生成工作流",
                workflow_definition=workflow_definition,
            )
        
        # 3. LLM 分析
        ceo_model = self._get_model(AgentRole.CEO)
        agent_list = self._build_agent_capability_list()
        routing_context = self._build_routing_context(routing_decision)
        
        prompt = (
            f"你是会议的CEO和组织者。请分析以下用户消息，判断其意图。\n\n"
            f"用户消息：{user_message}\n"
            f"{routing_context}\n"
            f"可用Agent：\n{agent_list}\n\n"
            f"请返回JSON格式分析结果：\n"
            f'{{"is_task": true/false, "intent": "task/discussion/question/feedback", '
            f'"task_description": "如果is_task为true，提取任务描述", '
            f'"target_agent_id": "最佳执行者的ID", '
            f'"reason": "选择该Agent的理由", '
            f'"confidence": 0.0-1.0, '
            f'"discussion_topic": "如果is_task为false，提取讨论主题"}}\n\n'
            f"分析规则：\n"
            f"1. 如果消息包含明确的行动指令（如'帮我...'、'请执行...'、'分析...'），判定为任务\n"
            f"2. 如果消息是征求意见（如'大家觉得...'、'你们怎么看'），判定为讨论\n"
            f"3. 根据任务内容匹配Agent能力，选择最合适的执行者\n"
            f"4. 参考动态路由建议，但可以覆盖它\n"
            f"5. 只返回JSON，不要其他内容"
        )
        msg = Msg(name="user", role="user", content=[{"type": "text", "text": prompt}])
        
        # 尝试调用LLM，如果失败则使用回退策略
        try:
            response = await ceo_model.reply(msg)
            text = _extract_text(response)
            
            json_match = re.search(r'\{[^{}]*\}', text, re.DOTALL)
            if json_match:
                try:
                    data = json.loads(json_match.group())
                    llm_is_task = bool(data.get("is_task", False))
                    llm_confidence = float(data.get("confidence", 0.5))
                    
                    discussion_topic = data.get("discussion_topic") or ""
                    task_description = data.get("task_description") or ""
                    return SemanticAnalysisResult(
                        is_task=llm_is_task,
                        intent=str(data.get("intent", "discussion")),
                        task_description=str(task_description),
                        target_agent_id=str(data.get("target_agent_id") or ""),
                        reason=str(data.get("reason") or ""),
                        discussion_topic=str(discussion_topic),
                    )
                except (json.JSONDecodeError, TypeError, KeyError):
                    pass
        except Exception as e:
            logger.warning("LLM 调用失败，使用回退策略: %s", e)
        
        # 回退：如果路由置信度足够高，直接使用路由结果
        if routing_decision.selected_dept and routing_decision.confidence >= 0.6:
            logger.info("LLM 解析失败，回退到路由结果: %s", routing_decision.selected_dept)
            return SemanticAnalysisResult(
                is_task=True,
                intent="task",
                task_description=user_message,
                target_agent_id=routing_decision.selected_dept,
                reason=f"动态路由推荐: {routing_decision.reason}",
            )
        
        return SemanticAnalysisResult(
            is_task=False,
            intent="discussion",
            discussion_topic=user_message,
        )
    
    def _detect_minutes_task(self, user_message: str) -> bool:
        """检测是否为文档型会议纪要任务（速记→纪要）"""
        return any(k in user_message for k in MINUTES_KEYWORDS) and any(
            v in user_message for v in ("整理", "生成", "撰写", "输出", "写")
        )

    def _detect_complex_task(self, user_message: str) -> bool:
        """检测是否为跨部门复杂任务"""
        complex_patterns = [
            r'首先.*然后.*最后',
            r'第一步.*第二步.*第三步',
            r'先.*再.*后',
            r'前端.*后端.*测试',
            r'设计.*开发.*部署',
            r'分析.*实现.*验证',
            r'完成后.*开始',
            r'依赖.*之后',
            r'等待.*后.*执行',
            r'工作流',
            r'流程',
            r'步骤.*顺序',
        ]
        
        for pattern in complex_patterns:
            if re.search(pattern, user_message, re.IGNORECASE):
                return True
        
        verbs = ['设计', '开发', '实现', '测试', '部署', '分析', '创建', '编写', '优化', '修复']
        verb_count = sum(1 for verb in verbs if verb in user_message)
        if verb_count >= 3:
            return True
        
        return False
    
    def _build_agent_capability_list(self) -> str:
        """构建agent能力列表"""
        lines = []
        for agent in self._meeting_agents:
            if agent.role == AgentRole.CEO:
                continue
            caps = ", ".join(agent.capabilities) if agent.capabilities else "通用"
            lines.append(f"- {agent.id} ({agent.name}, 角色:{agent.role.value}): 能力=[{caps}]")
        return "\n".join(lines)
    
    def _build_routing_context(self, decision: RoutingDecision) -> str:
        """构建路由上下文"""
        if not decision.selected_dept:
            return ""
        return (
            f"\n动态路由建议：\n"
            f"- 推荐部门：{decision.selected_dept}\n"
            f"- 置信度：{decision.confidence:.2f}\n"
            f"- 理由：{decision.reason}\n"
            f"- 匹配关键词：{', '.join(decision.matched_keywords) or '无'}\n"
        )
    
    def _generate_workflow_definition(self, user_message: str, routing_decision: RoutingDecision):
        """根据用户消息生成工作流定义"""
        import uuid
        from protocol import WorkflowDefinition, WorkflowNode, WorkflowEdge, WorkflowNodeStatus
        
        workflow_id = str(uuid.uuid4())[:8]
        nodes = []
        edges = []
        
        if '前端' in user_message or 'frontend' in user_message:
            nodes.append(WorkflowNode(
                node_id=f"node-{str(uuid.uuid4())[:4]}",
                task_description="前端开发任务",
                dept_id="dept-frontend",
                status=WorkflowNodeStatus.PENDING,
            ))
        
        if '后端' in user_message or 'backend' in user_message or 'api' in user_message.lower():
            nodes.append(WorkflowNode(
                node_id=f"node-{str(uuid.uuid4())[:4]}",
                task_description="后端开发任务",
                dept_id="dept-backend",
                status=WorkflowNodeStatus.PENDING,
            ))
        
        if '测试' in user_message or 'test' in user_message:
            nodes.append(WorkflowNode(
                node_id=f"node-{str(uuid.uuid4())[:4]}",
                task_description="测试任务",
                dept_id="dept-qa",
                status=WorkflowNodeStatus.PENDING,
            ))
        
        if '部署' in user_message or 'deploy' in user_message:
            nodes.append(WorkflowNode(
                node_id=f"node-{str(uuid.uuid4())[:4]}",
                task_description="部署任务",
                dept_id="dept-devops",
                status=WorkflowNodeStatus.PENDING,
            ))
        
        if not nodes and routing_decision.selected_dept:
            nodes.append(WorkflowNode(
                node_id=f"node-{str(uuid.uuid4())[:4]}",
                task_description=user_message[:100],
                dept_id=routing_decision.selected_dept,
                status=WorkflowNodeStatus.PENDING,
            ))
        
        if not nodes:
            nodes.append(WorkflowNode(
                node_id=f"node-{str(uuid.uuid4())[:4]}",
                task_description=user_message[:100],
                dept_id="dept-fullstack",
                status=WorkflowNodeStatus.PENDING,
            ))
        
        # 依赖推断（替代硬编码 dept_order 线性链）：
        # 实现类部门（前端/后端/全栈/数据）互不依赖 → 可并行；
        # qa 依赖所有实现类节点；devops 依赖 qa 与实现类节点；docs 独立。
        IMPL_DEPTS = {"dept-frontend", "dept-backend", "dept-fullstack", "dept-data"}
        for node in nodes:
            if node.dept_id == "dept-qa":
                for other in nodes:
                    if other.node_id != node.node_id and other.dept_id in IMPL_DEPTS:
                        edges.append(WorkflowEdge(source_node_id=other.node_id, target_node_id=node.node_id))
            elif node.dept_id == "dept-devops":
                for other in nodes:
                    if other.node_id != node.node_id and other.dept_id in (IMPL_DEPTS | {"dept-qa"}):
                        edges.append(WorkflowEdge(source_node_id=other.node_id, target_node_id=node.node_id))

        if not edges and len(nodes) > 1 and not any(n.dept_id in IMPL_DEPTS for n in nodes):
            # 兜底：仅当不含可并行的实现类节点时按原顺序线性连接，保证可执行
            for i in range(len(nodes) - 1):
                edges.append(WorkflowEdge(source_node_id=nodes[i].node_id, target_node_id=nodes[i + 1].node_id))

        # 执行策略：根节点（无入边）> 1 → parallel；否则 sequential
        incoming = {e.target_node_id for e in edges}
        root_count = sum(1 for n in nodes if n.node_id not in incoming)
        execution_strategy = "parallel" if root_count > 1 else "sequential"

        return WorkflowDefinition(
            workflow_id=workflow_id,
            name=f"工作流-{user_message[:30]}",
            description=user_message,
            nodes=nodes,
            edges=edges,
            execution_strategy=execution_strategy,
        )
