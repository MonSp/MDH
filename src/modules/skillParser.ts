interface ToolStep {
  command?: string
  name?: string
  args?: Record<string, any>
  payload?: Record<string, any>
}

const FIXED_COMMANDS = new Set([
  'scroll', 'wait', 'get_screenshot', 'get_tabs',
  'press_key', 'close_tab', 'switch_tab',
])

function isParameterizable(value: any): boolean {
  if (typeof value === 'string') return value.length > 1
  if (typeof value === 'number') return value > 100
  return false
}

function toCommandName(step: ToolStep): string {
  return step.command || step.name || ''
}

function toPayload(step: ToolStep): Record<string, any> {
  return step.payload || step.args || {}
}

export function extractSkillParams(toolSteps: ToolStep[]): Array<{ key: string; label: string; defaultValue: string }> {
  const seen = new Set<string>()
  const params: Array<{ key: string; label: string; defaultValue: string }> = []

  for (const step of toolSteps) {
    const cmd = toCommandName(step)
    if (FIXED_COMMANDS.has(cmd)) continue

    const payload = toPayload(step)
    for (const [key, value] of Object.entries(payload)) {
      if (!isParameterizable(value)) continue
      if (seen.has(key)) continue

      const label = key === 'url' ? 'URL'
        : key === 'query' ? '搜索关键词'
        : key === 'button_label' ? '按钮文字'
        : key === 'field_name' ? '字段名'
        : key === 'value' ? '输入内容'
        : key === 'username' ? '用户名'
        : key === 'password' ? '密码'
        : key

      seen.add(key)
      params.push({ key, label, defaultValue: String(value) })
    }
  }

  return params
}

export function stepsToServerFormat(toolSteps: ToolStep[]): Array<{ command: string; payload: Record<string, any> }> {
  return toolSteps
    .filter(s => s.status === 'done' || !s.status)
    .map(s => ({ command: toCommandName(s), payload: toPayload(s) }))
    .filter(s => s.command)
}

export function buildSkillPrompt(skillName: string): string {
  return `请使用技能 "${skillName}" 帮我执行任务`
}
