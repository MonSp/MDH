import { describe, it, expect, vi } from 'vitest'
import { handleBridgeAgentRegistered, handleBridgeMessage } from './bridge'
import type { BridgeSetters, BridgeRefs } from './bridge'

function makeSetters(): BridgeSetters {
  return {
    setBridgeMessages: vi.fn(fn => fn([])),
  }
}

function makeRefs(): BridgeRefs {
  return {
    bridgeCallbacks: { current: new Map() },
  }
}

describe('bridge handlers', () => {
  describe('handleBridgeAgentRegistered', () => {
    it('calls registration callback and cleans up', () => {
      const setters = makeSetters()
      const refs = makeRefs()
      const callback = vi.fn()
      refs.bridgeCallbacks.current.set('reg:ts-1', callback)

      handleBridgeAgentRegistered({ tsAgentId: 'ts-1', pyAgentId: 'py-1' }, setters, refs)

      expect(callback).toHaveBeenCalledWith({ tsAgentId: 'ts-1', pyAgentId: 'py-1' })
      expect(refs.bridgeCallbacks.current.has('reg:ts-1')).toBe(false)
    })

    it('does nothing if no callback registered', () => {
      const setters = makeSetters()
      const refs = makeRefs()
      handleBridgeAgentRegistered({ tsAgentId: 'ts-1' }, setters, refs)
      // No error
    })
  })

  describe('handleBridgeMessage', () => {
    it('calls message callback and adds to bridge messages', () => {
      const setters = makeSetters()
      const refs = makeRefs()
      const callback = vi.fn()
      refs.bridgeCallbacks.current.set('msg:ts-1', callback)

      handleBridgeMessage({
        fromAgentId: 'py-1', toAgentId: 'ts-1', payload: { data: 'hello' },
      }, setters, refs)

      expect(callback).toHaveBeenCalled()
      expect(setters.setBridgeMessages).toHaveBeenCalled()
      const fn = (setters.setBridgeMessages as any).mock.calls[0][0]
      const result = fn([])
      expect(result[0].fromAgentId).toBe('py-1')
      expect(result[0].toAgentId).toBe('ts-1')
    })

    it('adds message even without callback', () => {
      const setters = makeSetters()
      const refs = makeRefs()

      handleBridgeMessage({
        fromAgentId: 'py-1', toAgentId: 'ts-1', payload: {},
      }, setters, refs)

      expect(setters.setBridgeMessages).toHaveBeenCalled()
    })
  })
})
