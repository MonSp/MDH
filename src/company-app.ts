import { TOOL_DEFINITIONS, DEFAULT_SYSTEM_PROMPT } from './prompt';

interface PendingRequest {
  command: string;
  payload: Record<string, unknown>;
  sentAt: number;
  statusEl: HTMLElement | null;
  /* for plan: step index */
  stepIndex?: number;
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
const STORAGE_KEY_PROMPT = 'deepseek_system_prompt';

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

function getCommandIcon(cmd: string): string {
  const icons: Record<string, string> = {
    navigate: '🌐', search: '🔍', click_button: '👆', fill_field: '⌨',
    login: '🔑', scroll: '↕', wait: '⏱', get_screenshot: '📸',
    get_tabs: '📑', switch_tab: '↗', create_tab: '➕', close_tab: '✕',
    press_key: '⌨', evaluate_js: '⚡', execute_plan: '📋',
  };
  return icons[cmd] || '▶';
}

function formatPayloadSummary(payload: Record<string, unknown>): string {
  if (!payload || Object.keys(payload).length === 0) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(payload)) {
    if (k === 'steps' || k === 'manifest_version') continue;
    const val = typeof v === 'string' ? (v.length > 24 ? v.substring(0, 21) + '...' : v) : String(v);
    parts.push(val);
  }
  return parts.join(' · ');
}

function createExecStatus(cmd: string, payload: Record<string, unknown>): HTMLElement {
  dismissWelcome();
  const card = document.createElement('div');
  card.className = 'exec-status running';

  const params = Object.entries(payload)
    .filter(([k]) => k !== 'steps' && k !== 'manifest_version')
    .map(([k, v]) => {
      const val = typeof v === 'string' ? v : JSON.stringify(v);
      return `<span class="exec-param"><span class="exec-param-key">${escapeHtml(k)}</span><span class="exec-param-val">${escapeHtml(val)}</span></span>`;
    })
    .join('');

  card.innerHTML = `
    <div class="exec-header">
      <span class="exec-icon">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.2" stroke-dasharray="8 4" fill="none"/>
        </svg>
      </span>
      <span class="exec-cmd-name">${getFriendlyName(cmd)}</span>
      <span class="exec-elapsed" data-elapsed>0.0s</span>
    </div>
    <div class="exec-progress"><div class="exec-progress-bar" style="width:20%"></div></div>
    ${params ? `<div class="exec-body"><div class="exec-params">${params}</div></div>` : ''}
  `;

  chatArea.appendChild(card);
  chatArea.scrollTop = chatArea.scrollHeight;
  startElapsedTimer(card);
  return card;
}

function startElapsedTimer(card: HTMLElement): void {
  const elapsedEl = card.querySelector('[data-elapsed]');
  if (!elapsedEl) return;
  const start = Date.now();
  const iv = setInterval(() => {
    if (!card.parentNode) { clearInterval(iv); return; }
    const s = (Date.now() - start) / 1000;
    elapsedEl.textContent = s.toFixed(1) + 's';
  }, 100);
}

function updateExecStatus(card: HTMLElement, success: boolean, errorMsg: string | null): void {
  card.classList.remove('running');
  card.classList.add(success ? 'done' : 'error');

  const header = card.querySelector('.exec-header')!;
  const elapsed = header.querySelector('.exec-elapsed');
  if (elapsed) elapsed.remove();

  const icon = card.querySelector('.exec-icon')!;
  icon.innerHTML = success
    ? '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7L6 10L11 4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 4L10 10M10 4L4 10" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>';

  const nameEl = header.querySelector('.exec-cmd-name')!;
  nameEl.textContent = success ? getFriendlyName(nameEl.textContent || '') : (nameEl.textContent || '操作') + ' 失败';

  if (errorMsg) {
    const body = card.querySelector('.exec-body');
    if (body) {
      body.innerHTML = `<div class="exec-error-msg">${escapeHtml(errorMsg)}</div>`;
    } else {
      const errDiv = document.createElement('div');
      errDiv.className = 'exec-body';
      errDiv.innerHTML = `<div class="exec-error-msg">${escapeHtml(errorMsg)}</div>`;
      card.appendChild(errDiv);
    }
  }
}

