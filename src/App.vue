<template>
  <div class="app-shell">
    <header class="header">
      <div class="header-left">
        <div class="dot-live"></div>
        <div class="header-title">AI <span>Agent</span></div>
      </div>
      <div class="header-right">
        <div class="header-status"><span>●</span> ONLINE</div>
        <button class="settings-btn" @click="openSettings" title="配置">
          <svg viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2.5" stroke="currentColor" stroke-width="1"/><path d="M7 1.5 L7.8 3.2 L7 4.5 L6.2 3.2 Z M12.5 7 L11 7.5 L10.2 6.5 L11 5.5 Z M1.5 7 L3 7.5 L3.8 6.5 L3 5.5 Z M7 12.5 L7.8 10.8 L6.2 9.5 L5.5 10.3 Z" stroke="currentColor" stroke-width="0.8" fill="none"/></svg>
        </button>
      </div>
    </header>

    <div class="conv-stream" ref="streamRef">
      <div class="conv-empty" v-if="!conversations.length">
        <div class="empty-graphic">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect x="4" y="4" width="40" height="40" rx="12" stroke="currentColor" stroke-width="0.8" opacity="0.2"/>
            <path d="M16 20 L24 14 L32 20" stroke="currentColor" stroke-width="1.2" opacity="0.3" fill="none" stroke-linecap="round"/>
            <path d="M16 28 L24 22 L32 28" stroke="currentColor" stroke-width="1.2" opacity="0.2" fill="none" stroke-linecap="round"/>
          </svg>
        </div>
        <p class="empty-title">AI Agent 就绪</p>
        <p class="empty-desc">输入自然语言指令，AI 将自动编排并执行浏览器操作</p>
      </div>

      <div
        class="conv-block"
        v-for="conv in conversations"
        :key="conv.id"
      >
        <div class="msg msg-user">
          <div class="msg-avatar msg-avatar-user">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="5" r="3.5" stroke="currentColor" stroke-width="0.8"/><path d="M3.5 13C3.5 10 5.5 8 7 8C8.5 8 10.5 10 10.5 13" stroke="currentColor" stroke-width="0.8"/></svg>
          </div>
          <div class="msg-bubble msg-bubble-user">{{ conv.userMessage }}</div>
        </div>

        <div class="msg msg-agent">
          <div class="msg-avatar msg-avatar-agent">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="3" y="2" width="8" height="8" rx="2" stroke="currentColor" stroke-width="0.8"/><path d="M5 6 L7 8 L9 6" stroke="currentColor" stroke-width="0.8" fill="none" stroke-linecap="round"/><circle cx="7" cy="6" r="1" fill="currentColor" opacity="0.4"/></svg>
          </div>
          <div class="msg-body">

            <div class="think-section" v-if="conv.thinkItems.length">
              <div
                v-if="conv.thinkingCollapsed"
                class="think-summary-bar"
                @click="conv.thinkingCollapsed = false"
              >
                <span class="think-summary-icon">◈</span>
                <span class="think-summary-text">{{ conv.thinkItems[conv.thinkItems.length - 1].content.substring(0, 60) }}{{ conv.thinkItems[conv.thinkItems.length - 1].content.length > 60 ? '...' : '' }}</span>
                <span class="think-summary-count">{{ conv.thinkItems.length }} 步推理</span>
                <span class="think-summary-expand">展开 ▸</span>
              </div>
              <template v-else>
                <div class="think-header-row">
                  <span class="think-header-label">推理过程</span>
                  <button
                    class="think-collapse-btn"
                    @click="conv.thinkingCollapsed = true"
                    v-if="conv.pipelineStatus === 'done' || conv.pipelineStatus === 'error' || conv.pipelineStatus === 'unknown'"
                  >收起 ▾</button>
                </div>
                <div
                  class="agent-think-line"
                  v-for="(item, idx) in conv.thinkItems"
                  :key="idx"
                  :class="{
                    'think-active': conv.pipelineStatus === 'running' && idx === conv.thinkItems.length - 1,
                    'think-historical': conv.pipelineStatus === 'running' && idx < conv.thinkItems.length - 1
                  }"
                  :style="{ animationDelay: idx * 0.06 + 's' }"
                >
                  <span class="think-tag-inline" :class="item.tag">{{ item.tagText }}</span>
                  <span class="think-text-inline">{{ item.content }}</span>
                </div>
              </template>
            </div>

            <div class="phase-divider" v-if="conv.timeline.length && !conv.thinkingCollapsed && conv.thinkItems.length">
              <div class="phase-line"></div>
              <div class="phase-label">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 1L8 5L2 9" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                执行阶段
              </div>
              <div class="phase-line"></div>
            </div>

            <div class="agent-pipeline" v-if="conv.timeline.length && !conv.thinkingCollapsed">
              <div
                class="pipeline-step"
                v-for="(step, i) in conv.timeline"
                :key="i"
              >
                <div class="pip-dot" :class="step.status">
                  <svg v-if="step.status === 'done'" width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3.5 6L6.5 2" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  <span v-else-if="step.status === 'error'" class="pip-x">✕</span>
                </div>
                <div class="pip-connector" v-if="i < conv.timeline.length - 1" :class="step.status === 'done' ? 'conn-done' : 'conn-pending'"></div>
                <div class="pip-info">
                  <span class="pip-name" :class="{
                    'pip-name-done': step.status === 'done',
                    'pip-name-active': step.status === 'active',
                    'pip-name-err': step.status === 'error'
                  }">{{ step.name }}</span>
                  <span class="pip-detail" v-if="step.detail">{{ step.detail }}</span>
                  <span class="pip-duration" v-if="step.duration">{{ step.duration }}</span>
                </div>
              </div>
            </div>

            <div class="timeline-mini-bar" v-if="conv.timeline.length && conv.thinkingCollapsed && (conv.pipelineStatus === 'done' || conv.pipelineStatus === 'error')">
              <div class="mini-bar-track">
                <div
                  class="mini-bar-fill"
                  :style="{ width: miniBarWidth(conv) + '%' }"
                ></div>
              </div>
              <div class="mini-bar-info">
                <span class="mini-bar-steps">{{ conv.timeline.filter(s => s.status === 'done').length }}/{{ conv.timeline.length }} 步骤完成</span>
                <span class="mini-bar-duration" v-if="totalDuration(conv)">{{ totalDuration(conv) }}</span>
              </div>
            </div>

            <div class="agent-result" v-if="conv.pipelineStatus === 'done' && conv.result">
              <div class="agent-result-text" v-if="conv.result.summary">{{ conv.result.summary }}</div>
              <div class="result-stats" v-if="conv.result.stats && conv.result.stats.length">
                <span class="result-stat" v-for="(stat, i) in conv.result.stats" :key="i">
                  <strong>{{ stat.val }}</strong> {{ stat.label }}
                </span>
              </div>
              <div class="result-file" v-if="conv.result.file">
                <span class="result-file-icon">{{ conv.result.file.icon }}</span>
                <span class="result-file-name">{{ conv.result.file.name }}</span>
                <span class="result-file-size">{{ conv.result.file.size }}</span>
              </div>

              <button class="agent-log-toggle" @click="conv.terminalOpen = !conv.terminalOpen">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3L5 6L8 3" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>
                {{ conv.terminalOpen ? '收起' : '查看详细日志' }}
              </button>
              <div class="agent-log" v-if="conv.terminalOpen">
                <div class="agent-log-line" v-for="(line, li) in conv.terminalLines" :key="li">
                  <span class="log-prompt">$</span> {{ line.text }}
                  <span v-if="line.ok === true" class="log-ok">OK</span>
                </div>
              </div>

              <div class="result-actions">
                <button class="action-btn" @click="rerunTask(conv)">↻ 重新运行</button>
                <button class="action-btn" @click="shareReport">↗ 分享报告</button>
              </div>
            </div>

            <div class="agent-loading" v-if="conv.pipelineStatus === 'running'">
              <span class="loading-dot-pulse"></span>
              <span>执行中...</span>
            </div>

            <div class="agent-error" v-if="conv.pipelineStatus === 'error'">
              <span class="error-icon">⚠</span>
              <span>执行遇到错误，请重试</span>
            </div>

            <div class="agent-unknown" v-if="conv.pipelineStatus === 'unknown'">
              抱歉，我没有理解你的指令。你可以试试：打开网页、搜索内容、截图、获取标签页、按键、执行 JS 等。
            </div>

          </div>
        </div>
      </div>
    </div>

    <div class="input-bar">
      <div class="input-wrap">
        <textarea
          class="chat-input"
          v-model="chatText"
          rows="1"
          placeholder="输入指令，例如：生成本周销售周报并发送邮件..."
          @keydown="handleKeydown"
          @input="autoResize"
          ref="inputRef"
        ></textarea>
        <button class="send-btn" @click="sendMessage" title="发送">
          <svg viewBox="0 0 16 16" fill="none"><path d="M2 2 L14 8 L2 14 L4 8 L2 2Z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <div class="input-hint"><kbd>Enter</kbd> 发送 · <kbd>Shift+Enter</kbd> 换行</div>
    </div>

    <div class="settings-overlay" :class="{ open: settingsOpen }" @click.self="settingsOpen = false">
      <div class="settings-panel">
        <h3><span>⚙</span> API 配置</h3>
        <div class="settings-group">
          <label class="settings-label">BASE URL</label>
          <input class="settings-input" type="text" v-model="settingsCfg.baseUrl" placeholder="https://api.deepseek.com">
          <div class="settings-hint">DeepSeek API 地址</div>
        </div>
        <div class="settings-group">
          <label class="settings-label">API KEY</label>
          <input class="settings-input" type="password" v-model="settingsCfg.apiKey" placeholder="sk-...">
          <div class="settings-hint">您的 DeepSeek API Key</div>
        </div>
        <hr class="settings-divider">
        <h3><span>📝</span> System Prompt</h3>
        <div class="settings-group">
          <label class="settings-label">系统提示词</label>
          <textarea class="settings-textarea" v-model="settingsCfg.prompt" placeholder="输入系统提示词..."></textarea>
          <div class="settings-hint">可用 <code>{user_message}</code> 作为占位符。命令解析由 Tool Calling 完成。</div>
        </div>
        <div class="settings-actions">
          <button class="settings-btn-reset" @click="resetSettings">恢复默认</button>
          <button class="settings-btn-secondary" @click="settingsOpen = false">取消</button>
          <button class="settings-btn-primary" @click="saveSettings">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick, watch } from 'vue';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_API_KEY = '';
