<template>
  <div class="app-shell">
    <header class="header">
      <div class="header-left">
        <div class="dot-live" :class="{ 'ws-disconnected': wsStatus !== 'connected' }"></div>
        <div class="header-title">AI <span>Agent</span></div>
        <div class="page-context" v-if="pageCtx.url" :title="pageCtx.url">
          <span class="page-context-icon">◈</span>
          <span class="page-context-text">{{ pageCtx.title || pageCtx.url }}</span>
        </div>
      </div>
      <div class="header-right">
        <div class="header-status"><span :style="{ color: wsStatus === 'connected' ? 'var(--accent)' : '#f88' }">●</span> {{ wsStatusText }}</div>
        <button class="theme-toggle-btn" @click="toggleTheme" :title="theme === 'dark' ? '切换到浅色' : '切换到深色'">
          <svg v-if="theme === 'dark'" width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="3.5" stroke="currentColor" stroke-width="1"/><path d="M7 1 L7 3 M7 11 L7 13 M1 7 L3 7 M11 7 L13 7 M2.5 2.5 L4 4 M10 10 L11.5 11.5 M2.5 11.5 L4 10 M10 4 L11.5 2.5" stroke="currentColor" stroke-width="0.7" stroke-linecap="round"/></svg>
          <svg v-else width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5 A4.5 4.5 0 1 0 11.5 5.5 A3 3 0 0 1 8.5 2.5Z" stroke="currentColor" stroke-width="1" fill="none"/></svg>
        </button>
        <button class="settings-btn" @click="settingsOpen = !settingsOpen" title="配置">
          <svg viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2.5" stroke="currentColor" stroke-width="1"/><path d="M7 1.5 L7.8 3.2 L7 4.5 L6.2 3.2 Z M12.5 7 L11 7.5 L10.2 6.5 L11 5.5 Z M1.5 7 L3 7.5 L3.8 6.5 L3 5.5 Z M7 12.5 L7.8 10.8 L6.2 9.5 L5.5 10.3 Z" stroke="currentColor" stroke-width="0.8" fill="none"/></svg>
        </button>
        <button class="skills-btn" @click="skillPanelOpen = !skillPanelOpen" title="Skill 模板">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="currentColor" stroke-width="0.8"/><path d="M4 5 L6 5 M4 7.5 L8 7.5 M4 10 L5.5 10" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"/></svg>
        </button>
        <button class="new-conv-btn" @click="newSession" title="新建对话">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2 L7 12 M2 7 L12 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
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

      <div class="conv-block" v-for="conv in conversations" :key="conv.id">
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

            <div class="think-section" v-if="conv.thinking">
              <div class="think-header-row">
                <span class="think-header-label">推理过程</span>
              </div>
              <div class="agent-think-line think-active">
                <span class="think-tag-inline reason">推理</span>
                <span class="think-text-inline">{{ conv.thinking }}</span>
              </div>
            </div>

            <div class="agent-pipeline" v-if="conv.toolSteps.length">
              <div class="pipeline-step" v-for="(step, i) in conv.toolSteps" :key="i">
                <div class="pip-dot" :class="step.status">
                  <svg v-if="step.status === 'done'" width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3.5 6L6.5 2" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  <span v-else-if="step.status === 'error'" class="pip-x">✕</span>
                  <span v-else-if="step.status === 'retrying'" class="pip-r">↻</span>
                </div>
                <div class="pip-connector" v-if="i < conv.toolSteps.length - 1" :class="step.status === 'done' ? 'conn-done' : 'conn-pending'"></div>
                <div class="pip-info">
                  <span class="pip-name" :class="{
                    'pip-name-done': step.status === 'done',
                    'pip-name-active': step.status === 'active',
                    'pip-name-err': step.status === 'error',
                    'pip-name-retrying': step.status === 'retrying'
                  }">{{ step.name }}</span>
                  <span class="pip-detail" v-if="step.detail">{{ step.detail }}</span>
                  <span class="pip-duration" v-if="step.duration">{{ step.duration }}</span>
                </div>
              </div>
            </div>

            <div class="agent-result" v-if="conv.status === 'done'">
              <div class="agent-result-text">{{ conv.replyText || '任务完成' }}</div>
              <div class="result-actions">
                <div class="result-stats">
                  <span class="result-stat">
                    <strong>{{ conv.toolSteps.filter(s => s.status === 'done').length }}</strong> 步骤
                  </span>
                </div>
                <button
                  class="save-skill-btn"
                  @click="openSkillEditor(conv)"
                  title="保存为 Skill 模板"
                  v-if="conv.toolSteps.length > 0"
                >保存为 Skill</button>
              </div>
            </div>

            <div class="agent-loading" v-if="conv.status === 'running'">
              <span class="loading-dot-pulse"></span>
              <span>执行中...</span>
            </div>

            <div class="agent-error" v-if="conv.status === 'error'">
              <span class="error-icon">⚠</span>
              <span>{{ conv.errorMessage || '执行遇到错误，请重试' }}</span>
            </div>

          </div>
        </div>
      </div>
    </div>

    <div class="skill-overlay" :class="{ open: skillPanelOpen }" @click.self="skillPanelOpen = false">
      <div class="skill-panel">
        <h3>Skill 模板</h3>

        <div class="skill-editor" v-if="editingSkill !== null">
          <div class="skill-editor-field">
            <label>名称</label>
            <input v-model="editingSkill.name" placeholder="如：GitHub 搜索">
          </div>
          <div class="skill-editor-field">
            <label>描述</label>
            <input v-model="editingSkill.description" placeholder="一句话描述这个 Skill 的用途">
          </div>
          <div class="skill-editor-field" v-if="editingSkill.params.length">
            <label>可调参数</label>
            <div class="skill-param-row" v-for="param in editingSkill.params" :key="param.key">
              <span class="skill-param-label">{{ param.label }}</span>
              <input v-model="param.defaultValue" class="skill-param-input">
            </div>
          </div>
          <div class="skill-editor-field">
            <label>步骤预览 ({{ editingSkill.steps.length }})</label>
            <div class="skill-step-preview" v-for="(step, i) in editingSkill.steps" :key="i">
              <span class="skill-step-index">{{ i + 1 }}</span>
              <span class="skill-step-cmd">{{ step.command }}</span>
            </div>
          </div>
          <div class="skill-editor-actions">
            <button class="skill-btn-cancel" @click="editingSkill = null">取消</button>
            <button class="skill-btn-save" @click="confirmSaveSkill">保存</button>
          </div>
        </div>

        <div class="skill-list" v-else>
          <div class="skill-empty" v-if="!skillStore.list.length">
            <p>暂无 Skill 模板</p>
            <p class="skill-hint">执行任务后点击"保存为 Skill"即可创建</p>
          </div>
          <div
             class="skill-card"
             v-for="skill in skillStore.list"
             :key="skill.dir"
           >
             <div class="skill-card-header">
               <span class="skill-card-name">{{ skill.name }}</span>
               <button class="skill-card-del" @click="removeSkillByDir(skill.dir)">×</button>
             </div>
             <div class="skill-card-desc">{{ skill.description }}</div>
             <button class="skill-card-run" @click="runSkill(skill)">执行</button>
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
          placeholder="输入指令，例如：打开 GitHub 搜索 vue..."
          @keydown="handleKeydown"
          @input="autoResize"
          ref="inputRef"
        ></textarea>
        <button class="send-btn" @click="sendMessage" :disabled="isProcessing" title="发送">
          <svg viewBox="0 0 16 16" fill="none"><path d="M2 2 L14 8 L2 14 L4 8 L2 2Z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <div class="input-hint"><kbd>Enter</kbd> 发送 · <kbd>Shift+Enter</kbd> 换行</div>
    </div>

    <div class="settings-overlay" :class="{ open: settingsOpen }" @click.self="settingsOpen = false">
      <div class="settings-panel">
        <h3><span>⚙</span> 后端配置</h3>
        <div class="settings-group">
          <label class="settings-label">AgentScope 后端地址</label>
          <input class="settings-input" type="text" v-model="settingsCfg.agentUrl" placeholder="ws://localhost:8765/ws">
          <div class="settings-hint">AgentScope Python 后端 WebSocket 地址</div>
        </div>
        <div class="settings-group">
          <label class="settings-label">DeepSeek API KEY</label>
          <input class="settings-input" type="password" v-model="settingsCfg.apiKey" placeholder="sk-...">
          <div class="settings-hint">传递给后端用于 LLM 调用</div>
        </div>
        <div class="settings-group">
          <label class="settings-label">DeepSeek BASE URL</label>
          <input class="settings-input" type="text" v-model="settingsCfg.baseUrl" placeholder="https://api.deepseek.com">
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
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { usePageContext } from './modules/pageContextStore'
import { getFriendlyName } from './modules/commands'
import { retryWithBackoff } from './modules/retry'
import { skillStore, setSkills } from './modules/skillStore'
import { extractSkillParams, stepsToServerFormat, buildSkillPrompt } from './modules/skillParser'

