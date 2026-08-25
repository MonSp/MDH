import React, { useState, useEffect } from 'react';

interface AppHeaderProps {
  wsStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  pageCtx: { url: string; title: string };
  theme: 'dark' | 'light';
  username: string;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenSkills: () => void;
  onOpenEvolution: () => void;
  onNewSession: () => void;
  onLogout: () => void;
  onReplayOnboarding?: () => void;
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
  onOpenEvolution,
  onNewSession,
  onLogout,
  onReplayOnboarding,
}: AppHeaderProps) {
  const [isMobile, setIsMobile] = useState(() => {
    try { return window.matchMedia('(max-width: 768px)').matches } catch { return false }
  })
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    try {
      const mq = window.matchMedia('(max-width: 768px)')
      const handler = (e: MediaQueryListEvent) => {
        setIsMobile(e.matches)
        if (!e.matches) setMenuOpen(false)
      }
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    } catch { /* test env */ }
  }, [])

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
      {isMobile ? (
        <>
          <button
            className="icon-btn mobile-hamburger"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="菜单"
            style={{ fontSize: '1rem' }}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
          {menuOpen && (
            <div className="mobile-menu">
              <div className="mobile-menu-item">
                <span style={{ color: wsStatus === 'connected' ? 'var(--accent)' : '#f88' }}>●</span>
                {wsStatusMap[wsStatus]}
              </div>
              {username && (
                <div className="mobile-menu-item">
                  <span>👤</span> {username}
                  <button className="logout-btn" onClick={() => { onLogout(); setMenuOpen(false) }}>退出</button>
                </div>
              )}
              <button className="mobile-menu-btn" onClick={() => { onToggleTheme(); setMenuOpen(false) }}>
                {theme === 'dark' ? '☀' : '🌙'} {theme === 'dark' ? '浅色模式' : '深色模式'}
              </button>
              <button className="mobile-menu-btn" onClick={() => { onOpenSettings(); setMenuOpen(false) }}>
                ⚙ 配置
              </button>
              <button className="mobile-menu-btn" onClick={() => { onOpenSkills(); setMenuOpen(false) }}>
                📋 Skill 模板
              </button>
              <button className="mobile-menu-btn" onClick={() => { onOpenEvolution(); setMenuOpen(false) }}>
                🧬 技能进化
              </button>
              <button className="mobile-menu-btn" onClick={() => { onNewSession(); setMenuOpen(false) }}>
                ＋ 新建对话
              </button>
              {onReplayOnboarding && (
                <button className="mobile-menu-btn" onClick={() => { onReplayOnboarding(); setMenuOpen(false) }}>
                  🎯 重新体验引导
                </button>
              )}
              <button className="mobile-menu-btn" onClick={() => { window.location.href = 'test.html'; setMenuOpen(false) }}>
                🧪 协议测试
              </button>
            </div>
          )}
        </>
      ) : (
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
          <button className="icon-btn" onClick={onOpenEvolution} title="技能进化">🧬</button>
          <button className="icon-btn" onClick={onNewSession} title="新建对话">＋</button>
          {onReplayOnboarding && (
            <button className="icon-btn" onClick={onReplayOnboarding} title="重新体验引导">🎯</button>
          )}
          <button className="icon-btn" onClick={() => { window.location.href = 'test.html'; }} title="协议测试">🧪</button>
        </div>
      )}
    </header>
  );
}
