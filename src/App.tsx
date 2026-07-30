import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Sender } from '@agentscope-ai/chat';
import { getFriendlyName } from './modules/commands';
import { retryWithBackoff } from './modules/retry';
import { extractSkillParams, stepsToServerFormat, buildSkillPrompt } from './modules/skillParser';

import AppHeader from './components/AppHeader';
import ConversationStream, { type Conversation } from './components/ConversationStream';
import SettingsPanel from './components/SettingsPanel';
import SkillPanel from './components/SkillPanel';
import ApprovalDialog from './components/ApprovalDialog';
import OfficeTeamMode from './components/OfficeTeamMode';
import ErrorBoundary from './components/ErrorBoundary';
import type { ToolStep } from './components/ToolTree';

import { useWebSocket } from './hooks/useWebSocket';
import { useApproval } from './hooks/useApproval';
import { useScroll } from './hooks/useScroll';
import { formatStepResult, executeCommand } from './utils/commands';
import {
  AGENT_URL_DEFAULT,
  STORAGE_KEYS,
  SSO_KEYS,
  BRIDGE,
  type SettingsConfig,
  type SkillInfo,
  type EditingSkill,
  type AppMode,
} from './constants';

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const isTeamMode = location.pathname.startsWith('/team');
  const [chatText, setChatText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [skillPanelOpen, setSkillPanelOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<EditingSkill | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [pageCtx, setPageCtx] = useState({ url: '', title: '' });
  const [ssoUsername] = useState(localStorage.getItem(SSO_KEYS.USERNAME) || '');
  const appMode: AppMode = isTeamMode ? 'team' : 'single';
  const [settingsCfg, setSettingsCfg] = useState<SettingsConfig>({
    agentUrl: AGENT_URL_DEFAULT,
    provider: 'deepseek',
    modelName: '',
    apiKey: '',
    baseUrl: '',
    multimodal: true,
    backendToken: '',
  });

  const activeConvRef = useRef<Conversation | null>(null);
  const handshakeSentRef = useRef(false);
  const manifestVersionRef = useRef('');

  const { containerRef: streamRef, scrollToBottom, forceScrollToBottom } = useScroll();

  const { currentRequest, pendingCount, addRequest, approve, reject, close, waitForDecision, queueRef } = useApproval();

  const handleWsMessage = useCallback((msg: any) => {
    switch (msg.type) {
      case 'connected': break;
      case 'thinking': {
        if (!activeConvRef.current) return;
        const delta = typeof msg.delta === 'string' ? msg.delta : JSON.stringify(msg.delta ?? '');
        activeConvRef.current.thinking += delta;
        setConversations(prev => [...prev]);
        scrollToBottom();
        break;
      }
      case 'reply_text': {
        if (!activeConvRef.current) return;
        const delta = typeof msg.delta === 'string' ? msg.delta : JSON.stringify(msg.delta ?? '');
        activeConvRef.current.replyText += delta;
        setConversations(prev => [...prev]);
        scrollToBottom();
        break;
      }
      case 'tool_call': {
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
        scrollToBottom();

        retryWithBackoff(
          () => executeCommand(name, args, BRIDGE.PARENT_ORIGIN),
          {
            maxRetries: 3,
            onRetry: (state) => {
              step.status = 'retrying';
              step.detail = `重试中 (${state.attempt}/${state.maxRetries})`;
              setConversations(prev => [...prev]);
              scrollToBottom();
            },
          },
        ).then(result => {
          step.status = 'done';
          step.detail = '';
          step.duration = ((Date.now() - stepStart) / 1000).toFixed(1) + 's';
          step.resultText = formatStepResult(result);
          send({ type: 'tool_result', call_id, result });
          setConversations(prev => [...prev]);
          scrollToBottom();
        }).catch(err => {
          step.status = 'error';
          step.detail = err.message || '执行失败';
          send({ type: 'tool_result', call_id, result: { error: err.message || '执行失败' } });
          setConversations(prev => [...prev]);
          scrollToBottom();
        });
        break;
      }
      case 'confirm_request': {
        if (!activeConvRef.current) return;
        const { call_id, name, args } = msg;
        const riskLevel = args?.risk_level || 'medium';
        const approvalRequest = {
          id: call_id || crypto.randomUUID(),
          requesterId: name || 'agent',
          operation: getFriendlyName(name) || name,
          description: args?.description || args?.reason || `确认操作: ${name}`,
          riskLevel,
          confidence: args?.confidence ?? 0.5,
          status: 'pending' as const,
          createdAt: Date.now(),
        };
        addRequest(approvalRequest);

        const step: ToolStep = {
          callId: call_id,
          name: getFriendlyName(name) || name,
          args,
          status: 'active',
          detail: '等待审批...',
          duration: '',
          resultText: '',
          startTime: Date.now(),
        };
        activeConvRef.current.toolSteps.push(step);
        setConversations(prev => [...prev]);
        scrollToBottom();

        waitForDecision(approvalRequest.id).then(result => {
          const idx = activeConvRef.current?.toolSteps.findIndex((s: ToolStep) => s.callId === call_id);
          if (idx !== undefined && idx >= 0 && activeConvRef.current) {
            const step = activeConvRef.current.toolSteps[idx];
            step.status = result.confirmed ? 'done' : 'error';
            step.detail = result.confirmed ? '已批准' : '已拒绝';
            step.duration = ((Date.now() - step.startTime) / 1000).toFixed(1) + 's';
          }
          send({
            type: 'confirm_result',
            call_id,
            confirmed: !!result.confirmed,
            rejected: !!result.rejected,
            reason: result.reason,
          });
          setConversations(prev => [...prev]);
          scrollToBottom();
        });
        break;
      }
      case 'done': {
        if (!activeConvRef.current) return;
        activeConvRef.current.status = 'done';
        if (msg.message != null && !activeConvRef.current.replyText) {
          activeConvRef.current.replyText = typeof msg.message === 'string' ? msg.message : JSON.stringify(msg.message);
        }
        setIsProcessing(false);
        activeConvRef.current = null;
        setConversations(prev => [...prev]);
        scrollToBottom();
        break;
      }
      case 'error': {
        if (!activeConvRef.current) return;
        activeConvRef.current.status = 'error';
        activeConvRef.current.errorMessage = typeof msg.message === 'string' ? msg.message : (msg.message ? JSON.stringify(msg.message) : '执行错误');
        setIsProcessing(false);
        activeConvRef.current = null;
        setConversations(prev => [...prev]);
        scrollToBottom();
        break;
      }
      case 'skill_list':
        setSkills(msg.skills || []);
        break;
      case 'skill_saved':
      case 'skill_deleted':
        send({ type: 'get_skills' });
        break;
    }
  }, [scrollToBottom, addRequest, waitForDecision]);

  const { status: wsStatus, send, wsRef } = useWebSocket({
    url: localStorage.getItem(STORAGE_KEYS.AGENT_URL) || AGENT_URL_DEFAULT,
    onMessage: handleWsMessage,
    onOpen: () => send({ type: 'get_skills' }),
    backendToken: localStorage.getItem(STORAGE_KEYS.BACKEND_TOKEN) || undefined,
  });

  useEffect(() => {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
    setTheme(savedTheme as 'dark' | 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);

    const savedConversations = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS);
    if (savedConversations) {
      try { setConversations(JSON.parse(savedConversations)); }
      catch { localStorage.removeItem(STORAGE_KEYS.CONVERSATIONS); }
    }

    setSettingsCfg({
      agentUrl: localStorage.getItem(STORAGE_KEYS.AGENT_URL) || AGENT_URL_DEFAULT,
      provider: localStorage.getItem(STORAGE_KEYS.PROVIDER) || 'deepseek',
      modelName: localStorage.getItem(STORAGE_KEYS.MODEL_NAME) || '',
      apiKey: localStorage.getItem(STORAGE_KEYS.API_KEY) || '',
      baseUrl: localStorage.getItem(STORAGE_KEYS.BASE_URL) || '',
      multimodal: localStorage.getItem(STORAGE_KEYS.MULTIMODAL) !== 'false',
      backendToken: localStorage.getItem(STORAGE_KEYS.BACKEND_TOKEN) || '',
    });

    const handleBridgeEvent = (event: MessageEvent) => {
      if (event.origin !== BRIDGE.PARENT_ORIGIN) return;
      const msg = event.data;
      if (!msg || msg.type !== 'event') return;

      if (msg.command === 'host_ready' && !handshakeSentRef.current) {
        handshakeSentRef.current = true;
        executeCommand('handshake', {
          protocol_version: BRIDGE.PROTOCOL_VERSION,
          min_supported_version: BRIDGE.MIN_SUPPORTED_VERSION,
        }, BRIDGE.PARENT_ORIGIN).catch(() => {});
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
    return () => window.removeEventListener('message', handleBridgeEvent);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(conversations));
    }, 500);
    return () => clearTimeout(timer);
  }, [conversations]);

  useEffect(() => {
    queueRef.current.startAutoExpiryCheck(30000);
    return () => queueRef.current.stopAutoExpiryCheck();
  }, [queueRef]);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem(STORAGE_KEYS.THEME, newTheme);
  }, [theme]);

  const newSession = useCallback(() => {
    setConversations([]);
    localStorage.removeItem(STORAGE_KEYS.CONVERSATIONS);
    send({ type: 'user_message', content: '', reset: true });
  }, [send]);

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

    if (!send({
      type: 'user_message',
      content: text,
      provider: localStorage.getItem(STORAGE_KEYS.PROVIDER) || undefined,
      model_name: localStorage.getItem(STORAGE_KEYS.MODEL_NAME) || undefined,
      api_key: localStorage.getItem(STORAGE_KEYS.API_KEY) || undefined,
      base_url: localStorage.getItem(STORAGE_KEYS.BASE_URL) || undefined,
      multimodal: localStorage.getItem(STORAGE_KEYS.MULTIMODAL) !== 'false',
    })) {
      conv.status = 'error';
      conv.errorMessage = '未连接到 AgentScope 后端';
      setIsProcessing(false);
      activeConvRef.current = null;
      setConversations(prev => [...prev]);
    }
  }, [chatText, isProcessing, forceScrollToBottom, send]);

  const saveSettings = useCallback(() => {
    localStorage.setItem(STORAGE_KEYS.AGENT_URL, settingsCfg.agentUrl.trim() || AGENT_URL_DEFAULT);
    localStorage.setItem(STORAGE_KEYS.PROVIDER, settingsCfg.provider);
    localStorage.setItem(STORAGE_KEYS.MODEL_NAME, settingsCfg.modelName.trim());
    localStorage.setItem(STORAGE_KEYS.API_KEY, settingsCfg.apiKey.trim());
    localStorage.setItem(STORAGE_KEYS.BASE_URL, settingsCfg.baseUrl.trim());
    localStorage.setItem(STORAGE_KEYS.MULTIMODAL, String(settingsCfg.multimodal));
    localStorage.setItem(STORAGE_KEYS.BACKEND_TOKEN, settingsCfg.backendToken.trim());

    // Electron 模式：同步配置到主进程
    const mdh = (window as any).mdh;
    if (mdh?.isElectron) {
      mdh.invoke('mdh:setLlmConfig', {
        provider: settingsCfg.provider,
        apiKey: settingsCfg.apiKey.trim(),
        baseUrl: settingsCfg.baseUrl.trim(),
        model: settingsCfg.modelName.trim(),
      }).then(() => {
        console.log('[Electron] LLM config synced to main process');
      }).catch((e: any) => {
        console.warn('[Electron] Failed to sync config:', e);
      });
    }

    setSettingsOpen(false);
    window.location.reload();
  }, [settingsCfg]);

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
    if (!editingSkill?.name.trim()) return;
    send({
      type: 'save_skill',
      name: editingSkill.name.trim(),
      description: editingSkill.description.trim(),
      steps: editingSkill.steps,
      skill_type: editingSkill.skillType || 'strict',
    });
    setEditingSkill(null);
  }, [editingSkill, send]);

  const runSkill = useCallback((skill: SkillInfo) => {
    setChatText(buildSkillPrompt(skill.name));
    setSkillPanelOpen(false);
  }, []);

  const removeSkillByDir = useCallback((dir: string) => {
    send({ type: 'delete_skill', dir });
  }, [send]);

  const logout = useCallback(() => {
    localStorage.removeItem(SSO_KEYS.TOKEN);
    localStorage.removeItem(SSO_KEYS.USERNAME);
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

      <ErrorBoundary>
        {appMode === 'single' ? (
          <>
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
                placeholder="输入指令，例如：打开 GitHub 搜索 react..."
                submitType="enter"
              />
              <div className="mode-switcher">
                <button className={`mode-btn ${!isTeamMode ? 'active' : ''}`} onClick={() => navigate('/')}>
                  <span className="mode-icon">🤖</span>
                  <span className="mode-label">单智能体</span>
                </button>
                <button className={`mode-btn ${isTeamMode ? 'active' : ''}`} onClick={() => navigate('/team')}>
                  <span className="mode-icon">👥</span>
                  <span className="mode-label">多智能体团队</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          <OfficeTeamMode
            wsRef={wsRef}
            onBackToSingle={() => navigate('/')}
            pendingApprovalCount={pendingCount}
            onOpenApproval={() => {
              if (currentRequest) close();
            }}
          />
        )}
      </ErrorBoundary>

      {currentRequest && (
        <ApprovalDialog
          request={currentRequest}
          onApprove={approve}
          onReject={reject}
          onClose={close}
        />
      )}

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

export default function App() {
  // Electron 环境使用 HashRouter（file:// 协议不支持 History API）
  const isElectron = typeof window !== 'undefined' && (window as any).mdh?.isElectron === true;
  const Router = isElectron ? HashRouter : BrowserRouter;

  return (
    <Router>
      <AppContent />
    </Router>
  );
}