function createPlanTimeline(payload: Record<string, unknown>): HTMLElement {
  dismissWelcome();
  const steps = (payload.steps || []) as Array<{ command: string; payload?: Record<string, unknown> }>;
  const total = steps.length;

  const timeline = document.createElement('div');
  timeline.className = 'plan-timeline';

  let stepsHtml = '';
  steps.forEach((step, i) => {
    const summary = step.payload ? formatPayloadSummary(step.payload) : '';
    stepsHtml += `
      <div class="plan-step" data-step="${i}">
        <div class="plan-step-indicator">
          <div class="plan-step-dot"></div>
          <div class="plan-step-line"></div>
        </div>
        <div class="plan-step-body">
          <div class="plan-step-cmd">${getFriendlyName(step.command)}</div>
          ${summary ? `<div class="plan-step-params">${escapeHtml(summary)}</div>` : ''}
          <div class="plan-step-status"></div>
        </div>
      </div>
    `;
  });

  timeline.innerHTML = `
    <div class="plan-header">
      <span>PLAN</span>
      <span class="plan-progress-text" data-plan-progress>0 / ${total}</span>
    </div>
    ${stepsHtml}
    <div class="plan-summary">
      <div class="plan-summary-item"><span class="plan-summary-label">步骤</span><span class="plan-summary-val" data-plan-total>${total}</span></div>
      <div class="plan-summary-item"><span class="plan-summary-label">完成</span><span class="plan-summary-val" data-plan-done>0</span></div>
    </div>
  `;

  chatArea.appendChild(timeline);
  chatArea.scrollTop = chatArea.scrollHeight;
  return timeline;
}

