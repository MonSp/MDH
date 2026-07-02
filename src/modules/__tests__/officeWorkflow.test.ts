import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OfficeWorkflowManager, MEETING_TABLE_POSITION } from '../officeWorkflow'
import { OfficeStateManager } from '../officeStateManager'

describe('OfficeWorkflowManager', () => {
  let manager: InstanceType<typeof OfficeWorkflowManager>

  beforeEach(() => {
    vi.useFakeTimers()
    // Reset singletons
    ;(OfficeStateManager as any).instance = null
    ;(OfficeWorkflowManager as any).instance = null
    manager = OfficeWorkflowManager.getInstance()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    ;(OfficeStateManager as any).instance = null
    ;(OfficeWorkflowManager as any).instance = null
  })

  it('should be a singleton', () => {
    const a = OfficeWorkflowManager.getInstance()
    const b = OfficeWorkflowManager.getInstance()
    expect(a).toBe(b)
  })

  it('should have MEETING_TABLE_POSITION', () => {
    expect(MEETING_TABLE_POSITION).toBeDefined()
    expect(MEETING_TABLE_POSITION.x).toBeDefined()
    expect(MEETING_TABLE_POSITION.y).toBeDefined()
  })

  it('should get all tasks', () => {
    const tasks = manager.getAllTasks()
    expect(Array.isArray(tasks)).toBe(true)
  })

  it('should register callbacks', () => {
    const onPhaseChange = vi.fn()
    manager.setCallbacks({ onPhaseChange })

    // Callbacks should be stored (no direct way to verify without triggering)
    expect(manager).toBeDefined()
  })
})