const AGENT_URL_DEFAULT = 'ws://localhost:8765/ws'
const STORAGE_AGENT_URL = 'agentscope_url'
const STORAGE_API_KEY = 'deepseek_api_key'
const STORAGE_BASE_URL = 'deepseek_base_url'
const STORAGE_CONVERSATIONS = 'agent_conversations'

const origin = window.location.origin
const chatText = ref('')
const isProcessing = ref(false)
const streamRef = ref(null)
const inputRef = ref(null)
const settingsOpen = ref(false)
const settingsCfg = reactive({
  agentUrl: AGENT_URL_DEFAULT,
  apiKey: '',
  baseUrl: '',
})
const skillPanelOpen = ref(false)
const editingSkill = ref(null)

const { pageContext: pageCtx, handleEvent } = usePageContext()
const theme = ref('dark')

let ws = null
let wsReconnectTimer = null
const wsStatus = ref('disconnected')
const wsStatusText = computed(() => {
  const map = { connected: '已连接', connecting: '连接中', disconnected: '未连接', error: '连接错误' }
  return map[wsStatus.value] || wsStatus.value
})

const conversations = ref([])
let activeConv = null

watch(conversations, (val) => {
  localStorage.setItem(STORAGE_CONVERSATIONS, JSON.stringify(val))
}, { deep: true })

