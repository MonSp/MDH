<template>
  <div class="app-shell">
    <AppHeader
      :ws-status="wsStatus"
      :page-ctx="pageCtx"
      :theme="theme"
      @toggle-theme="toggleTheme"
      @toggle-settings="toggleSettings"
      @toggle-skills="toggleSkills"
      @new-session="newSession"
    />

    <div class="conv-stream" ref="streamRef">
      <ConversationStream
        :conversations="conversations"
        @open-skill-editor="openSkillEditor"
      />
    </div>

    <SkillPanel
      v-model:open="skillPanelOpen"
      :skills="skillStore.list"
      :editing-skill="editingSkill"
      @close="skillPanelOpen = false"
      @save-skill="confirmSaveSkill"
      @delete-skill="removeSkillByDir"
      @run-skill="runSkill"
      @cancel-edit="editingSkill = null"
      @regenerate-summary="generateSummary(editingSkill?.steps, editingSkill?.skillType)"
      @import-skill="importSkill"
      @update:editing-skill="editingSkill = $event"
    />

    <ChatInput
      v-model="chatText"
      :disabled="isProcessing"
      @send="sendMessage"
    />

    <SettingsPanel
      v-model:open="settingsOpen"
      :settings-cfg="settingsCfg"
      @close="settingsOpen = false"
      @save="saveSettings"
      @reset="resetSettings"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { usePageContext } from './modules/pageContextStore'
import { getFriendlyName } from './modules/commands'
import { retryWithBackoff } from './modules/retry'
import { skillStore, setSkills } from './modules/skillStore'
import { extractSkillParams, stepsToServerFormat, buildSkillPrompt } from './modules/skillParser'

import AppHeader from './components/AppHeader.vue'
import ConversationStream from './components/ConversationStream.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import SkillPanel from './components/SkillPanel.vue'
import ChatInput from './components/ChatInput.vue'

const AGENT_URL_DEFAULT = `ws://${window.location.hostname}:8765/ws`
const STORAGE_AGENT_URL = 'agentscope_url'
const STORAGE_API_KEY = 'deepseek_api_key'
const STORAGE_BASE_URL = 'deepseek_base_url'
const STORAGE_PROVIDER = 'llm_provider'
const STORAGE_MODEL_NAME = 'llm_model_name'
const STORAGE_CONVERSATIONS = 'agent_conversations'

const origin = window.location.origin
const chatText = ref('')
const isProcessing = ref(false)
const streamRef = ref(null)
const settingsOpen = ref(false)
const skillPanelOpen = ref(false)
const editingSkill = ref(null)

const settingsCfg = reactive({
  agentUrl: AGENT_URL_DEFAULT,
  provider: 'deepseek',
  modelName: '',
  apiKey: '',
  baseUrl: '',
})

const { pageContext: pageCtx, handleEvent } = usePageContext()
const theme = ref('dark')

let ws = null
let wsReconnectTimer = null
const wsStatus = ref('disconnected')

const conversations = ref([])
let activeConv = null
let scrollRafId = null

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

function toggleSettings() {
  if (!settingsOpen.value) {
    settingsCfg.agentUrl = localStorage.getItem(STORAGE_AGENT_URL) || AGENT_URL_DEFAULT
    settingsCfg.provider = localStorage.getItem(STORAGE_PROVIDER) || 'deepseek'
    settingsCfg.modelName = localStorage.getItem(STORAGE_MODEL_NAME) || ''
    settingsCfg.apiKey = localStorage.getItem(STORAGE_API_KEY) || ''
    settingsCfg.baseUrl = localStorage.getItem(STORAGE_BASE_URL) || ''
  }
  settingsOpen.value = !settingsOpen.value
}

function toggleSkills() {
  skillPanelOpen.value = !skillPanelOpen.value
}

function isNearBottom(el) {
  if (!el) return true
  return el.scrollTop + el.clientHeight >= el.scrollHeight - 50
}

function scheduleScroll() {
  if (scrollRafId !== null) return
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = null
    const el = streamRef.value
    if (el && isNearBottom(el)) {
      el.scrollTop = el.scrollHeight
    }
  })
}

function forceScrollToBottom() {
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

function saveSettings() {
  localStorage.setItem(STORAGE_AGENT_URL, settingsCfg.agentUrl.trim() || AGENT_URL_DEFAULT)
  localStorage.setItem(STORAGE_PROVIDER, settingsCfg.provider)
  localStorage.setItem(STORAGE_MODEL_NAME, settingsCfg.modelName.trim())
  localStorage.setItem(STORAGE_API_KEY, settingsCfg.apiKey.trim())
  localStorage.setItem(STORAGE_BASE_URL, settingsCfg.baseUrl.trim())
  settingsOpen.value = false
  reconnectWs()
}

function resetSettings() {
  settingsCfg.agentUrl = AGENT_URL_DEFAULT
  settingsCfg.provider = 'deepseek'
  settingsCfg.modelName = ''
  settingsCfg.apiKey = ''
  settingsCfg.baseUrl = ''
}

function getAgentUrl() { return localStorage.getItem(STORAGE_AGENT_URL) || AGENT_URL_DEFAULT }
function getProvider() { return localStorage.getItem(STORAGE_PROVIDER) || 'deepseek' }
function getModelName() { return localStorage.getItem(STORAGE_MODEL_NAME) || '' }
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
      case 'confirm_request':
        handleConfirmRequest(msg)
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
      case 'skill_summary':
        handleSkillSummary(msg)
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
  scheduleScroll()
}

