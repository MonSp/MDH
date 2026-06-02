import './console-setup';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, carbonTheme } from '@agentscope-ai/design';
import App from './App';

import './theme-dark.css';
import './theme-light.css';
import './assets/base.css';
import './assets/collaboration.css';

const SSO_TOKEN_KEY = 'sso_auth_token';
const SSO_USERNAME_KEY = 'sso_auth_username';
const SSO_PORT = '8766';

function getSSOUrl() {
  const hostname = window.location.hostname;
  return `http://${hostname}:${SSO_PORT}/login`;
}

function checkSSOAuth(): boolean {
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
