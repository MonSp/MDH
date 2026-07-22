/**
 * useIpcBridge — Electron IPC 适配层
 *
 * 检测运行环境，自动切换通信方式：
 * - Electron: 通过 window.mdh (IPC) 通信
 * - 浏览器: 通过 WebSocket 通信（回退到现有逻辑）
 */

import { useEffect, useRef, useCallback, useState } from 'react';

// ─── 类型声明 ───
interface MdhApi {
  invoke: (channel: string, data?: unknown) => Promise<unknown>;
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  off: (channel: string, callback: (...args: unknown[]) => void) => void;
  isElectron: boolean;
  platform: string;
}

declare global {
  interface Window {
    mdh?: MdhApi;
  }
}

// ─── 事件类型 ───
export interface AgentMessageEvent {
  type: string;
  phase?: string;
  agentId?: string;
  content?: string;
  meetingId?: string;
  agents?: Array<{
    id: string;
    name: string;
    role: string;
    status: string;
    capabilities: string[];
  }>;
  result?: string;
  [key: string]: unknown;
}

export type AgentMessageHandler = (event: AgentMessageEvent) => void;
export type ErrorHandler = (error: { type: string; message: string }) => void;

// ─── 环境检测 ───
export function isElectron(): boolean {
  return typeof window !== 'undefined' && window.mdh?.isElectron === true;
}

// ─── IPC Bridge Hook ───
export function useIpcBridge() {
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef<Map<string, Set<Function>>>(new Map());

  useEffect(() => {
    if (isElectron()) {
      setConnected(true);
    }
  }, []);

  // 发送消息到主进程
  const invoke = useCallback(async (channel: string, data?: unknown) => {
    if (!isElectron()) {
      console.warn('[useIpcBridge] 非 Electron 环境，invoke 无效:', channel);
      return null;
    }
    try {
      return await window.mdh!.invoke(channel, data);
    } catch (e) {
      console.error('[useIpcBridge] invoke 失败:', channel, e);
      return null;
    }
  }, []);

  // 监听主进程推送
  const on = useCallback((channel: string, callback: (...args: unknown[]) => void) => {
    if (!isElectron()) return;
    if (!listenersRef.current.has(channel)) {
      listenersRef.current.set(channel, new Set());
    }
    listenersRef.current.get(channel)!.add(callback);
    window.mdh!.on(channel, callback);
  }, []);

  // 移除监听
  const off = useCallback((channel: string, callback: (...args: unknown[]) => void) => {
    if (!isElectron()) return;
    window.mdh!.off(channel, callback);
    listenersRef.current.get(channel)?.delete(callback);
  }, []);

  // 清理所有监听器
  useEffect(() => {
    return () => {
      if (isElectron()) {
        for (const [channel, callbacks] of listenersRef.current) {
          for (const cb of callbacks) {
            window.mdh!.off(channel, cb);
          }
        }
      }
    };
  }, []);

  return { connected, invoke, on, off, isElectron: isElectron() };
}

// ─── 会议控制 Hook ───
export function useMeetingControl() {
  const { invoke, on, off, isElectron: isElect } = useIpcBridge();
  const messageHandlers = useRef<Set<AgentMessageHandler>>(new Set());
  const errorHandlers = useRef<Set<ErrorHandler>>(new Set());

  // 注册消息监听
  useEffect(() => {
    if (!isElect) return;

    const handleMessage = (...args: unknown[]) => {
      const event = args[0] as AgentMessageEvent;
      for (const handler of messageHandlers.current) {
        handler(event);
      }
    };

    const handleError = (...args: unknown[]) => {
      const error = args[0] as { type: string; message: string };
      for (const handler of errorHandlers.current) {
        handler(error);
      }
    };

    on('mdh:onAgentMessage', handleMessage);
    on('mdh:onError', handleError);

    return () => {
      off('mdh:onAgentMessage', handleMessage);
      off('mdh:onError', handleError);
    };
  }, [isElect, on, off]);

  // 注册消息回调
  const onAgentMessage = useCallback((handler: AgentMessageHandler) => {
    messageHandlers.current.add(handler);
    return () => messageHandlers.current.delete(handler);
  }, []);

  // 注册错误回调
  const onError = useCallback((handler: ErrorHandler) => {
    errorHandlers.current.add(handler);
    return () => errorHandlers.current.delete(handler);
  }, []);

  // 启动会议
  const startMeeting = useCallback(async (task: string, roles: string[]) => {
    if (!isElect) return null;
    return invoke('mdh:startMeeting', { task, roles });
  }, [isElect, invoke]);

  // 发送消息
  const sendMessage = useCallback(async (content: string, roles?: string[]) => {
    if (!isElect) return null;
    return invoke('mdh:sendMessage', { content, roles });
  }, [isElect, invoke]);

  // 停止会议
  const stopMeeting = useCallback(async () => {
    if (!isElect) return null;
    return invoke('mdh:stopMeeting');
  }, [isElect, invoke]);

  // 投票
  const castVote = useCallback(async (proposalId: string, approve: boolean, reason?: string) => {
    if (!isElect) return null;
    return invoke('mdh:castVote', { proposalId, approve, reason });
  }, [isElect, invoke]);

  // 审批
  const respondApproval = useCallback(async (requestId: string, approved: boolean, reason?: string) => {
    if (!isElect) return null;
    return invoke('mdh:approval', { requestId, approved, reason });
  }, [isElect, invoke]);

  return {
    isElectron: isElect,
    startMeeting,
    sendMessage,
    stopMeeting,
    castVote,
    respondApproval,
    onAgentMessage,
    onError,
  };
}

