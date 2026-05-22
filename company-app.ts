import { DEFAULT_PROMPT } from './prompt';

interface PendingRequest {
  command: string;
  payload: Record<string, unknown>;
  sentAt: number;
  toolEl: HTMLElement | null;
}

interface CommandPattern {
  regex: RegExp;
  cmd: string;
  parseJson?: boolean;
  build: (match: RegExpMatchArray, parsed?: unknown) => Record<string, unknown>;
}

interface ParsedCommand {
  command: string;
  payload: Record<string, unknown>;
}

interface DeepSeekResult {
  command: string;
  payload: Record<string, unknown>;
  reply: string | null;
}

interface ParentMessage {
  id: string;
  type: string;
  command?: string;
  payload?: Record<string, unknown>;
  error?: { code: string; message: string };
  manifest_version?: string;
  timestamp?: number;
}

const origin = window.location.origin;

const chatArea = document.getElementById('chatArea')!;
const chatInput = document.getElementById('chatInput') as HTMLTextAreaElement;
const sendBtn = document.getElementById('sendBtn')!;
const welcomeScreen = document.getElementById('welcomeScreen');
const headerPage = document.getElementById('headerPage')!;
const headerBadge = document.getElementById('headerBadge')!;
const statusSessions = document.getElementById('statusSessions')!;
const statusTabs = document.getElementById('statusTabs')!;

const pendingRequests: Record<string, PendingRequest> = {};
let reqCounter = 0;
let lastTargetRef = '';
let currentManifestVersion = '';
let isProcessing = false;
let welcomeDismissed = false;

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_API_KEY = '';

const STORAGE_KEY_BASE_URL = 'deepseek_base_url';
const STORAGE_KEY_API_KEY = 'deepseek_api_key';
const STORAGE_KEY_PROMPT = 'deepseek_prompt';

const settingsOverlay = document.getElementById('settingsOverlay')!;
const cfgBaseUrl = document.getElementById('cfgBaseUrl') as HTMLInputElement;
const cfgApiKey = document.getElementById('cfgApiKey') as HTMLInputElement;
const cfgPrompt = document.getElementById('cfgPrompt') as HTMLTextAreaElement;

function dismissWelcome(): void {
  if (welcomeDismissed) return;
  welcomeDismissed = true;
  if (welcomeScreen && welcomeScreen.parentNode) {
    welcomeScreen.remove();
  }
}

