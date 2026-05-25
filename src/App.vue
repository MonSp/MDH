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

            <div
              class="agent-think-line"
              v-for="(item, idx) in conv.thinkItems"
              :key="idx"
              :style="{ animationDelay: idx * 0.08 + 's' }"
            >
              <span class="think-tag-inline" :class="item.tag">{{ item.tagText }}</span>
              <span class="think-text-inline">{{ item.content }}</span>
            </div>

            <div class="agent-pipeline" v-if="conv.timeline.length">
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
  };
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
    } else {
      conv.pipelineStatus = 'done';
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
:root {
  --bg-deep: #050b14;
  --bg-elevated: rgba(15, 25, 45, 0.85);
  --bg-input: rgba(8, 14, 26, 0.8);
  --border-card: rgba(90, 140, 210, 0.12);
  --border-glow: rgba(90, 140, 210, 0.22);
  --glass-blur: 16px;
  --blue: #4d9fff;
  --blue-dim: rgba(77, 159, 255, 0.1);
  --cyan: #3dd6c8;
  --cyan-dim: rgba(61, 214, 200, 0.1);
  --purple: #a78bfa;
  --purple-dim: rgba(167, 139, 250, 0.1);
  --amber: #f59e0b;
  --amber-dim: rgba(245, 158, 11, 0.1);
  --green: #34d399;
  --green-dim: rgba(52, 211, 153, 0.1);
  --red: #f87171;
  --red-dim: rgba(248, 113, 113, 0.1);
  --text-primary: #e2e8f0;
  --text-secondary: #8899b4;
  --text-muted: #4a5575;
  --font-mono: 'JetBrains Mono', 'Cascadia Code', monospace;
  --font-sans: 'Plus Jakarta Sans', -apple-system, sans-serif;
  --radius-sm: 6px;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font-sans);
  background: var(--bg-deep);
  color: var(--text-primary);
  height: 100vh;
  overflow: hidden;
}

body::before {
  content: '';
  position: fixed;
  inset: 0;
  background:
    radial-gradient(ellipse 60% 50% at 20% 10%, rgba(77, 159, 255, 0.04) 0%, transparent 60%),
    radial-gradient(ellipse 50% 40% at 80% 90%, rgba(167, 139, 250, 0.03) 0%, transparent 60%),
    radial-gradient(ellipse 40% 30% at 50% 50%, rgba(61, 214, 200, 0.02) 0%, transparent 50%);
  pointer-events: none;
  z-index: 0;
}

body::after {
  content: '';
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(rgba(90, 140, 210, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(90, 140, 210, 0.02) 1px, transparent 1px);
  background-size: 48px 48px;
  pointer-events: none;
  z-index: 0;
  mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, black 30%, transparent 70%);
  -webkit-mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, black 30%, transparent 70%);
}

.app-shell {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.header {
  position: relative;
  z-index: 10;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 20px;
  border-bottom: 1px solid var(--border-card);
  background: rgba(8, 14, 26, 0.7);
  backdrop-filter: blur(var(--glass-blur));
}

.header-left { display: flex; align-items: center; gap: 10px; }

.dot-live {
  position: relative;
  width: 8px; height: 8px;
}
.dot-live::before {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  background: var(--blue);
  opacity: 0.25;
  animation: dot-breathe 2s ease-in-out infinite;
}
.dot-live::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--blue);
  box-shadow: 0 0 8px var(--blue), 0 0 16px rgba(77, 159, 255, 0.4);
}
@keyframes dot-breathe {
  0%, 100% { transform: scale(1); opacity: 0.25; }
  50% { transform: scale(2.4); opacity: 0; }
}

.header-title {
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: 0.68rem;
  letter-spacing: 1.6px;
  color: var(--text-primary);
}
.header-title span { color: var(--blue); }

.header-right { display: flex; align-items: center; gap: 12px; }

.header-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 0.52rem;
  color: var(--text-muted);
}
.header-status span { color: var(--green); font-weight: 500; }