function applyTheme(t) {
  theme.value = t
  document.documentElement.setAttribute('data-theme', t)
  localStorage.setItem('app_theme', t)
}

function toggleTheme() {
  applyTheme(theme.value === 'dark' ? 'light' : 'dark')
}

function scrollToBottom() {
  nextTick(() => {
    if (streamRef.value) streamRef.value.scrollTop = streamRef.value.scrollHeight
  })
}

function newSession() {
  conversations.value = []
  localStorage.removeItem(STORAGE_CONVERSATIONS)
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'user_message', content: '', reset: true }))
  }
}

function openSettings() {
  settingsCfg.agentUrl = localStorage.getItem(STORAGE_AGENT_URL) || AGENT_URL_DEFAULT
  settingsCfg.apiKey = localStorage.getItem(STORAGE_API_KEY) || ''
  settingsCfg.baseUrl = localStorage.getItem(STORAGE_BASE_URL) || ''
  settingsOpen.value = true
}

function saveSettings() {
  localStorage.setItem(STORAGE_AGENT_URL, settingsCfg.agentUrl.trim() || AGENT_URL_DEFAULT)
  localStorage.setItem(STORAGE_API_KEY, settingsCfg.apiKey.trim())
  localStorage.setItem(STORAGE_BASE_URL, settingsCfg.baseUrl.trim())
  settingsOpen.value = false
  reconnectWs()
}

function resetSettings() {
  settingsCfg.agentUrl = AGENT_URL_DEFAULT
  settingsCfg.apiKey = ''
  settingsCfg.baseUrl = ''
}

function getAgentUrl() { return localStorage.getItem(STORAGE_AGENT_URL) || AGENT_URL_DEFAULT }
function getApiKey() { return localStorage.getItem(STORAGE_API_KEY) || '' }
function getBaseUrl() { return localStorage.getItem(STORAGE_BASE_URL) || '' }

