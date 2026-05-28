<script setup>
import { ref } from 'vue'
import { formatStepArgs, getParamLabel } from '../modules/skillParser'

const open = defineModel('open', { type: Boolean, default: false })

const props = defineProps({
  skills: { type: Array, default: () => [] },
  editingSkill: { type: Object, default: null },
})

const emit = defineEmits([
  'close', 'saveSkill', 'deleteSkill', 'runSkill',
  'cancelEdit', 'regenerateSummary', 'importSkill', 'update:editingSkill',
])

const importInput = ref(null)

const SKILL_TYPES = [
  { value: 'strict', label: '严格步骤', desc: '精确记录网页、元素、输入内容，执行时严格复现' },
  { value: 'general', label: '泛化决策', desc: '只记录高层目标，执行时 AI 自主决策具体操作' },
]

function changeSkillType(type) {
  const es = props.editingSkill
  if (!es || es.skillType === type) return
  emit('update:editingSkill', { ...es, skillType: type, name: '', description: '', generating: true })
  emit('regenerateSummary')
}

function moveStep(index, direction) {
  const es = props.editingSkill
  if (!es) return
  const target = index + direction
  if (target < 0 || target >= es.steps.length) return
  const steps = [...es.steps]
  ;[steps[index], steps[target]] = [steps[target], steps[index]]
  emit('update:editingSkill', { ...es, steps })
}

function removeStep(index) {
  const es = props.editingSkill
  if (!es) return
  const steps = es.steps.filter((_, i) => i !== index)
  emit('update:editingSkill', { ...es, steps })
}

function exportSkill() {
  const es = props.editingSkill
  if (!es) return
  const data = { name: es.name, description: es.description, steps: es.steps, skillType: es.skillType }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${es.name || 'skill'}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function onImportFile(e) {
  const file = e.target.files?.[0]
  if (file) emit('importSkill', file)
  e.target.value = ''
}

function exportExistingSkill(skill) {
  const data = { name: skill.name, description: skill.description, type: skill.type, dir: skill.dir }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${skill.name || 'skill'}.json`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="skill-overlay" :class="{ open }" @click.self="emit('close')">
    <div class="skill-panel">
      <h3>Skill 模板</h3>

      <div class="skill-editor" v-if="editingSkill !== null">
        <div class="skill-editor-field">
          <label>技能类型</label>
          <div class="skill-type-selector">
            <button
              v-for="t in SKILL_TYPES"
              :key="t.value"
              class="skill-type-btn"
              :class="{ active: editingSkill.skillType === t.value }"
              @click="changeSkillType(t.value)"
            >
              <span class="skill-type-label">{{ t.label }}</span>
              <span class="skill-type-desc">{{ t.desc }}</span>
            </button>
          </div>
        </div>
        <div class="skill-editor-field">
          <label>
            名称
            <span class="skill-gen-badge" v-if="editingSkill.generating">AI 生成中...</span>
          </label>
          <div class="skill-input-row">
            <input v-model="editingSkill.name" placeholder="如：GitHub 搜索">
            <button
              class="skill-btn-icon"
              title="重新生成摘要"
              :disabled="editingSkill.generating"
              @click="emit('regenerateSummary')"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M11.5 7A4.5 4.5 0 1 1 7 2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                <path d="M7 1v2.5h2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
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
          <div class="skill-step-list">
            <div class="skill-step-item" v-for="(step, i) in editingSkill.steps" :key="i">
              <div class="skill-step-main">
                <span class="skill-step-index">{{ i + 1 }}</span>
                <span class="skill-step-cmd">{{ step.command }}</span>
                <span class="skill-step-args" v-if="Object.keys(step.payload || {}).length">
                  {{ formatStepArgs(step.payload) }}
                </span>
              </div>
              <div class="skill-step-actions">
                <button class="skill-step-btn" :disabled="i === 0" @click="moveStep(i, -1)" title="上移">↑</button>
                <button class="skill-step-btn" :disabled="i === editingSkill.steps.length - 1" @click="moveStep(i, 1)" title="下移">↓</button>
                <button class="skill-step-btn skill-step-btn-del" @click="removeStep(i)" title="删除">×</button>
              </div>
            </div>
          </div>
        </div>
        <div class="skill-editor-actions">
          <button class="skill-btn-secondary" @click="exportSkill" title="导出为 JSON">导出</button>
          <button class="skill-btn-cancel" @click="emit('cancelEdit')">取消</button>
          <button class="skill-btn-save" @click="emit('saveSkill')">保存</button>
        </div>
      </div>

      <div class="skill-list" v-else>
        <div class="skill-list-actions">
          <button class="skill-btn-import" @click="importInput?.click()">导入 Skill</button>
          <input ref="importInput" type="file" accept=".json" style="display:none" @change="onImportFile">
        </div>
        <div class="skill-empty" v-if="!skills.length">
          <p>暂无 Skill 模板</p>
          <p class="skill-hint">执行任务后点击"保存为 Skill"即可创建</p>
        </div>
        <div class="skill-card" v-for="skill in skills" :key="skill.dir">
          <div class="skill-card-header">
            <span class="skill-card-name">{{ skill.name }}</span>
            <div class="skill-card-actions">
              <span class="skill-card-type" v-if="skill.type === 'general'">泛化</span>
              <button class="skill-card-export" @click="exportExistingSkill(skill)" title="导出">⤓</button>
              <button class="skill-card-del" @click="emit('deleteSkill', skill.dir)">×</button>
            </div>
          </div>
          <div class="skill-card-desc">{{ skill.description }}</div>
          <button class="skill-card-run" @click="emit('runSkill', skill)">执行</button>
        </div>
      </div>
    </div>
  </div>
</template>
