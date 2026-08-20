export interface ExtractedEntity {
  type: string
  value: string
  confidence: number
}

export function extractIntent(input: string): string {
  const intentPatterns: Array<{
    pattern: RegExp
    intent: string
  }> = [
    { pattern: /^(创建|新建|生成|写|编写)/, intent: 'create' },
    { pattern: /^(修改|更新|编辑|改|调整)/, intent: 'update' },
    { pattern: /^(删除|移除|去掉|清理)/, intent: 'delete' },
    { pattern: /^(查找|搜索|查询|找)/, intent: 'search' },
    { pattern: /^(分析|检查|审查|测试)/, intent: 'analyze' },
    { pattern: /^(部署|发布|上线)/, intent: 'deploy' },
    { pattern: /^(优化|改进|提升)/, intent: 'optimize' },
    { pattern: /^(修复|解决|处理|修复)/, intent: 'fix' },
    { pattern: /^(添加|增加|实现|开发)/, intent: 'implement' },
    { pattern: /^(配置|设置|设定)/, intent: 'configure' },
  ]

  for (const { pattern, intent } of intentPatterns) {
    if (pattern.test(input)) {
      return intent
    }
  }

  return 'generic'
}

export function extractEntities(input: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = []

  const filePattern = /[\w\-\.]+\.(ts|js|tsx|jsx|py|java|cpp|c|h|css|html|json|yaml|yml|md)/gi
  const fileMatches = input.match(filePattern)
  if (fileMatches) {
    fileMatches.forEach(match => {
      entities.push({
        type: 'file',
        value: match,
        confidence: 0.9,
      })
    })
  }

  const componentPattern = /(?:组件|component|模块|module|页面|page|服务|service)[\s:：]*([a-zA-Z\u4e00-\u9fa5]+)/gi
  const componentMatches = input.matchAll(componentPattern)
  for (const match of componentMatches) {
    entities.push({
      type: 'component',
      value: match[1],
      confidence: 0.8,
    })
  }

  const techKeywords = [
    'react', 'vue', 'angular', 'typescript', 'javascript', 'python', 'java',
    'node', 'express', 'fastapi', 'django', 'spring', 'docker', 'kubernetes',
    'redis', 'mysql', 'postgresql', 'mongodb', 'graphql', 'rest', 'api',
  ]
  
  techKeywords.forEach(keyword => {
    if (input.includes(keyword)) {
      entities.push({
        type: 'technology',
        value: keyword,
        confidence: 0.7,
      })
    }
  })

  return entities
}

export function estimateComplexity(
  input: string,
  entities: ExtractedEntity[]
): 'low' | 'medium' | 'high' {
  let score = 0

  score += Math.min(input.length / 100, 3)

  score += entities.length * 0.5

  const complexityKeywords = ['系统', '架构', '完整', '全面', '复杂', '多个', '集成', '优化']
  complexityKeywords.forEach(keyword => {
    if (input.includes(keyword)) {
      score += 1
    }
  })

  if (score < 3) return 'low'
  if (score < 6) return 'medium'
  return 'high'
}

export function suggestTaskType(
  intent: string,
  entities: ExtractedEntity[]
): string {
  const hasFileEntities = entities.some(e => e.type === 'file')
  const hasComponentEntities = entities.some(e => e.type === 'component')
  const hasTechEntities = entities.some(e => e.type === 'technology')

  if (intent === 'create' && hasComponentEntities) {
    return 'component_creation'
  }
  if (intent === 'create' && hasFileEntities) {
    return 'file_creation'
  }
  if (intent === 'analyze' && hasTechEntities) {
    return 'technical_analysis'
  }
  if (intent === 'fix') {
    return 'bug_fix'
  }
  if (intent === 'optimize') {
    return 'performance_optimization'
  }
  if (intent === 'deploy') {
    return 'deployment'
  }
  if (intent === 'implement') {
    return 'feature_implementation'
  }

  return 'generic'
}

export function hasCodeKeywords(input: string): boolean {
  const codeKeywords = ['代码', '函数', '方法', '类', '接口', '变量', '算法', '逻辑', 'code', 'function', 'method', 'class']
  return codeKeywords.some(keyword => input.includes(keyword))
}

export function hasFileKeywords(input: string): boolean {
  const fileKeywords = ['文件', '目录', '路径', '配置', 'file', 'directory', 'path', 'config']
  return fileKeywords.some(keyword => input.includes(keyword))
}