function handleReplyText(msg) {
  if (!activeConv) return
  if (!activeConv.replyText) activeConv.replyText = ''
  activeConv.replyText += msg.delta
  scheduleScroll()
}

function handleToolCall(msg) {
  if (!activeConv) return
  const { call_id, name, args } = msg
  const stepName = getFriendlyName(name) || name
  const stepStart = Date.now()

  const step = reactive({
    callId: call_id,
    name: stepName,
    args,
    status: 'active',
    detail: '执行中...',
    duration: '',
    resultText: '',
    startTime: stepStart,
  })
  activeConv.toolSteps.push(step)
  scheduleScroll()

  retryWithBackoff(
    () => executeCommand(name, args),
    {
      maxRetries: 3,
      onRetry: (state) => {
        step.status = 'retrying'
        step.detail = `重试中 (${state.attempt}/${state.maxRetries})`
        scheduleScroll()
      },
      onTARGET_STALE: () => executeCommand('discover_tools', {}),
    },
  ).then(result => {
    step.status = 'done'
    step.detail = ''
    step.duration = ((Date.now() - stepStart) / 1000).toFixed(1) + 's'
    step.resultText = formatStepResult(result)
    ws.send(JSON.stringify({ type: 'tool_result', call_id, result }))
    scheduleScroll()
  }).catch(err => {
    step.status = 'error'
    step.detail = err.message || '执行失败'
    step.resultText = ''
    ws.send(JSON.stringify({ type: 'tool_result', call_id, result: { error: err.message || '执行失败' } }))
    scheduleScroll()
  })
}

function handleConfirmRequest(msg) {
  if (!activeConv) return
  const { call_id, name, args } = msg
  const stepName = getFriendlyName(name) || name

  const step = {
    callId: call_id,
    name: stepName,
    args,
    status: 'done',
    detail: '已确认',
    duration: '',
    resultText: '',
    startTime: Date.now(),
  }
  activeConv.toolSteps.push(step)
  scheduleScroll()

  ws.send(JSON.stringify({ type: 'confirm_result', call_id, confirmed: true }))
}

function formatStepResult(result) {
  if (!result) return ''
  if (typeof result === 'string') return result
  try {
    const str = JSON.stringify(result, null, 2)
    const lines = str.split('\n')
    if (lines.length > 10) {
      return lines.slice(0, 10).join('\n') + '\n... 还有 ' + (lines.length - 10) + ' 行'
    }
    return str
  } catch {
    return String(result)
  }
}

function handleDone(msg) {
  if (!activeConv) return
  activeConv.status = 'done'
  if (msg.message && !activeConv.replyText) {
    activeConv.replyText = msg.message
  }
  isProcessing.value = false
  activeConv = null
  scheduleScroll()
}

function handleError(msg) {
  if (!activeConv) return
  activeConv.status = 'error'
  activeConv.errorMessage = msg.message || '执行错误'
  isProcessing.value = false
  activeConv = null
  scheduleScroll()
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

  activeConv = reactive({
    id: 'conv_' + Date.now(),
    userMessage: text,
    status: 'running',
    thinking: '',
    replyText: '',
    toolSteps: [],
    errorMessage: '',
    thinkCollapsed: false,
  })
  conversations.value.push(activeConv)
  forceScrollToBottom()

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
    provider: getProvider() || undefined,
    model_name: getModelName() || undefined,
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
    skillType: 'strict',
    generating: false,
  }
  skillPanelOpen.value = true
  generateSummary(steps, 'strict')
}

function confirmSaveSkill() {
  const es = editingSkill.value
  if (!es || !es.name.trim() || !ws) return

  ws.send(JSON.stringify({
    type: 'save_skill',
    name: es.name.trim(),
    description: es.description.trim(),
    steps: es.steps,
    skill_type: es.skillType || 'strict',
  }))
  editingSkill.value = null
}

function generateSummary(steps, skillType) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  if (editingSkill.value) editingSkill.value.generating = true
  ws.send(JSON.stringify({ type: 'generate_skill_summary', steps, skill_type: skillType || 'strict' }))
}

function handleSkillSummary(msg) {
  if (!editingSkill.value) return
  editingSkill.value.generating = false
  if (msg.error) return
  if (msg.name && !editingSkill.value.name) editingSkill.value.name = msg.name
  if (msg.description && !editingSkill.value.description) editingSkill.value.description = msg.description
}

function importSkill(file) {
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result)
      if (!data.steps || !Array.isArray(data.steps)) return
      const params = extractSkillParams(data.steps)
      editingSkill.value = {
        name: data.name || '',
        description: data.description || '',
        params: params.map(p => ({ ...p })),
        steps: data.steps,
        skillType: data.skillType || 'strict',
        generating: false,
      }
      skillPanelOpen.value = true
    } catch {}
  }
  reader.readAsText(file)
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
  settingsCfg.provider = localStorage.getItem(STORAGE_PROVIDER) || 'deepseek'
  settingsCfg.modelName = localStorage.getItem(STORAGE_MODEL_NAME) || ''
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
  if (scrollRafId !== null) {
    cancelAnimationFrame(scrollRafId)
    scrollRafId = null
  }
  if (wsReconnectTimer) clearTimeout(wsReconnectTimer)
  if (ws) { ws.onclose = null; ws.close(); ws = null }
})
</script>

<style>
@import './theme-dark.css';
@import './theme-light.css';
@import './assets/base.css';
@import './components/AppHeader.css';
@import './components/ConversationStream.css';
@import './components/ConversationBlock.css';
@import './components/ToolTree.css';
@import './components/ChatInput.css';
@import './components/SettingsPanel.css';
@import './components/SkillPanel.css';
</style>