.settings-btn {
  width: 28px; height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.06);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s var(--ease-out);
}
.settings-btn:hover {
  border-color: var(--blue);
  color: var(--blue);
  background: var(--blue-dim);
  box-shadow: 0 0 14px rgba(77, 159, 255, 0.15);
}
.settings-btn svg { width: 14px; height: 14px; }

.conv-stream {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 20px 20px 8px;
}

.conv-stream::-webkit-scrollbar { width: 4px; }
.conv-stream::-webkit-scrollbar-track { background: transparent; }
.conv-stream::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.04); border-radius: 2px; }

.conv-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 10px;
  color: var(--text-muted);
  text-align: center;
}
.empty-graphic svg { opacity: 0.15; }
.empty-title {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.5px;
  opacity: 0.5;
}
.empty-desc {
  font-family: var(--font-mono);
  font-size: 0.52rem;
  opacity: 0.35;
  max-width: 260px;
  line-height: 1.5;
}

.conv-block {
  margin-bottom: 28px;
  animation: conv-enter 0.4s var(--ease-out) both;
}
@keyframes conv-enter {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

.msg {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.msg-avatar {
  width: 30px; height: 30px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
}
.msg-avatar-user {
  background: rgba(77, 159, 255, 0.1);
  border: 1px solid rgba(77, 159, 255, 0.15);
  color: var(--blue);
}
.msg-avatar-agent {
  background: rgba(167, 139, 250, 0.08);
  border: 1px solid rgba(167, 139, 250, 0.12);
  color: var(--purple);
}

.msg-bubble {
  max-width: 80%;
  font-size: 0.72rem;
  line-height: 1.55;
  padding: 9px 14px;
  border-radius: 14px;
}
.msg-bubble-user {
  background: linear-gradient(135deg, rgba(77, 159, 255, 0.08), rgba(77, 159, 255, 0.03));
  border: 1px solid rgba(77, 159, 255, 0.1);
  border-bottom-right-radius: 4px;
  color: var(--text-primary);
}

.msg-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.agent-think-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 0.62rem;
  line-height: 1.55;
  color: var(--text-secondary);
  animation: think-fade 0.5s var(--ease-out) both;
}
@keyframes think-fade {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.think-tag-inline {
  font-family: var(--font-mono);
  font-size: 0.46rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 5px;
  flex-shrink: 0;
  letter-spacing: 0.2px;
}
.think-tag-inline.intent { background: var(--purple-dim); color: var(--purple); }
.think-tag-inline.tool { background: var(--cyan-dim); color: var(--cyan); }
.think-tag-inline.reason { background: var(--amber-dim); color: var(--amber); }

.think-text-inline { flex: 1; }

.agent-pipeline {
  display: flex;
  gap: 0;
  padding: 8px 0;
  border-top: 1px solid rgba(255,255,255,0.03);
  border-bottom: 1px solid rgba(255,255,255,0.03);
}

.pipeline-step {
  display: flex;
  align-items: center;
  gap: 0;
  flex: 1;
  min-width: 0;
}

.pip-dot {
  width: 18px; height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 2px solid var(--text-muted);
  background: transparent;
  transition: all 0.4s var(--ease-out);
}
.pip-dot.done {
  border-color: var(--green);
  background: rgba(52, 211, 153, 0.15);
  color: var(--green);
}
.pip-dot.active {
  border-color: var(--blue);
  background: rgba(77, 159, 255, 0.2);
  color: var(--blue);
  animation: pip-pulse 1.5s ease-in-out infinite;
}
.pip-dot.error {
  border-color: var(--red);
  background: rgba(248, 113, 113, 0.15);
  color: var(--red);
}
@keyframes pip-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(77, 159, 255, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(77, 159, 255, 0); }
}

.pip-x { font-size: 0.5rem; }

.pip-connector {
  width: 1.5px;
  height: 14px;
  flex-shrink: 0;
  margin: 0 6px;
  transition: background 0.5s var(--ease-out);
  align-self: stretch;
  min-height: 14px;
}
.pip-connector.conn-done { background: var(--green); }
.pip-connector.conn-pending { background: var(--text-muted); }

.pip-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-left: 6px;
  min-width: 0;
}
.pip-name {
  font-family: var(--font-mono);
  font-size: 0.54rem;
  font-weight: 600;
  transition: color 0.3s;
  white-space: nowrap;
}
.pip-name { color: var(--text-muted); }
.pip-name.pip-name-done { color: var(--green); }
.pip-name.pip-name-active { color: var(--blue); }
.pip-name.pip-name-err { color: var(--red); }
.pip-detail {
  font-family: var(--font-mono);
  font-size: 0.45rem;
  color: var(--text-muted);
  white-space: nowrap;
}
.pip-duration {
  font-family: var(--font-mono);
  font-size: 0.45rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.agent-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-result-text {
  font-size: 0.65rem;
  color: var(--green);
  line-height: 1.5;
}

.result-stats {
  display: flex;
  gap: 14px;
}
.result-stat {
  font-family: var(--font-mono);
  font-size: 0.52rem;
  color: var(--text-secondary);
}
.result-stat strong { color: var(--text-primary); font-weight: 600; }

.result-file {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(239, 68, 68, 0.04);
  border: 1px solid rgba(239, 68, 68, 0.1);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s var(--ease-out);
}
.result-file:hover {
  border-color: rgba(77, 159, 255, 0.15);
  box-shadow: 0 0 16px rgba(77, 159, 255, 0.06);
  background: rgba(77, 159, 255, 0.04);
}
.result-file-icon { font-size: 1rem; flex-shrink: 0; }
.result-file-name {
  font-family: var(--font-mono);
  font-size: 0.55rem;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
}
.result-file-size {
  font-family: var(--font-mono);
  font-size: 0.46rem;
  color: var(--text-muted);
}

.agent-log-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 0.48rem;
  color: var(--text-muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 0;
  transition: color 0.2s;
}
.agent-log-toggle:hover { color: var(--green); }
.agent-log-toggle svg { transition: transform 0.3s; }

.agent-log {
  font-family: var(--font-mono);
  font-size: 0.46rem;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255,255,255,0.03);
  border-radius: 6px;
  padding: 8px 10px;
  color: var(--green);
  line-height: 1.6;
}
.agent-log-line { display: flex; gap: 6px; }
.log-prompt { color: var(--cyan); flex-shrink: 0; }
.log-ok { color: var(--green); }