function normalizeUrl(str: string): string {
  if (/^https?:\/\//i.test(str)) return str;
  if (/^[\w-]+\.\w{2,}/.test(str)) return 'https://' + str;
  return 'https://' + str + '.com';
}

const COMMAND_PATTERNS: CommandPattern[] = [
  { regex: /^(?:打开|前往|导航[到至]?|访问|go\s+to|navigate\s+to)\s+(.+)/i, cmd: 'navigate', build: (m) => ({ url: normalizeUrl(m[1].trim()) }) },
  { regex: /^搜索\s+(.+)/i, cmd: 'search', build: (m) => ({ query: m[1].trim() }) },
  { regex: /^点击\s+(.+)/i, cmd: 'click_button', build: (m) => ({ button_label: m[1].trim() }) },
  { regex: /^(?:输入|填写?|键入)\s*(.+?)\s*(?:到|在|至)\s*(.+)/i, cmd: 'fill_field', build: (m) => ({ field_name: m[2].trim(), value: m[1].trim() }) },
  { regex: /^登录\s+(\S+)\s+(\S+)/i, cmd: 'login', build: (m) => ({ username: m[1], password: m[2] }) },
  { regex: /^(?:向下|up|down)\s*(?:滚动|scroll)\s*(\d+)?/i, cmd: 'scroll', build: (m) => {
    const amt = parseInt(m[1]) || 300;
    const isUp = /up/i.test(m[0]);
    return { y: isUp ? -amt : amt, behavior: 'smooth' };
  }},
  { regex: /^等待\s*(\d+)\s*(?:秒|s)/i, cmd: 'wait', build: (m) => ({ timeout_ms: parseInt(m[1]) * 1000 }) },
  { regex: /^(?:截图|截取|screenshot)/i, cmd: 'get_screenshot', build: () => ({}) },
  { regex: /^(?:列出|获取|显示|查看)?\s*(?:所有)?标签页/i, cmd: 'get_tabs', build: () => ({}) },
  { regex: /^切换(?:到)?\s*(?:第)?\s*(\d+)\s*(?:个)?标签页/i, cmd: 'switch_tab', build: (m) => ({ tab_id: parseInt(m[1]) }) },
  { regex: /^新建标签页\s*(.+)?/i, cmd: 'create_tab', build: (m) => {
    const url = m[1] ? normalizeUrl(m[1].trim()) : undefined;
    return { url, active: true };
  }},
  { regex: /^关闭标签页\s*(\d+)/i, cmd: 'close_tab', build: (m) => ({ tab_id: parseInt(m[1]) }) },
  { regex: /^按(?:下)?键?\s*(.+)/i, cmd: 'press_key', build: (m) => ({ key: m[1].trim() }) },
  { regex: /^运行[：:]\s*([\s\S]+)/i, cmd: 'evaluate_js', build: (m) => ({ code: m[1].trim() }) },
  { regex: /^执行计划\s*([\s\S]+)/i, cmd: 'execute_plan', parseJson: true, build: (m, parsed) => {
    const steps = parsed || [];
    return { manifest_version: currentManifestVersion || 'none', steps, stop_on_error: true };
  }},
];

function parseCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim();
  for (const pattern of COMMAND_PATTERNS) {
    const match = trimmed.match(pattern.regex);
    if (match) {
      let parsed: unknown = null;
      if (pattern.parseJson) {
        try { parsed = JSON.parse(match[1]); } catch { /* ignore */ }
      }
      return {
        command: pattern.cmd,
        payload: pattern.build(match, parsed),
      };
    }
  }
  return null;
}

function getFriendlyName(cmd: string): string {
  const map: Record<string, string> = {
    navigate: '导航', search: '搜索', click_button: '点击元素',
    fill_field: '填写字段', login: '登录', scroll: '滚动',
    wait: '等待', get_screenshot: '截图', get_tabs: '获取标签页',
    switch_tab: '切换标签页', create_tab: '新建标签页', close_tab: '关闭标签页',
    press_key: '按键', evaluate_js: '执行脚本', execute_plan: '执行计划',
    get_active_tab: '获取活跃标签页',
  };
  return map[cmd] || cmd;
}

function formatPayload(cmd: string, payload: Record<string, unknown>): string {
  if (!payload) return '';
  switch (cmd) {
    case 'navigate': return (payload.url as string) || '';
    case 'search': return `"${payload.query}"`;
    case 'click_button': return (payload.button_label || payload.selector || payload.target_ref || '') as string;
    case 'fill_field': return `${payload.value} → ${payload.field_name}`;
    case 'login': return `${payload.username} / ***`;
    case 'scroll': return `y=${payload.y || 0}`;
    case 'wait': return `${(Number(payload.timeout_ms) || 0) / 1000}s`;
    case 'get_screenshot': return '全页面';
    case 'switch_tab': return `标签页 #${payload.tab_id}`;
    case 'press_key': return payload.key as string;
    default: return JSON.stringify(payload).substring(0, 60);
  }
}

function createToolCard(cmd: string, payload: Record<string, unknown>): HTMLElement {
  const card = document.createElement('div');
  card.className = 'tool-card';
  card.innerHTML = `
    <div class="tool-card-header">
      <span class="tool-icon">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="4" stroke="currentColor" stroke-width="1" opacity="0.6"/>
          <circle cx="6" cy="6" r="1.5" fill="currentColor" opacity="0.8">
            <animate attributeName="r" values="1.5;2.5;1.5" dur="1.5s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.8;0.3;0.8" dur="1.5s" repeatCount="indefinite"/>
          </circle>
        </svg>
      </span>
      <span class="tool-label">EXECUTING</span>
      <span class="tool-cmd">${cmd}</span>
    </div>
    <div class="tool-card-body">${formatPayload(cmd, payload)}</div>
  `;
  return card;
}