const DEFAULT_SYSTEM_PROMPT = '你是一个浏览器自动化助手。根据用户的自然语言指令调用工具执行浏览器操作。如果无法识别，请用中文说明可执行的操作。用户指令: {user_message}';

const TOOL_DEFINITIONS = [
  { type:'function',function:{ name:'navigate',description:'导航到指定网页',parameters:{ type:'object',properties:{ url:{ type:'string',description:'完整URL' } },required:['url'] } } },
  { type:'function',function:{ name:'search',description:'搜索',parameters:{ type:'object',properties:{ query:{ type:'string',description:'关键词' } },required:['query'] } } },
  { type:'function',function:{ name:'click_button',description:'点击按钮',parameters:{ type:'object',properties:{ button_label:{ type:'string',description:'按钮文字' } },required:['button_label'] } } },
  { type:'function',function:{ name:'fill_field',description:'填写字段',parameters:{ type:'object',properties:{ field_name:{ type:'string',description:'字段名' },value:{ type:'string',description:'输入值' } },required:['field_name','value'] } } },
  { type:'function',function:{ name:'scroll',description:'滚动页面',parameters:{ type:'object',properties:{ y:{ type:'integer',description:'像素' } },required:['y'] } } },
  { type:'function',function:{ name:'wait',description:'等待',parameters:{ type:'object',properties:{ timeout_ms:{ type:'integer',description:'毫秒' } },required:['timeout_ms'] } } },
  { type:'function',function:{ name:'get_screenshot',description:'截图',parameters:{ type:'object',properties:{},required:[] } } },
  { type:'function',function:{ name:'get_tabs',description:'获取标签页',parameters:{ type:'object',properties:{},required:[] } } },
  { type:'function',function:{ name:'switch_tab',description:'切换标签页',parameters:{ type:'object',properties:{ tab_id:{ type:'integer',description:'标签页ID' } },required:['tab_id'] } } },
  { type:'function',function:{ name:'create_tab',description:'新建标签页',parameters:{ type:'object',properties:{ url:{ type:'string',description:'URL(可选)' } },required:[] } } },
  { type:'function',function:{ name:'close_tab',description:'关闭标签页',parameters:{ type:'object',properties:{ tab_id:{ type:'integer',description:'标签页ID' } },required:['tab_id'] } } },
  { type:'function',function:{ name:'press_key',description:'按键',parameters:{ type:'object',properties:{ key:{ type:'string',description:'键名' } },required:['key'] } } },
  { type:'function',function:{ name:'evaluate_js',description:'执行JS',parameters:{ type:'object',properties:{ code:{ type:'string',description:'JS代码' } },required:['code'] } } },
  { type:'function',function:{ name:'execute_plan',description:'执行多步计划',parameters:{ type:'object',properties:{ steps:{ type:'array',description:'步骤数组' },stop_on_error:{ type:'boolean',description:'遇错停止' } },required:['steps'] } } }
];