.result-actions {
  display: flex;
  gap: 6px;
}
.action-btn {
  padding: 5px 12px;
  font-family: var(--font-mono);
  font-size: 0.48rem;
  letter-spacing: 0.3px;
  border-radius: 6px;
  border: 1px solid var(--border-card);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s var(--ease-out);
}
.action-btn:hover {
  border-color: var(--blue);
  color: var(--blue);
  background: var(--blue-dim);
}

.agent-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 0.55rem;
  color: var(--text-muted);
}
.loading-dot-pulse {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--blue);
  animation: dot-active-pulse 1.5s ease-in-out infinite;
}
@keyframes dot-active-pulse {
  0%, 100% { box-shadow: 0 0 4px rgba(77, 159, 255, 0.4); }
  50% { box-shadow: 0 0 12px rgba(77, 159, 255, 0.7); }
}

.agent-error {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.6rem;
  color: var(--red);
}
.error-icon { font-size: 0.75rem; }

.agent-unknown {
  font-size: 0.62rem;
  color: var(--text-secondary);
  line-height: 1.6;
}

.input-bar {
  position: relative;
  z-index: 10;
  flex-shrink: 0;
  padding: 10px 20px 14px;
  border-top: 1px solid var(--border-card);
  background: rgba(8, 14, 26, 0.7);
  backdrop-filter: blur(var(--glass-blur));
}

