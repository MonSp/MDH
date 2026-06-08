# 前后端接口缺口补齐 — 设计规格

## 设计目标

1. **数据透传**：将后端已产出但被丢弃的结构化数据（审查结果、讨论立场、路由决策）通过 WebSocket 推送到前端
2. **实时性**：工作流节点级别的状态变化能实时推送到前端，而非仅在结束时一次性返回
3. **协议一致性**：前端定义的消息类型与后端实际发送的消息类型保持一致，消除死类型和孤立 REST 调用
4. **Bug 修复**：修复路由决策属性引用 bug，确保数据正确传播

## 模块划分

### 改造模块 1：backend/server.py

**改造内容**：在 meeting_message 处理流程中新增 review_completed 消息推送；修改 send_agent_message 回调支持 stance/confidence 参数；修复 coordinator._last_routing_decision 引用。

**改造要点**：
- execute_and_review_task 完成后，从 review_result 提取 critic_result 和 grounding_result，通过新的 review_completed 消息推送
- send_agent_message 回调签名增加 stance/confidence 可选参数
- 将 coordinator._last_routing_decision 改为 coordinator.last_routing_decision

### 改造模块 2：backend/meeting_coordinator.py

**改造内容**：新增 last_routing_decision 属性委托；修改 _on_workflow_node_status_change 回调支持 on_message 推送。

**改造要点**：
- 新增 @property last_routing_decision 委托到 self._semantic_analyzer.last_routing_decision
- _on_workflow_node_status_change 回调改为通过 on_message 推送 workflow_node_status_update
- auto_assign_task 中的 hasattr(self, '_last_routing_decision') 改为 self.last_routing_decision

### 改造模块 3：backend/discussion_manager.py

**改造内容**：在 run() 方法中调用 on_message 时传递 stance 和 confidence。

**改造要点**：
- on_message 回调签名扩展为支持 stance/confidence 可选参数
- 在每轮讨论中调用 on_message(agent_id, text, "", stance=parsed_stance, confidence=parsed_confidence)

### 改造模块 4：src/hooks/useMeetingSocket.ts

**改造内容**：新增 review_completed、workflow_node_status_update 消息处理器；在 agent_message handler 中读取 stance/confidence。

**改造要点**：
- switch 中新增 case 'review_completed'：将 critic/grounding 结果添加到 chatMessages
- switch 中新增 case 'workflow_node_status_update'：更新 tasks 中对应节点的状态
- agent_message handler 中从 msg 读取 stance 和 confidence 填充到 ChatMessage

### 改造模块 5：src/modules/workflowEngine.ts

**改造内容**：清理孤立的 REST 调用，标注为预留接口。

### 改造模块 6：src/modules/meetingProtocol.ts

**改造内容**：将后端未发送的消息类型标注为 reserved。

### 依赖关系

```
server.py
├── meeting_coordinator.py
│   ├── semantic_analyzer.py (last_routing_decision 属性)
│   └── workflow_engine.py (节点状态回调)
├── discussion_manager.py (stance/confidence 传递)
└── review_pipeline.py (critic/grounding 结果)

useMeetingSocket.ts
├── 处理 review_completed 消息
├── 处理 workflow_node_status_update 消息
└── agent_message 中读取 stance/confidence

workflowEngine.ts → 标注为预留
meetingProtocol.ts → 清理死类型
```

## 失败处理策略

### 策略1：CriticAgent/GroundingAgent 结果为空

当 CriticAgent 或 GroundingAgent 返回空结果时，review_completed 消息仍应发送，但 critic_result 和 grounding_result 字段可为空对象。前端渲染时应优雅处理空结果，不显示空白卡片。

### 策略2：讨论 stance 解析失败

当 DiscussionManager 无法从 LLM 回复中解析出 stance 时，默认 stance 为 neutral、confidence 为 0.5。前端应能正确渲染 neutral 状态。

### 策略3：工作流节点状态推送丢失

WebSocket 断连时，前端已有重连机制（指数退避，最多5次）。重连后可通过 request_retransmit 恢复丢失的消息。

## 质量控制

1. 现有 test_meeting_coordinator_router.py 必须全部通过
2. 新增测试验证 review_completed 消息包含 critic_result 和 grounding_result
3. 新增测试验证 agent_message 包含 stance 和 confidence 字段
4. 新增测试验证 workflow_node_status_update 消息在节点状态变化时被推送
5. 前端 TypeScript 类型检查通过
