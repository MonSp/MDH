import { describe, it, expect, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import MeetingChatPanel from '../MeetingChatPanel'
import type { TeamAgent, ChatMessage } from '../types'

// Mock scrollIntoView
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

const mockAgents: TeamAgent[] = [
  { id: 'agent-ceo', name: 'agent-ceo', role: 'coordinator', status: 'idle', capabilities: [] },
  { id: 'agent-executor', name: 'agent-executor', role: 'executor', status: 'idle', capabilities: [] },
]

const mockMessages: ChatMessage[] = [
  { role: 'boss', content: '会议已开始', timestamp: Date.now() },
  { role: 'agent', agentId: 'agent-ceo', content: '收到任务', timestamp: Date.now() },
  { role: 'agent', agentId: 'agent-executor', content: '开始执行', timestamp: Date.now() },
]

describe('MeetingChatPanel', () => {
  it('renders chat panel with messages', () => {
    render(
      <MeetingChatPanel
        agents={mockAgents}
        messages={mockMessages}
        onEndMeeting={() => {}}
      />
    )
    expect(screen.getByText(/会议讨论/)).toBeDefined()
    expect(screen.getByText('会议已开始')).toBeDefined()
    expect(screen.getByText('收到任务')).toBeDefined()
  })

  it('renders end meeting button', () => {
    render(
      <MeetingChatPanel
        agents={mockAgents}
        messages={[]}
        onEndMeeting={() => {}}
      />
    )
    expect(screen.getByText('结束会议')).toBeDefined()
  })

  it('displays message count', () => {
    render(
      <MeetingChatPanel
        agents={mockAgents}
        messages={mockMessages}
        onEndMeeting={() => {}}
      />
    )
    expect(screen.getByText('3 条')).toBeDefined()
  })

  it('renders boss messages with correct styling', () => {
    render(
      <MeetingChatPanel
        agents={mockAgents}
        messages={[{ role: 'boss', content: '测试消息', timestamp: Date.now() }]}
        onEndMeeting={() => {}}
      />
    )
    expect(screen.getByText('👔 老板')).toBeDefined()
  })

  it('renders agent messages with agent name', () => {
    render(
      <MeetingChatPanel
        agents={mockAgents}
        messages={[{ role: 'agent', agentId: 'agent-executor', content: '执行中', timestamp: Date.now() }]}
        onEndMeeting={() => {}}
      />
    )
    expect(screen.getByText('执行中')).toBeDefined()
  })

  it('renders agenda phase badge when provided', () => {
    render(
      <MeetingChatPanel
        agents={mockAgents}
        messages={[]}
        onEndMeeting={() => {}}
        agendaPhase="discussion"
      />
    )
    expect(screen.getByText(/讨论中/)).toBeDefined()
  })

  it('renders file write messages', () => {
    render(
      <MeetingChatPanel
        agents={mockAgents}
        messages={[{ role: 'agent', agentId: 'agent-executor', content: '已写入 2 个文件: src/a.ts, src/b.ts', timestamp: Date.now() }]}
        onEndMeeting={() => {}}
      />
    )
    expect(screen.getByText('写入文件')).toBeDefined()
  })

  it('renders stance badges', () => {
    render(
      <MeetingChatPanel
        agents={mockAgents}
        messages={[{ role: 'agent', agentId: 'agent-executor', content: '支持方案', timestamp: Date.now(), _stance: 'support', _confidence: 0.9 }]}
        onEndMeeting={() => {}}
      />
    )
    expect(screen.getByText('👍 支持')).toBeDefined()
    expect(screen.getByText('置信度 90%')).toBeDefined()
  })
})
