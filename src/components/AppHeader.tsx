import React from 'react';

interface AppHeaderProps {
  wsStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  pageCtx: { url: string; title: string };
  theme: 'dark' | 'light';
  username: string;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenSkills: () => void;
  onNewSession: () => void;
  onLogout: () => void;
}

const wsStatusMap = {
  connected: '已连接',
  connecting: '连接中',
  disconnected: '未连接',
  error: '连接错误',
};

export default function AppHeader({
  wsStatus,
  pageCtx,
  theme,
  username,
  onToggleTheme,
  onOpenSettings,
  onOpenSkills,
  onNewSession,
  onLogout,
}: AppHeaderProps) {
  return (
    <header className="header">
      <div className="header-left">
        <div className={`dot-live ${wsStatus !== 'connected' ? 'ws-disconnected' : ''}`}></div>
        <div className="header-title">AI <span>Agent</span></div>
        {pageCtx.url && (
          <div className="page-context" title={pageCtx.url}>
            <span className="page-context-icon">◈</span>
            <span className="page-context-text">{pageCtx.title || pageCtx.url}</span>
          </div>
        )}
      </div>
      <div className="header-right">
        <div className="header-status">
          <span style={{ color: wsStatus === 'connected' ? 'var(--accent)' : '#f88' }}>●</span>
          {wsStatusMap[wsStatus]}
        </div>
        {username && (
          <div className="user-info">
            <span>👤</span> {username}
            <button className="logout-btn" onClick={onLogout}>退出</button>
          </div>
        )}
        <button className="icon-btn" onClick={onToggleTheme} title={theme === 'dark' ? '切换到浅色' : '切换到深色'}>
          {theme === 'dark' ? '☀' : '🌙'}
        </button>
        <button className="icon-btn" onClick={onOpenSettings} title="配置">⚙</button>
        <button className="icon-btn" onClick={onOpenSkills} title="Skill 模板">📋</button>
        <button className="icon-btn" onClick={onNewSession} title="新建对话">＋</button>
        <button className="icon-btn" onClick={() => { window.location.href = 'test.html'; }} title="协议测试">🧪</button>
      </div>
    </header>
  );
}
