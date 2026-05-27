<script setup>
import ToolTree from './ToolTree.vue'

defineProps({
  conv: { type: Object, required: true },
})

const emit = defineEmits(['openSkillEditor'])
</script>

<template>
  <div class="conv-block">
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
            <button class="think-collapse-btn" @click="conv.thinkCollapsed = !conv.thinkCollapsed">
              {{ conv.thinkCollapsed ? '展开' : '折叠' }}
            </button>
          </div>
          <div class="agent-think-line think-active" v-if="!conv.thinkCollapsed">
            <span class="think-tag-inline reason">推理</span>
            <span class="think-text-inline">{{ conv.thinking }}</span>
          </div>
        </div>

        <ToolTree :steps="conv.toolSteps" />

        <div class="agent-reply-text" v-if="conv.replyText" :class="{ streaming: conv.status === 'running' }">
          {{ conv.replyText }}<span class="streaming-cursor" v-if="conv.status === 'running'">|</span>
        </div>

        <div class="agent-result" v-if="conv.status === 'done'">
          <div class="agent-result-text" v-if="!conv.replyText && conv.toolSteps.length > 0">任务完成</div>
          <div class="result-actions" v-if="conv.toolSteps.filter(s => s.status === 'done').length > 0">
            <div class="result-stats">
              <span class="result-stat">
                <strong>{{ conv.toolSteps.filter(s => s.status === 'done').length }}</strong> 步骤
              </span>
            </div>
            <button
              class="save-skill-btn"
              @click="emit('openSkillEditor', conv)"
              title="保存为 Skill 模板"
            >保存为 Skill</button>
          </div>
        </div>

        <div class="agent-loading" v-if="conv.status === 'running' && !conv.replyText">
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
</template>
