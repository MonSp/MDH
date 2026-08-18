/**
 * MeetingChatPanel 辅助函数
 */

/** 根据 ID 查找智能体 */
export function getAgentById(agents: Array<{ id: string }>, id?: string) {
  return agents.find(a => a.id === id)
}

/** 从消息内容中提取代码块 */
export function extractCodeBlock(content: string, filePath: string): string | null {
  const regex = new RegExp('```[^\\n]*' + filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^\\n]*\\n([\\s\\S]*?)```', 'i')
  const match = content.match(regex)
  if (match) return match[1].trim()

  const codeBlockRegex = /```([^\n`]+(?:\.[^\n`]+)?)\n([\s\S]*?)```/g
  let m
  while ((m = codeBlockRegex.exec(content)) !== null) {
    const blockPath = m[1].trim()
    if (blockPath === filePath || blockPath.endsWith(filePath.split('/').pop() || '')) {
      return m[2].trim()
    }
  }
  return null
}

/** 解析写入文件消息，返回文件列表 */
export function parseFileWriteMessage(content: string): { files: string[]; charCount?: string } | null {
  const match = content.match(/\[写入文件\]\s*(.+?)\s*\((\d+)\s*字符\)/)
  if (match) {
    const files = match[1].split(',').map(f => f.trim()).filter(Boolean)
    return { files, charCount: match[2] }
  }
  const match2 = content.match(/已写入\s*\d+\s*个文件[：:]\s*(.+)/)
  if (match2) {
    const files = match2[1].split(',').map(f => f.trim()).filter(Boolean)
    return { files }
  }
  return null
}

/** 获取文件图标 */
export function getFileIcon(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  if (['py'].includes(ext)) return '🐍'
  if (['js', 'ts', 'tsx', 'jsx'].includes(ext)) return '📜'
  if (['html', 'htm'].includes(ext)) return '🌐'
  if (['css', 'scss', 'less'].includes(ext)) return '🎨'
  if (['json', 'yaml', 'yml', 'toml', 'xml'].includes(ext)) return '📋'
  if (['md', 'txt'].includes(ext)) return '📝'
  if (['java'].includes(ext)) return '☕'
  if (['go'].includes(ext)) return '🔷'
  if (['rs'].includes(ext)) return '🦀'
  if (['sql'].includes(ext)) return '🗄️'
  return '📄'
}
