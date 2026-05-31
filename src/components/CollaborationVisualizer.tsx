import React, { useMemo, useState } from 'react';
import type { CollaborationSession, AgentStatus } from '../modules/collaborationState';
import { SessionStatus } from '../modules/collaborationState';
import type { MessageEnvelope } from '../modules/communicationProtocol';
import { MessageType, MessagePriority } from '../modules/communicationProtocol';

interface CollaborationVisualizerProps {
  session: CollaborationSession;
  agents: AgentStatus[];
  onMessageClick?: (message: MessageEnvelope) => void;
  selectedMessageId?: string | null;
}

const messageTypeIcons: Record<MessageType, string> = {
  [MessageType.TaskAssignment]: '📋',
  [MessageType.TaskResult]: '✅',
  [MessageType.TaskRequest]: '❓',
  [MessageType.TaskUpdate]: '🔄',
  [MessageType.StatusReport]: '📊',
  [MessageType.StatusRequest]: '🔍',
  [MessageType.ErrorReport]: '⚠️',
  [MessageType.HelpRequest]: '🆘',
  [MessageType.HelpResponse]: '🤝',
  [MessageType.DataShare]: '📦',
  [MessageType.ControlCommand]: '🎛️',
  [MessageType.Heartbeat]: '💓',
  [MessageType.Acknowledgement]: '👍',
};

const messageTypeLabels: Record<MessageType, string> = {
  [MessageType.TaskAssignment]: '任务分配',
  [MessageType.TaskResult]: '任务结果',
  [MessageType.TaskRequest]: '任务请求',
  [MessageType.TaskUpdate]: '任务更新',
  [MessageType.StatusReport]: '状态报告',
  [MessageType.StatusRequest]: '状态请求',
  [MessageType.ErrorReport]: '错误报告',
  [MessageType.HelpRequest]: '帮助请求',
  [MessageType.HelpResponse]: '帮助响应',
  [MessageType.DataShare]: '数据共享',
  [MessageType.ControlCommand]: '控制命令',
  [MessageType.Heartbeat]: '心跳',
  [MessageType.Acknowledgement]: '确认',
};

const priorityColors: Record<MessagePriority, string> = {
  [MessagePriority.Low]: '#6b7280',
  [MessagePriority.Normal]: '#3b82f6',
  [MessagePriority.High]: '#f59e0b',
  [MessagePriority.Urgent]: '#ef4444',
};

const sessionStatusLabels: Record<SessionStatus, string> = {
  [SessionStatus.Initializing]: '初始化中',
  [SessionStatus.Planning]: '规划中',
  [SessionStatus.Executing]: '执行中',
  [SessionStatus.Reviewing]: '审查中',
  [SessionStatus.Completing]: '完成中',
  [SessionStatus.Completed]: '已完成',
  [SessionStatus.Failed]: '失败',
  [SessionStatus.Cancelled]: '已取消',
  [SessionStatus.Paused]: '已暂停',
};

