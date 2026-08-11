/**
 * 本地经验提炼器
 *
 * 纯前端内存实现的经验规则提取、审核管理和关键词检索。
 * 无需后端 API，所有操作在浏览器端完成。
 */

/** 执行日志 */
export interface ExecutionLogLocal {
  taskId: string
  agentId: string
  taskDescription: string
  taskType: string
  status: 'success' | 'failure' | 'partial'
  steps: string[]
  errors: string[]
  corrections: string[]
  finalOutput: string
  createdAt: string
}

/** 经验规则 */
export interface ExperienceRuleLocal {
  ruleId: string
  triggerCondition: string
  action: string
  note: string
  sourceTaskId: string
  sourceTaskType: string
  ruleType: 'success_pattern' | 'failure_recovery' | 'optimization' | 'heuristic'
  status: 'pending_review' | 'approved' | 'rejected'
  keywords: string[]
  createdAt: string
}

/** 任务类型推断关键词映射 */
const TASK_TYPE_KEYWORDS: Record<string, string[]> = {
  'software-dev': ['code', 'implement', 'develop', 'api', 'function', 'class', 'bug', 'fix', 'refactor', 'deploy', 'backend', 'frontend', 'typescript', 'javascript', 'python', 'java', 'react', 'vue', 'node', 'database', 'sql', 'git', 'commit', 'merge', 'test', 'debug', 'compile', 'build', 'npm', 'pip', 'docker'],
  'data-analysis': ['data', 'analyze', 'dataset', 'csv', 'statistics', 'visualization', 'chart', 'metrics', 'dashboard', 'report', 'kpi', 'pandas', 'numpy', 'excel', 'query', 'aggregate', 'trend', 'correlation'],
  'content-writing': ['write', 'article', 'blog', 'content', 'document', 'copy', 'draft', 'edit', 'proofread', 'publish', 'story', 'narrative', 'essay', 'report', 'summary', 'review'],
  'ppt-design': ['ppt', 'presentation', 'slide', 'deck', 'powerpoint', 'keynote', 'pitch', 'slides', 'slide-deck'],
  'video-production': ['video', 'animate', 'animation', 'render', 'clip', 'film', 'montage', 'motion', 'vfx', 'after effects', 'premiere', 'timeline', 'frame', 'scene'],
}

export class ExperienceExtractorLocal {
  private rules: Map<string, ExperienceRuleLocal> = new Map()

  /**
   * 从成功执行日志中提取经验规则。
   * 提取决策点和步骤模式作为成功模式。
   */
  extractFromSuccess(log: ExecutionLogLocal): ExperienceRuleLocal[] {
    if (log.status !== 'success' || log.steps.length === 0) return []

    const extractedRules: ExperienceRuleLocal[] = []

    // 提取步骤模式：如果有 ≥2 个步骤，将完整步骤序列作为成功模式
    if (log.steps.length >= 2) {
      const stepPatternRule: ExperienceRuleLocal = {
        ruleId: this.generateRuleId(),
        triggerCondition: `Task type is "${log.taskType}" with similar description`,
        action: `Follow step sequence: ${log.steps.join(' → ')}`,
        note: `Extracted from successful task ${log.taskId} (${log.steps.length} steps)`,
        sourceTaskId: log.taskId,
        sourceTaskType: log.taskType,
        ruleType: 'success_pattern',
        status: 'pending_review',
        keywords: this.extractKeywords(log.taskDescription),
        createdAt: new Date().toISOString(),
      }
      extractedRules.push(stepPatternRule)
      this.rules.set(stepPatternRule.ruleId, stepPatternRule)
    }

    // 提取决策点：如果输出中有明确的决策结果
    if (log.finalOutput && log.finalOutput.length > 0) {
      const decisionRule: ExperienceRuleLocal = {
        ruleId: this.generateRuleId(),
        triggerCondition: `Task type is "${log.taskType}" and requires similar output`,
        action: `Apply approach: ${this.summarizeOutput(log.finalOutput)}`,
        note: `Decision pattern from task ${log.taskId}`,
        sourceTaskId: log.taskId,
        sourceTaskType: log.taskType,
        ruleType: 'heuristic',
        status: 'pending_review',
        keywords: this.extractKeywords(log.taskDescription),
        createdAt: new Date().toISOString(),
      }
      extractedRules.push(decisionRule)
      this.rules.set(decisionRule.ruleId, decisionRule)
    }

    return extractedRules
  }

  /**
   * 从失败-恢复日志中提取经验规则。
   * 将错误与对应的修正配对，生成 failure_recovery 规则。
   */
  extractFromFailureRecovery(log: ExecutionLogLocal): ExperienceRuleLocal[] {
    if (log.errors.length === 0 || log.corrections.length === 0) return []

    const extractedRules: ExperienceRuleLocal[] = []
    const pairCount = Math.min(log.errors.length, log.corrections.length)

    for (let i = 0; i < pairCount; i++) {
      const rule: ExperienceRuleLocal = {
        ruleId: this.generateRuleId(),
        triggerCondition: `Error encountered: "${this.truncate(log.errors[i], 80)}"`,
        action: `Apply correction: ${log.corrections[i]}`,
        note: `Failure recovery from task ${log.taskId}, error-correction pair ${i + 1}`,
        sourceTaskId: log.taskId,
        sourceTaskType: log.taskType,
        ruleType: 'failure_recovery',
        status: 'pending_review',
        keywords: this.extractKeywords(`${log.errors[i]} ${log.corrections[i]}`),
        createdAt: new Date().toISOString(),
      }
      extractedRules.push(rule)
      this.rules.set(rule.ruleId, rule)
    }

    return extractedRules
  }

