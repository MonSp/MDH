import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StructuredLogger } from '../structuredLogger'

describe('StructuredLogger', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('should initialize with empty buffer', () => {
    const logger = new StructuredLogger()
    expect(logger.size()).toBe(0)
    expect(logger.getEntries()).toEqual([])
  })

  it('should log entries at different levels', () => {
    const logger = new StructuredLogger()

    logger.debug('debug msg')
    logger.info('info msg')
    logger.warn('warn msg')
    logger.error('error msg')

    expect(logger.size()).toBe(4)
  })

  it('should filter by minimum level', () => {
    const logger = new StructuredLogger(1000, 'warn')

    logger.debug('debug')
    logger.info('info')
    logger.warn('warn')
    logger.error('error')

    // Only warn and error should be stored
    expect(logger.size()).toBe(2)
    expect(logger.getEntries()[0].level).toBe('warn')
    expect(logger.getEntries()[1].level).toBe('error')
  })

  it('should filter entries by level', () => {
    const logger = new StructuredLogger()

    logger.debug('d')
    logger.info('i')
    logger.warn('w')
    logger.error('e')

    const errors = logger.getEntries({ level: 'error' })
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('e')

    const warnsAndAbove = logger.getEntries({ level: 'warn' })
    expect(warnsAndAbove).toHaveLength(2)
  })

  it('should filter by agentId', () => {
    const logger = new StructuredLogger()

    logger.info('msg1', { agentId: 'agent-1' })
    logger.info('msg2', { agentId: 'agent-2' })
    logger.info('msg3', { agentId: 'agent-1' })

    const agent1 = logger.getEntries({ agentId: 'agent-1' })
    expect(agent1).toHaveLength(2)
  })

  it('should respect maxSize', () => {
    const logger = new StructuredLogger(3)

    logger.info('a')
    logger.info('b')
    logger.info('c')
    logger.info('d')

    expect(logger.size()).toBe(3)
    expect(logger.getEntries()[0].message).toBe('b')
    expect(logger.getEntries()[2].message).toBe('d')
  })

  it('should get latest entries', () => {
    const logger = new StructuredLogger()

    logger.info('a')
    logger.info('b')
    logger.info('c')
    logger.info('d')

    const latest = logger.getLatest(2)
    expect(latest).toHaveLength(2)
    expect(latest[0].message).toBe('c')
    expect(latest[1].message).toBe('d')
  })

  it('should clear buffer', () => {
    const logger = new StructuredLogger()

    logger.info('a')
    logger.info('b')
    logger.clear()

    expect(logger.size()).toBe(0)
  })

  it('should include context in entry', () => {
    const logger = new StructuredLogger()

    logger.info('test', {
      agentId: 'agent-1',
      sessionId: 'sess-1',
      messageType: 'tool_call',
      data: { tool: 'bash' },
    })

    const entry = logger.getEntries()[0]
    expect(entry.agentId).toBe('agent-1')
    expect(entry.sessionId).toBe('sess-1')
    expect(entry.messageType).toBe('tool_call')
    expect(entry.data).toEqual({ tool: 'bash' })
  })
})
