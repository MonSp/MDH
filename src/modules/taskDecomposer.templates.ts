/**
 * TaskDecomposer 内置模板
 */

import type { TaskType, TaskPriority } from './taskTypes'
import type { AgentCapability } from './agentTypes'
import type { TaskTemplate } from './taskDecomposer'

export const DEFAULT_TEMPLATES: TaskTemplate[] = [
  {
    id: 'component-creation',
    name: '组件创建',
    description: '创建新的UI组件',
    intentPattern: /^create$/,
    subTaskTemplates: [
      { title: '分析组件需求', description: '分析组件的功能需求和设计规范', type: 'atomic' as TaskType, priority: 'high' as TaskPriority, requiredCapabilities: ['data_analysis' as AgentCapability], estimatedDuration: 30000 },
      { title: '设计组件接口', description: '设计组件的Props接口和状态管理', type: 'atomic' as TaskType, priority: 'high' as TaskPriority, requiredCapabilities: ['code_generation' as AgentCapability], estimatedDuration: 45000 },
      { title: '实现组件逻辑', description: '编写组件的核心逻辑和渲染', type: 'atomic' as TaskType, priority: 'high' as TaskPriority, requiredCapabilities: ['code_generation' as AgentCapability], estimatedDuration: 120000 },
      { title: '添加组件样式', description: '实现组件的样式和主题支持', type: 'atomic' as TaskType, priority: 'medium' as TaskPriority, requiredCapabilities: ['code_generation' as AgentCapability], estimatedDuration: 60000 },
      { title: '编写组件测试', description: '编写单元测试和集成测试', type: 'atomic' as TaskType, priority: 'medium' as TaskPriority, requiredCapabilities: ['testing' as AgentCapability], estimatedDuration: 90000 },
    ],
    defaultDependencies: [
      { fromIndex: 0, toIndex: 1, type: 'blocks' },
      { fromIndex: 1, toIndex: 2, type: 'blocks' },
      { fromIndex: 2, toIndex: 3, type: 'blocks' },
      { fromIndex: 2, toIndex: 4, type: 'blocks' },
    ],
  },
  {
    id: 'bug-fix',
    name: '问题修复',
    description: '修复代码中的问题',
    intentPattern: /^fix$/,
    subTaskTemplates: [
      { title: '复现问题', description: '复现并确认问题', type: 'atomic' as TaskType, priority: 'high' as TaskPriority, requiredCapabilities: ['testing' as AgentCapability], estimatedDuration: 30000 },
      { title: '定位问题原因', description: '分析代码定位问题根本原因', type: 'atomic' as TaskType, priority: 'high' as TaskPriority, requiredCapabilities: ['code_review' as AgentCapability], estimatedDuration: 60000 },
      { title: '实施修复', description: '编写修复代码', type: 'atomic' as TaskType, priority: 'high' as TaskPriority, requiredCapabilities: ['code_generation' as AgentCapability], estimatedDuration: 90000 },
      { title: '验证修复', description: '测试修复是否有效且无回归', type: 'atomic' as TaskType, priority: 'high' as TaskPriority, requiredCapabilities: ['testing' as AgentCapability], estimatedDuration: 45000 },
    ],
    defaultDependencies: [
      { fromIndex: 0, toIndex: 1, type: 'blocks' },
      { fromIndex: 1, toIndex: 2, type: 'blocks' },
      { fromIndex: 2, toIndex: 3, type: 'blocks' },
    ],
  },
  {
    id: 'feature-implementation',
    name: '功能实现',
    description: '实现新功能',
    intentPattern: /^implement$/,
    subTaskTemplates: [
      { title: '需求分析', description: '分析功能需求和验收标准', type: 'atomic' as TaskType, priority: 'high' as TaskPriority, requiredCapabilities: ['data_analysis' as AgentCapability], estimatedDuration: 45000 },
      { title: '技术设计', description: '设计技术方案和架构', type: 'atomic' as TaskType, priority: 'high' as TaskPriority, requiredCapabilities: ['data_analysis' as AgentCapability], estimatedDuration: 60000 },
      { title: '核心开发', description: '实现核心功能代码', type: 'atomic' as TaskType, priority: 'high' as TaskPriority, requiredCapabilities: ['code_generation' as AgentCapability], estimatedDuration: 180000 },
      { title: '集成测试', description: '进行集成测试和调试', type: 'atomic' as TaskType, priority: 'medium' as TaskPriority, requiredCapabilities: ['testing' as AgentCapability], estimatedDuration: 90000 },
      { title: '文档编写', description: '编写使用文档和API文档', type: 'atomic' as TaskType, priority: 'low' as TaskPriority, requiredCapabilities: ['documentation' as AgentCapability], estimatedDuration: 60000 },
    ],
    defaultDependencies: [
      { fromIndex: 0, toIndex: 1, type: 'blocks' },
      { fromIndex: 1, toIndex: 2, type: 'blocks' },
      { fromIndex: 2, toIndex: 3, type: 'blocks' },
      { fromIndex: 3, toIndex: 4, type: 'blocks' },
    ],
  },
]
