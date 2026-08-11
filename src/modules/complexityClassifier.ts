/**
 * 任务复杂度分类器
 *
 * 两层分类：规则引擎（快速）+ LLM 语义分析（精确）。
 * 本模块实现规则引擎层。
 */

export interface ComplexityResult {
  level: 'simple' | 'complex'
  confidence: number
  reason: string
  method: 'rule_engine'
}

/** 简单任务模式（浏览器/文件/查询等单步操作） */
const SIMPLE_PATTERNS: RegExp[] = [
  /打开.*网页/,
  /打开.*网站/,
  /打开.*浏览器/,
  /搜索.*信息/,
  /查询.*内容/,
  /查看.*文件/,
  /读取.*文件/,
  /列出.*目录/,
  /列出.*文件/,
  /创建.*文件/,
  /修改.*配置/,
  /更新.*配置/,
  /查看.*状态/,
  /获取.*列表/,
  /打开.*页面/,
  /open.*url/i,
  /open.*browser/i,
  /search.*for/i,
  /read.*file/i,
  /list.*files/i,
  /check.*status/i,
]

/** 复杂任务模式（多步骤/跨部门） */
const COMPLEX_PATTERNS: RegExp[] = [
  /设计.*架构/,
  /实现.*系统/,
  /重构.*模块/,
  /迁移.*数据库/,
  /部署.*环境/,
  /集成.*接口/,
  /优化.*性能/,
  /前后端.*联调/,
  /跨部门.*协作/,
  /多模块.*协调/,
  /全流程.*开发/,
  /端到端.*测试/,
  /整体.*方案/,
  /系统.*设计/,
  /design.*architecture/i,
  /implement.*system/i,
  /refactor.*module/i,
  /migrate.*database/i,
  /deploy.*environment/i,
  /integrate.*api/i,
  /end.*to.*end/i,
  /cross.*department/i,
]

/** 复杂任务关键词（出现即倾向 complex） */
const COMPLEX_KEYWORDS: string[] = [
  '架构', '重构', '迁移', '部署', '集成', '联调',
  '协作', '全流程', '端到端', '整体', '系统性',
  '多模块', '跨部门', '微服务', '分布式', '集群',
  'CI/CD', 'Kubernetes', 'Docker',
  'architecture', 'refactor', 'migrate', 'deploy',
  'integrate', 'orchestration', 'microservice',
]

export class ComplexityClassifier {
  /**
   * 根据消息内容判定任务复杂度。
   * 使用规则引擎进行快速分类。
   */
  classify(message: string): ComplexityResult {
    if (!message || message.trim().length === 0) {
      return {
        level: 'simple',
        confidence: 0.5,
        reason: '空消息，默认为简单任务',
        method: 'rule_engine',
      }
    }

    const normalized = message.trim()
    let simpleScore = 0
    let complexScore = 0
    const matchedSimple: string[] = []
    const matchedComplex: string[] = []
    const matchedKeywords: string[] = []

    // 简单模式匹配
    for (const pattern of SIMPLE_PATTERNS) {
      if (pattern.test(normalized)) {
        simpleScore += 1
        matchedSimple.push(pattern.source)
      }
    }

    // 复杂模式匹配
    for (const pattern of COMPLEX_PATTERNS) {
      if (pattern.test(normalized)) {
        complexScore += 1.5  // 复杂模式权重更高
        matchedComplex.push(pattern.source)
      }
    }

    // 关键词匹配
    for (const keyword of COMPLEX_KEYWORDS) {
      if (normalized.includes(keyword)) {
        complexScore += 0.8
        matchedKeywords.push(keyword)
      }
    }

    // 消息长度启发式
    if (normalized.length > 200) {
      complexScore += 0.5
    }

    // 判定
    const totalScore = simpleScore + complexScore
    if (totalScore === 0) {
      return {
        level: 'simple',
        confidence: 0.6,
        reason: '未匹配到任何已知模式，默认为简单任务',
        method: 'rule_engine',
      }
    }

    if (complexScore > simpleScore) {
      const confidence = Math.min(0.95, 0.6 + complexScore * 0.1)
      const reasons: string[] = []
      if (matchedComplex.length > 0) {
        reasons.push(`匹配复杂模式: ${matchedComplex.length} 个`)
      }
      if (matchedKeywords.length > 0) {
        reasons.push(`包含复杂关键词: ${matchedKeywords.join(', ')}`)
      }
      return {
        level: 'complex',
        confidence,
        reason: reasons.join('; '),
        method: 'rule_engine',
      }
    }

    const confidence = Math.min(0.95, 0.6 + simpleScore * 0.1)
    const reasons: string[] = []
    if (matchedSimple.length > 0) {
      reasons.push(`匹配简单模式: ${matchedSimple.length} 个`)
    }
    if (complexScore > 0) {
      reasons.push(`但有 ${matchedKeywords.length} 个复杂关键词`)
    }
    return {
      level: 'simple',
      confidence,
      reason: reasons.join('; ') || '简单任务模式匹配',
      method: 'rule_engine',
    }
  }
}

/** 全局单例 */
export const complexityClassifier = new ComplexityClassifier()