// ─── 配置管理 Hook ───
export function useConfig() {
  const { invoke, isElectron: isElect } = useIpcBridge();

  const getLlmConfig = useCallback(async () => {
    if (!isElect) return null;
    return invoke('mdh:getLlmConfig');
  }, [isElect, invoke]);

  const setLlmConfig = useCallback(async (config: Record<string, string>) => {
    if (!isElect) return null;
    return invoke('mdh:setLlmConfig', config);
  }, [isElect, invoke]);

  const getHealth = useCallback(async () => {
    if (!isElect) return null;
    return invoke('mdh:getHealth');
  }, [isElect, invoke]);

  const getRoles = useCallback(async () => {
    if (!isElect) return null;
    return invoke('mdh:getRoles');
  }, [isElect, invoke]);

  const getTeamPresets = useCallback(async () => {
    if (!isElect) return null;
    return invoke('mdh:getTeamPresets');
  }, [isElect, invoke]);

  const getFullConfig = useCallback(async () => {
    if (!isElect) return null;
    return invoke('mdh:getFullConfig');
  }, [isElect, invoke]);

  return { getLlmConfig, setLlmConfig, getFullConfig, getHealth, getRoles, getTeamPresets };
}

// ─── 工作区管理 Hook ───
export function useWorkspace() {
  const { invoke, isElectron: isElect } = useIpcBridge();

  const getWorkspace = useCallback(async () => {
    if (!isElect) return null;
    return invoke('mdh:getWorkspace');
  }, [isElect, invoke]);

  const setWorkspace = useCallback(async (path: string) => {
    if (!isElect) return null;
    return invoke('mdh:setWorkspace', { path });
  }, [isElect, invoke]);

  const selectWorkspace = useCallback(async () => {
    if (!isElect) return null;
    return invoke('mdh:selectWorkspace');
  }, [isElect, invoke]);

  return { getWorkspace, setWorkspace, selectWorkspace };
}

// ─── 自动更新 Hook ───
export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  releaseDate?: string;
  releaseNotes?: string;
  percent?: number;
  bytesPerSecond?: number;
  message?: string;
}

export function useAutoUpdate() {
  const { invoke, on, off, isElectron: isElect } = useIpcBridge();
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    if (!isElect) return;

    const handleUpdate = (...args: unknown[]) => {
      const status = args[0] as UpdateStatus;
      setUpdateStatus(status);
    };

    on('mdh:onUpdateStatus', handleUpdate);
    return () => off('mdh:onUpdateStatus', handleUpdate);
  }, [isElect, on, off]);

  const checkForUpdate = useCallback(async () => {
    if (!isElect) return null;
    return invoke('mdh:checkForUpdate');
  }, [isElect, invoke]);

  const downloadUpdate = useCallback(async () => {
    if (!isElect) return null;
    return invoke('mdh:downloadUpdate');
  }, [isElect, invoke]);

  const installUpdate = useCallback(async () => {
    if (!isElect) return null;
    return invoke('mdh:installUpdate');
  }, [isElect, invoke]);

  const getAppVersion = useCallback(async () => {
    if (!isElect) return null;
    return invoke('mdh:getAppVersion');
  }, [isElect, invoke]);

  return {
    updateStatus,
    checkForUpdate,
    downloadUpdate,
    installUpdate,
    getAppVersion,
  };
}
