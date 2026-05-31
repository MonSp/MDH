import React, { useMemo } from 'react';
import type { CollaborationSession, TaskProgress, SessionMetrics } from '../modules/collaborationState';
import { calculateSessionProgress } from '../modules/collaborationState';
import { TaskStatus } from '../modules/taskTypes';

interface ProgressSummaryProps {
  session: CollaborationSession;
  onTaskClick?: (task: TaskProgress) => void;
  selectedTaskId?: string | null;
}

const statusColors: Record<TaskStatus, string> = {
  [TaskStatus.Pending]: '#6b7280',
  [TaskStatus.Planning]: '#8b5cf6',
  [TaskStatus.Assigned]: '#3b82f6',
  [TaskStatus.Running]: '#f59e0b',
  [TaskStatus.Paused]: '#f97316',
  [TaskStatus.Completed]: '#10b981',
  [TaskStatus.Failed]: '#ef4444',
  [TaskStatus.Cancelled]: '#9ca3af',
};

const statusLabels: Record<TaskStatus, string> = {
  [TaskStatus.Pending]: '待处理',
  [TaskStatus.Planning]: '规划中',
  [TaskStatus.Assigned]: '已分配',
  [TaskStatus.Running]: '执行中',
  [TaskStatus.Paused]: '已暂停',
  [TaskStatus.Completed]: '已完成',
  [TaskStatus.Failed]: '失败',
  [TaskStatus.Cancelled]: '已取消',
};

const statusIcons: Record<TaskStatus, string> = {
  [TaskStatus.Pending]: '⏳',
  [TaskStatus.Planning]: '🧠',
  [TaskStatus.Assigned]: '📋',
  [TaskStatus.Running]: '⚡',
  [TaskStatus.Paused]: '⏸️',
  [TaskStatus.Completed]: '✅',
  [TaskStatus.Failed]: '❌',
  [TaskStatus.Cancelled]: '🚫',
};

