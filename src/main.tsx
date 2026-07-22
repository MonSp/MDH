import './console-setup';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, carbonTheme } from '@agentscope-ai/design';
import App from './App';

import './theme-dark.css';
import './theme-light.css';
import './assets/base.css';
import './assets/collaboration.css';
import './styles/App.css';
import './styles/Header.css';
import './styles/Settings.css';
import './styles/Conversation.css';

const SSO_TOKEN_KEY = 'sso_auth_token';
const SSO_USERNAME_KEY = 'sso_auth_username';

// 检测是否在 Electron 环境
const isElectron = typeof window !== 'undefined' && (window as any).mdh?.isElectron === true;

function getSSOUrl() {
  return `${window.location.origin}/sso/login`;
}

function checkSSOAuth(): boolean {
  // Electron 环境跳过 SSO 检查
  if (isElectron) {
    return true;
  }

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const username = params.get('username');

  if (token && username) {
    localStorage.setItem(SSO_TOKEN_KEY, token);
    localStorage.setItem(SSO_USERNAME_KEY, username);
    window.history.replaceState({}, '', window.location.pathname);
    return true;
  }

  return !!localStorage.getItem(SSO_TOKEN_KEY);
}

function redirectToSSO() {
  const currentUrl = window.location.href;
  const ssoUrl = `${getSSOUrl()}?redirect=${encodeURIComponent(currentUrl)}&origin=${encodeURIComponent(window.location.origin)}`;
  window.location.href = ssoUrl;
}

if (!checkSSOAuth()) {
  redirectToSSO();
} else {
  const root = ReactDOM.createRoot(document.getElementById('app')!);
  root.render(
    <React.StrictMode>
      <ConfigProvider {...carbonTheme} prefix="sps" prefixCls="sps">
        <App />
      </ConfigProvider>
    </React.StrictMode>
  );
}
