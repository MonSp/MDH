import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sender } from '@agentscope-ai/chat';
import { getFriendlyName } from './modules/commands';
import { retryWithBackoff } from './modules/retry';
import { extractSkillParams, stepsToServerFormat, buildSkillPrompt } from './modules/skillParser';

import AppHeader from './components/AppHeader';
import ConversationStream, { type Conversation } from './components/ConversationStream';
import SettingsPanel from './components/SettingsPanel';
import SkillPanel from './components/SkillPanel';
import type { ToolStep } from './components/ToolTree';

const AGENT_URL_DEFAULT = `ws://${window.location.hostname}:8765/ws`;
const STORAGE_AGENT_URL = 'agentscope_url';
const STORAGE_API_KEY = 'deepseek_api_key';
const STORAGE_BASE_URL = 'deepseek_base_url';
const STORAGE_PROVIDER = 'llm_provider';
const STORAGE_MODEL_NAME = 'llm_model_name';
const STORAGE_MULTIMODAL = 'llm_multimodal';
const STORAGE_CONVERSATIONS = 'agent_conversations';
const SSO_TOKEN_KEY = 'sso_auth_token';
const SSO_USERNAME_KEY = 'sso_auth_username';

const PARENT_ORIGIN = 'chrome://ai-automation-side-panel.top-chrome';
const PROTOCOL_VERSION = '1.3';
const MIN_SUPPORTED_VERSION = '1.1';

interface SkillInfo {
  name: string;
  description: string;
  dir: string;
  type?: string;
}

interface EditingSkill {
  name: string;
  description: string;
  params: Array<{ key: string; label: string; defaultValue: string }>;
  steps: Array<{ command: string; payload: Record<string, any> }>;
  skillType: string;
  generating: boolean;
}

interface SettingsConfig {
  agentUrl: string;
  provider: string;
  modelName: string;
  apiKey: string;
  baseUrl: string;
  multimodal: boolean;
}

