# 前后端接口缺口补齐 — 需求规格

## 目标

通过深度审查 test-sidepanel-host 项目的后端 Python 代码（server.py、meeting_coordinator.py、4个子模块）和前端 TypeScript 代码（useMeetingSocket.ts、meetingProtocol.ts、workflowEngine.ts 等），识别并修补前后端之间的接口缺口，确保后端产出的所有结构化数据能被前端正确接收和渲染。

## 范围

### 在范围内

1. **审查结果透传**：将 CriticAgent/GroundingAgent 的审查结果通过 WebSocket 推送到前端
2. **讨论立场结构化传递**：将 DiscussionManager 解析的 stance/confidence 附加到 agent_message 中
3. **工作流节点状态实时推送**：将 WorkflowEngine 的节点级状态变化实时推送到前端
4. **工作流 REST API 对齐**：解决前端 workflowEngine.ts 调用 /api/workflow/* 但后端无对应端点的问题
5. **协议类型清理**：标记或移除 meetingProtocol.ts 中后端永远不会发送的消息类型
6. **路由决策传播修复**：修复 MeetingCoordinator._last_routing_decision 属性引用 bug

### 不在范围内

1. 新增功能开发（仅修补已有缺口）
2. 前端 UI 组件的视觉改版
3. 后端 LLM 调用逻辑的改动
4. agentscope 框架本身的改动

## 功能要求

### FR1: 审查结果透传

当 ReviewPipeline.review() 返回 critic_result 和 grounding_result 时，server.py 应在 execute_and_review_task 完成后新增 review_completed WebSocket 消息，将 critic_result（severity、findings）和 grounding_result（grounded、sources）推送给前端。前端 useMeetingSocket.ts 应新增 case 'review_completed' 处理器，将审查结果添加到 chatMessages 中。

### FR2: 讨论立场结构化传递

当 DiscussionManager.run() 返回 parsed_stance 和 parsed_confidence 时，server.py 的 send_agent_message 回调应支持附加 stance 和 confidence 可选参数。前端 useMeetingSocket.ts 的 agent_message handler 应从消息中读取 stance 和 confidence，填充到 ChatMessage._stance 和 _confidence 字段。

### FR3: 工作流节点状态实时推送

当 WorkflowEngine 中某个节点状态发生变化时，MeetingCoordinator 的 _on_workflow_node_status_change 回调应通过 on_message 推送 workflow_node_status_update 消息。前端 useMeetingSocket.ts 应新增 case 'workflow_node_status_update' 处理器，实时更新 WorkflowPanel 中的节点状态。

### FR4: 工作流 REST API 对齐

前端 workflowEngine.ts 定义了8个 REST API 调用（/api/workflow/create、execute、pause、resume、cancel、retry、status、visualization），但后端 server.py 没有对应的端点。应统一为 WebSocket 驱动，清理前端孤立的 REST 调用。

### FR5: 协议类型清理

meetingProtocol.ts 定义了25种消息类型，后端实际只发送约10种。应将后端未发送的消息类型（agenda_update、proposal、vote、vote_result、critical_blocker、human_approval_request/response、checkpoint_save/restore、audit_log）标注为 reserved。

### FR6: 路由决策传播修复

MeetingCoordinator 应新增 @property last_routing_decision，委托返回 self._semantic_analyzer.last_routing_decision。auto_assign_task 方法和 server.py 中对 _last_routing_decision 的引用应改为使用新的属性。

## 验收标准

### AC1: 审查结果透传验收

当 ReviewPipeline.review() 完成后，server.py 应推送 review_completed 消息到前端。前端 useMeetingSocket.ts 应正确处理该消息并将 critic/grounding 结果渲染到聊天流中。

### AC2: 讨论立场传递验收

当 DiscussionManager.run() 产生讨论结果时，agent_message 消息中应包含 stance 和 confidence 字段。前端 ChatMessage._stance 和 _confidence 应被正确填充。

### AC3: 工作流节点状态推送验收

当 WorkflowEngine 中节点状态变化时，前端应收到 workflow_node_status_update 消息并实时更新 WorkflowPanel。

### AC4: 工作流 API 对齐验收

前端 workflowEngine.ts 中不应存在调用后端不存在的 REST 端点的代码。

### AC5: 协议类型一致性验收

meetingProtocol.ts 中后端未发送的消息类型应被标注为 reserved。

### AC6: 路由决策传播验收

当 SemanticAnalyzer 产生路由决策时，server.py 应能通过 coordinator.last_routing_decision 正确读取并推送给前端。