function updateToolCard(card: HTMLElement, success: boolean, errorMsg: string | null): void {
  card.classList.add(success ? 'done' : 'error');
  const header = card.querySelector('.tool-card-header')!;
  const label = header.querySelector('.tool-label')!;
  const icon = header.querySelector('.tool-icon')!;
  label.textContent = success ? 'DONE' : 'FAILED';
  icon.innerHTML = success
    ? '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3.5 3.5L8.5 8.5M8.5 3.5L3.5 8.5" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>';
  if (errorMsg) {
    const body = card.querySelector('.tool-card-body')!;
    body.textContent = errorMsg;
  }
  card.querySelector('animate')?.remove();
}

function addMessage(role: 'agent' | 'user', content: string, time: string): HTMLElement {
  dismissWelcome();

  const el = document.createElement('div');
  el.className = `msg ${role}`;
  const avatarHtml = role === 'agent'
    ? '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="5" r="3" stroke="currentColor" stroke-width="0.8"/><rect x="3" y="8" width="8" height="4" rx="1.5" stroke="currentColor" stroke-width="0.8"/><path d="M5 10L5 12M9 10L9 12" stroke="currentColor" stroke-width="0.6"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="5" r="3.5" stroke="currentColor" stroke-width="0.8"/><path d="M3.5 13C3.5 10 5.5 8 7 8C8.5 8 10.5 10 10.5 13" stroke="currentColor" stroke-width="0.8"/></svg>';

  el.innerHTML = `
    <div class="msg-avatar">${avatarHtml}</div>
    <div>
      <div class="msg-bubble">${content}</div>
      <div class="msg-time">${time}</div>
    </div>
  `;
  chatArea.appendChild(el);
  chatArea.scrollTop = chatArea.scrollHeight;
  return el;
}

function addThinkingMessage(): HTMLElement {
  dismissWelcome();
  const el = document.createElement('div');
  el.className = 'msg agent thinking';
  el.innerHTML = `
    <div class="msg-avatar">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="5" r="3" stroke="currentColor" stroke-width="0.8"/><rect x="3" y="8" width="8" height="4" rx="1.5" stroke="currentColor" stroke-width="0.8"/></svg>
    </div>
    <div>
      <div class="msg-bubble">
        <div class="think-dot"></div>
        <div class="think-dot"></div>
        <div class="think-dot"></div>
      </div>
    </div>
  `;
  chatArea.appendChild(el);
  chatArea.scrollTop = chatArea.scrollHeight;
  return el;
}

function removeThinking(thinkingEl: HTMLElement | null): void {
  if (thinkingEl && thinkingEl.parentNode) {
    thinkingEl.remove();
  }
}

