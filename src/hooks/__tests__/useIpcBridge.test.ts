import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { isElectron, useIpcBridge, useMeetingControl, useConfig, useWorkspace } from '../useIpcBridge'

describe('useIpcBridge', () => {
  afterEach(() => {
    Object.defineProperty(window, 'mdh', { value: undefined, writable: true })
  })

  describe('isElectron', () => {
    it('should return false when window.mdh is not defined', () => {
      expect(isElectron()).toBe(false)
    })

    it('should return true when window.mdh.isElectron is true', () => {
      Object.defineProperty(window, 'mdh', {
        value: { isElectron: true },
        writable: true,
      })
      expect(isElectron()).toBe(true)
    })
  })

  describe('useIpcBridge hook', () => {
    it('should return disconnected state in browser', () => {
      const { result } = renderHook(() => useIpcBridge())
      expect(result.current.connected).toBe(false)
      expect(result.current.isElectron).toBe(false)
    })

    it('should return connected state in Electron', () => {
      Object.defineProperty(window, 'mdh', {
        value: {
          isElectron: true,
          platform: 'linux',
          invoke: vi.fn(),
          on: vi.fn(),
          off: vi.fn(),
        },
        writable: true,
      })

      const { result } = renderHook(() => useIpcBridge())
      expect(result.current.connected).toBe(true)
      expect(result.current.isElectron).toBe(true)
    })

    it('invoke should call window.mdh.invoke in Electron', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({ status: 'ok' })
      Object.defineProperty(window, 'mdh', {
        value: {
          isElectron: true,
          platform: 'linux',
          invoke: mockInvoke,
          on: vi.fn(),
          off: vi.fn(),
        },
        writable: true,
      })

      const { result } = renderHook(() => useIpcBridge())
      const response = await result.current.invoke('mdh:getHealth')

      expect(mockInvoke).toHaveBeenCalledWith('mdh:getHealth', undefined)
      expect(response).toEqual({ status: 'ok' })
    })

    it('invoke should return null in browser', async () => {
      const { result } = renderHook(() => useIpcBridge())
      const response = await result.current.invoke('mdh:getHealth')
      expect(response).toBeNull()
    })

    it('on should register listener in Electron', () => {
      const mockOn = vi.fn()
      Object.defineProperty(window, 'mdh', {
        value: {
          isElectron: true,
          platform: 'linux',
          invoke: vi.fn(),
          on: mockOn,
          off: vi.fn(),
        },
        writable: true,
      })

      const { result } = renderHook(() => useIpcBridge())
      const callback = vi.fn()
      result.current.on('mdh:onAgentMessage', callback)

      expect(mockOn).toHaveBeenCalledWith('mdh:onAgentMessage', callback)
    })
  })

  describe('useMeetingControl', () => {
    it('should expose meeting control methods', () => {
      const { result } = renderHook(() => useMeetingControl())
      expect(result.current.isElectron).toBe(false)
      expect(typeof result.current.startMeeting).toBe('function')
      expect(typeof result.current.sendMessage).toBe('function')
      expect(typeof result.current.stopMeeting).toBe('function')
      expect(typeof result.current.castVote).toBe('function')
      expect(typeof result.current.respondApproval).toBe('function')
      expect(typeof result.current.onAgentMessage).toBe('function')
      expect(typeof result.current.onError).toBe('function')
    })

    it('startMeeting should invoke IPC in Electron', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({ status: 'started' })
      Object.defineProperty(window, 'mdh', {
        value: {
          isElectron: true,
          platform: 'linux',
          invoke: mockInvoke,
          on: vi.fn(),
          off: vi.fn(),
        },
        writable: true,
      })

      const { result } = renderHook(() => useMeetingControl())
      await act(async () => {
        const response = await result.current.startMeeting('测试任务', ['executor'])
        expect(response).toEqual({ status: 'started' })
      })

      expect(mockInvoke).toHaveBeenCalledWith('mdh:startMeeting', {
        task: '测试任务',
        roles: ['executor'],
      })
    })

    it('startMeeting should return null in browser', async () => {
      const { result } = renderHook(() => useMeetingControl())
      await act(async () => {
        const response = await result.current.startMeeting('测试任务', ['executor'])
        expect(response).toBeNull()
      })
    })
  })

  describe('useConfig', () => {
    it('should expose config methods', () => {
      const { result } = renderHook(() => useConfig())
      expect(typeof result.current.getLlmConfig).toBe('function')
      expect(typeof result.current.setLlmConfig).toBe('function')
      expect(typeof result.current.getHealth).toBe('function')
      expect(typeof result.current.getRoles).toBe('function')
      expect(typeof result.current.getTeamPresets).toBe('function')
    })

    it('getLlmConfig should invoke IPC in Electron', async () => {
      const mockConfig = { provider: 'deepseek', hasApiKey: true }
      const mockInvoke = vi.fn().mockResolvedValue(mockConfig)
      Object.defineProperty(window, 'mdh', {
        value: {
          isElectron: true,
          platform: 'linux',
          invoke: mockInvoke,
          on: vi.fn(),
          off: vi.fn(),
        },
        writable: true,
      })

      const { result } = renderHook(() => useConfig())
      const config = await result.current.getLlmConfig()
      expect(config).toEqual(mockConfig)
      expect(mockInvoke).toHaveBeenCalledWith('mdh:getLlmConfig', undefined)
    })
  })

  describe('useWorkspace', () => {
    it('should expose workspace methods', () => {
      const { result } = renderHook(() => useWorkspace())
      expect(typeof result.current.getWorkspace).toBe('function')
      expect(typeof result.current.setWorkspace).toBe('function')
      expect(typeof result.current.selectWorkspace).toBe('function')
    })

    it('selectWorkspace should invoke IPC in Electron', async () => {
      const mockResult = { canceled: false, path: '/home/user/project' }
      const mockInvoke = vi.fn().mockResolvedValue(mockResult)
      Object.defineProperty(window, 'mdh', {
        value: {
          isElectron: true,
          platform: 'linux',
          invoke: mockInvoke,
          on: vi.fn(),
          off: vi.fn(),
        },
        writable: true,
      })

      const { result } = renderHook(() => useWorkspace())
      const response = await result.current.selectWorkspace()
      expect(response).toEqual(mockResult)
      expect(mockInvoke).toHaveBeenCalledWith('mdh:selectWorkspace', undefined)
    })
  })
})
