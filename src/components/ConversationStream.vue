<script setup>
import ConversationBlock from './ConversationBlock.vue'

defineProps({
  conversations: { type: Array, required: true },
})

const emit = defineEmits(['openSkillEditor'])
</script>

<template>
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
  <ConversationBlock
    v-for="conv in conversations"
    :key="conv.id"
    :conv="conv"
    @open-skill-editor="emit('openSkillEditor', $event)"
  />
</template>