function updatePlanStep(timeline: HTMLElement, stepIndex: number, status: 'active' | 'done' | 'error', errorMsg?: string): void {
  const step = timeline.querySelector(`[data-step="${stepIndex}"]`);
  if (!step) return;
  step.className = `plan-step ${status}`;

  const statusEl = step.querySelector('.plan-step-status')!;
  if (status === 'active') {
    statusEl.textContent = 'EXECUTING';
  } else if (status === 'done') {
    statusEl.textContent = 'DONE';
  } else {
    statusEl.textContent = errorMsg ? `FAILED: ${errorMsg}` : 'FAILED';
  }

  const progressEl = timeline.querySelector('[data-plan-progress]')!;
  const doneEl = timeline.querySelector('[data-plan-done]')!;
  const total = Number.parseInt(timeline.querySelector('[data-plan-total]')!.textContent || '0', 10);
  const doneCount = timeline.querySelectorAll('.plan-step.done').length;
  progressEl.textContent = `${doneCount} / ${total}`;
  doneEl.textContent = String(doneCount);

  chatArea.scrollTop = chatArea.scrollHeight;
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
    <div class="msg-body">
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
    <div class="msg-body">
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

function sendCommand(command: string, payload: Record<string, unknown>, statusEl: HTMLElement | null, stepIndex?: number): void {
  const id = 'req_' + (++reqCounter);
  const request = {
    type: 'request', id, command, payload, timestamp: Date.now(),
  };
  pendingRequests[id] = { command, payload, sentAt: Date.now(), statusEl, stepIndex };
  parent.postMessage(request, origin);
}

handleResponse = function(msg: ParentMessage): void {
  const req = pendingRequests[msg.id];
  if (req) delete pendingRequests[msg.id];

  const cmd = msg.command || 'unknown';
  const hasError = !!msg.error;

  if (req && req.statusEl) {
    if (req.statusEl.classList.contains('exec-status')) {
      updateExecStatus(req.statusEl, !hasError, hasError ? (msg.error!.message || msg.error!.code) : null);
    } else if (req.statusEl.classList.contains('plan-timeline')) {
      const status: 'done' | 'error' = hasError ? 'error' : 'done';
      updatePlanStep(req.statusEl, req.stepIndex!, status, hasError ? (msg.error!.message || msg.error!.code) : undefined);
    }
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
      if (req && req.statusEl) {
        const hasError = !!msg.error;
        if (req.statusEl.classList.contains('exec-status')) {
          updateExecStatus(req.statusEl, !hasError, hasError ? (msg.error!.message || msg.error!.code) : null);
        }
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

  const msg = addMessage('agent', '', formatTime());
  const bubble = msg.querySelector('.msg-bubble')!;
  if (deepseekReply) {
    bubble.textContent = deepseekReply;
  } else {
    bubble.textContent = `正在${getFriendlyName(command)}…`;
  }

  if (command === 'execute_plan') {
    await handlePlanExecution(command, payload, msg);
  } else {
    const statusCard = createExecStatus(command, payload);
    sendCommand(command, payload, statusCard);

    try {
      const result = await waitForResponse(command);
      bubble.innerHTML = '';
      const responseText = buildResponseText(command, payload, result);
      await streamText(msg, responseText, 12);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '未知错误';
      bubble.innerHTML = simpleMarkdown(`❌ ${getFriendlyName(command)}失败: ${escapeHtml(message)}`);
    }
  }

  isProcessing = false;
}

async function handlePlanExecution(command: string, payload: Record<string, unknown>, msg: HTMLElement): Promise<void> {
  const steps = (payload.steps || []) as Array<{ command: string; payload?: Record<string, unknown> }>;
  const timeline = createPlanTimeline(payload);

  let allDone = 0;
  let hasError = false;

  for (let i = 0; i < steps.length; i++) {
    if (hasError && payload.stop_on_error) break;

    const step = steps[i];
    updatePlanStep(timeline, i, 'active');

    sendCommand(step.command ?? '', step.payload ?? {}, timeline, i);

    try {
      await waitForResponse(step.command ?? '');
      allDone++;
    } catch {
      hasError = true;
    }
  }

  const bubble = msg.querySelector('.msg-bubble')!;
  bubble.innerHTML = '';
  if (hasError) {
    bubble.innerHTML = simpleMarkdown(`⚠ 计划执行中断\n完成: ${allDone}/${steps.length} 个步骤`);
  } else {
    bubble.innerHTML = simpleMarkdown(`✅ 计划执行完成\n共 ${steps.length} 个步骤全部成功`);
  }
  chatArea.scrollTop = chatArea.scrollHeight;
}

function loadSettings(): void {
  cfgBaseUrl.value = localStorage.getItem(STORAGE_KEY_BASE_URL) || DEFAULT_BASE_URL;
  cfgApiKey.value = localStorage.getItem(STORAGE_KEY_API_KEY) || DEFAULT_API_KEY;
  cfgPrompt.value = localStorage.getItem(STORAGE_KEY_PROMPT) || DEFAULT_SYSTEM_PROMPT;
}

function saveSettings(): void {
  const baseUrl = cfgBaseUrl.value.trim() || DEFAULT_BASE_URL;
  const apiKey = cfgApiKey.value.trim();
  const prompt = cfgPrompt.value.trim() || DEFAULT_SYSTEM_PROMPT;
  localStorage.setItem(STORAGE_KEY_BASE_URL, baseUrl);
  localStorage.setItem(STORAGE_KEY_API_KEY, apiKey);
  localStorage.setItem(STORAGE_KEY_PROMPT, prompt);
  settingsOverlay.classList.remove('open');
}

function resetSettings(): void {
  cfgBaseUrl.value = DEFAULT_BASE_URL;
  cfgApiKey.value = DEFAULT_API_KEY;
  cfgPrompt.value = DEFAULT_SYSTEM_PROMPT;
}

function getCurrentBaseUrl(): string {
  return localStorage.getItem(STORAGE_KEY_BASE_URL) || DEFAULT_BASE_URL;
}

function getCurrentApiKey(): string {
  return localStorage.getItem(STORAGE_KEY_API_KEY) || DEFAULT_API_KEY;
}

function getCurrentSystemPrompt(): string {
  return localStorage.getItem(STORAGE_KEY_PROMPT) || DEFAULT_SYSTEM_PROMPT;
}

async function deepseekIntentRecognition(userMessage: string): Promise<DeepSeekResult | null> {
  const baseUrl = getCurrentBaseUrl();
  const apiKey = getCurrentApiKey();
  const systemPrompt = getCurrentSystemPrompt();

  if (!apiKey) return null;

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
          { role: 'system', content: systemPrompt.replace('{user_message}', userMessage) },
          { role: 'user', content: userMessage },
        ],
        tools: TOOL_DEFINITIONS,
        temperature: 0,
        max_tokens: 1024,
      }),
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    const message = data.choices?.[0]?.message;
    if (!message) return null;

    const toolCalls = message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) return null;

    const toolCall = toolCalls[0];
    const command = toolCall.function?.name;
    if (!command) return null;

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(toolCall.function?.arguments || '{}');
    } catch { /* ignore */ }

    return {
      command,
      payload,
      reply: message.content || null,
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
  pendingRequests[id] = { command: 'get_active_tab', payload: {}, sentAt: Date.now(), statusEl: null };
  parent.postMessage(request, origin);
}, 500);
