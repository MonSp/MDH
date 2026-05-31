import React, { useMemo, useState } from 'react';
import type { TaskPlan, SubTask, TaskDependency } from '../modules/taskTypes';
import { TaskStatus, TaskPriority, isTaskReady, getTaskDependencies } from '../modules/taskTypes';

interface TaskNode extends SubTask {
  children: TaskNode[];
  level: number;
}

interface TaskDecompositionGraphProps {
  plan: TaskPlan;
  onTaskClick?: (task: SubTask) => void;
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

const priorityIcons: Record<TaskPriority, string> = {
  [TaskPriority.Low]: '○',
  [TaskPriority.Medium]: '◐',
  [TaskPriority.High]: '●',
  [TaskPriority.Critical]: '◉',
};

export default function TaskDecompositionGraph({
  plan,
  onTaskClick,
  selectedTaskId,
}: TaskDecompositionGraphProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const taskTree = useMemo(() => {
    const taskMap = new Map<string, SubTask>();
    plan.subTasks.forEach(task => taskMap.set(task.id, task));

    const buildTree = (taskId: string, level: number): TaskNode | null => {
      const task = taskMap.get(taskId);
      if (!task) return null;

      const childTasks = plan.subTasks.filter(t => t.parentTaskId === taskId);
      const children = childTasks
        .map(child => buildTree(child.id, level + 1))
        .filter((node): node is TaskNode => node !== null);

      return { ...task, children, level };
    };

    const rootTasks = plan.subTasks.filter(t => !t.parentTaskId);
    return rootTasks
      .map(root => buildTree(root.id, 0))
      .filter((node): node is TaskNode => node !== null);
  }, [plan]);

  const toggleNode = (taskId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const isExpanded = (taskId: string) => expandedNodes.has(taskId) || expandedNodes.size === 0;

  const renderTaskNode = (node: TaskNode, index: number) => {
    const isReady = isTaskReady(node, plan);
    const dependencies = getTaskDependencies(node.id, plan);
    const isSelected = selectedTaskId === node.id;
    const hasChildren = node.children.length > 0;
    const expanded = isExpanded(node.id);

    return (
      <div key={node.id} className="task-node-container">
        <div
          className={`task-node ${isSelected ? 'selected' : ''} ${!isReady ? 'blocked' : ''}`}
          style={{ marginLeft: `${node.level * 24}px` }}
          onClick={() => onTaskClick?.(node)}
        >
          {hasChildren && (
            <button
              className="expand-btn"
              onClick={(e) => {
                e.stopPropagation();
                toggleNode(node.id);
              }}
            >
              {expanded ? '▼' : '▶'}
            </button>
          )}
          {!hasChildren && <span className="expand-placeholder" />}
          
          <div className="task-content">
            <div className="task-header">
              <span className="priority-icon" title={`优先级: ${node.priority}`}>
                {priorityIcons[node.priority]}
              </span>
              <span className="task-title">{node.title}</span>
              <span
                className="status-badge"
                style={{ backgroundColor: statusColors[node.status] }}
              >
                {statusLabels[node.status]}
              </span>
            </div>
            
            {node.description && (
              <div className="task-description">{node.description}</div>
            )}
            
            <div className="task-meta">
              {node.assignedAgentId && (
                <span className="meta-item">
                  🤖 {node.assignedAgentId.slice(0, 8)}
                </span>
              )}
              {dependencies.length > 0 && (
                <span className="meta-item dependency-count">
                  ⚡ {dependencies.length} 个依赖
                </span>
              )}
              {node.retryCount > 0 && (
                <span className="meta-item retry-count">
                  🔄 重试 {node.retryCount} 次
                </span>
              )}
            </div>
          </div>
        </div>

        {hasChildren && expanded && (
          <div className="task-children">
            {node.children.map((child, childIndex) => renderTaskNode(child, childIndex))}
          </div>
        )}
      </div>
    );
  };

  const renderDependencyLines = () => {
    const lines: JSX.Element[] = [];
    
    plan.dependencies.forEach((dep, index) => {
      const fromTask = plan.subTasks.find(t => t.id === dep.fromTaskId);
      const toTask = plan.subTasks.find(t => t.id === dep.toTaskId);
      
      if (fromTask && toTask) {
        lines.push(
          <div key={`dep-${index}`} className="dependency-line">
            <span className="dep-from">{fromTask.title}</span>
            <span className="dep-arrow">→</span>
            <span className="dep-to">{toTask.title}</span>
            <span className="dep-type">[{dep.type}]</span>
          </div>
        );
      }
    });
    
    return lines;
  };

  const stats = useMemo(() => {
    const total = plan.subTasks.length;
    const completed = plan.subTasks.filter(t => t.status === TaskStatus.Completed).length;
    const running = plan.subTasks.filter(t => t.status === TaskStatus.Running).length;
    const failed = plan.subTasks.filter(t => t.status === TaskStatus.Failed).length;
    const blocked = plan.subTasks.filter(t => !isTaskReady(t, plan)).length;
    
    return { total, completed, running, failed, blocked };
  }, [plan]);

  return (
    <div className="task-decomposition-graph">
      <div className="graph-header">
        <h3 className="graph-title">{plan.title}</h3>
        {plan.description && (
          <p className="graph-description">{plan.description}</p>
        )}
        <div className="graph-stats">
          <span className="stat-item">
            📋 总计: <strong>{stats.total}</strong>
          </span>
          <span className="stat-item completed">
            ✅ 完成: <strong>{stats.completed}</strong>
          </span>
          <span className="stat-item running">
            ⚡ 执行中: <strong>{stats.running}</strong>
          </span>
          {stats.failed > 0 && (
            <span className="stat-item failed">
              ❌ 失败: <strong>{stats.failed}</strong>
            </span>
          )}
          {stats.blocked > 0 && (
            <span className="stat-item blocked">
              🚫 阻塞: <strong>{stats.blocked}</strong>
            </span>
          )}
        </div>
      </div>

      <div className="task-tree">
        {taskTree.length > 0 ? (
          taskTree.map((node, index) => renderTaskNode(node, index))
        ) : (
          <div className="empty-state">
            <p>暂无任务分解</p>
          </div>
        )}
      </div>

      {plan.dependencies.length > 0 && (
        <div className="dependencies-section">
          <h4 className="section-title">依赖关系</h4>
          <div className="dependency-list">
            {renderDependencyLines()}
          </div>
        </div>
      )}
    </div>
  );
}