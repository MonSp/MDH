import React, { useState, useMemo } from 'react';
import TaskDecompositionGraph from '../components/TaskDecompositionGraph';
import AgentStatusPanel from '../components/AgentStatusPanel';
import CollaborationVisualizer from '../components/CollaborationVisualizer';
import ProgressSummary from '../components/ProgressSummary';

import type { TaskPlan, SubTask } from '../modules/taskTypes';
import { TaskStatus, TaskPriority, TaskType, createSubTask, createTaskPlan } from '../modules/taskTypes';
import type { AgentStatus, CollaborationSession } from '../modules/collaborationState';
import { createAgentStatus, createCollaborationSession, SessionStatus, CollaborationMode } from '../modules/collaborationState';
import type { MessageEnvelope } from '../modules/communicationProtocol';
import { MessageType, MessagePriority, createMessage } from '../modules/communicationProtocol';
import { AgentRole, AgentCapability, AgentInstanceStatus } from '../modules/agentTypes';

export default function CollaborationDemo() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  const agents = useMemo<AgentStatus[]>(() => [
    createAgentStatus('agent-1', '规划者-Alpha', AgentRole.Planner, [AgentCapability.TaskDecomposition, AgentCapability.DataAnalysis]),
    createAgentStatus('agent-2', '执行者-Beta', AgentRole.Executor, [AgentCapability.CodeGeneration, AgentCapability.BrowserAutomation]),
    createAgentStatus('agent-3', '执行者-Gamma', AgentRole.Executor, [AgentCapability.FileOperation, AgentCapability.WebSearch]),
    createAgentStatus('agent-4', '审查者-Delta', AgentRole.Reviewer, [AgentCapability.CodeReview, AgentCapability.Testing]),
  ], []);

  const plan = useMemo<TaskPlan>(() => {
    const subTasks: SubTask[] = [
      createSubTask('任务分解', '分析用户需求并分解为子任务', {
        type: TaskType.Composite,
        priority: TaskPriority.High,
        assignedAgentId: 'agent-1',
      }),
      createSubTask('代码生成', '根据需求生成代码实现', {
        type: TaskType.Atomic,
        priority: TaskPriority.High,
        assignedAgentId: 'agent-2',
      }),
      createSubTask('测试验证', '对生成的代码进行测试', {
        type: TaskType.Atomic,
        priority: TaskPriority.Medium,
        assignedAgentId: 'agent-4',
      }),
      createSubTask('文档编写', '编写相关文档', {
        type: TaskType.Atomic,
        priority: TaskPriority.Low,
        assignedAgentId: 'agent-3',
      }),
    ];

    subTasks[0].status = TaskStatus.Completed;
    subTasks[1].status = TaskStatus.Running;

    return createTaskPlan('协作任务示例', '这是一个展示多Agent协作的示例任务', subTasks, [
      { fromTaskId: subTasks[0].id, toTaskId: subTasks[1].id, type: 'blocks' },
      { fromTaskId: subTasks[1].id, toTaskId: subTasks[2].id, type: 'requires_output' },
    ]);
  }, []);

  const session = useMemo<CollaborationSession>(() => {
    const session = createCollaborationSession('实现一个用户管理系统', CollaborationMode.Hierarchical);
    session.status = SessionStatus.Executing;
    session.agentIds = agents.map(a => a.agentId);
    session.taskProgress = plan.subTasks.map(task => ({
      taskId: task.id,
      taskTitle: task.title,
      status: task.status,
      priority: task.priority,
      assignedAgentId: task.assignedAgentId,
      progress: task.status === TaskStatus.Completed ? 1 : task.status === TaskStatus.Running ? 0.6 : 0,
      startedAt: task.startedAt,
      estimatedCompletionAt: null,
      completedAt: task.completedAt,
      retryCount: 0,
      error: null,
      subProgress: [],
    }));

    const messages: MessageEnvelope[] = [
      createMessage(MessageType.TaskAssignment, 'agent-1', 'agent-2', {
        taskId: plan.subTasks[1].id,
        taskTitle: '代码生成',
        taskDescription: '根据需求生成代码实现',
        input: {},
        constraints: {},
        deadline: null,
      }),
      createMessage(MessageType.StatusReport, 'agent-2', 'agent-1', {
        agentId: 'agent-2',
        status: 'busy',
        currentTaskId: plan.subTasks[1].id,
        completedTaskCount: 5,
        failedTaskCount: 0,
        uptime: 3600,
      }),
      createMessage(MessageType.TaskUpdate, 'agent-2', 'agent-1', {
        taskId: plan.subTasks[1].id,
        status: 'running',
        progress: 0.6,
        message: '代码生成进行中',
      }),
    ];

    session.messageHistory = messages;
    return session;
  }, [agents, plan]);

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '24px', color: 'var(--text-primary)' }}>
        多Agent协作可视化演示
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <TaskDecompositionGraph
          plan={plan}
          onTaskClick={(task) => setSelectedTaskId(task.id)}
          selectedTaskId={selectedTaskId}
        />

        <AgentStatusPanel
          agents={agents}
          onAgentClick={(agent) => setSelectedAgentId(agent.agentId)}
          selectedAgentId={selectedAgentId}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <CollaborationVisualizer
          session={session}
          agents={agents}
          onMessageClick={(msg) => setSelectedMessageId(msg.id)}
          selectedMessageId={selectedMessageId}
        />
      </div>

      <div>
        <ProgressSummary
          session={session}
          onTaskClick={(task) => setSelectedTaskId(task.taskId)}
          selectedTaskId={selectedTaskId}
        />
      </div>
    </div>
  );
}