function addToolCardToChat(card: HTMLElement): void {
  dismissWelcome();
  chatArea.appendChild(card);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function formatTime(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function simpleMarkdown(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_: string, _lang: string, code: string) =>
    `<pre><code>${escapeHtml(code.trim())}</code></pre>`
  );
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

async function streamText(el: HTMLElement, text: string, speed = 18): Promise<void> {
  const bubble = el.querySelector('.msg-bubble')!;
  let displayed = '';
  for (let i = 0; i < text.length; i++) {
    displayed += text[i];
    bubble.innerHTML = simpleMarkdown(displayed);
    chatArea.scrollTop = chatArea.scrollHeight;
    await new Promise(r => setTimeout(r, speed));
  }
}

function updateStatus(id: string, val: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

let handleResponse: (msg: ParentMessage) => void;

function sendCommand(command: string, payload: Record<string, unknown>, toolEl: HTMLElement | null): void {
  const id = 'req_' + (++reqCounter);
  const request = {
    type: 'request', id, command, payload, timestamp: Date.now(),
  };
  pendingRequests[id] = { command, payload, sentAt: Date.now(), toolEl };
  parent.postMessage(request, origin);
}

handleResponse = function(msg: ParentMessage): void {
  const req = pendingRequests[msg.id];
  if (req) delete pendingRequests[msg.id];

  const cmd = msg.command || 'unknown';
  const hasError = !!msg.error;
  const success = !hasError;

  if (req && req.toolEl) {
    updateToolCard(req.toolEl, success, hasError ? (msg.error!.message || msg.error!.code) : null);
    if (cmd === 'resolve_selector' && msg.payload && msg.payload.target_ref) {
      lastTargetRef = msg.payload.target_ref as string;
    }
  }

  if (cmd === 'get_active_tab' && msg.payload) {
    headerPage.textContent = (msg.payload.url || msg.payload.title || '') as string;
  } else if (cmd === 'get_tabs' && msg.payload) {
    const tabs = msg.payload.tabs || msg.payload;
    if (Array.isArray(tabs)) {
      statusTabs.textContent = String(tabs.length);
    }
  } else if (cmd === 'navigate' && msg.payload && msg.payload.url) {
    headerPage.textContent = msg.payload.url as string;
  }
};

window.addEventListener('message', (event: MessageEvent) => {
  if (event.origin !== origin) return;
  const msg = event.data as ParentMessage;
  if (!msg) return;
  if (msg.type === 'response') {
    handleResponse(msg);
  } else if (msg.type === 'event') {
    if (msg.command === 'manifest_push' || msg.command === 'manifest_update') {
      currentManifestVersion = (msg.payload?.manifest_version || msg.manifest_version || '') as string;
      updateStatus('statusProto', 'v' + (currentManifestVersion || '?'));
    }
  }
});

function buildResponseText(command: string, payload: Record<string, unknown>, result: ParentMessage): string {
  const error = result?.error;
  const data = result?.payload;

  if (error) {
    return `❌ 执行失败\n<code>${escapeHtml(error.code || 'ERROR')}</code> ${escapeHtml(error.message || '')}`;
  }

  switch (command) {
    case 'navigate':
      return `✅ 已导航到\n<code>${escapeHtml(payload.url as string)}</code>`;
    case 'search':
      return `✅ 已提交搜索\n关键词: <code>${escapeHtml(payload.query as string)}</code>`;
    case 'click_button':
      return `✅ 已点击元素`;
    case 'fill_field':
      return `✅ 已在 <code>${escapeHtml(payload.field_name as string)}</code> 中填入内容`;
    case 'login':
      return `✅ 已登录: <code>${escapeHtml(payload.username as string)}</code>`;
    case 'scroll':
      return `✅ 已滚动页面\n偏移: y=${payload.y || 0}px`;
    case 'wait':
      return `✅ 已等待 ${(Number(payload.timeout_ms) || 0) / 1000} 秒`;
    case 'get_screenshot':
      if (data && data.data_base64) {
        return `✅ 截图完成\n尺寸: ${data.width || '?'} × ${data.height || '?'}`;
      }
      return `✅ 截图完成`;
    case 'get_tabs':
      if (data && data.tabs) {
        const tabs = data.tabs as Array<{ id: number; title?: string; is_active?: boolean }>;
        const list = tabs.map(t =>
          `${t.is_active ? '● ' : '  '}<code>#${t.id}</code> ${escapeHtml(t.title || '')}`
        ).join('\n');
        return `✅ 当前标签页:\n${list}`;
      }
      return `✅ 已获取标签页列表`;
    case 'switch_tab':
      return `✅ 已切换到标签页 #${payload.tab_id}`;
    case 'create_tab':
      return `✅ 已新建标签页`;
    case 'close_tab':
      return `✅ 已关闭标签页 #${payload.tab_id}`;
    case 'press_key':
      return `✅ 已按下 <code>${escapeHtml(payload.key as string)}</code>`;
    case 'evaluate_js':
      if (data && data.result !== undefined) {
        return `✅ 脚本执行完成\n结果: <code>${escapeHtml(String(data.result).substring(0, 200))}</code>`;
      }
      return `✅ 脚本执行完成`;
    case 'execute_plan':
      if (data) {
        return `✅ 计划执行完成\n步骤: ${data.steps_completed || 0}/${data.steps_total || 0}\n耗时: ${data.total_duration_ms || 0}ms`;
      }
      return `✅ 计划执行完成`;
    default:
      return `✅ ${getFriendlyName(command)}完成`;
  }
}

function waitForResponse(command: string): Promise<ParentMessage> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timeout = 15000;

    function check(): void {
      if (Date.now() - start > timeout) {
        reject(new Error('请求超时'));
        return;
      }
      const keys = Object.keys(pendingRequests);
      const stillPending = keys.some(k => {
        const r = pendingRequests[k];
        return r && r.command === command;
      });
      if (!stillPending) {
        resolve({ success: true } as unknown as ParentMessage);
      } else {
        setTimeout(check, 100);
      }
    }

    const origHandler = handleResponse;
    handleResponse = function(msg: ParentMessage): void {
      const req = pendingRequests[msg.id];
      if (req) delete pendingRequests[msg.id];
      if (req && req.toolEl) {
        const hasError = !!msg.error;
        updateToolCard(req.toolEl, !hasError, hasError ? (msg.error!.message || msg.error!.code) : null);
        if (msg.command === 'resolve_selector' && msg.payload && msg.payload.target_ref) {
          lastTargetRef = msg.payload.target_ref as string;
        }
      }

      if (msg.command === 'get_active_tab' && msg.payload) {
        headerPage.textContent = (msg.payload.url || msg.payload.title || '') as string;
      } else if (msg.command === 'get_tabs' && msg.payload) {
        const tabs = msg.payload.tabs || msg.payload;
        if (Array.isArray(tabs)) statusTabs.textContent = String(tabs.length);
      } else if (msg.command === 'navigate' && msg.payload && msg.payload.url) {
        headerPage.textContent = msg.payload.url as string;
      }

      if (msg.command === command) {
        resolve(msg);
        handleResponse = origHandler;
      }
    };

    setTimeout(check, 200);
  });
}

