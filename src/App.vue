<template>
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

  <div class="dashboard">
    <!-- Card 1: Think Process -->
    <div class="card think" :class="{ collapsed: cardCollapsed.think }">
      <div class="card-header" @click="toggleCard('think')">
        <span class="card-header-icon">🧠</span>
        <span class="card-header-text">AI 思考过程</span>
        <span class="card-header-badge">{{ thinkCount }}</span>
        <button class="collapse-btn" @click.stop="toggleCard('think')">
          <svg viewBox="0 0 12 12" fill="none"><path d="M4 2.5L7.5 6L4 9.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <div class="card-body">
        <div class="think-item" v-for="(item, idx) in thinkItems" :key="idx">
          <div class="think-meta">
            <span class="think-time">{{ item.time }}</span>
            <span class="think-tag" :class="item.tag">{{ item.tagText }}</span>
          </div>
          <div class="think-content" :style="{ borderLeftColor: 'var(--' + item.label + ')' }">{{ item.content }}</div>
        </div>
        <button class="think-load-more" v-if="thinkLoadMoreVisible" @click="loadMoreThink">查看完整日志 ↓</button>
      </div>
    </div>

    <!-- Card 2: Task Pipeline -->
    <div class="card pipeline" :class="{ collapsed: cardCollapsed.pipeline }">
      <div class="card-header" @click="toggleCard('pipeline')">
        <span class="card-header-icon">📋</span>
        <span class="card-header-text">任务管道</span>
        <span class="card-header-badge">{{ taskCount }}</span>
        <button class="collapse-btn" @click.stop="toggleCard('pipeline')">
          <svg viewBox="0 0 12 12" fill="none"><path d="M4 2.5L7.5 6L4 9.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <div class="card-body">
        <div class="timeline">
          <div class="timeline-step" v-for="(step, i) in timelineSteps" :key="i">
            <div class="step-indicator">
              <div class="step-dot" :class="step.status"></div>
              <div class="step-connector" v-if="step.showConnector !== false" :class="'conn-' + (step.status === 'done' ? 'done' : 'pending')"></div>
            </div>
            <div class="step-body" @click="toggleStep(i)">
              <div class="step-name" :class="{
                'done-c': step.status === 'done',
                'current': step.status === 'active',
                'error-c': step.status === 'error',
                'dim': step.status === 'pending'
              }">{{ step.name }}</div>
              <div class="step-desc" v-if="step.desc">{{ step.desc }}</div>
              <div class="step-detail" v-if="step.detail">{{ step.detail }}</div>
              <div class="step-progress-wrap" v-if="step.progress !== undefined">
                <div class="step-progress-fill" :style="{ width: step.status === 'done' ? '100%' : step.status === 'active' ? step.progress + '%' : '0%' }"></div>
              </div>
              <div class="step-subtasks" v-if="step.subtasks" :class="{ open: step.expanded }">
                <div class="step-subtask" v-for="(sub, j) in step.subtasks" :key="j" :class="sub.cls">{{ sub.text }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Card 3: Results -->
    <div class="card results" :class="{ collapsed: cardCollapsed.results }">
      <div class="card-header" @click="toggleCard('results')">
        <span class="card-header-icon">✅</span>
        <span class="card-header-text">执行结果</span>
        <span class="card-header-badge" :style="resultBadge.style">{{ resultBadge.text }}</span>
        <button class="collapse-btn" @click.stop="toggleCard('results')">
          <svg viewBox="0 0 12 12" fill="none"><path d="M4 2.5L7.5 6L4 9.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <div class="card-body">
        <div class="results-body">
          <div class="stats-row">
            <div class="stat-pill" v-for="(stat, i) in resultStats" :key="i">
              <div class="stat-pill-val">{{ stat.val }}</div>
              <div class="stat-pill-label">{{ stat.label }}</div>
            </div>
          </div>
          <div ref="fileCardRef" class="file-card">
            <div class="file-icon">{{ resultFile.icon }}</div>
            <div class="file-info">
              <div class="file-name">{{ resultFile.name }}</div>
              <div class="file-meta"><span>{{ resultFile.size }}</span><span>{{ resultFile.time }}</span></div>
            </div>
          </div>
          <button class="terminal-toggle" @click="terminalOpen = !terminalOpen">{{ terminalOpen ? '收起日志 ▾' : '查看详细日志 ▸' }}</button>
          <div class="terminal-log" :class="{ open: terminalOpen }">
            <div class="t-line" v-for="(line, i) in terminalLines" :key="i">
              <span class="t-prompt">$</span> {{ line.text }} <span v-if="line.ok === true" class="t-ok">OK</span>
            </div>
          </div>
          <div class="btn-row">
            <button class="btn-outline" @click="rerunTask">🔄 重新运行</button>
            <button class="btn-outline" @click="shareReport">📤 分享报告</button>
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
      ></textarea>
      <button class="send-btn" @click="sendMessage" title="发送">
        <svg viewBox="0 0 16 16" fill="none"><path d="M2 2 L14 8 L2 14 L4 8 L2 2Z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round"/></svg>
      </button>
    </div>
    <div class="input-hint"><kbd>Enter</kbd> 发送 · <kbd>Shift+Enter</kbd> 换行</div>
  </div>

  <!-- Settings Overlay -->
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
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue';

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
const fileCardRef = ref(null);

const cardCollapsed = reactive({ think: false, pipeline: false, results: false });

const thinkItems = ref([
  { time: '现在', tag: 'intent', tagText: '意图理解', label: 'purple', content: '解析用户指令，识别到操作意图涉及多个步骤。提取关键词并匹配工具能力。' },
  { time: '现在', tag: 'tool', tagText: '工具选择', label: 'cyan', content: '匹配到以下可用工具：数据查询、报表生成、邮件服务。准备编排执行顺序。' },
  { time: '现在', tag: 'reason', tagText: '逻辑推理', label: 'amber', content: '检测到缺失参数"时间范围"，根据上下文自动补全为"本周"。验证参数合法性通过。' },
]);
const thinkLoadMoreVisible = ref(true);
const extraLogs = [
  { time:'2s前', tag:'intent', tagText:'意图理解', label:'purple', content:'用户意图已确认为复合型任务，包含数据检索、图表生成与邮件发送三个子目标。开始构建执行计划。' },
  { time:'1s前', tag:'reason', tagText:'逻辑推理', label:'amber', content:'参数校验通过。检测到输出格式为PDF，自动选择高保真渲染引擎以确保图表质量。' }
];

const timelineSteps = ref([
  { status:'done', name:'数据检索', desc:'', detail:'⏱ 1.2s · 📊 328条记录', progress:100, showConnector:true },
  { status:'active', name:'生成图表', desc:'正在渲染可视化组件', detail:'', progress:60, showConnector:true,
    expanded:false, subtasks:[
      { text:'选择图表类型', cls:'sub-done' },
      { text:'绑定数据源', cls:'sub-done' },
      { text:'渲染中...', cls:'sub-active' },
      { text:'优化布局', cls:'' }
    ] },
  { status:'pending', name:'发送邮件', desc:'等待前序任务完成', detail:'', progress:0, showConnector:false },
]);

const resultStats = ref([
  { val:'328', label:'处理记录' },
  { val:'3.6s', label:'总耗时' },
  { val:'100%', label:'成功率' },
]);
const resultFile = ref({ name:'weekly_sales_report.pdf', size:'2.4 MB', time:'刚刚生成', icon:'📄' });
const resultBadge = ref({ text:'成功', style:'color:var(--green);border-color:rgba(52,211,153,0.2);background:var(--green-dim)' });
const terminalOpen = ref(false);
const terminalLines = ref([
  { text:'Fetching data from API...', ok:true },
  { text:'Processing 328 records...', ok:true },
  { text:'Generating chart components...', ok:true },
  { text:'Compiling PDF report...', ok:true },
  { text:'Output: weekly_sales_report.pdf (2.4 MB)', ok:null },
]);

const settingsOpen = ref(false);
const settingsCfg = reactive({ baseUrl: DEFAULT_BASE_URL, apiKey: DEFAULT_API_KEY, prompt: DEFAULT_SYSTEM_PROMPT });

const thinkCount = computed(() => thinkItems.value.length + '条');
const taskCount = computed(() => timelineSteps.value.length + '个步骤');

function toggleCard(key) { cardCollapsed[key] = !cardCollapsed[key]; }
function toggleStep(idx) { const s = timelineSteps.value[idx]; if (s.subtasks) s.expanded = !s.expanded; }
function loadMoreThink() { thinkLoadMoreVisible.value = false; extraLogs.forEach(item => thinkItems.value.push(item)); }

function rerunTask() {
  chatText.value = '生成本周销售周报并发送邮件';
  nextTick(() => sendMessage());
}
function shareReport() {
  if (fileCardRef.value) {
    fileCardRef.value.style.boxShadow = '0 0 32px rgba(77,159,255,0.25)';
    setTimeout(() => { if (fileCardRef.value) fileCardRef.value.style.boxShadow = ''; }, 600);
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

function addThinkItem(label, tagClass, tagText, content) {
  thinkLoadMoreVisible.value = false;
  thinkItems.value.push({ time:'现在', tag:tagClass, tagText, label, content });
}

function updateTimeline(index, status, name, desc) {
  const step = timelineSteps.value[index];
  if (!step) return;
  step.status = status;
  step.name = name;
  step.desc = desc || '';
  if (status === 'done' && step.progress !== undefined) step.progress = 100;
}

function rebuildTimeline(steps) {
  timelineSteps.value = steps.map((s, i) => ({
    status:'pending', name:getFriendlyName(s.command), desc:'等待中', detail:'',
    progress: s.command === 'wait' ? undefined : 0,
    showConnector: i < steps.length - 1,
  }));
}

function updateResults(result) {
  if (result?.error) {
    resultBadge.value = { text:'失败', style:'color:var(--red);border-color:rgba(248,113,113,0.2);background:var(--red-dim)' };
  }
}

async function sendMessage() {
  const text = chatText.value.trim();
  if (!text || isProcessing.value) return;
  chatText.value = '';
  isProcessing.value = true;

  thinkLoadMoreVisible.value = false;
  addThinkItem('purple', 'intent', '意图理解', '解析用户指令：「' + text.substring(0,40) + '」...识别操作意图及目标。');

  let parsed = null;
  const ds = await deepseekRecognize(text);
  if (ds) parsed = { command: ds.command, payload: ds.payload };

  if (!parsed) {
    const local = parseLocal(text);
    if (local) {
      parsed = local;
      addThinkItem('purple', 'intent', '意图理解', '通过本地规则匹配到命令: ' + getFriendlyName(parsed.command));
    }
  }

  if (!parsed) {
    addThinkItem('amber', 'reason', '无法识别', '未匹配到任何可用工具，建议用户：导航、搜索、截图、获取标签页、滚动、等待、按键、执行JS等。');
    isProcessing.value = false;
    return;
  }

  const { command, payload } = parsed;
  addThinkItem('cyan', 'tool', '工具选择', '选择工具：「' + getFriendlyName(command) + '」，参数: ' + JSON.stringify(payload).substring(0,80));

  if (command === 'execute_plan') {
    const steps = payload.steps || [];
    rebuildTimeline(steps);
    for (let i = 0; i < steps.length; i++) {
      updateTimeline(i, 'active', getFriendlyName(steps[i].command), '执行中...');
      addThinkItem('amber', 'reason', '步骤' + (i+1), '正在执行: ' + getFriendlyName(steps[i].command));
      sendCommand(steps[i].command, steps[i].payload || {}, i);
      try {
        await waitForResponse(steps[i].command);
        updateTimeline(i, 'done', getFriendlyName(steps[i].command), '完成');
      } catch {
        updateTimeline(i, 'error', getFriendlyName(steps[i].command), '执行失败');
        if (payload.stop_on_error) break;
      }
    }
  } else {
    rebuildTimeline([{ command, payload: {} }]);
    updateTimeline(0, 'active', getFriendlyName(command), '执行中...');
    sendCommand(command, payload, 0);
    try {
      const result = await waitForResponse(command);
      updateTimeline(0, 'done', getFriendlyName(command), '已完成');
      updateResults(result);
    } catch {
      updateTimeline(0, 'error', getFriendlyName(command), '执行失败');
    }
  }

  isProcessing.value = false;
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
