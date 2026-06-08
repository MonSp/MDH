# 前后端接口缺口补齐 — 任务清单

## 里程碑

### M1: 数据透传修复
**目标**：将后端已产出但被丢弃的结构化数据推送到前端
**包含任务**：T1, T2, T3, T4, T9, T10
**依赖**：无

### M2: 实时性与协议一致性
**目标**：工作流节点状态实时推送，清理死类型和孤立 REST 调用
**包含任务**：T5, T6, T7, T8
**依赖**：无

## 任务清单

### T1: server.py 增加 review_completed 消息推送
- **里程碑**：M1
- **描述**：在 meeting_message 处理的 execute_and_review_task 完成后，从 review_result 提取 critic_result 和 grounding_result，新增 ws.send_json 推送 review_completed 消息
- **输出**：修改 backend/server.py
- **验证**：运行集成测试验证 review_completed 消息包含 critic_result 和 grounding_result

### T2: useMeetingSocket.ts 增加 review_completed handler
- **里程碑**：M1
- **描述**：前端 switch 中新增 case 'review_completed'，将 critic/grounding 结果添加到 chatMessages，格式化为可读的审查摘要
- **输出**：修改 src/hooks/useMeetingSocket.ts
- **验证**：TypeScript 类型检查通过

### T3: server.py send_agent_message 增加 stance/confidence 参数
- **里程碑**：M1
- **描述**：修改 send_agent_message 回调签名，增加可选 stance 和 confidence 参数，在发送 agent_message 时附加到消息中
- **输出**：修改 backend/server.py
- **验证**：运行测试验证 agent_message 包含 stance 和 confidence 字段

### T4: DiscussionManager 传递 stance 到回调
- **里程碑**：M1
- **描述**：DiscussionManager.run() 中调用 on_message 时传递 parsed_stance 和 parsed_confidence
- **输出**：修改 backend/discussion_manager.py
- **验证**：运行测试验证讨论消息包含 stance 信息

### T5: MeetingCoordinator 工作流节点状态回调改为推送
- **里程碑**：M2
- **描述**：修改 _on_workflow_node_status_change 回调，通过 on_message 推送 workflow_node_status_update 消息。需要在 MeetingCoordinator 中持有 on_message 引用
- **输出**：修改 backend/meeting_coordinator.py
- **验证**：运行测试验证节点状态变化时推送 workflow_node_status_update

### T6: useMeetingSocket.ts 增加 workflow_node_status_update handler
- **里程碑**：M2
- **描述**：前端新增 case 'workflow_node_status_update' 处理器，实时更新 WorkflowPanel 中对应节点的状态
- **输出**：修改 src/hooks/useMeetingSocket.ts
- **验证**：TypeScript 类型检查通过

### T7: 清理前端 workflowEngine.ts 或标记为预留
- **里程碑**：M2
- **描述**：workflowEngine.ts 中的8个 REST API 调用（/api/workflow/*）后端无对应端点。标注为预留接口，添加注释说明当前工作流通过 WebSocket 驱动
- **输出**：修改 src/modules/workflowEngine.ts
- **验证**：无运行时 404 调用

### T8: meetingProtocol.ts 消息类型标注
- **里程碑**：M2
- **描述**：将后端未发送的消息类型（agenda_update、proposal、vote、vote_result、critical_blocker、human_approval_request/response、checkpoint_save/restore、audit_log）标注为 reserved
- **输出**：修改 src/modules/meetingProtocol.ts
- **验证**：TypeScript 类型检查通过

### T9: MeetingCoordinator 新增 last_routing_decision 属性
- **里程碑**：M1
- **描述**：在 MeetingCoordinator 中新增 @property last_routing_decision，委托返回 self._semantic_analyzer.last_routing_decision
- **输出**：修改 backend/meeting_coordinator.py
- **验证**：运行 test_meeting_coordinator_router.py 全部通过

### T10: server.py 修复路由决策读取
- **里程碑**：M1
- **描述**：将 server.py 中 coordinator._last_routing_decision 改为 coordinator.last_routing_decision
- **输出**：修改 backend/server.py
- **验证**：运行测试验证路由决策正确传播到前端

## 完成定义

1. 后端 review_completed 消息包含 critic_result 和 grounding_result
2. agent_message 消息包含 stance 和 confidence 字段
3. 工作流节点状态变化实时推送到前端
4. 前端 workflowEngine.ts 标注为预留接口
5. meetingProtocol.ts 中后端未发送的消息类型标注为 reserved
6. 路由决策通过 @property 正确传播
7. 现有测试全部通过
8. 前端 TypeScript 类型检查通过
