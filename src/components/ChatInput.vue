<script setup>
import { ref } from 'vue'

const model = defineModel({ type: String, default: '' })

defineProps({
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['send'])

const inputRef = ref(null)

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    emit('send')
  }
}

function autoResize(e) {
  e.target.style.height = 'auto'
  e.target.style.height = Math.min(e.target.scrollHeight, 90) + 'px'
}

defineExpose({ inputRef })
</script>

<template>
  <div class="input-bar">
    <div class="input-wrap">
      <textarea
        class="chat-input"
        v-model="model"
        rows="1"
        placeholder="输入指令，例如：打开 GitHub 搜索 vue..."
        @keydown="handleKeydown"
        @input="autoResize"
        ref="inputRef"
      ></textarea>
      <button class="send-btn" @click="emit('send')" :disabled="disabled" title="发送">
        <svg viewBox="0 0 16 16" fill="none"><path d="M2 2 L14 8 L2 14 L4 8 L2 2Z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round"/></svg>
      </button>
    </div>
    <div class="input-hint"><kbd>Enter</kbd> 发送 · <kbd>Shift+Enter</kbd> 换行</div>
  </div>
</template>