async function handleUserMessage(text: string): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  const userTime = formatTime();
  addMessage('user', escapeHtml(text), userTime);

  const thinking = addThinkingMessage();
  let parsed: ParsedCommand | null = null;
  let deepseekReply: string | null = null;

  const deepseekResult = await deepseekIntentRecognition(text);
  if (deepseekResult) {
    parsed = { command: deepseekResult.command, payload: deepseekResult.payload };
    deepseekReply = deepseekResult.reply;
  }

  if (!parsed) {
    parsed = parseCommand(text);
  }

  removeThinking(thinking);

  if (!parsed) {
    const msg = addMessage('agent', '', formatTime());
    await streamText(msg,
      '抱歉，我没有理解你的指令。你可以试试：\n\n' +
      '• "打开 github.com" — 导航到网页\n' +
      '• "搜索 chromium browser" — 搜索内容\n' +
      '• "点击 提交按钮" — 点击元素\n' +
      '• "输入 Hello 到 搜索框" — 填写字段\n' +
      '• "等待 3 秒" — 等待\n' +
      '• "截取当前页面截图" — 截图\n' +
      '• "列出所有标签页" — 查看标签页\n' +
      '• "切换第 2 个标签页" — 切换标签\n' +
      '• "按下键 Enter" — 按键\n' +
      '• "运行: document.title" — 执行 JS',
      12
    );
    isProcessing = false;
    return;
  }

  const { command, payload } = parsed;
  const friendlyName = getFriendlyName(command);

  const msg = addMessage('agent', '', formatTime());
  const bubble = msg.querySelector('.msg-bubble')!;
  if (deepseekReply) {
    bubble.textContent = deepseekReply;
  } else {
    bubble.textContent = `正在${friendlyName}…`;
  }

  const toolCard = createToolCard(command, payload);
  addToolCardToChat(toolCard);

  sendCommand(command, payload, toolCard);

  try {
    const result = await waitForResponse(command);
    bubble.innerHTML = '';

    const responseText = buildResponseText(command, payload, result);
    await streamText(msg, responseText, 12);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '未知错误';
    bubble.innerHTML = simpleMarkdown(`❌ ${friendlyName}失败: ${escapeHtml(message)}`);
  }

  isProcessing = false;
}