export default function ProgressSummary({
  session,
  onTaskClick,
  selectedTaskId,
}: ProgressSummaryProps) {
  const progress = useMemo(() => calculateSessionProgress(session), [session]);

  const stats = useMemo(() => {
    const tasks = session.taskProgress;
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === TaskStatus.Completed).length;
    const running = tasks.filter(t => t.status === TaskStatus.Running).length;
    const failed = tasks.filter(t => t.status === TaskStatus.Failed).length;
    const pending = tasks.filter(t => t.status === TaskStatus.Pending).length;
    const paused = tasks.filter(t => t.status === TaskStatus.Paused).length;
    const cancelled = tasks.filter(t => t.status === TaskStatus.Cancelled).length;
    
    return { total, completed, running, failed, pending, paused, cancelled };
  }, [session.taskProgress]);

  const duration = useMemo(() => {
    if (!session.startedAt) return null;
    const end = session.completedAt || Date.now();
    const ms = end - session.startedAt;
    
    if (ms < 60000) return `${Math.round(ms / 1000)} 秒`;
    if (ms < 3600000) return `${Math.round(ms / 60000)} 分钟`;
    return `${Math.round(ms / 3600000)} 小时`;
  }, [session.startedAt, session.completedAt]);

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderProgressBar = () => {
    const segments = Object.values(TaskStatus).map(status => {
      const count = session.taskProgress.filter(t => t.status === status).length;
      return { status, count, percentage: stats.total > 0 ? (count / stats.total) * 100 : 0 };
    }).filter(s => s.count > 0);

    return (
      <div className="progress-bar-container">
        <div className="progress-bar">
          {segments.map(seg => (
            <div
              key={seg.status}
              className="progress-segment"
              style={{
                width: `${seg.percentage}%`,
                backgroundColor: statusColors[seg.status],
              }}
              title={`${statusLabels[seg.status]}: ${seg.count}`}
            />
          ))}
        </div>
        <div className="progress-percentage">{Math.round(progress * 100)}%</div>
      </div>
    );
  };

  const renderMetrics = () => {
    const metrics = session.metrics;
    
    return (
      <div className="metrics-grid">
        <div className="metric-card">
          <span className="metric-icon">📊</span>
          <div className="metric-content">
            <span className="metric-value">{metrics.totalTasks}</span>
            <span className="metric-label">总任务数</span>
          </div>
        </div>
        
        <div className="metric-card">
          <span className="metric-icon">✅</span>
          <div className="metric-content">
            <span className="metric-value success">{metrics.completedTasks}</span>
            <span className="metric-label">已完成</span>
          </div>
        </div>
        
        <div className="metric-card">
          <span className="metric-icon">❌</span>
          <div className="metric-content">
            <span className="metric-value error">{metrics.failedTasks}</span>
            <span className="metric-label">失败</span>
          </div>
        </div>
        
        <div className="metric-card">
          <span className="metric-icon">💬</span>
          <div className="metric-content">
            <span className="metric-value">{metrics.messageCount}</span>
            <span className="metric-label">消息数</span>
          </div>
        </div>
        
        <div className="metric-card">
          <span className="metric-icon">⏱️</span>
          <div className="metric-content">
            <span className="metric-value">{duration || '-'}</span>
            <span className="metric-label">总耗时</span>
          </div>
        </div>
        
        <div className="metric-card">
          <span className="metric-icon">⚡</span>
          <div className="metric-content">
            <span className="metric-value">
              {metrics.averageTaskDuration > 0
                ? `${Math.round(metrics.averageTaskDuration / 1000)}s`
                : '-'}
            </span>
            <span className="metric-label">平均任务耗时</span>
          </div>
        </div>
      </div>
    );
  };

  const renderTaskList = () => {
    const sortedTasks = [...session.taskProgress].sort((a, b) => {
      const statusOrder: Record<TaskStatus, number> = {
        [TaskStatus.Running]: 0,
        [TaskStatus.Failed]: 1,
        [TaskStatus.Pending]: 2,
        [TaskStatus.Assigned]: 3,
        [TaskStatus.Planning]: 4,
        [TaskStatus.Paused]: 5,
        [TaskStatus.Completed]: 6,
        [TaskStatus.Cancelled]: 7,
      };
      return statusOrder[a.status] - statusOrder[b.status];
    });

    return (
      <div className="task-list">
        {sortedTasks.map(task => {
          const isSelected = selectedTaskId === task.taskId;
          
          return (
            <div
              key={task.taskId}
              className={`task-item ${isSelected ? 'selected' : ''}`}
              onClick={() => onTaskClick?.(task)}
            >
              <div className="task-header">
                <span className="task-icon">{statusIcons[task.status]}</span>
                <span className="task-title">{task.taskTitle}</span>
                <span
                  className="status-badge"
                  style={{ backgroundColor: statusColors[task.status] }}
                >
                  {statusLabels[task.status]}
                </span>
              </div>
              
              <div className="task-progress">
                <div className="mini-progress-bar">
                  <div
                    className="mini-progress-fill"
                    style={{
                      width: `${task.progress * 100}%`,
                      backgroundColor: statusColors[task.status],
                    }}
                  />
                </div>
                <span className="progress-text">{Math.round(task.progress * 100)}%</span>
              </div>
              
              <div className="task-meta">
                {task.assignedAgentId && (
                  <span className="meta-item">
                    🤖 {task.assignedAgentId.slice(0, 8)}
                  </span>
                )}
                <span className="meta-item">
                  ⏱ {formatTime(task.startedAt)}
                </span>
                {task.completedAt && (
                  <span className="meta-item">
                    ✅ {formatTime(task.completedAt)}
                  </span>
                )}
                {task.retryCount > 0 && (
                  <span className="meta-item retry">
                    🔄 {task.retryCount}
                  </span>
                )}
              </div>
              
              {task.error && (
                <div className="task-error">
                  <span className="error-icon">⚠</span>
                  <span className="error-message">{task.error}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderStatusDistribution = () => {
    const distribution = Object.values(TaskStatus).map(status => {
      const count = session.taskProgress.filter(t => t.status === status).length;
      return { status, count };
    }).filter(d => d.count > 0);

    return (
      <div className="status-distribution">
        <h4 className="section-title">状态分布</h4>
        <div className="distribution-chart">
          {distribution.map(({ status, count }) => (
            <div key={status} className="distribution-item">
              <div className="distribution-bar">
                <div
                  className="distribution-fill"
                  style={{
                    height: `${stats.total > 0 ? (count / stats.total) * 100 : 0}%`,
                    backgroundColor: statusColors[status],
                  }}
                />
              </div>
              <span className="distribution-label">{statusLabels[status]}</span>
              <span className="distribution-count">{count}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="progress-summary">
      <div className="summary-header">
        <h3 className="summary-title">进度汇总</h3>
        <div className="summary-meta">
          <span className="meta-item">
            📋 {session.title}
          </span>
          <span className="meta-item">
            🕐 {formatTime(session.startedAt)} - {formatTime(session.completedAt)}
          </span>
        </div>
      </div>

      <div className="progress-section">
        <div className="progress-header">
          <span className="progress-label">整体进度</span>
          <span className="progress-stats">
            {stats.completed}/{stats.total} 任务完成
          </span>
        </div>
        {renderProgressBar()}
      </div>

      <div className="stats-section">
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-icon completed">✅</span>
            <span className="stat-value">{stats.completed}</span>
            <span className="stat-label">已完成</span>
          </div>
          <div className="stat-item">
            <span className="stat-icon running">⚡</span>
            <span className="stat-value">{stats.running}</span>
            <span className="stat-label">执行中</span>
          </div>
          <div className="stat-item">
            <span className="stat-icon pending">⏳</span>
            <span className="stat-value">{stats.pending}</span>
            <span className="stat-label">待处理</span>
          </div>
          <div className="stat-item">
            <span className="stat-icon failed">❌</span>
            <span className="stat-value">{stats.failed}</span>
            <span className="stat-label">失败</span>
          </div>
          {stats.paused > 0 && (
            <div className="stat-item">
              <span className="stat-icon paused">⏸️</span>
              <span className="stat-value">{stats.paused}</span>
              <span className="stat-label">已暂停</span>
            </div>
          )}
          {stats.cancelled > 0 && (
            <div className="stat-item">
              <span className="stat-icon cancelled">🚫</span>
              <span className="stat-value">{stats.cancelled}</span>
              <span className="stat-label">已取消</span>
            </div>
          )}
        </div>
      </div>

      <div className="metrics-section">
        <h4 className="section-title">详细指标</h4>
        {renderMetrics()}
      </div>

      <div className="content-section">
        <div className="tasks-panel">
          <h4 className="section-title">任务列表</h4>
          {renderTaskList()}
        </div>
        
        <div className="distribution-panel">
          {renderStatusDistribution()}
        </div>
      </div>
    </div>
  );
}