function connectWs() {
  const url = getAgentUrl()
  wsStatus.value = 'connecting'
  try {
    ws = new WebSocket(url)
  } catch {
    wsStatus.value = 'error'
    scheduleReconnect()
    return
  }

  ws.onopen = () => {
    wsStatus.value = 'connected'
    ws.send(JSON.stringify({ type: 'get_skills' }))
    if (pageCtx.url) {
      ws.send(JSON.stringify({
        type: 'page_context',
        context: { url: pageCtx.url, title: pageCtx.title || '', tools: pageCtx.tools || [] },
      }))
    }
  }

  ws.onclose = () => {
    wsStatus.value = 'disconnected'
    scheduleReconnect()
  }

  ws.onerror = () => { wsStatus.value = 'error' }

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    switch (msg.type) {
      case 'connected':
        wsStatus.value = 'connected'
        break
      case 'thinking':
        handleThinking(msg)
        break
      case 'thinking_end':
        break
      case 'tool_call':
        handleToolCall(msg)
        break
      case 'reply_text':
        handleReplyText(msg)
        break
      case 'reply_text_end':
        break
      case 'done':
        handleDone(msg)
        break
      case 'error':
        handleError(msg)
        break
      case 'skill_list':
        setSkills(msg.skills || [])
        break
      case 'skill_saved':
      case 'skill_deleted':
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'get_skills' }))
        }
        break
    }
  }
}

function scheduleReconnect() {
  if (wsReconnectTimer) clearTimeout(wsReconnectTimer)
  wsReconnectTimer = setTimeout(connectWs, 3000)
}

function reconnectWs() {
  if (ws) {
    ws.onclose = null
    ws.close()
    ws = null
  }
  if (wsReconnectTimer) clearTimeout(wsReconnectTimer)
  setTimeout(connectWs, 200)
}

function handleThinking(msg) {
  if (!activeConv) return
  if (!activeConv.thinking) activeConv.thinking = ''
  activeConv.thinking += msg.delta
  scrollToBottom()
}

function handleReplyText(msg) {
  if (!activeConv) return
  if (!activeConv.replyText) activeConv.replyText = ''
  activeConv.replyText += msg.delta
  scrollToBottom()
}

function handleToolCall(msg) {
  if (!activeConv) return
  const { call_id, name, arguments: args } = msg
  const stepName = getFriendlyName(name) || name
  const stepStart = Date.now()

  const step = {
    callId: call_id,
    name: stepName,
    args,
    status: 'active',
    detail: '执行中...',
    duration: '',
    startTime: stepStart,
  }
  activeConv.toolSteps.push(step)
  scrollToBottom()

  retryWithBackoff(
    () => executeCommand(name, args),
    {
      maxRetries: 3,
      onRetry: (state) => {
        step.status = 'retrying'
        step.detail = `重试中 (${state.attempt}/${state.maxRetries})`
        scrollToBottom()
      },
      onTARGET_STALE: () => executeCommand('discover_tools', {}),
    },
  ).then(result => {
    step.status = 'done'
    step.detail = ''
    step.duration = ((Date.now() - stepStart) / 1000).toFixed(1) + 's'
    ws.send(JSON.stringify({ type: 'tool_result', call_id, result }))
    scrollToBottom()
  }).catch(err => {
    step.status = 'error'
    step.detail = err.message || '执行失败'
    ws.send(JSON.stringify({ type: 'tool_result', call_id, result: { error: err.message || '执行失败' } }))
    scrollToBottom()
  })
}

function handleDone(msg) {
  if (!activeConv) return
  activeConv.status = 'done'
  if (msg.message && !activeConv.replyText) {
    activeConv.replyText = msg.message
  }
  isProcessing.value = false
  activeConv = null
  scrollToBottom()
}

function handleError(msg) {
  if (!activeConv) return
  activeConv.status = 'error'
  activeConv.errorMessage = msg.message || '执行错误'
  isProcessing.value = false
  activeConv = null
  scrollToBottom()
}