function loadSettings(): void {
  cfgBaseUrl.value = localStorage.getItem(STORAGE_KEY_BASE_URL) || DEFAULT_BASE_URL;
  cfgApiKey.value = localStorage.getItem(STORAGE_KEY_API_KEY) || DEFAULT_API_KEY;
  cfgPrompt.value = localStorage.getItem(STORAGE_KEY_PROMPT) || DEFAULT_PROMPT;
}

function saveSettings(): void {
  const baseUrl = cfgBaseUrl.value.trim() || DEFAULT_BASE_URL;
  const apiKey = cfgApiKey.value.trim();
  const prompt = cfgPrompt.value.trim() || DEFAULT_PROMPT;
  localStorage.setItem(STORAGE_KEY_BASE_URL, baseUrl);
  localStorage.setItem(STORAGE_KEY_API_KEY, apiKey);
  localStorage.setItem(STORAGE_KEY_PROMPT, prompt);
  settingsOverlay.classList.remove('open');
}

function resetSettings(): void {
  cfgBaseUrl.value = DEFAULT_BASE_URL;
  cfgApiKey.value = DEFAULT_API_KEY;
  cfgPrompt.value = DEFAULT_PROMPT;
}

function getCurrentBaseUrl(): string {
  return localStorage.getItem(STORAGE_KEY_BASE_URL) || DEFAULT_BASE_URL;
}

function getCurrentApiKey(): string {
  return localStorage.getItem(STORAGE_KEY_API_KEY) || DEFAULT_API_KEY;
}

function getCurrentPrompt(): string {
  return localStorage.getItem(STORAGE_KEY_PROMPT) || DEFAULT_PROMPT;
}

async function deepseekIntentRecognition(userMessage: string): Promise<DeepSeekResult | null> {
  const baseUrl = getCurrentBaseUrl();
  const apiKey = getCurrentApiKey();
  const prompt = getCurrentPrompt();

  if (!apiKey) return null;

  const systemPrompt = prompt.replace('{user_message}', userMessage);

  try {
    const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
        ],
        temperature: 0,
        max_tokens: 1024,
      }),
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.command) return null;

    return {
      command: parsed.command,
      payload: parsed.payload || {},
      reply: parsed.reply || null,
    };
  } catch {
    return null;
  }
}

function sendMessage(): void {
  const text = chatInput.value.trim();
  if (!text || isProcessing) return;
  chatInput.value = '';
  chatInput.style.height = 'auto';
  handleUserMessage(text);
}

sendBtn.addEventListener('click', sendMessage);

chatInput.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
});

document.querySelectorAll('.quick-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const cmd = (chip as HTMLElement).dataset.cmd;
    if (cmd) {
      chatInput.value = cmd;
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
      sendMessage();
    }
  });
});

document.getElementById('settingsBtn')!.addEventListener('click', () => {
  loadSettings();
  settingsOverlay.classList.add('open');
});

document.getElementById('settingsSave')!.addEventListener('click', saveSettings);
document.getElementById('settingsCancel')!.addEventListener('click', () => {
  settingsOverlay.classList.remove('open');
});
document.getElementById('settingsReset')!.addEventListener('click', resetSettings);

settingsOverlay.addEventListener('click', (e: Event) => {
  if (e.target === settingsOverlay) {
    settingsOverlay.classList.remove('open');
  }
});

loadSettings();

setTimeout(() => {
  const id = 'req_' + (++reqCounter);
  const request = {
    type: 'request', id,
    command: 'get_active_tab',
    payload: {},
    timestamp: Date.now(),
  };
  pendingRequests[id] = { command: 'get_active_tab', payload: {}, sentAt: Date.now(), toolEl: null };
  parent.postMessage(request, origin);
}, 500);
