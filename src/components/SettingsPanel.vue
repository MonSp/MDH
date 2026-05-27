<script setup>
import { computed } from 'vue'

const open = defineModel('open', { type: Boolean, default: false })

const props = defineProps({
  settingsCfg: { type: Object, required: true },
})

const emit = defineEmits(['save', 'reset', 'close'])

const providers = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'dashscope', label: 'DashScope (通义)' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'moonshot', label: 'Moonshot (月之暗面)' },
  { value: 'ollama', label: 'Ollama (本地)' },
  { value: 'xai', label: 'xAI (Grok)' },
  { value: 'custom', label: '自定义 (OpenAI 兼容)' },
]

const modelPlaceholders = {
  deepseek: 'deepseek-chat',
  openai: 'gpt-4.1',
  anthropic: 'claude-sonnet-4-6',
  dashscope: 'qwen-plus',
  gemini: 'gemini-2.5-flash',
  moonshot: 'moonshot-v1-8k',
  ollama: 'qwen3-14b',
  xai: 'grok-4.3',
  custom: 'my-model',
}

const baseUrlPlaceholders = {
  deepseek: 'https://api.deepseek.com',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  dashscope: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  gemini: '',
  moonshot: 'https://api.moonshot.cn/v1',
  ollama: 'http://localhost:11434',
  xai: '',
  custom: 'https://your-api-endpoint.com/v1',
}

const isCustom = computed(() => props.settingsCfg.provider === 'custom')
</script>

<template>
  <div class="settings-overlay" :class="{ open }" @click.self="emit('close')">
    <div class="settings-panel">
      <h3><span>⚙</span> 后端配置</h3>
      <div class="settings-group">
        <label class="settings-label">AgentScope 后端地址</label>
        <input class="settings-input" type="text" v-model="props.settingsCfg.agentUrl" placeholder="ws://localhost:8765/ws">
        <div class="settings-hint">AgentScope Python 后端 WebSocket 地址</div>
      </div>
      <div class="settings-group">
        <label class="settings-label">模型提供商</label>
        <select class="settings-input" v-model="props.settingsCfg.provider">
          <option v-for="p in providers" :key="p.value" :value="p.value">{{ p.label }}</option>
        </select>
      </div>
      <div class="settings-group">
        <label class="settings-label">模型名称 <span v-if="isCustom" class="required">*</span></label>
        <input class="settings-input" type="text" v-model="props.settingsCfg.modelName" :placeholder="modelPlaceholders[props.settingsCfg.provider] || ''">
        <div class="settings-hint" v-if="isCustom">必填，输入自定义模型名称</div>
        <div class="settings-hint" v-else>留空则使用后端默认模型</div>
      </div>
      <div class="settings-group">
        <label class="settings-label">API KEY <span v-if="isCustom" class="required">*</span></label>
        <input class="settings-input" type="password" v-model="props.settingsCfg.apiKey" placeholder="sk-...">
        <div class="settings-hint">传递给后端用于 LLM 调用</div>
      </div>
      <div class="settings-group">
        <label class="settings-label">BASE URL <span v-if="isCustom" class="required">*</span></label>
        <input class="settings-input" type="text" v-model="props.settingsCfg.baseUrl" :placeholder="baseUrlPlaceholders[props.settingsCfg.provider] || 'https://api.example.com/v1'">
        <div class="settings-hint" v-if="isCustom">必填，OpenAI 兼容的 API 端点地址</div>
        <div class="settings-hint" v-else>自定义 API 端点地址（可选）</div>
      </div>
      <div class="settings-actions">
        <button class="settings-btn-reset" @click="emit('reset')">恢复默认</button>
        <button class="settings-btn-secondary" @click="emit('close')">取消</button>
        <button class="settings-btn-primary" @click="emit('save')">保存</button>
      </div>
    </div>
  </div>
</template>
