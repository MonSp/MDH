import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Sender } from '@agentscope-ai/chat';
import { getFriendlyName } from './modules/commands';
import { extractSkillParams, stepsToServerFormat, buildSkillPrompt } from './modules/skillParser';
import AppHeader from './components/AppHeader';
import ConversationStream, { type Conversation } from './components/ConversationStream';
import SettingsPanel from './components/SettingsPanel';
import SkillPanel from './components/SkillPanel';
import { SkillEvolutionDashboard } from './components/skill-evolution';
import ApprovalDialog from './components/ApprovalDialog';
import OfficeTeamMode from './components/OfficeTeamMode/index'
import ErrorBoundary from './components/ErrorBoundary';
import OnboardingGuard from './components/onboarding/OnboardingGuard';
import type { ToolStep } from './components/ToolTree';

import { useWebSocket } from './hooks/useWebSocket';
import { useApproval } from './hooks/useApproval';
import { useScroll } from './hooks/useScroll';
import {
  AGENT_URL_DEFAULT,
  STORAGE_KEYS,
  SSO_KEYS,
  isElectron,
  getMdH,
  type SettingsConfig,
  type SkillInfo,
  type EditingSkill,
  type AppMode,
} from './constants';

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  // Electron 模式默认进入团队视图，浏览器模式保留单智能体
  const isElectronMode = isElectron();
  const isTeamMode = isElectronMode
    ? !location.pathname.startsWith('/single')  // Electron: 默认团队，/single 才切回单智能体
    : location.pathname.startsWith('/team');     // 浏览器: /team 切团队
  const [chatText, setChatText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [skillPanelOpen, setSkillPanelOpen] = useState(false);
  const [evolutionDashboardOpen, setEvolutionDashboardOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<EditingSkill | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [pageCtx] = useState({ url: '', title: '' });
  const [ssoUsername] = useState(localStorage.getItem(SSO_KEYS.USERNAME) || '');
  const [guardKey, setGuardKey] = useState(0); // force re-mount to replay onboarding
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
  const onboardingTaskResolver = useRef<((ok: boolean) => void) | null>(null);

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
        if (onboardingTaskResolver.current) {
          onboardingTaskResolver.current(true);
          onboardingTaskResolver.current = null;
        }
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
        if (onboardingTaskResolver.current) {
          onboardingTaskResolver.current(false);
          onboardingTaskResolver.current = null;
        }
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
    const mdh = getMdH();
    if (mdh?.isElectron) {
      mdh!.invoke('mdh:setLlmConfig', {
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

  const executeTaskForOnboarding = useCallback((description: string): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      onboardingTaskResolver.current = resolve;

      const conv: Conversation = {
        id: 'conv_' + Date.now(),
        userMessage: description,
        status: 'running',
        thinking: '',
        replyText: '',
        toolSteps: [],
        errorMessage: '',
        thinkCollapsed: false,
      };
      activeConvRef.current = conv;
      setIsProcessing(true);
      setConversations(prev => [...prev, conv]);
      forceScrollToBottom();

      if (!send({
        type: 'user_message',
        content: description,
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
        onboardingTaskResolver.current = null;
        resolve(false);
      }
    });
  }, [send, forceScrollToBottom]);

  const replayOnboarding = useCallback(() => {
    // Reset onboarding state on backend and force guard re-mount
    import('./services/apiFetch').then(({ apiPost }) => {
      apiPost('/onboarding/reset').catch(() => { /* best-effort */ });
    });
    setGuardKey(k => k + 1);
  }, []);

  return (
    <OnboardingGuard key={guardKey} onExecuteTask={executeTaskForOnboarding}>
    <div className="app-shell">
      <AppHeader
        wsStatus={wsStatus}
        pageCtx={pageCtx}
        theme={theme}
        username={ssoUsername}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSkills={() => setSkillPanelOpen(true)}
        onOpenEvolution={() => setEvolutionDashboardOpen(true)}
        onNewSession={newSession}
        onLogout={logout}
        onReplayOnboarding={replayOnboarding}
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
                <button className={`mode-btn ${!isTeamMode ? 'active' : ''}`} onClick={() => navigate(isElectronMode ? '/single' : '/')}>
                  <span className="mode-icon">🤖</span>
                  <span className="mode-label">单智能体</span>
                </button>
                <button className={`mode-btn ${isTeamMode ? 'active' : ''}`} onClick={() => navigate(isElectronMode ? '/' : '/team')}>
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

      {evolutionDashboardOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setEvolutionDashboardOpen(false)}>
          <div style={{
            width: '90vw', maxWidth: 1200, height: '85vh',
            background: 'rgba(15,15,25,0.97)', borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.1)',
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(0,0,0,0.2)',
            }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#a78bfa' }}>🧬 技能进化仪表盘</span>
              <button
                onClick={() => setEvolutionDashboardOpen(false)}
                style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 18 }}
              >✕</button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <SkillEvolutionDashboard />
            </div>
          </div>
        </div>
      )}
    </div>
    </OnboardingGuard>
  );
}

export default function App() {
  // Electron 环境使用 HashRouter（file:// 协议不支持 History API）
  const isElectronMode = isElectron();
  const Router = isElectronMode ? HashRouter : BrowserRouter;

  return (
    <Router>
      <AppContent />
    </Router>
  );
}
