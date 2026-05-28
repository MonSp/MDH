<script setup>
import { computed } from 'vue'

const props = defineProps({
  wsStatus: { type: String, required: true },
  pageCtx: { type: Object, default: () => ({}) },
  theme: { type: String, required: true },
  username: { type: String, default: '' },
})

const emit = defineEmits(['toggleTheme', 'toggleSettings', 'toggleSkills', 'newSession', 'logout'])

const wsStatusText = computed(() => {
  const map = { connected: '已连接', connecting: '连接中', disconnected: '未连接', error: '连接错误' }
  return map[props.wsStatus] || props.wsStatus
})
</script>

<template>
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
      <div class="header-status">
        <span :style="{ color: wsStatus === 'connected' ? 'var(--accent)' : '#f88' }">●</span> {{ wsStatusText }}
      </div>
      <div class="user-info" v-if="username">
        <span class="user-icon">👤</span>
        <span class="username">{{ username }}</span>
        <button class="logout-btn" @click="emit('logout')" title="退出登录">退出</button>
      </div>
      <button
        class="theme-toggle-btn"
        @click="emit('toggleTheme')"
        :title="theme === 'dark' ? '切换到浅色' : '切换到深色'"
      >
        <svg v-if="theme === 'dark'" width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="3.5" stroke="currentColor" stroke-width="1"/><path d="M7 1 L7 3 M7 11 L7 13 M1 7 L3 7 M11 7 L13 7 M2.5 2.5 L4 4 M10 10 L11.5 11.5 M2.5 11.5 L4 10 M10 4 L11.5 2.5" stroke="currentColor" stroke-width="0.7" stroke-linecap="round"/></svg>
        <svg v-else width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M8.5 2.5 A4.5 4.5 0 1 0 11.5 5.5 A3 3 0 0 1 8.5 2.5Z" stroke="currentColor" stroke-width="1" fill="none"/></svg>
      </button>
      <button class="settings-btn" @click="emit('toggleSettings')" title="配置">
        <svg viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2.5" stroke="currentColor" stroke-width="1"/><path d="M7 1.5 L7.8 3.2 L7 4.5 L6.2 3.2 Z M12.5 7 L11 7.5 L10.2 6.5 L11 5.5 Z M1.5 7 L3 7.5 L3.8 6.5 L3 5.5 Z M7 12.5 L7.8 10.8 L6.2 9.5 L5.5 10.3 Z" stroke="currentColor" stroke-width="0.8" fill="none"/></svg>
      </button>
      <button class="skills-btn" @click="emit('toggleSkills')" title="Skill 模板">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="currentColor" stroke-width="0.8"/><path d="M4 5 L6 5 M4 7.5 L8 7.5 M4 10 L5.5 10" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"/></svg>
      </button>
      <button class="new-conv-btn" @click="emit('newSession')" title="新建对话">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2 L7 12 M2 7 L12 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      </button>
    </div>
  </header>
</template>