const STORAGE_KEY_BASE_URL = 'deepseek_base_url';
const STORAGE_KEY_API_KEY = 'deepseek_api_key';
const STORAGE_KEY_PROMPT = 'deepseek_system_prompt';

const cmdNames = {
  navigate:'导航', search:'搜索', click_button:'点击元素', fill_field:'填写字段',
  login:'登录', scroll:'滚动', wait:'等待', get_screenshot:'截图', get_tabs:'获取标签页',
  switch_tab:'切换标签页', create_tab:'新建标签页', close_tab:'关闭标签页',
  press_key:'按键', evaluate_js:'执行脚本', execute_plan:'执行计划'
};

function getFriendlyName(cmd) { return cmdNames[cmd] || cmd; }

function parseLocal(text) {
  const t = text.trim();
  const patterns = [
    [/^(?:打开|前往|导航[到至]?|访问|go\s+to)\s+(.+)/i, 'navigate', m => ({ url: /^https?:\/\//i.test(m[1].trim()) ? m[1].trim() : 'https://' + m[1].trim() + '.com' })],
    [/^搜索\s+(.+)/i, 'search', m => ({ query: m[1].trim() })],
    [/^点击\s+(.+)/i, 'click_button', m => ({ button_label: m[1].trim() })],
    [/^(?:输入|填写?)\s*(.+?)\s*(?:到|在)\s*(.+)/i, 'fill_field', m => ({ field_name: m[2].trim(), value: m[1].trim() })],
    [/^(?:向下|up|down)\s*(?:滚动|scroll)\s*(\d+)?/i, 'scroll', m => ({ y: (/up/i.test(m[0]) ? -1 : 1) * (parseInt(m[1]) || 300), behavior:'smooth' })],
    [/^等待\s*(\d+)\s*(?:秒|s)/i, 'wait', m => ({ timeout_ms: parseInt(m[1]) * 1000 })],
    [/^(?:截图|截取|screenshot)/i, 'get_screenshot', () => ({})],
    [/^(?:列出|获取)?\s*(?:所有)?标签页/i, 'get_tabs', () => ({})],
    [/^按(?:下)?键?\s*(.+)/i, 'press_key', m => ({ key: m[1].trim() })],
    [/^运行[：:]\s*([\s\S]+)/i, 'evaluate_js', m => ({ code: m[1].trim() })],
    [/^执行计划\s*([\s\S]+)/i, 'execute_plan', m => {
      let steps = [];
      try { steps = JSON.parse(m[1]); } catch(e) {}
      return { steps, stop_on_error: true };
    }],
  ];
  for (const [r, cmd, fn] of patterns) {
    const match = t.match(r);
    if (match) return { command: cmd, payload: fn(match) };
  }
  return null;
}

const origin = window.location.origin;
const chatText = ref('');
const isProcessing = ref(false);
const pendingRequests = reactive({});
const reqCounter = ref(0);
const streamRef = ref(null);
const inputRef = ref(null);
const settingsOpen = ref(false);
const settingsCfg = reactive({ baseUrl: DEFAULT_BASE_URL, apiKey: DEFAULT_API_KEY, prompt: DEFAULT_SYSTEM_PROMPT });

const conversations = ref([
  {
    id: 'conv_demo_1',
    userMessage: '生成本周销售周报并发送邮件',
    timestamp: Date.now() - 5000,
    pipelineStatus: 'done',
    thinkItems: [
      { tag: 'intent', tagText: '意图', content: '解析指令，识别到复合型任务：数据检索 → 图表生成 → 邮件发送' },
      { tag: 'tool', tagText: '工具', content: '匹配到工具：数据查询、报表生成、邮件服务。准备编排执行顺序。' },
      { tag: 'reason', tagText: '推理', content: '参数"时间范围"缺失，根据上下文自动补全为"本周"。参数校验通过。' },
      { tag: 'intent', tagText: '意图', content: '确认为三个子目标的复合任务，开始构建执行计划。' },
      { tag: 'reason', tagText: '推理', content: '输出格式为 PDF，选择高保真渲染引擎以确保图表质量。' },
    ],
    timeline: [
      { status:'done', name:'数据检索', detail:'328 条记录', duration:'1.2s' },
      { status:'done', name:'生成图表', detail:'3 个图表', duration:'0.8s' },
      { status:'done', name:'发送邮件', detail:'3 位收件人', duration:'0.5s' },
    ],
    result: {
      summary: '✅ 任务完成！已生成周报并发送给 3 位收件人。',
      stats: [
        { val:'328', label:'记录' },
        { val:'3.6s', label:'耗时' },
        { val:'100%', label:'成功率' },
      ],
      file: { name:'weekly_sales_report.pdf', size:'2.4 MB', icon:'📄' },
    },
    terminalOpen: false,
    terminalLines: [
      { text:'Fetching data from API...', ok:true },
      { text:'Processing 328 records...', ok:true },
      { text:'Generating chart components...', ok:true },
      { text:'Compiling PDF report...', ok:true },
      { text:'Output: weekly_sales_report.pdf (2.4 MB)', ok:null },
    ],
    thinkingCollapsed: true,
  },
]);

function scrollToBottom() {
  nextTick(() => {
    if (streamRef.value) {
      streamRef.value.scrollTop = streamRef.value.scrollHeight;
    }
  });
}

watch(conversations, () => scrollToBottom(), { deep: true });

function rerunTask(conv) {
  chatText.value = conv.userMessage;
  nextTick(() => {
    inputRef.value?.focus();
    sendMessage();
  });
}
function shareReport() {
  const card = streamRef.value?.querySelector('.result-file');
  if (card) {
    card.style.boxShadow = '0 0 24px rgba(77,159,255,0.25)';
    setTimeout(() => { if (card) card.style.boxShadow = ''; }, 600);
  }
}

function openSettings() {
  settingsCfg.baseUrl = localStorage.getItem(STORAGE_KEY_BASE_URL) || DEFAULT_BASE_URL;
  settingsCfg.apiKey = localStorage.getItem(STORAGE_KEY_API_KEY) || DEFAULT_API_KEY;
  settingsCfg.prompt = localStorage.getItem(STORAGE_KEY_PROMPT) || DEFAULT_SYSTEM_PROMPT;
  settingsOpen.value = true;
}
function saveSettings() {
  localStorage.setItem(STORAGE_KEY_BASE_URL, settingsCfg.baseUrl.trim() || DEFAULT_BASE_URL);
  localStorage.setItem(STORAGE_KEY_API_KEY, settingsCfg.apiKey.trim());
  localStorage.setItem(STORAGE_KEY_PROMPT, settingsCfg.prompt.trim() || DEFAULT_SYSTEM_PROMPT);
  settingsOpen.value = false;
}
function resetSettings() {
  settingsCfg.baseUrl = DEFAULT_BASE_URL;
  settingsCfg.apiKey = DEFAULT_API_KEY;
  settingsCfg.prompt = DEFAULT_SYSTEM_PROMPT;
}

function getBaseUrl() { return localStorage.getItem(STORAGE_KEY_BASE_URL) || DEFAULT_BASE_URL; }
function getApiKey() { return localStorage.getItem(STORAGE_KEY_API_KEY) || DEFAULT_API_KEY; }
function getPrompt() { return localStorage.getItem(STORAGE_KEY_PROMPT) || DEFAULT_SYSTEM_PROMPT; }

async function deepseekRecognize(userMessage) {
  const apiKey = getApiKey();
  if (!apiKey) return null;
  try {
    const resp = await fetch(`${getBaseUrl()}/v1/chat/completions`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` },
      body: JSON.stringify({
        model:'deepseek-chat',
        messages:[
          { role:'system', content: getPrompt().replace('{user_message}', userMessage) },
          { role:'user', content: userMessage }
        ],
        tools: TOOL_DEFINITIONS, temperature:0, max_tokens:1024
      })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) return null;
    const tcs = msg.tool_calls;
    if (!tcs || !tcs.length) return null;
    const tc = tcs[0];
    const command = tc.function?.name;
    if (!command) return null;
    let payload = {};
    try { payload = JSON.parse(tc.function?.arguments || '{}'); } catch(e) {}
    return { command, payload, reply: msg.content || null };
  } catch { return null; }
}

function sendCommand(command, payload, stepIndex) {
  const id = 'req_' + (++reqCounter.value);
  pendingRequests[id] = { command, payload, sentAt: Date.now(), stepIndex };
  parent.postMessage({ type:'request', id, command, payload, timestamp:Date.now() }, origin);
}

function waitForResponse(command) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timeout = 15000;
    function check() {
      if (Date.now() - start > timeout) { reject(new Error('超时')); return; }
      const still = Object.keys(pendingRequests).some(k => pendingRequests[k] && pendingRequests[k].command === command);
      if (!still) resolve({ success:true });
      else setTimeout(check, 100);
    }
    setTimeout(check, 200);
  });
}

function newConversation(userMessage) {
  return {
    id: 'conv_' + Date.now(),
    userMessage,
    timestamp: Date.now(),
    pipelineStatus: 'running',
    thinkItems: [],
    timeline: [],
    result: null,
    terminalOpen: false,
    terminalLines: [],
    thinkingCollapsed: false,
  };
}

function miniBarWidth(conv) {
  const total = conv.timeline.length;
  if (!total) return 0;
  const done = conv.timeline.filter(s => s.status === 'done').length;
  const errors = conv.timeline.filter(s => s.status === 'error').length;
  return ((done + errors) / total) * 100;
}

function totalDuration(conv) {
  const durations = conv.timeline
    .filter(s => s.duration)
    .map(s => parseFloat(s.duration));
  if (!durations.length) return '';
  const total = durations.reduce((a, b) => a + b, 0);
  return total.toFixed(1) + 's 总耗时';
}

async function sendMessage() {
  const text = chatText.value.trim();
  if (!text || isProcessing.value) return;
  chatText.value = '';
  isProcessing.value = true;

  const conv = newConversation(text);
  conversations.value.push(conv);
  scrollToBottom();

  conv.thinkItems.push({ tag:'intent', tagText:'意图', content:'解析用户指令：「' + text.substring(0,40) + '」...识别操作意图及目标。' });
  scrollToBottom();

  let parsed = null;
  const ds = await deepseekRecognize(text);
  if (ds) parsed = { command: ds.command, payload: ds.payload };

  if (!parsed) {
    const local = parseLocal(text);
    if (local) {
      parsed = local;
      conv.thinkItems.push({ tag:'intent', tagText:'意图', content:'通过本地规则匹配: ' + getFriendlyName(parsed.command) });
      scrollToBottom();
    }
  }

  if (!parsed) {
    conv.thinkItems.push({ tag:'reason', tagText:'推理', content:'未匹配到可用工具，建议：导航、搜索、截图、获取标签页、滚动、等待、按键、执行JS等。' });
    conv.pipelineStatus = 'unknown';
    conv.thinkingCollapsed = true;
    isProcessing.value = false;
    scrollToBottom();
    return;
  }

  const { command, payload } = parsed;
  conv.thinkItems.push({ tag:'tool', tagText:'工具', content:'选择工具：「' + getFriendlyName(command) + '」，参数: ' + JSON.stringify(payload).substring(0,80) });
  scrollToBottom();

  if (command === 'execute_plan') {
    const t0 = Date.now();
    const steps = payload.steps || [];
    conv.timeline = steps.map((s) => ({
      status:'pending', name:getFriendlyName(s.command), detail:'等待中', duration:'',
    }));

    for (let i = 0; i < steps.length; i++) {
      const stepStart = Date.now();
      conv.timeline[i].status = 'active';
      conv.timeline[i].detail = '执行中...';
      conv.thinkItems.push({ tag:'reason', tagText:'步骤', content:'执行: ' + getFriendlyName(steps[i].command) });
      scrollToBottom();
      sendCommand(steps[i].command, steps[i].payload || {}, i);
      try {
        await waitForResponse(steps[i].command);
        conv.timeline[i].status = 'done';
        conv.timeline[i].detail = '';
        conv.timeline[i].duration = ((Date.now() - stepStart) / 1000).toFixed(1) + 's';
      } catch {
        conv.timeline[i].status = 'error';
        conv.timeline[i].detail = '失败';
        if (payload.stop_on_error) break;
      }
      scrollToBottom();
    }

    const totalDuration = ((Date.now() - t0) / 1000).toFixed(1);
    const doneCount = conv.timeline.filter(s => s.status === 'done').length;
    const hasError = conv.timeline.some(s => s.status === 'error');

    if (hasError) {
      conv.pipelineStatus = 'error';
      conv.thinkingCollapsed = true;
    } else {
      conv.pipelineStatus = 'done';
      conv.thinkingCollapsed = true;
      conv.result = {
        summary: '✅ 任务完成！共执行 ' + doneCount + ' 个步骤，全部成功。',
        stats: [
          { val: String(doneCount), label: '步骤' },
          { val: totalDuration + 's', label: '耗时' },
          { val: '100%', label: '成功率' },
        ],
        file: null,
      };
    }
  } else {
    const stepStart = Date.now();
    conv.timeline = [{ status:'active', name:getFriendlyName(command), detail:'执行中...', duration:'' }];
    sendCommand(command, payload, 0);
    try {
      const result = await waitForResponse(command);
      conv.timeline[0].status = 'done';
      conv.timeline[0].detail = '';
      conv.timeline[0].duration = ((Date.now() - stepStart) / 1000).toFixed(1) + 's';
      conv.pipelineStatus = 'done';
      conv.thinkingCollapsed = true;
      conv.result = {
        summary: '✅ ' + getFriendlyName(command) + '完成。',
        stats: [
          { val: '1', label: '步骤' },
          { val: conv.timeline[0].duration, label: '耗时' },
          { val: result?.error ? '0%' : '100%', label: '成功' },
        ],
        file: null,
      };
    } catch {
      conv.timeline[0].status = 'error';
      conv.timeline[0].detail = '失败';
      conv.pipelineStatus = 'error';
      conv.thinkingCollapsed = true;
    }
  }

  isProcessing.value = false;
  scrollToBottom();
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}
function autoResize(e) {
  e.target.style.height = 'auto';
  e.target.style.height = Math.min(e.target.scrollHeight, 90) + 'px';
}

onMounted(() => {
  settingsCfg.baseUrl = localStorage.getItem(STORAGE_KEY_BASE_URL) || DEFAULT_BASE_URL;
  settingsCfg.apiKey = localStorage.getItem(STORAGE_KEY_API_KEY) || DEFAULT_API_KEY;
  settingsCfg.prompt = localStorage.getItem(STORAGE_KEY_PROMPT) || DEFAULT_SYSTEM_PROMPT;

  window.addEventListener('message', event => {
    if (event.origin !== origin) return;
    const msg = event.data;
    if (!msg || msg.type !== 'response') return;
    delete pendingRequests[msg.id];
  });
});
</script>

<style>
@import './App.css';
</style>
