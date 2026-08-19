/**
 * Bridge 相关消息处理器
 */

import type { ChatMessage } from '../../components/office-team/types'

export interface BridgeSetters {
  setBridgeMessages: (fn: (prev: any[]) => any[]) => void
}

export interface BridgeRefs {
  bridgeCallbacks: React.MutableRefObject<Map<string, (msg: any) => void>>
}

export function handleBridgeAgentRegistered(msg: any, _setters: BridgeSetters, refs: BridgeRefs) {
  const regCallback = refs.bridgeCallbacks.current.get(`reg:${msg.tsAgentId}`)
  if (regCallback) {
    regCallback(msg)
    refs.bridgeCallbacks.current.delete(`reg:${msg.tsAgentId}`)
  }
}

export function handleBridgeMessage(msg: any, setters: BridgeSetters, refs: BridgeRefs) {
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
