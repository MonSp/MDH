<script setup>
defineProps({
  steps: { type: Array, required: true },
})
</script>

<template>
  <div class="tool-tree" v-if="steps.length">
    <div class="tool-tree-item" v-for="(step, i) in steps" :key="i">
      <div class="tool-tree-connector">
        <div class="tool-tree-dot" :class="step.status">
          <svg v-if="step.status === 'done'" width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3.5 6L6.5 2" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span v-else-if="step.status === 'error'" class="tool-dot-x">✕</span>
          <span v-else-if="step.status === 'retrying'" class="tool-dot-r">↻</span>
        </div>
        <div class="tool-tree-line" v-if="i < steps.length - 1"></div>
      </div>
      <div class="tool-tree-content">
        <div class="tool-tree-header">
          <span class="tool-tree-name" :class="{
            'tool-name-done': step.status === 'done',
            'tool-name-active': step.status === 'active',
            'tool-name-error': step.status === 'error',
            'tool-name-retrying': step.status === 'retrying'
          }">{{ step.name }}</span>
          <span class="tool-tree-duration" v-if="step.duration">{{ step.duration }}</span>
        </div>
        <div class="tool-tree-result" v-if="step.detail && step.status !== 'done' && step.status !== 'error'">
          {{ step.detail }}
        </div>
        <div class="tool-tree-result tool-result-done" v-if="step.status === 'done' && step.resultText">
          <pre class="tool-result-pre">{{ step.resultText }}</pre>
        </div>
        <div class="tool-tree-result tool-result-error" v-if="step.status === 'error' && step.detail">
          {{ step.detail }}
        </div>
      </div>
    </div>
  </div>
</template>
