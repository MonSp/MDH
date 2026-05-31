import React, { useMemo } from 'react';
import type { AgentStatus } from '../modules/collaborationState';
import { AgentInstanceStatus } from '../modules/agentTypes';
import type { AgentRole, AgentCapability } from '../modules/agentTypes';

interface AgentStatusPanelProps {
  agents: AgentStatus[];
  onAgentClick?: (agent: AgentStatus) => void;
  selectedAgentId?: string | null;
}

const statusColors: Record<AgentInstanceStatus, string> = {
  [AgentInstanceStatus.Idle]: '#10b981',
  [AgentInstanceStatus.Busy]: '#f59e0b',
  [AgentInstanceStatus.Waiting]: '#3b82f6',
  [AgentInstanceStatus.Error]: '#ef4444',
  [AgentInstanceStatus.Offline]: '#6b7280',
};

const statusLabels: Record<AgentInstanceStatus, string> = {
  [AgentInstanceStatus.Idle]: '空闲',
  [AgentInstanceStatus.Busy]: '忙碌',
  [AgentInstanceStatus.Waiting]: '等待中',
  [AgentInstanceStatus.Error]: '错误',
  [AgentInstanceStatus.Offline]: '离线',
};

const roleLabels: Record<AgentRole, string> = {
  planner: '规划者',
  executor: '执行者',
  monitor: '监控者',
  reviewer: '审查者',
  coordinator: '协调者',
};

const roleIcons: Record<AgentRole, string> = {
  planner: '🧠',
  executor: '⚡',
  monitor: '👁',
  reviewer: '🔍',
  coordinator: '🎯',
};

const capabilityLabels: Record<AgentCapability, string> = {
  task_decomposition: '任务分解',
  code_generation: '代码生成',
  code_review: '代码审查',
  testing: '测试',
  browser_automation: '浏览器自动化',
  file_operation: '文件操作',
  web_search: '网络搜索',
  data_analysis: '数据分析',
  documentation: '文档编写',
  monitoring: '监控',
};

export default function AgentStatusPanel({
  agents,
  onAgentClick,
  selectedAgentId,
}: AgentStatusPanelProps) {
  const stats = useMemo(() => {
    const total = agents.length;
    const idle = agents.filter(a => a.status === AgentInstanceStatus.Idle).length;
    const busy = agents.filter(a => a.status === AgentInstanceStatus.Busy).length;
    const error = agents.filter(a => a.status === AgentInstanceStatus.Error).length;
    const offline = agents.filter(a => a.status === AgentInstanceStatus.Offline).length;
    
    return { total, idle, busy, error, offline };
  }, [agents]);

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return `${Math.floor(diff / 86400000)} 天前`;
  };

  const renderAgentCard = (agent: AgentStatus) => {
    const isSelected = selectedAgentId === agent.agentId;
    const isActive = agent.status !== AgentInstanceStatus.Offline;
    
    return (
      <div
        key={agent.agentId}
        className={`agent-card ${isSelected ? 'selected' : ''} ${!isActive ? 'offline' : ''}`}
        onClick={() => onAgentClick?.(agent)}
      >
        <div className="agent-header">
          <div className="agent-identity">
            <span className="agent-icon">{roleIcons[agent.role]}</span>
            <div className="agent-info">
              <span className="agent-name">{agent.agentName}</span>
              <span className="agent-role">{roleLabels[agent.role]}</span>
            </div>
          </div>
          <div className="agent-status-indicator">
            <span
              className="status-dot"
              style={{ backgroundColor: statusColors[agent.status] }}
            />
            <span className="status-label">{statusLabels[agent.status]}</span>
          </div>
        </div>

        <div className="agent-body">
          {agent.currentTaskId && (
            <div className="current-task">
              <span className="task-label">当前任务:</span>
              <span className="task-id">{agent.currentTaskId.slice(0, 8)}...</span>
            </div>
          )}

          <div className="agent-metrics">
            <div className="metric">
              <span className="metric-label">负载</span>
              <div className="load-bar">
                <div
                  className="load-fill"
                  style={{
                    width: `${Math.min(agent.load * 100, 100)}%`,
                    backgroundColor: agent.load > 0.8 ? '#ef4444' : agent.load > 0.5 ? '#f59e0b' : '#10b981',
                  }}
                />
              </div>
              <span className="metric-value">{Math.round(agent.load * 100)}%</span>
            </div>
            
            <div className="metric">
              <span className="metric-label">完成任务</span>
              <span className="metric-value success">{agent.completedTasks}</span>
            </div>
            
            <div className="metric">
              <span className="metric-label">失败任务</span>
              <span className="metric-value error">{agent.failedTasks}</span>
            </div>
          </div>

          {agent.capabilities.length > 0 && (
            <div className="agent-capabilities">
              <span className="capabilities-label">能力:</span>
              <div className="capabilities-list">
                {agent.capabilities.slice(0, 3).map(cap => (
                  <span key={cap} className="capability-tag">
                    {capabilityLabels[cap] || cap}
                  </span>
                ))}
                {agent.capabilities.length > 3 && (
                  <span className="capability-more">+{agent.capabilities.length - 3}</span>
                )}
              </div>
            </div>
          )}

          {agent.error && (
            <div className="agent-error">
              <span className="error-icon">⚠</span>
              <span className="error-message">{agent.error}</span>
            </div>
          )}
        </div>

        <div className="agent-footer">
          <span className="last-heartbeat">
            最后心跳: {formatTime(agent.lastHeartbeat)}
          </span>
          {agent.averageTaskDuration > 0 && (
            <span className="avg-duration">
              平均耗时: {Math.round(agent.averageTaskDuration / 1000)}s
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="agent-status-panel">
      <div className="panel-header">
        <h3 className="panel-title">Agent 状态</h3>
        <div className="panel-stats">
          <span className="stat">
            总计: <strong>{stats.total}</strong>
          </span>
          <span className="stat idle">
            空闲: <strong>{stats.idle}</strong>
          </span>
          <span className="stat busy">
            忙碌: <strong>{stats.busy}</strong>
          </span>
          {stats.error > 0 && (
            <span className="stat error">
              错误: <strong>{stats.error}</strong>
            </span>
          )}
          {stats.offline > 0 && (
            <span className="stat offline">
              离线: <strong>{stats.offline}</strong>
            </span>
          )}
        </div>
      </div>

      <div className="agents-grid">
        {agents.length > 0 ? (
          agents.map(agent => renderAgentCard(agent))
        ) : (
          <div className="empty-state">
            <p>暂无 Agent 信息</p>
          </div>
        )}
      </div>
    </div>
  );
}