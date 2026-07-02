import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1

  readyState = MockWebSocket.CONNECTING
  url: string
  send = vi.fn()
  close = vi.fn()
  private listeners: Record<string, Function[]> = {}

  addEventListener(event: string, handler: Function) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(handler)
  }

  removeEventListener(event: string, handler: Function) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(h => h !== handler)
    }
  }

  emit(event: string, data?: any) {
    for (const h of this.listeners[event] || []) h(data)
  }

  constructor(url: string) {
    this.url = url
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      this.emit('open')
    }, 0)
  }
}

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    clear: () => { store = {} },
  }
})()

describe('useMeetingSocket', () => {
  let originalWebSocket: typeof globalThis.WebSocket
  let originalStorage: typeof globalThis.localStorage

  beforeEach(() => {
    vi.useFakeTimers()
    originalWebSocket = globalThis.WebSocket
    originalStorage = globalThis.localStorage
    globalThis.WebSocket = MockWebSocket as any
    globalThis.localStorage = localStorageMock as any
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    globalThis.WebSocket = originalWebSocket
    globalThis.localStorage = originalStorage
  })

  it('should export PHASE_LABELS', async () => {
    const { PHASE_LABELS } = await import('../hooks/useMeetingSocket')
    expect(Object.keys(PHASE_LABELS)).toHaveLength(9)
    expect(PHASE_LABELS.idle).toBe('等待中')
    expect(PHASE_LABELS.executing).toBe('代码执行')
  })

  it('should initialize with idle phase', async () => {
    const { default: useMeetingSocket } = await import('../hooks/useMeetingSocket')
    const wsRef = { current: null as any }
    const { result } = renderHook(() => useMeetingSocket({ wsRef }))

    expect(result.current.meetingPhase).toBe('idle')
    expect(result.current.agents).toEqual([])
    expect(result.current.isMeetingActive).toBe(false)
  })

  it('should handle meeting_started', async () => {
    const { default: useMeetingSocket } = await import('../hooks/useMeetingSocket')
    const ws = new MockWebSocket('ws://test')
    ws.readyState = MockWebSocket.OPEN
    const wsRef = { current: ws as any }

    const { result } = renderHook(() => useMeetingSocket({ wsRef }))

    act(() => {
      ws.emit('message', {
        data: JSON.stringify({
          type: 'meeting_started',
          meeting_id: 'test-123',
          agents: [
            { id: 'agent-ceo', name: 'CTO', role: 'ceo' },
            { id: 'agent-executor', name: 'Dev', role: 'executor' },
          ],
        }),
      })
    })

    expect(result.current.meetingId).toBe('test-123')
    expect(result.current.agents).toHaveLength(2)
    expect(result.current.isMeetingActive).toBe(true)
    expect(result.current.meetingPhase).toBe('analyzing')
  })

  it('should handle agenda_update', async () => {
    const { default: useMeetingSocket } = await import('../hooks/useMeetingSocket')
    const ws = new MockWebSocket('ws://test')
    ws.readyState = MockWebSocket.OPEN
    const wsRef = { current: ws as any }

    const { result } = renderHook(() => useMeetingSocket({ wsRef }))

    // Start meeting first
    act(() => {
      ws.emit('message', {
        data: JSON.stringify({
          type: 'meeting_started',
          meeting_id: 'test',
          agents: [{ id: 'agent-planner', name: 'Planner', role: 'planner' }],
        }),
      })
    })

    // Update agenda
    act(() => {
      ws.emit('message', {
        data: JSON.stringify({
          type: 'agenda_update',
          phase: 'discussion',
          topic: 'Test topic',
          current_speaker: 'agent-planner',
          token_queue: [],
          event_history: [],
        }),
      })
    })

    expect(result.current.agendaState?.phase).toBe('discussion')
    // meetingPhase 是会议阶段，不受 agenda_update 影响
    expect(result.current.meetingPhase).toBe('analyzing')
  })

  it('should handle tool_result', async () => {
    const { default: useMeetingSocket } = await import('../hooks/useMeetingSocket')
    const ws = new MockWebSocket('ws://test')
    ws.readyState = MockWebSocket.OPEN
    const wsRef = { current: ws as any }

    const { result } = renderHook(() => useMeetingSocket({ wsRef }))

    act(() => {
      ws.emit('message', {
        data: JSON.stringify({
          type: 'tool_result',
          tool_name: 'write_file',
          success: true,
          output: 'File created',
          timestamp: new Date().toISOString(),
        }),
      })
    })

    expect(result.current.toolCallLogs).toHaveLength(1)
    expect(result.current.toolCallLogs[0].tool_name).toBe('write_file')
  })

  it('should handle meeting_ended', async () => {
    const { default: useMeetingSocket } = await import('../hooks/useMeetingSocket')
    const ws = new MockWebSocket('ws://test')
    ws.readyState = MockWebSocket.OPEN
    const wsRef = { current: ws as any }

    const { result } = renderHook(() => useMeetingSocket({ wsRef }))

    // Start meeting
    act(() => {
      ws.emit('message', {
        data: JSON.stringify({
          type: 'meeting_started',
          meeting_id: 'test',
          agents: [],
        }),
      })
    })
    expect(result.current.isMeetingActive).toBe(true)

    // End meeting
    act(() => {
      ws.emit('message', { data: JSON.stringify({ type: 'meeting_ended' }) })
    })
    expect(result.current.isMeetingActive).toBe(false)
  })

  it('should send startMeeting', async () => {
    const { default: useMeetingSocket } = await import('../hooks/useMeetingSocket')
    const ws = new MockWebSocket('ws://test')
    ws.readyState = MockWebSocket.OPEN
    const wsRef = { current: ws as any }

    const { result } = renderHook(() => useMeetingSocket({ wsRef }))

    act(() => { result.current.startMeeting() })

    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"start_meeting"'))
  })
})
