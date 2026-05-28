import { createApp } from 'vue';
import App from './App.vue';

const SSO_PORT = '8766';
const SSO_TOKEN_KEY = 'sso_auth_token';
const SSO_USERNAME_KEY = 'sso_auth_username';

function getSSOUrl() {
  const hostname = window.location.hostname;
  return `http://${hostname}:${SSO_PORT}/login`;
}

function checkSSOAuth() {
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
  createApp(App).mount('#app');
}