export default function CollaborationVisualizer({
  session,
  agents,
  onMessageClick,
  selectedMessageId,
}: CollaborationVisualizerProps) {
  const [filterType, setFilterType] = useState<MessageType | 'all'>('all');
  const [showOnlyRecent, setShowOnlyRecent] = useState(false);
  const [tab, setTab] = useState<'messages' | 'graph' | 'trace'>('messages');

  const agentMap = useMemo(() => {
    const map = new Map<string, AgentStatus>();
    agents.forEach(agent => map.set(agent.agentId, agent));
    return map;
  }, [agents]);

  const filteredMessages = useMemo(() => {
    let messages = [...session.messageHistory];
    
    if (filterType !== 'all') {
      messages = messages.filter(m => m.type === filterType);
    }
    
    if (showOnlyRecent) {
      messages = messages.slice(-50);
    }
    
    return messages.sort((a, b) => b.timestamp - a.timestamp);
  }, [session.messageHistory, filterType, showOnlyRecent]);

  const stats = useMemo(() => {
    const total = session.messageHistory.length;
    const byType = new Map<MessageType, number>();
    const byPriority = new Map<MessagePriority, number>();
    
    session.messageHistory.forEach(msg => {
      byType.set(msg.type, (byType.get(msg.type) || 0) + 1);
      byPriority.set(msg.priority, (byPriority.get(msg.priority) || 0) + 1);
    });
    
    return { total, byType, byPriority };
  }, [session.messageHistory]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getAgentName = (agentId: string) => {
    return agentMap.get(agentId)?.agentName || agentId.slice(0, 8);
  };

  const renderMessageFlow = () => {
    const messages = filteredMessages.slice(0, 100);
    
    return (
      <div className="message-flow">
        {messages.map((msg, index) => {
          const isSelected = selectedMessageId === msg.id;
          const sender = getAgentName(msg.senderId);
          const receiver = msg.receiverId ? getAgentName(msg.receiverId) : '广播';
          
          return (
            <div
              key={msg.id}
              className={`message-item ${isSelected ? 'selected' : ''} priority-${msg.priority}`}
              onClick={() => onMessageClick?.(msg)}
            >
              <div className="message-header">
                <span className="message-icon">{messageTypeIcons[msg.type]}</span>
                <span className="message-type">{messageTypeLabels[msg.type]}</span>
                <span
                  className="priority-badge"
                  style={{ backgroundColor: priorityColors[msg.priority] }}
                >
                  {msg.priority}
                </span>
                <span className="message-time">{formatTime(msg.timestamp)}</span>
              </div>
              
              <div className="message-route">
                <span className="sender">{sender}</span>
                <span className="arrow">→</span>
                <span className="receiver">{receiver}</span>
              </div>
              
              {msg.payload != null && typeof msg.payload === 'object' && (
                <div className="message-payload">
                  {renderPayloadPreview(msg.payload as Record<string, unknown>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderPayloadPreview = (payload: Record<string, unknown>) => {
    const keys = Object.keys(payload).slice(0, 3);
    
    return (
      <div className="payload-preview">
        {keys.map(key => (
          <span key={key} className="payload-item">
            <span className="payload-key">{key}:</span>
            <span className="payload-value">
              {typeof payload[key] === 'string'
                ? (payload[key] as string).slice(0, 50)
                : JSON.stringify(payload[key]).slice(0, 50)}
            </span>
          </span>
        ))}
      </div>
    );
  };

  const traceChains = useMemo(() => {
    const traced = session.messageHistory.filter(m => m.traceId);
    if (traced.length === 0) return [];

    const byTrace = new Map<string, MessageEnvelope[]>();
    traced.forEach(msg => {
      const list = byTrace.get(msg.traceId!) ?? [];
      list.push(msg);
      byTrace.set(msg.traceId!, list);
    });

    return Array.from(byTrace.entries()).map(([traceId, messages]) => {
      const byId = new Map<string, MessageEnvelope>();
      messages.forEach(m => byId.set(m.id, m));

      const roots: MessageEnvelope[] = [];
      const childrenMap = new Map<string, MessageEnvelope[]>();

      messages.forEach(msg => {
        if (msg.causalMessageId && byId.has(msg.causalMessageId)) {
          const siblings = childrenMap.get(msg.causalMessageId) ?? [];
          siblings.push(msg);
          childrenMap.set(msg.causalMessageId, siblings);
        } else {
          roots.push(msg);
        }
      });

      roots.sort((a, b) => a.timestamp - b.timestamp);
      childrenMap.forEach(list => list.sort((a, b) => a.timestamp - b.timestamp));

      return { traceId, roots, childrenMap };
    });
  }, [session.messageHistory]);

  const renderTraceNode = (msg: MessageEnvelope, depth: number): React.ReactNode => {
    const children = traceChains.find(t => t.traceId === msg.traceId)?.childrenMap.get(msg.id) ?? [];

    return (
      <div key={msg.id} className="trace-node" style={{ paddingLeft: depth * 24 }}>
        <div className="trace-node-content">
          {depth > 0 && <span className="trace-arrow">↳</span>}
          <span className="trace-icon">{messageTypeIcons[msg.type]}</span>
          <span className="trace-sender">{getAgentName(msg.senderId)}</span>
          <span className="trace-type">{messageTypeLabels[msg.type]}</span>
          <span className="trace-time">{formatTime(msg.timestamp)}</span>
          {msg.causalMessageId && (
            <span className="trace-causal">← 因果关联</span>
          )}
        </div>
        {children.map(child => renderTraceNode(child, depth + 1))}
      </div>
    );
  };

  const renderTraceChain = () => {
    if (traceChains.length === 0) {
      return (
        <div className="trace-empty">
          <span className="trace-empty-icon">🔗</span>
          <span className="trace-empty-text">暂无追踪数据</span>
        </div>
      );
    }

    return (
      <div className="trace-chain">
        {traceChains.map(trace => (
          <div key={trace.traceId} className="trace-group">
            <div className="trace-group-header">
              <span className="trace-id-label">Trace</span>
              <span className="trace-id-value">{trace.traceId.slice(0, 8)}</span>
              <span className="trace-count">{trace.roots.length + Array.from(trace.childrenMap.values()).flat().length} 条消息</span>
            </div>
            <div className="trace-tree">
              {trace.roots.map(root => renderTraceNode(root, 0))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderCommunicationGraph = () => {
    const connections = new Map<string, number>();
    
    session.messageHistory.forEach(msg => {
      if (msg.receiverId) {
        const key = `${msg.senderId}-${msg.receiverId}`;
        connections.set(key, (connections.get(key) || 0) + 1);
      }
    });
    
    const topConnections = Array.from(connections.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    return (
      <div className="communication-graph">
        <h4 className="section-title">通信热图</h4>
        <div className="connections-list">
          {topConnections.map(([key, count]) => {
            const [from, to] = key.split('-');
            return (
              <div key={key} className="connection-item">
                <span className="connection-from">{getAgentName(from)}</span>
                <span className="connection-arrow">⇄</span>
                <span className="connection-to">{getAgentName(to)}</span>
                <span className="connection-count">{count} 条消息</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="collaboration-visualizer">
      <div className="visualizer-header">
        <div className="session-info">
          <h3 className="session-title">{session.title}</h3>
          <span className="session-status">{sessionStatusLabels[session.status]}</span>
        </div>
        
        <div className="session-stats">
          <span className="stat">
            消息总数: <strong>{stats.total}</strong>
          </span>
          <span className="stat">
            参与 Agent: <strong>{session.agentIds.length}</strong>
          </span>
          <span className="stat">
            协作模式: <strong>{session.mode}</strong>
          </span>
        </div>
      </div>

      <div className="visualizer-controls">
        <div className="tab-group">
          <button
            className={`tab-button ${tab === 'messages' ? 'active' : ''}`}
            onClick={() => setTab('messages')}
          >
            消息流
          </button>
          <button
            className={`tab-button ${tab === 'graph' ? 'active' : ''}`}
            onClick={() => setTab('graph')}
          >
            通信图
          </button>
          <button
            className={`tab-button ${tab === 'trace' ? 'active' : ''}`}
            onClick={() => setTab('trace')}
          >
            追踪链路
          </button>
        </div>

        <div className="filter-group">
          <label>消息类型:</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as MessageType | 'all')}
          >
            <option value="all">全部</option>
            {Object.entries(messageTypeLabels).map(([type, label]) => (
              <option key={type} value={type}>{label}</option>
            ))}
          </select>
        </div>
        
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showOnlyRecent}
            onChange={(e) => setShowOnlyRecent(e.target.checked)}
          />
          仅显示最近 50 条
        </label>
      </div>

      <div className="visualizer-content">
        {tab === 'messages' && (
          <div className="message-panel">
            <h4 className="section-title">消息流</h4>
            {renderMessageFlow()}
          </div>
        )}
        
        {tab === 'graph' && (
          <div className="graph-panel">
            {renderCommunicationGraph()}
            
            <div className="agent-timeline">
              <h4 className="section-title">Agent 时间线</h4>
              {session.agentIds.map(agentId => {
                const agent = agentMap.get(agentId);
                if (!agent) return null;
                
                const agentMessages = session.messageHistory.filter(
                  m => m.senderId === agentId || m.receiverId === agentId
                );
                
                return (
                  <div key={agentId} className="timeline-item">
                    <span className="agent-name">{agent.agentName}</span>
                    <span className="message-count">{agentMessages.length} 条消息</span>
                    <div className="activity-bar">
                      <div
                        className="activity-fill"
                        style={{
                          width: `${Math.min((agentMessages.length / stats.total) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'trace' && (
          <div className="trace-panel">
            <h4 className="section-title">追踪链路</h4>
            {renderTraceChain()}
          </div>
        )}
      </div>
    </div>
  );
}