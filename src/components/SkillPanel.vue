<script setup>
const open = defineModel('open', { type: Boolean, default: false })

defineProps({
  skills: { type: Array, default: () => [] },
  editingSkill: { type: Object, default: null },
})

const emit = defineEmits(['close', 'saveSkill', 'deleteSkill', 'runSkill', 'cancelEdit'])
</script>

<template>
  <div class="skill-overlay" :class="{ open }" @click.self="emit('close')">
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
          <button class="skill-btn-cancel" @click="emit('cancelEdit')">取消</button>
          <button class="skill-btn-save" @click="emit('saveSkill')">保存</button>
        </div>
      </div>

      <div class="skill-list" v-else>
        <div class="skill-empty" v-if="!skills.length">
          <p>暂无 Skill 模板</p>
          <p class="skill-hint">执行任务后点击"保存为 Skill"即可创建</p>
        </div>
        <div class="skill-card" v-for="skill in skills" :key="skill.dir">
          <div class="skill-card-header">
            <span class="skill-card-name">{{ skill.name }}</span>
            <button class="skill-card-del" @click="emit('deleteSkill', skill.dir)">×</button>
          </div>
          <div class="skill-card-desc">{{ skill.description }}</div>
          <button class="skill-card-run" @click="emit('runSkill', skill)">执行</button>
        </div>
      </div>
    </div>
  </div>
</template>
