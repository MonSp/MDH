<script setup>
import { watch } from 'vue'

const open = defineModel('open', { type: Boolean, default: false })

const props = defineProps({
  settingsCfg: { type: Object, required: true },
})

const emit = defineEmits(['save', 'reset', 'close'])
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
        <label class="settings-label">DeepSeek API KEY</label>
        <input class="settings-input" type="password" v-model="props.settingsCfg.apiKey" placeholder="sk-...">
        <div class="settings-hint">传递给后端用于 LLM 调用</div>
      </div>
      <div class="settings-group">
        <label class="settings-label">DeepSeek BASE URL</label>
        <input class="settings-input" type="text" v-model="props.settingsCfg.baseUrl" placeholder="https://api.deepseek.com">
      </div>
      <div class="settings-actions">
        <button class="settings-btn-reset" @click="emit('reset')">恢复默认</button>
        <button class="settings-btn-secondary" @click="emit('close')">取消</button>
        <button class="settings-btn-primary" @click="emit('save')">保存</button>
      </div>
    </div>
  </div>
</template>