export default function App() {
  const [chatText, setChatText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [skillPanelOpen, setSkillPanelOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<EditingSkill | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [pageCtx, setPageCtx] = useState({ url: '', title: '' });
  const [ssoUsername] = useState(localStorage.getItem(SSO_USERNAME_KEY) || '');
  const [settingsCfg, setSettingsCfg] = useState<SettingsConfig>({
    agentUrl: AGENT_URL_DEFAULT,
    provider: 'deepseek',
    modelName: '',
    apiKey: '',
    baseUrl: '',
    multimodal: true,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const activeConvRef = useRef<Conversation | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const scrollRafIdRef = useRef<number | null>(null);
  const wsReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handshakeSentRef = useRef(false);
  const manifestVersionRef = useRef('');

  const isNearBottom = useCallback((el: HTMLElement | null) => {
    if (!el) return true;
    return el.scrollTop + el.clientHeight >= el.scrollHeight - 50;
  }, []);

  const scheduleScroll = useCallback(() => {
    if (scrollRafIdRef.current !== null) return;
    scrollRafIdRef.current = requestAnimationFrame(() => {
      scrollRafIdRef.current = null;
      const el = streamRef.current;
      if (el && isNearBottom(el)) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }, [isNearBottom]);

  const forceScrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }, 50);
  }, []);

  const formatStepResult = useCallback((result: any): string => {
    if (!result) return '';
    if (typeof result === 'string') return result;
    try {
      const str = JSON.stringify(result, null, 2);
      const lines = str.split('\n');
      return lines.length > 10 ? lines.slice(0, 10).join('\n') + '\n... 还有 ' + (lines.length - 10) + ' 行' : str;
    } catch {
      return String(result);
    }
  }, []);

  const executeCommand = useCallback((command: string, payload: any): Promise<any> => {
    const id = 'req_' + Date.now();
    return new Promise((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        if (event.origin !== PARENT_ORIGIN) return;
        const msg = event.data;
        if (!msg || msg.type !== 'response' || msg.id !== id) return;
        window.removeEventListener('message', handler);
        if (msg.error) {
          reject(Object.assign(new Error(msg.error.message || '失败'), { code: msg.error.code }));
        } else {
          resolve(msg.payload || { success: true });
        }
      };
      window.addEventListener('message', handler);
      parent.postMessage({ type: 'request', id, command, payload, timestamp: Date.now() }, PARENT_ORIGIN);
      setTimeout(() => { window.removeEventListener('message', handler); reject(new Error('超时')); }, 15000);
    });
  }, []);

  const handleThinking = useCallback((msg: any) => {
    if (!activeConvRef.current) return;
    activeConvRef.current.thinking += msg.delta;
    setConversations(prev => [...prev]);
    scheduleScroll();
  }, [scheduleScroll]);

  const handleReplyText = useCallback((msg: any) => {
    if (!activeConvRef.current) return;
    activeConvRef.current.replyText += msg.delta;
    setConversations(prev => [...prev]);
    scheduleScroll();
  }, [scheduleScroll]);

  const handleToolCall = useCallback((msg: any) => {
    if (!activeConvRef.current) return;
    const { call_id, name, args } = msg;
    const stepStart = Date.now();

    const step: ToolStep = {
      callId: call_id,
      name: getFriendlyName(name) || name,
      args,
      status: 'active',
      detail: '执行中...',
      duration: '',
      resultText: '',
      startTime: stepStart,
    };
    activeConvRef.current.toolSteps.push(step);
    setConversations(prev => [...prev]);
    scheduleScroll();

    retryWithBackoff(
      () => executeCommand(name, args),
      {
        maxRetries: 3,
        onRetry: (state) => {
          step.status = 'retrying';
          step.detail = `重试中 (${state.attempt}/${state.maxRetries})`;
          setConversations(prev => [...prev]);
          scheduleScroll();
        },
        onTARGET_STALE: () => executeCommand('discover_tools', {}),
      },
    ).then(result => {
      step.status = 'done';
      step.detail = '';
      step.duration = ((Date.now() - stepStart) / 1000).toFixed(1) + 's';
      step.resultText = formatStepResult(result);
      wsRef.current?.send(JSON.stringify({ type: 'tool_result', call_id, result }));
      setConversations(prev => [...prev]);
      scheduleScroll();
    }).catch(err => {
      step.status = 'error';
      step.detail = err.message || '执行失败';
      wsRef.current?.send(JSON.stringify({ type: 'tool_result', call_id, result: { error: err.message || '执行失败' } }));
      setConversations(prev => [...prev]);
      scheduleScroll();
    });
  }, [executeCommand, formatStepResult, scheduleScroll]);

  const handleConfirmRequest = useCallback((msg: any) => {
    if (!activeConvRef.current) return;
    const { call_id, name, args } = msg;
    const step: ToolStep = {
      callId: call_id,
      name: getFriendlyName(name) || name,
      args,
      status: 'done',
      detail: '已确认',
      duration: '',
      resultText: '',
      startTime: Date.now(),
    };
    activeConvRef.current.toolSteps.push(step);
    setConversations(prev => [...prev]);
    scheduleScroll();
    wsRef.current?.send(JSON.stringify({ type: 'confirm_result', call_id, confirmed: true }));
  }, [scheduleScroll]);

  const handleDone = useCallback((msg: any) => {
    if (!activeConvRef.current) return;
    activeConvRef.current.status = 'done';
    if (msg.message && !activeConvRef.current.replyText) {
      activeConvRef.current.replyText = msg.message;
    }
    setIsProcessing(false);
    activeConvRef.current = null;
    setConversations(prev => [...prev]);
    scheduleScroll();
  }, [scheduleScroll]);

  const handleError = useCallback((msg: any) => {
    if (!activeConvRef.current) return;
    activeConvRef.current.status = 'error';
    activeConvRef.current.errorMessage = msg.message || '执行错误';
    setIsProcessing(false);
    activeConvRef.current = null;
    setConversations(prev => [...prev]);
    scheduleScroll();
  }, [scheduleScroll]);

  const connectWs = useCallback(() => {
    const url = localStorage.getItem(STORAGE_AGENT_URL) || AGENT_URL_DEFAULT;
    setWsStatus('connecting');
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('connected');
        ws.send(JSON.stringify({ type: 'get_skills' }));
      };

      ws.onclose = () => {
        setWsStatus('disconnected');
        wsReconnectTimerRef.current = setTimeout(connectWs, 3000);
      };

      ws.onerror = () => setWsStatus('error');

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'connected': setWsStatus('connected'); break;
          case 'thinking': handleThinking(msg); break;
          case 'tool_call': handleToolCall(msg); break;
          case 'confirm_request': handleConfirmRequest(msg); break;
          case 'reply_text': handleReplyText(msg); break;
          case 'done': handleDone(msg); break;
          case 'error': handleError(msg); break;
          case 'skill_list': setSkills(msg.skills || []); break;
          case 'skill_saved':
          case 'skill_deleted':
            ws.send(JSON.stringify({ type: 'get_skills' }));
            break;
        }
      };
    } catch {
      setWsStatus('error');
      wsReconnectTimerRef.current = setTimeout(connectWs, 3000);
    }
  }, [handleThinking, handleToolCall, handleConfirmRequest, handleReplyText, handleDone, handleError]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('app_theme') || 'dark';
    setTheme(savedTheme as 'dark' | 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);

    const savedConversations = localStorage.getItem(STORAGE_CONVERSATIONS);
    if (savedConversations) {
      try { setConversations(JSON.parse(savedConversations)); }
      catch { localStorage.removeItem(STORAGE_CONVERSATIONS); }
    }

    setSettingsCfg({
      agentUrl: localStorage.getItem(STORAGE_AGENT_URL) || AGENT_URL_DEFAULT,
      provider: localStorage.getItem(STORAGE_PROVIDER) || 'deepseek',
      modelName: localStorage.getItem(STORAGE_MODEL_NAME) || '',
      apiKey: localStorage.getItem(STORAGE_API_KEY) || '',
      baseUrl: localStorage.getItem(STORAGE_BASE_URL) || '',
      multimodal: localStorage.getItem(STORAGE_MULTIMODAL) !== 'false',
    });

    connectWs();

    const handleBridgeEvent = (event: MessageEvent) => {
      if (event.origin !== PARENT_ORIGIN) return;
      const msg = event.data;
      if (!msg || msg.type !== 'event') return;

      if (msg.command === 'host_ready' && !handshakeSentRef.current) {
        handshakeSentRef.current = true;
        executeCommand('handshake', {
          protocol_version: PROTOCOL_VERSION,
          min_supported_version: MIN_SUPPORTED_VERSION,
        }).catch(() => {});
      }

      if (msg.command === 'manifest_push' || msg.command === 'manifest_update') {
        manifestVersionRef.current = msg.payload?.manifest_version || msg.manifest_version || '';
        const meta = msg.payload?.page_metadata;
        if (meta) {
          setPageCtx({ url: meta.url || meta.page_url || '', title: meta.title || meta.page_title || '' });
        }
      }

      if (msg.command === 'page_changed' && msg.payload?.new_url) {
        setPageCtx(prev => ({ ...prev, url: msg.payload.new_url }));
      }
    };

    window.addEventListener('message', handleBridgeEvent);

    return () => {
      window.removeEventListener('message', handleBridgeEvent);
      if (wsReconnectTimerRef.current) clearTimeout(wsReconnectTimerRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_CONVERSATIONS, JSON.stringify(conversations));
  }, [conversations]);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('app_theme', newTheme);
  }, [theme]);

  const newSession = useCallback(() => {
    setConversations([]);
    localStorage.removeItem(STORAGE_CONVERSATIONS);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'user_message', content: '', reset: true }));
    }
  }, []);

  const sendMessage = useCallback(() => {
    const text = chatText.trim();
    if (!text || isProcessing) return;
    setChatText('');
    setIsProcessing(true);

    const conv: Conversation = {
      id: 'conv_' + Date.now(),
      userMessage: text,
      status: 'running',
      thinking: '',
      replyText: '',
      toolSteps: [],
      errorMessage: '',
      thinkCollapsed: false,
    };
    activeConvRef.current = conv;
    setConversations(prev => [...prev, conv]);
    forceScrollToBottom();

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      conv.status = 'error';
      conv.errorMessage = '未连接到 AgentScope 后端';
      setIsProcessing(false);
      activeConvRef.current = null;
      setConversations(prev => [...prev]);
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'user_message',
      content: text,
      provider: localStorage.getItem(STORAGE_PROVIDER) || undefined,
      model_name: localStorage.getItem(STORAGE_MODEL_NAME) || undefined,
      api_key: localStorage.getItem(STORAGE_API_KEY) || undefined,
      base_url: localStorage.getItem(STORAGE_BASE_URL) || undefined,
      multimodal: localStorage.getItem(STORAGE_MULTIMODAL) !== 'false',
    }));
  }, [chatText, isProcessing, forceScrollToBottom]);

  const saveSettings = useCallback(() => {
    localStorage.setItem(STORAGE_AGENT_URL, settingsCfg.agentUrl.trim() || AGENT_URL_DEFAULT);
    localStorage.setItem(STORAGE_PROVIDER, settingsCfg.provider);
    localStorage.setItem(STORAGE_MODEL_NAME, settingsCfg.modelName.trim());
    localStorage.setItem(STORAGE_API_KEY, settingsCfg.apiKey.trim());
    localStorage.setItem(STORAGE_BASE_URL, settingsCfg.baseUrl.trim());
    localStorage.setItem(STORAGE_MULTIMODAL, String(settingsCfg.multimodal));
    setSettingsOpen(false);
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    setTimeout(connectWs, 200);
  }, [settingsCfg, connectWs]);

  const openSkillEditor = useCallback((conv: Conversation) => {
    const steps = stepsToServerFormat(conv.toolSteps);
    if (!steps.length) return;
    const params = extractSkillParams(conv.toolSteps);
    setEditingSkill({
      name: '',
      description: '',
      params: params.map(p => ({ ...p })),
      steps,
      skillType: 'strict',
      generating: false,
    });
    setSkillPanelOpen(true);
  }, []);

  const confirmSaveSkill = useCallback(() => {
    if (!editingSkill?.name.trim() || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({
      type: 'save_skill',
      name: editingSkill.name.trim(),
      description: editingSkill.description.trim(),
      steps: editingSkill.steps,
      skill_type: editingSkill.skillType || 'strict',
    }));
    setEditingSkill(null);
  }, [editingSkill]);

  const runSkill = useCallback((skill: SkillInfo) => {
    setChatText(buildSkillPrompt(skill.name));
    setSkillPanelOpen(false);
  }, []);

  const removeSkillByDir = useCallback((dir: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'delete_skill', dir }));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SSO_TOKEN_KEY);
    localStorage.removeItem(SSO_USERNAME_KEY);
    window.location.reload();
  }, []);

  const toggleThinkCollapse = useCallback((convId: string) => {
    setConversations(prev => prev.map(c =>
      c.id === convId ? { ...c, thinkCollapsed: !c.thinkCollapsed } : c
    ));
  }, []);

  return (
    <div className="app-shell">
      <AppHeader
        wsStatus={wsStatus}
        pageCtx={pageCtx}
        theme={theme}
        username={ssoUsername}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSkills={() => setSkillPanelOpen(true)}
        onNewSession={newSession}
        onLogout={logout}
      />

      <div className="conv-stream" ref={streamRef}>
        <ConversationStream
          conversations={conversations}
          onOpenSkillEditor={openSkillEditor}
          onToggleThinkCollapse={toggleThinkCollapse}
        />
      </div>

      <div className="input-bar">
        <Sender
          value={chatText}
          onChange={setChatText}
          onSubmit={sendMessage}
          disabled={isProcessing}
          loading={isProcessing}
          placeholder="输入指令，例如：打开 GitHub 搜索 vue..."
          submitType="enter"
        />
      </div>

      <SettingsPanel
        open={settingsOpen}
        settingsCfg={settingsCfg}
        onChangeCfg={setSettingsCfg}
        onSave={saveSettings}
        onClose={() => setSettingsOpen(false)}
      />

      <SkillPanel
        open={skillPanelOpen}
        skills={skills}
        editingSkill={editingSkill}
        onChangeEditingSkill={setEditingSkill}
        onSaveSkill={confirmSaveSkill}
        onDeleteSkill={removeSkillByDir}
        onRunSkill={runSkill}
        onClose={() => setSkillPanelOpen(false)}
      />
    </div>
  );
}