  /**
   * 提交规则供审核。
   */
  submitForReview(rule: ExperienceRuleLocal): ExperienceRuleLocal {
    const submitted: ExperienceRuleLocal = {
      ...rule,
      status: 'pending_review',
    }
    this.rules.set(submitted.ruleId, submitted)
    return { ...submitted }
  }

  /**
   * 审批通过规则。
   */
  approveRule(ruleId: string, comment?: string): ExperienceRuleLocal | null {
    const rule = this.rules.get(ruleId)
    if (!rule) return null
    rule.status = 'approved'
    if (comment) rule.note = `${rule.note} | Approved: ${comment}`
    return { ...rule }
  }

  /**
   * 驳回规则。
   */
  rejectRule(ruleId: string, reason: string): ExperienceRuleLocal | null {
    const rule = this.rules.get(ruleId)
    if (!rule) return null
    rule.status = 'rejected'
    rule.note = `${rule.note} | Rejected: ${reason}`
    return { ...rule }
  }

  /**
   * 修改规则。
   */
  modifyRule(ruleId: string, updates: Partial<Pick<ExperienceRuleLocal, 'triggerCondition' | 'action' | 'note' | 'keywords'>>): ExperienceRuleLocal | null {
    const rule = this.rules.get(ruleId)
    if (!rule) return null
    if (updates.triggerCondition !== undefined) rule.triggerCondition = updates.triggerCondition
    if (updates.action !== undefined) rule.action = updates.action
    if (updates.note !== undefined) rule.note = updates.note
    if (updates.keywords !== undefined) rule.keywords = updates.keywords
    return { ...rule }
  }

  /**
   * 基于任务类型和关键词检索相关规则。
   * 匹配策略：任务类型精确匹配 + 关键词交集。
   */
  retrieveRelevantRules(taskType: string, keywords: string[]): ExperienceRuleLocal[] {
    const results: ExperienceRuleLocal[] = []
    const keywordSet = new Set(keywords.map(k => k.toLowerCase()))

    for (const rule of this.rules.values()) {
      if (rule.status !== 'approved') continue

      // 任务类型匹配
      const typeMatch = rule.sourceTaskType === taskType

      // 关键词匹配：至少有一个关键词命中
      const keywordMatch = rule.keywords.some(k => keywordSet.has(k.toLowerCase()))

      if (typeMatch || keywordMatch) {
        results.push({ ...rule })
      }
    }

    return results
  }

  /**
   * 将规则列表格式化为可注入 prompt 的文本。
   */
  buildExperienceContext(rules: ExperienceRuleLocal[]): string {
    if (rules.length === 0) return ''

    const lines: string[] = ['# Relevant Experience Rules', '']

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i]
      lines.push(`## Rule ${i + 1} [${rule.ruleType}]`)
      lines.push(`**Trigger:** ${rule.triggerCondition}`)
      lines.push(`**Action:** ${rule.action}`)
      if (rule.note) lines.push(`**Note:** ${rule.note}`)
      lines.push(`**Keywords:** ${rule.keywords.join(', ')}`)
      lines.push('')
    }

    return lines.join('\n')
  }

  /**
   * 获取所有待审核规则。
   */
  getPendingRules(): ExperienceRuleLocal[] {
    return this.getAllRules('pending_review')
  }

  /**
   * 获取所有规则，可选按状态过滤。
   */
  getAllRules(status?: ExperienceRuleLocal['status']): ExperienceRuleLocal[] {
    const results: ExperienceRuleLocal[] = []
    for (const rule of this.rules.values()) {
      if (!status || rule.status === status) {
        results.push({ ...rule })
      }
    }
    return results
  }

  /**
   * 根据描述推断任务类型。
   * 基于关键词匹配，返回最匹配的类型。
   */
  inferTaskType(description: string): string {
    const lower = description.toLowerCase()
    let bestType = 'general'
    let bestScore = 0

    for (const [taskType, keywords] of Object.entries(TASK_TYPE_KEYWORDS)) {
      let score = 0
      for (const kw of keywords) {
        if (lower.includes(kw)) score++
      }
      if (score > bestScore) {
        bestScore = score
        bestType = taskType
      }
    }

    return bestType
  }

  // ====== 内部辅助方法 ======

  private generateRuleId(): string {
    return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  private extractKeywords(text: string): string[] {
    // 提取有意义的关键词（长度 ≥3，去重）
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3)

    const seen = new Set<string>()
    const keywords: string[] = []
    for (const w of words) {
      if (!seen.has(w)) {
        seen.add(w)
        keywords.push(w)
      }
    }
    return keywords.slice(0, 10) // 最多 10 个关键词
  }

  private summarizeOutput(output: string): string {
    const trimmed = output.trim()
    if (trimmed.length <= 120) return trimmed
    return trimmed.slice(0, 117) + '...'
  }

  private truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text
    return text.slice(0, maxLen - 3) + '...'
  }
}

/** 全局单例 */
export const experienceExtractorLocal = new ExperienceExtractorLocal()