.input-wrap {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  background: var(--bg-input);
  border: 1px solid var(--border-card);
  border-radius: 14px;
  padding: 8px 8px 8px 16px;
  transition: all 0.25s var(--ease-out);
}
.input-wrap:focus-within {
  border-color: rgba(77, 159, 255, 0.35);
  box-shadow: 0 0 20px rgba(77, 159, 255, 0.06);
}

.chat-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 0.7rem;
  line-height: 1.5;
  resize: none;
  max-height: 90px;
  padding: 4px 0;
}
.chat-input::placeholder { color: var(--text-muted); }

.send-btn {
  flex-shrink: 0;
  width: 36px; height: 36px;
  border-radius: 10px;
  border: 1px solid var(--border-card);
  background: var(--bg-elevated);
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s var(--ease-out);
}
.send-btn:hover {
  border-color: var(--blue);
  color: var(--blue);
  background: var(--blue-dim);
  box-shadow: 0 0 16px rgba(77, 159, 255, 0.12);
}
.send-btn:active { transform: scale(0.94); }
.send-btn svg { width: 16px; height: 16px; }

.input-hint {
  font-family: var(--font-mono);
  font-size: 0.48rem;
  color: var(--text-muted);
  margin-top: 6px;
  text-align: center;
  letter-spacing: 0.2px;
}
.input-hint kbd {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.03);
  font-family: var(--font-mono);
  font-size: 0.48rem;
}

.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s var(--ease-out);
}
.settings-overlay.open { opacity: 1; pointer-events: auto; }

.settings-panel {
  width: 440px;
  max-width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border-glow);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(var(--glass-blur));
}
.settings-panel::-webkit-scrollbar { width: 4px; }
.settings-panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.04); border-radius: 2px; }

.settings-panel h3 {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 1.4px;
  margin-bottom: 18px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.settings-panel h3 span { color: var(--blue); }
.settings-group { margin-bottom: 14px; }
.settings-label {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.5rem;
  letter-spacing: 0.8px;
  color: var(--text-secondary);
  margin-bottom: 5px;
  text-transform: uppercase;
}
.settings-input, .settings-textarea {
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-card);
  background: var(--bg-input);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 0.6rem;
  outline: none;
  transition: border-color 0.2s;
}
.settings-input:focus, .settings-textarea:focus {
  border-color: rgba(77, 159, 255, 0.35);
  box-shadow: 0 0 10px rgba(77, 159, 255, 0.05);
}
.settings-textarea { min-height: 100px; resize: vertical; line-height: 1.5; }
.settings-hint { font-family: var(--font-mono); font-size: 0.47rem; color: var(--text-muted); margin-top: 4px; }

.settings-actions { display: flex; gap: 8px; margin-top: 18px; justify-content: flex-end; }
.settings-btn-primary {
  padding: 8px 18px;
  border-radius: 8px;
  border: 1px solid var(--blue);
  background: var(--blue-dim);
  color: var(--blue);
  font-family: var(--font-mono);
  font-size: 0.55rem;
  letter-spacing: 0.8px;
  cursor: pointer;
  transition: all 0.2s;
}
.settings-btn-primary:hover { background: rgba(77, 159, 255, 0.2); box-shadow: 0 0 16px rgba(77, 159, 255, 0.15); }
.settings-btn-secondary, .settings-btn-reset {
  padding: 8px 18px;
  border-radius: 8px;
  border: 1px solid var(--border-card);
  background: transparent;
  font-family: var(--font-mono);
  font-size: 0.55rem;
  letter-spacing: 0.8px;
  cursor: pointer;
  transition: all 0.2s;
}
.settings-btn-secondary { color: var(--text-secondary); }
.settings-btn-secondary:hover { border-color: var(--text-secondary); }
.settings-btn-reset { color: var(--red); margin-right: auto; border-color: rgba(248,113,113,0.15); }
.settings-btn-reset:hover { background: var(--red-dim); border-color: rgba(248,113,113,0.3); }
.settings-divider { border: none; border-top: 1px solid var(--border-card); margin: 16px 0; }
</style>
