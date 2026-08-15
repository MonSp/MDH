import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

// vi.hoisted：mock 实例在 import 之前初始化，供 hoisted vi.mock factory 引用
const { getPendingApprovals, useMeetingSocketMock, useAgentSystemMock } = vi.hoisted(() => {
  // stub 覆盖 OfficeTeamMode 从 useMeetingSocket 解构的全部返回值
  const getPendingApprovals = vi.fn()
  const useMeetingSocketMock = vi.fn(() => ({
    agents: [],
    tasks: [],
    chatMessages: [],
    isMeetingActive: false,
    lastWorkflow: null,
    agendaState: null,
    workspace: null,
    toolCallLogs: [],
    clearWorkflow: vi.fn(),
    startMeeting: vi.fn(),
    sendMeetingMessage: vi.fn(),
    endMeeting: vi.fn(),
    sendAgendaAction: vi.fn(),
    sendToolCall: vi.fn(),
    sendWorkspaceAction: vi.fn(),
    activeProposal: null,
    votes: [],
    voteResults: null,
    createProposal: vi.fn(),
    castVote: vi.fn(),
    evaluateConsensus: vi.fn(),
    // 人工审批
    pendingApprovals: new Map(),
    sendApprovalResponse: vi.fn(),
    getPendingApprovals,
    // 检查点
    checkpoints: [],
    restoredState: null,
    saveCheckpoint: vi.fn(),
    restoreCheckpoint: vi.fn(),
    getCheckpoints: vi.fn(),
    deleteCheckpoint: vi.fn(),
    clearRestoredState: vi.fn(),
    // 审计日志
    auditLog: [],
    getAuditLog: vi.fn(),
    // 迭代配置
    maxIterations: 3,
    setMaxIterations: vi.fn(),
    // 权重调整
    adjustAgentWeight: vi.fn(),
  }))

  // stub 覆盖 OfficeTeamMode 从 useAgentSystem 解构的全部返回值
  const useAgentSystemMock = vi.fn(() => ({
    agents: [],
    createAgent: vi.fn(),
    removeAgent: vi.fn(),
    sendAgentMessage: vi.fn(),
    onAgentMessage: vi.fn(),
    getPythonId: vi.fn(() => ''),
    registerToPython: vi.fn(),
  }))

  return { getPendingApprovals, useMeetingSocketMock, useAgentSystemMock }
})

vi.mock('../../hooks/useMeetingSocket', () => ({
  default: useMeetingSocketMock,
  // OfficeHeader 从 useMeetingSocket 具名导入 PHASE_LABELS（运行时值）
  PHASE_LABELS: {
    idle: '等待中',
    analyzing: '需求分析',
    planning: '项目规划',
    discussing: '团队讨论',
    assigning: '任务分派',
    executing: '代码执行',
    reviewing: '质量审查',
    summarizing: '生成报告',
    done: '已完成',
  },
}))
vi.mock('../../hooks/useAgentSystem', () => ({ useAgentSystem: useAgentSystemMock }))

// TechTowerView 引入 three.js 生态（@react-three/fiber/drei + cyberpunk 模块加载时
// 即生成 canvas 纹理），在 jsdom 无 canvas 上下文环境下无法渲染 → 以空组件替换。
// 本用例只关注 OfficeTeamMode 挂载拉取行为，tower 子树非本测试关注点。
vi.mock('../TechTowerView', () => ({ default: () => null }))

import OfficeTeamMode from '../OfficeTeamMode'

describe('OfficeTeamMode 审批拉取', () => {
  beforeEach(() => {
    getPendingApprovals.mockClear()
  })

  it('挂载时调用 getPendingApprovals 拉取已富化审批列表', () => {
    render(<OfficeTeamMode wsRef={{ current: null }} onBackToSingle={() => {}} />)
    expect(useMeetingSocketMock).toHaveBeenCalled()
    expect(useAgentSystemMock).toHaveBeenCalled()
    expect(getPendingApprovals).toHaveBeenCalled()
  })
})
