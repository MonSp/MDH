/** DynamicRouterLocal - 本地动态路由器（从 Python backend/dynamic_router.py 移植）
 *
 * 负责将用户需求路由到合适的部门。
 * 支持基于规则的关键词匹配、语义相似度排序和综合评分决策。
 */

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export interface RouteEntryLocal {
  deptId: string
  deptName: string
  capabilityDesc: string
  capabilityKeywords: string[]
  tools: string[]
  successRate: number
  totalTasks: number
  successfulTasks: number
  lastActive: string
  priority: number
}

export interface RoutingDecisionLocal {
  selectedDept: string
  confidence: number
  reason: string
  candidateDepts: Array<{
    deptId: string
    deptName: string
    score: number
    matchedKeywords: string[]
  }>
  matchedKeywords: string[]
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const WEIGHT_KEYWORD = 0.4
const WEIGHT_SEMANTIC = 0.3
const WEIGHT_SUCCESS_RATE = 0.2
const WEIGHT_PRIORITY = 0.1

const TASK_TYPE_KEYWORDS: Record<string, string[]> = {
  'web-dev': ['前端', 'frontend', 'react', 'vue', 'html', 'css', 'javascript', 'typescript', '网页', '界面'],
  'backend-dev': ['后端', 'backend', 'api', '数据库', 'database', '服务器', 'server', 'python', 'java'],
  'data-analysis': ['数据', 'data', '分析', 'analysis', '统计', '图表', '可视化', 'visualization'],
  devops: ['部署', 'deploy', 'docker', 'kubernetes', 'ci/cd', '监控', 'monitoring', '运维'],
  testing: ['测试', 'test', 'qa', '质量', 'quality', '自动化测试', 'automation'],
  design: ['设计', 'design', 'ui', 'ux', '原型', 'prototype', '交互', '界面设计'],
  documentation: ['文档', 'documentation', '说明', 'readme', 'api文档', '技术文档'],
  'code-review': ['审查', 'review', '代码质量', 'code quality', '重构', 'refactor'],
  architecture: ['架构', 'architecture', '系统设计', 'system design', '技术方案'],
  security: ['安全', 'security', '漏洞', 'vulnerability', '认证', 'authentication', '授权', 'authorization'],
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/** 将文本分词为小写词集合（英文单词 + 中文 2-4 字 ngram） */
export function tokenize(text: string): Set<string> {
  const lower = text.toLowerCase()
  const enWords = new Set(lower.match(/[a-z_][a-z0-9_]*/g) ?? [])
  const cnChars = (lower.match(/[\u4e00-\u9fff]/g) ?? []) as string[]
  const cnWords = new Set<string>(cnChars)
  for (const n of [2, 3, 4]) {
    for (let i = 0; i <= cnChars.length - n; i++) {
      cnWords.add(cnChars.slice(i, i + n).join(''))
    }
  }
  for (const w of cnWords) enWords.add(w)
  return enWords
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

// ---------------------------------------------------------------------------
// 默认部门
// ---------------------------------------------------------------------------

function defaultDepartments(): RouteEntryLocal[] {
  const now = nowIso()
  return [
    {
      deptId: 'frontend',
      deptName: '前端开发部',
      capabilityDesc: '负责前端界面开发，包括 React/Vue 组件、CSS 样式、响应式布局和用户交互',
      capabilityKeywords: ['前端', 'frontend', 'react', 'vue', 'html', 'css', 'javascript', 'typescript', '组件', '界面', '网页', 'ui'],
      tools: ['write_file', 'edit_file', 'read_file', 'run_tests'],
      successRate: 0.0,
      totalTasks: 0,
      successfulTasks: 0,
      lastActive: now,
      priority: 5,
    },
    {
      deptId: 'backend',
      deptName: '后端开发部',
      capabilityDesc: '负责后端服务开发，包括 API 设计、数据库操作、服务器端逻辑和微服务架构',
      capabilityKeywords: ['后端', 'backend', 'api', '数据库', 'database', '服务器', 'server', 'python', 'java', 'node', '微服务'],
      tools: ['write_file', 'edit_file', 'read_file', 'bash', 'run_tests'],
      successRate: 0.0,
      totalTasks: 0,
      successfulTasks: 0,
      lastActive: now,
      priority: 5,
    },
    {
      deptId: 'fullstack',
      deptName: '全栈开发部',
      capabilityDesc: '负责全栈开发，前后端联调、系统集成、端到端功能实现',
      capabilityKeywords: ['全栈', 'fullstack', 'full-stack', '集成', '联调', '端到端', '系统开发'],
      tools: ['write_file', 'edit_file', 'read_file', 'bash', 'run_tests', 'git_commit'],
      successRate: 0.0,
      totalTasks: 0,
      successfulTasks: 0,
      lastActive: now,
      priority: 4,
    },
    {
      deptId: 'qa',
      deptName: '质量保障部',
      capabilityDesc: '负责代码审查、测试编写、质量审计和安全检查',
      capabilityKeywords: ['测试', 'test', 'qa', '质量', 'quality', '审查', 'review', '安全', 'security', '自动化测试'],
      tools: ['read_file', 'list_directory', 'bash', 'run_tests', 'run_linter'],
      successRate: 0.0,
      totalTasks: 0,
      successfulTasks: 0,
      lastActive: now,
      priority: 4,
    },
    {
      deptId: 'devops',
      deptName: '运维部署部',
      capabilityDesc: '负责 CI/CD 流水线、Docker 容器化、Kubernetes 部署和系统监控',
      capabilityKeywords: ['部署', 'deploy', 'docker', 'kubernetes', 'ci/cd', '监控', 'monitoring', '运维', '容器', '流水线'],
      tools: ['bash', 'read_file', 'write_file', 'git_commit', 'git_push'],
      successRate: 0.0,
      totalTasks: 0,
      successfulTasks: 0,
      lastActive: now,
      priority: 3,
    },
    {
      deptId: 'data',
      deptName: '数据分析部',
      capabilityDesc: '负责数据分析、统计建模、数据可视化和报表生成',
      capabilityKeywords: ['数据', 'data', '分析', 'analysis', '统计', '图表', '可视化', 'visualization', '报表', '指标'],
      tools: ['read_file', 'write_file', 'bash', 'search_files'],
      successRate: 0.0,
      totalTasks: 0,
      successfulTasks: 0,
      lastActive: now,
      priority: 3,
    },
    {
      deptId: 'docs',
      deptName: '文档编写部',
      capabilityDesc: '负责技术文档编写、API 文档维护、README 和用户指南撰写',
      capabilityKeywords: ['文档', 'documentation', '说明', 'readme', 'api文档', '技术文档', '用户指南', '手册'],
      tools: ['read_file', 'write_file', 'edit_file', 'create_document'],
      successRate: 0.0,
      totalTasks: 0,
      successfulTasks: 0,
      lastActive: now,
      priority: 2,
    },
  ]
}

// ---------------------------------------------------------------------------
// DynamicRouterLocal
// ---------------------------------------------------------------------------

export class DynamicRouterLocal {
  private table: Map<string, RouteEntryLocal>

  constructor() {
    this.table = new Map()
    for (const entry of defaultDepartments()) {
      this.table.set(entry.deptId, entry)
    }
  }

  // ------------------------------------------------------------------
  // tokenize（公开辅助）
  // ------------------------------------------------------------------

  tokenize(text: string): Set<string> {
    return tokenize(text)
  }

  // ------------------------------------------------------------------
  // 规则匹配
  // ------------------------------------------------------------------

  ruleMatch(userInput: string, taskType?: string): RouteEntryLocal[] {
    const entries = [...this.table.values()]
    if (!entries.length) return []
    if (!userInput || !userInput.trim()) return entries

    const inputLower = userInput.toLowerCase()
    const inputTokens = tokenize(userInput)

    const typeKeywords = new Set<string>()
    if (taskType) {
      for (const kw of TASK_TYPE_KEYWORDS[taskType] ?? []) {
        typeKeywords.add(kw.toLowerCase())
      }
      typeKeywords.add(taskType.toLowerCase())
    }

    const scored: Array<{ entry: RouteEntryLocal; score: number }> = []

    for (const entry of entries) {
      if (!entry.capabilityKeywords.length) {
        scored.push({ entry, score: 0 })
        continue
      }

      let matched = 0
      let typeMatched = 0
      for (const kw of entry.capabilityKeywords) {
        const kwLower = kw.toLowerCase()
        if (inputLower.includes(kwLower) || inputTokens.has(kwLower)) {
          matched++
        }
        if (typeKeywords.size > 0 && typeKeywords.has(kwLower)) {
          typeMatched++
        }
      }

      let matchRatio = matched / entry.capabilityKeywords.length

      if (typeKeywords.size > 0 && typeMatched > 0) {
        const typeBoost = typeMatched / entry.capabilityKeywords.length
        matchRatio = Math.min(1, matchRatio + typeBoost * 0.5)
      }

      scored.push({ entry, score: matchRatio })
    }

    if (scored.every(s => s.score === 0)) return entries

    const threshold = 0.1
    const candidates = scored.filter(s => s.score >= threshold).map(s => s.entry)
    return candidates.length ? candidates : entries
  }

  // ------------------------------------------------------------------
  // 语义排序
  // ------------------------------------------------------------------

  semanticRank(
    candidates: RouteEntryLocal[],
    userInput: string,
  ): Array<{ entry: RouteEntryLocal; score: number }> {
    if (!candidates.length) return []

    const inputTokens = tokenize(userInput)
    if (!inputTokens.size) {
      return candidates.map(entry => ({ entry, score: 0 }))
    }

    const results: Array<{ entry: RouteEntryLocal; score: number }> = []

    for (const entry of candidates) {
      const descTokens = tokenize(entry.capabilityDesc)
      if (!descTokens.size) {
        results.push({ entry, score: 0 })
        continue
      }

      // Jaccard
      let intersectionSize = 0
      for (const t of inputTokens) {
        if (descTokens.has(t)) intersectionSize++
      }
      const unionSize = new Set([...inputTokens, ...descTokens]).size
      const jaccard = unionSize > 0 ? intersectionSize / unionSize : 0

      // keyword bonus
      const inputLower = userInput.toLowerCase()
      let kwHits = 0
      for (const kw of entry.capabilityKeywords) {
        const kwLower = kw.toLowerCase()
        if (inputLower.includes(kwLower) || inputTokens.has(kwLower)) kwHits++
      }
      const kwBonus = Math.min(kwHits / Math.max(entry.capabilityKeywords.length, 1), 1)

      const score = Math.min(jaccard * 0.7 + kwBonus * 0.3, 1)
      results.push({ entry, score })
    }

    results.sort((a, b) => b.score - a.score)
    return results
  }

  // ------------------------------------------------------------------
  // 综合路由决策
  // ------------------------------------------------------------------

  route(userInput: string, taskType?: string): RoutingDecisionLocal {
    const allEntries = [...this.table.values()]

    if (!allEntries.length) {
      return {
        selectedDept: '',
        confidence: 0,
        reason: '路由表为空，无可用部门',
        candidateDepts: [],
        matchedKeywords: [],
      }
    }

    // Step 1: rule-match filter
    const candidates = this.ruleMatch(userInput, taskType)

    // Step 2: semantic rank
    const semanticResults = this.semanticRank(candidates, userInput)
    const semanticMap = new Map(semanticResults.map(r => [r.entry.deptId, r.score]))

    // keyword scores
    const inputLower = userInput.toLowerCase()
    const inputTokens = tokenize(userInput)
    const kwScoreMap = new Map<string, number>()
    const matchedKwMap = new Map<string, string[]>()

    for (const entry of candidates) {
      const matchedKws: string[] = []
      for (const kw of entry.capabilityKeywords) {
        const kwLower = kw.toLowerCase()
        if (inputLower.includes(kwLower) || inputTokens.has(kwLower)) {
          matchedKws.push(kw)
        }
      }
      kwScoreMap.set(entry.deptId, matchedKws.length / Math.max(entry.capabilityKeywords.length, 1))
      matchedKwMap.set(entry.deptId, matchedKws)
    }

    // normalize priority
    const maxPriority = Math.max(...allEntries.map(e => e.priority), 1) || 1

    // Step 3: composite scoring
    const candidateScores: Array<{
      entry: RouteEntryLocal
      score: number
      kw: string[]
    }> = []

    for (const entry of candidates) {
      const kwScore = kwScoreMap.get(entry.deptId) ?? 0
      const semScore = semanticMap.get(entry.deptId) ?? 0
      const sr = entry.successRate
      const pri = entry.priority / maxPriority

      const finalScore =
        kwScore * WEIGHT_KEYWORD +
        semScore * WEIGHT_SEMANTIC +
        sr * WEIGHT_SUCCESS_RATE +
        pri * WEIGHT_PRIORITY

      candidateScores.push({
        entry,
        score: finalScore,
        kw: matchedKwMap.get(entry.deptId) ?? [],
      })
    }

    candidateScores.sort((a, b) => b.score - a.score)

    const best = candidateScores[0]

    // confidence
    let confidence: number
    if (candidateScores.length > 1) {
      const secondScore = candidateScores[1].score
      const gap = best.score - secondScore
      confidence = Math.min(1, best.score * 0.6 + gap * 0.4 + 0.1)
    } else {
      confidence = Math.min(1, best.score + 0.2)
    }
    confidence = Math.max(0, Math.min(1, parseFloat(confidence.toFixed(4))))

    const reason = `部门「${best.entry.deptName}」综合得分最高(${best.score.toFixed(4)})，匹配关键词: ${best.kw.length ? best.kw.join(', ') : '无'}`

    return {
      selectedDept: best.entry.deptId,
      confidence,
      reason,
      candidateDepts: candidateScores.map(c => ({
        deptId: c.entry.deptId,
        deptName: c.entry.deptName,
        score: parseFloat(c.score.toFixed(4)),
        matchedKeywords: c.kw,
      })),
      matchedKeywords: best.kw,
    }
  }

  // ------------------------------------------------------------------
  // 统计更新
  // ------------------------------------------------------------------

  updateStats(deptId: string, success: boolean): boolean {
    const entry = this.table.get(deptId)
    if (!entry) return false

    entry.totalTasks += 1
    if (success) entry.successfulTasks += 1
    entry.successRate =
      entry.totalTasks > 0 ? entry.successfulTasks / entry.totalTasks : 0
    entry.lastActive = nowIso()
    return true
  }

  // ------------------------------------------------------------------
  // 路由条目增删
  // ------------------------------------------------------------------

  addRouteEntry(entry: RouteEntryLocal): void {
    this.table.set(entry.deptId, entry)
  }

  removeRouteEntry(deptId: string): boolean {
    return this.table.delete(deptId)
  }

  // ------------------------------------------------------------------
  // 查询
  // ------------------------------------------------------------------

  getRouteTable(): RouteEntryLocal[] {
    return [...this.table.values()]
  }
}
