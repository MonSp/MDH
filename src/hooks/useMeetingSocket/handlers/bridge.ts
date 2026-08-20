/**
 * Bridge 相关消息处理器
 */

import type { ChatMessage } from '../../components/office-team/types'

export interface BridgeMessage {
  tsAgentId?: string
  pyAgentId?: string
  fromAgentId?: string
  toAgentId?: string
  payload?: Record<string, unknown>
}

export interface BridgeSetters {
  setBridgeMessages: (fn: (prev: Array<{ fromAgentId: string; toAgentId: string; payload: unknown; timestamp: number }>) => Array<{ fromAgentId: string; toAgentId: string; payload: unknown; timestamp: number }>) => void
}

export interface BridgeRefs {
  bridgeCallbacks: React.MutableRefObject<Map<string, (msg: BridgeMessage) => void>>
}

export function handleBridgeAgentRegistered(msg: BridgeMessage, _setters: BridgeSetters, refs: BridgeRefs) {
  const regCallback = refs.bridgeCallbacks.current.get(`reg:${msg.tsAgentId}`)
  if (regCallback) {
    regCallback(msg)
    refs.bridgeCallbacks.current.delete(`reg:${msg.tsAgentId}`)
  }
}

export function handleBridgeMessage(msg: BridgeMessage, setters: BridgeSetters, refs: BridgeRefs) {
  const msgCallback = refs.bridgeCallbacks.current.get(`msg:${msg.toAgentId}`)
  if (msgCallback) {
    msgCallback(msg)
  }
  setters.setBridgeMessages(prev => [...prev, {
    fromAgentId: msg.fromAgentId,
    toAgentId: msg.toAgentId,
    payload: msg.payload,
    timestamp: Date.now(),
  }])
}
