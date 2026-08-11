/**
 * 本地技能打包器
 *
 * 纯前端内存实现的技能包打包、脱敏、版本管理和差异计算。
 * 无需后端 API，所有操作在浏览器端完成。
 */

/** 脱敏问题记录 */
export interface DesensitizeIssue {
  filePath: string
  lineNumber: number
  issueType: 'api_key' | 'internal_path' | 'private_ip' | 'email' | 'phone'
  originalContent: string
  redactedContent: string
}

/** 差异计算结果 */
export interface DiffResult {
  newFiles: string[]
  modifiedFiles: string[]
}

/** 脱敏规则定义 */
interface DesensitizeRule {
  type: DesensitizeIssue['issueType']
  pattern: RegExp
  replacement: string
  label: string
}

/** 默认脱敏规则集 */
const DESENSITIZE_RULES: DesensitizeRule[] = [
  // API Keys
  { type: 'api_key', pattern: /sk-[a-zA-Z0-9]{20,}/g, replacement: 'sk-***REDACTED***', label: 'OpenAI-style API key' },
  { type: 'api_key', pattern: /Bearer\s+[a-zA-Z0-9\-._~+/]+=*/g, replacement: 'Bearer ***REDACTED***', label: 'Bearer token' },
  { type: 'api_key', pattern: /secret\s*[=:]\s*[^\s;,&)}\]]+/gi, replacement: 'secret=***REDACTED***', label: 'Secret assignment' },

  // Internal paths
  { type: 'internal_path', pattern: /\/home\/[a-zA-Z0-9_.-]+(?:\/[^\s]*)?/g, replacement: '/home/***REDACTED***', label: 'Linux home path' },
  { type: 'internal_path', pattern: /C:\\Users\\[a-zA-Z0-9_.-]+(?:\\[^\s]*)?/gi, replacement: 'C:\\Users\\***REDACTED***', label: 'Windows user path' },

  // Private IPs
  { type: 'private_ip', pattern: /10\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, replacement: '10.x.x.x', label: '10.x private IP' },
  { type: 'private_ip', pattern: /172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}/g, replacement: '172.x.x.x', label: '172.16-31.x private IP' },
  { type: 'private_ip', pattern: /192\.168\.\d{1,3}\.\d{1,3}/g, replacement: '192.168.x.x', label: '192.168.x private IP' },

  // Privacy: email
  { type: 'email', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '***@***.***', label: 'Email address' },

  // Privacy: Chinese phone numbers (1[3-9]xxxxxxxxx)
  { type: 'phone', pattern: /1[3-9]\d{9}/g, replacement: '1**********', label: 'Chinese phone number' },
]

export class SkillPackagerLocal {
  /**
   * 扫描内容，检测敏感信息并返回脱敏后的内容和问题列表。
   *
   * @param content - 待扫描的文本内容
   * @param filePath - 文件路径标识（用于报告）
   * @returns 包含 redactedContent 和 issues 的结果
   */
  desensitizeCheck(content: string, filePath = '<unknown>'): {
    redactedContent: string
    issues: DesensitizeIssue[]
  } {
    const lines = content.split('\n')
    const issues: DesensitizeIssue[] = []
    const redactedLines: string[] = []

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]
      for (const rule of DESENSITIZE_RULES) {
        // 每行独立重置 lastIndex，因为每行都是新字符串
        rule.pattern.lastIndex = 0
        const matches = line.match(rule.pattern)
        if (matches) {
          for (const match of matches) {
            issues.push({
              filePath,
              lineNumber: i + 1,
              issueType: rule.type,
              originalContent: match,
              redactedContent: rule.replacement,
            })
          }
          rule.pattern.lastIndex = 0
          line = line.replace(rule.pattern, rule.replacement)
        }
      }
      redactedLines.push(line)
    }

    return {
      redactedContent: redactedLines.join('\n'),
      issues,
    }
  }

  /**
   * 生成技能包 README.md 内容。
   */
  generateReadme(
    skillName: string,
    baseVersion: string,
    diffSummary: string,
    rulesSummary: string,
  ): string {
    const now = new Date().toISOString().split('T')[0]
    return [
      `# ${skillName}`,
      '',
      `**Version:** ${baseVersion}`,
      `**Generated:** ${now}`,
      '',
      '## Diff Summary',
      '',
      diffSummary,
      '',
      '## Rules Summary',
      '',
      rulesSummary,
      '',
    ].join('\n')
  }

  /**
   * 版本号自增：minor +1，patch 重置为 0。
   * 例: 1.0.0 -> 1.1.0, 2.3.5 -> 2.4.0
   */
  bumpVersion(version: string): string {
    const parts = version.split('.')
    if (parts.length !== 3) {
      throw new Error(`Invalid version format: ${version}`)
    }
    const [major, minor, patch] = parts.map(Number)
    if ([major, minor, patch].some(isNaN)) {
      throw new Error(`Invalid version format: ${version}`)
    }
    return `${major}.${minor + 1}.0`
  }

  /**
   * 计算基础文件集与增量文件集的差异。
   *
   * @param baseFiles - 基础文件路径列表
   * @param incrementalFiles - 增量文件路径列表
   * @returns 新增文件和修改文件列表
   */
  computeDiff(baseFiles: string[], incrementalFiles: string[]): DiffResult {
    const baseSet = new Set(baseFiles)
    const newFiles: string[] = []
    const modifiedFiles: string[] = []

    for (const file of incrementalFiles) {
      if (baseSet.has(file)) {
        modifiedFiles.push(file)
      } else {
        newFiles.push(file)
      }
    }

    return { newFiles, modifiedFiles }
  }

  /**
   * 从文件路径列表生成 ASCII 目录树预览。
   *
   * @param allFiles - 文件路径列表（使用 / 分隔）
   * @returns ASCII 树形字符串
   */
  buildTreePreview(allFiles: string[]): string {
    if (allFiles.length === 0) return ''

    // 构建树结构
    interface TreeNode {
      [key: string]: TreeNode
    }
    const root: TreeNode = {}

    for (const file of allFiles.sort()) {
      const parts = file.split('/').filter(Boolean)
      let current = root
      for (const part of parts) {
        if (!current[part]) current[part] = {}
        current = current[part]
      }
    }

    // 渲染 ASCII 树
    const lines: string[] = []

    function render(node: TreeNode, prefix: string): void {
      const entries = Object.keys(node)
      for (let i = 0; i < entries.length; i++) {
        const key = entries[i]
        const isLast = i === entries.length - 1
        const connector = isLast ? '└── ' : '├── '
        const childPrefix = isLast ? '    ' : '│   '

        const hasChildren = Object.keys(node[key]).length > 0
        lines.push(`${prefix}${connector}${key}${hasChildren ? '/' : ''}`)
        if (hasChildren) {
          render(node[key], prefix + childPrefix)
        }
      }
    }

    render(root, '')
    return lines.join('\n')
  }
}

/** 全局单例 */
export const skillPackagerLocal = new SkillPackagerLocal()