function executeCommand(command, payload) {
  const id = 'req_' + Date.now()
  return new Promise((resolve, reject) => {
    const handler = (event) => {
      if (event.origin !== origin) return
      const msg = event.data
      if (!msg || msg.type !== 'response') return
      window.removeEventListener('message', handler)
      if (msg.error) {
        reject(Object.assign(new Error(msg.error.message || '失败'), { code: msg.error.code }))
      } else {
        resolve(msg.payload || { success: true })
      }
    }
    window.addEventListener('message', handler)
    parent.postMessage({ type: 'request', id, command, payload, timestamp: Date.now() }, origin)
    setTimeout(() => { window.removeEventListener('message', handler); reject(new Error('超时')) }, 15000)
  })
}

async function sendMessage() {
  const text = chatText.value.trim()
  if (!text || isProcessing.value) return
  chatText.value = ''
  isProcessing.value = true

  activeConv = {
    id: 'conv_' + Date.now(),
    userMessage: text,
    status: 'running',
    thinking: '',
    replyText: '',
    toolSteps: [],
    errorMessage: '',
  }
  conversations.value.push(activeConv)
  scrollToBottom()

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    activeConv.status = 'error'
    activeConv.errorMessage = '未连接到 AgentScope 后端'
    isProcessing.value = false
    activeConv = null
    return
  }

  ws.send(JSON.stringify({
    type: 'user_message',
    content: text,
    api_key: getApiKey() || undefined,
    base_url: getBaseUrl() || undefined,
  }))
}

function openSkillEditor(conv) {
  const steps = stepsToServerFormat(conv.toolSteps)
  if (!steps.length) return

  const params = extractSkillParams(conv.toolSteps)

  editingSkill.value = {
    name: '',
    description: '',
    params: params.map(p => ({ ...p })),
    steps,
  }
  skillPanelOpen.value = true
}

function confirmSaveSkill() {
  const es = editingSkill.value
  if (!es || !es.name.trim() || !ws) return

  ws.send(JSON.stringify({
    type: 'save_skill',
    name: es.name.trim(),
    description: es.description.trim(),
    steps: es.steps,
  }))
  editingSkill.value = null
}

function runSkill(skill) {
  chatText.value = buildSkillPrompt(skill.name)
  skillPanelOpen.value = false
  sendMessage()
}

function removeSkillByDir(dir) {
  if (!ws) return
  ws.send(JSON.stringify({ type: 'delete_skill', dir }))
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
}

function autoResize(e) {
  e.target.style.height = 'auto'
  e.target.style.height = Math.min(e.target.scrollHeight, 90) + 'px'
}

onMounted(() => {
  const savedTheme = localStorage.getItem('app_theme') || 'dark'
  applyTheme(savedTheme)

  const savedConversations = localStorage.getItem(STORAGE_CONVERSATIONS)
  if (savedConversations) {
    try {
      conversations.value = JSON.parse(savedConversations)
    } catch {
      localStorage.removeItem(STORAGE_CONVERSATIONS)
    }
  }

  settingsCfg.agentUrl = localStorage.getItem(STORAGE_AGENT_URL) || AGENT_URL_DEFAULT
  settingsCfg.apiKey = localStorage.getItem(STORAGE_API_KEY) || ''
  settingsCfg.baseUrl = localStorage.getItem(STORAGE_BASE_URL) || ''

  window.addEventListener('message', (event) => {
    if (event.origin !== origin) return
    const msg = event.data
    if (msg && msg.type === 'event') {
      handleEvent(msg)
      if (ws && ws.readyState === WebSocket.OPEN && (msg.command === 'manifest_push' || msg.command === 'page_changed')) {
        ws.send(JSON.stringify({
          type: 'page_context',
          context: {
            url: pageCtx.url || '',
            title: pageCtx.title || '',
            tools: pageCtx.tools || [],
          },
        }))
      }
    }
  })

  connectWs()
})

onUnmounted(() => {
  if (wsReconnectTimer) clearTimeout(wsReconnectTimer)
  if (ws) { ws.onclose = null; ws.close(); ws = null }
})
</script>

<style>
@import './theme-dark.css';
@import './theme-light.css';
@import './App.css';
</style>
