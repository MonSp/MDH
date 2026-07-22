import { contextBridge, ipcRenderer } from 'electron';

// ─── IPC API 暴露给渲染进程 ───

export interface MdhApi {
  invoke: (channel: string, data?: unknown) => Promise<unknown>;
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  off: (channel: string, callback: (...args: unknown[]) => void) => void;
  isElectron: boolean;
  platform: string;
}

// 允许的 IPC 通道白名单
const VALID_INVOKE_CHANNELS = [
  // 会议控制
  'mdh:startMeeting',
  'mdh:sendMessage',
  'mdh:stopMeeting',
  'mdh:castVote',
  'mdh:approval',
  'mdh:workspaceConfirmResponse',
  // 配置
  'mdh:getLlmConfig',
  'mdh:setLlmConfig',
  'mdh:getFullConfig',
  'mdh:getHealth',
  // 工作区
  'mdh:getWorkspace',
  'mdh:setWorkspace',
  'mdh:selectWorkspace',
  // 角色
  'mdh:getRoles',
  'mdh:getTeamPresets',
  // 更新
  'mdh:checkForUpdate',
  'mdh:downloadUpdate',
  'mdh:installUpdate',
  'mdh:getAppVersion',
];

const VALID_RECEIVE_CHANNELS = [
  'mdh:onAgentMessage',
  'mdh:onStatusChange',
  'mdh:onAgendaUpdate',
  'mdh:onApprovalRequest',
  'mdh:onWorkspaceConfirm',
  'mdh:onProgress',
  'mdh:onError',
  'mdh:onUpdateStatus',
];

const mdhApi: MdhApi = {
  invoke: (channel: string, data?: unknown) => {
    if (VALID_INVOKE_CHANNELS.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
    return Promise.reject(new Error(`不允许的 IPC 通道: ${channel}`));
  },

  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (VALID_RECEIVE_CHANNELS.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },

  off: (channel: string, callback: (...args: unknown[]) => void) => {
    if (VALID_RECEIVE_CHANNELS.includes(channel)) {
      ipcRenderer.removeListener(channel, callback);
    }
  },

  isElectron: true,
  platform: process.platform,
};

contextBridge.exposeInMainWorld('mdh', mdhApi);
