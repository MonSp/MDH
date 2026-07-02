import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

describe('useBrowserStorage', () => {
  let mockStorage: any

  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    mockStorage = {
      init: vi.fn().mockResolvedValue(undefined),
      getProjects: vi.fn().mockResolvedValue([]),
      saveProject: vi.fn().mockResolvedValue(undefined),
      deleteProject: vi.fn().mockResolvedValue(undefined),
      getProject: vi.fn().mockResolvedValue(null),
      exportAll: vi.fn().mockResolvedValue('{}'),
    }
    vi.doMock('../services/browserStorage', () => ({
      browserStorage: mockStorage,
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.doUnmock('../services/browserStorage')
  })

  it('should initialize and set isReady', async () => {
    const { useBrowserStorage } = await import('../hooks/useBrowserStorage')
    const { result } = renderHook(() => useBrowserStorage())

    expect(result.current.isReady).toBe(false)

    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    expect(result.current.isReady).toBe(true)
    expect(result.current.projects).toEqual([])
    expect(mockStorage.init).toHaveBeenCalled()
  })

  it('should expose CRUD methods', async () => {
    const { useBrowserStorage } = await import('../hooks/useBrowserStorage')
    const { result } = renderHook(() => useBrowserStorage())
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    expect(result.current.createProject).toBeInstanceOf(Function)
    expect(result.current.deleteProject).toBeInstanceOf(Function)
    expect(result.current.addTask).toBeInstanceOf(Function)
    expect(result.current.getCategories).toBeInstanceOf(Function)
  })

  it('should load projects on init', async () => {
    mockStorage.getProjects.mockResolvedValueOnce([
      { project_id: 'p1', name: 'Project 1', status: 'active', category: 'dev', created_at: '', tasks: [] },
    ])

    const { useBrowserStorage } = await import('../hooks/useBrowserStorage')
    const { result } = renderHook(() => useBrowserStorage())
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    expect(result.current.projects).toHaveLength(1)
    expect(result.current.projects[0].name).toBe('Project 1')
  })

  it('should compute categories', async () => {
    mockStorage.getProjects.mockResolvedValueOnce([
      { project_id: 'p1', name: 'P1', status: 'active', category: '开发', created_at: '', tasks: [] },
      { project_id: 'p2', name: 'P2', status: 'active', category: '设计', created_at: '', tasks: [] },
      { project_id: 'p3', name: 'P3', status: 'active', category: '开发', created_at: '', tasks: [] },
    ])

    const { useBrowserStorage } = await import('../hooks/useBrowserStorage')
    const { result } = renderHook(() => useBrowserStorage())
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })

    const categories = result.current.getCategories()
    expect(Object.keys(categories)).toHaveLength(2)
    expect(categories['开发']).toHaveLength(2)
  })
})
