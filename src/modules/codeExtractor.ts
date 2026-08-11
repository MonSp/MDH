/**
 * 代码提取模块
 *
 * 从 LLM 输出文本中提取代码块和工具调用。
 * 支持带文件名或语言标记的代码块识别与去重。
 */

export interface CodeBlock {
  filename: string
  content: string
  language: string
}

/**
 * 将语言名称映射为默认文件名
 */
export function langToFilename(language: string): string {
  const map: Record<string, string> = {
    javascript: 'index.js',
    js: 'index.js',
    jsx: 'index.jsx',
    typescript: 'index.ts',
    ts: 'index.ts',
    tsx: 'index.tsx',
    python: 'main.py',
    py: 'main.py',
    html: 'index.html',
    css: 'style.css',
    scss: 'style.scss',
    less: 'style.less',
    json: 'data.json',
    yaml: 'config.yaml',
    yml: 'config.yaml',
    xml: 'data.xml',
    markdown: 'README.md',
    md: 'README.md',
    sql: 'query.sql',
    sh: 'script.sh',
    bash: 'script.sh',
    shell: 'script.sh',
    rust: 'main.rs',
    rs: 'main.rs',
    go: 'main.go',
    golang: 'main.go',
    java: 'Main.java',
    c: 'main.c',
    cpp: 'main.cpp',
    'c++': 'main.cpp',
    csharp: 'Program.cs',
    cs: 'Program.cs',
    ruby: 'main.rb',
    rb: 'main.rb',
    php: 'index.php',
    swift: 'main.swift',
    kotlin: 'Main.kt',
    kt: 'Main.kt',
    dart: 'main.dart',
    lua: 'main.lua',
    r: 'main.R',
    dockerfile: 'Dockerfile',
    docker: 'Dockerfile',
    toml: 'config.toml',
    ini: 'config.ini',
    graphql: 'schema.graphql',
    gql: 'schema.graphql',
    vue: 'App.vue',
    svelte: 'App.svelte',
  }
  return map[language.toLowerCase()] || `file.${language}`
}

/**
 * 从文本中提取代码块
 *
 * - 跳过 tool_call 块
 * - 如果标识符包含 . / \ 则视为文件名，从扩展名推断语言
 * - 否则视为语言标记，通过 langToFilename 生成默认文件名
 * - 重复文件名自动添加 _2, _3 后缀
 */
export function extractCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = []
  const usedFilenames = new Map<string, number>()
  const regex = /```([^\n`]*)\n([\s\S]*?)```/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    const identifier = match[1].trim()
    const content = match[2]

    // Skip tool_call blocks
    if (identifier === 'tool_call') continue

    let filename: string
    let language: string

    if (identifier.includes('.') || identifier.includes('/') || identifier.includes('\\')) {
      // Treat as filename
      filename = identifier
      const ext = filename.split('.').pop() || ''
      language = ext
    } else {
      // Treat as language
      language = identifier || 'text'
      filename = langToFilename(language)
    }

    // Deduplicate filenames
    const count = usedFilenames.get(filename) || 0
    usedFilenames.set(filename, count + 1)
    if (count > 0) {
      const dotIdx = filename.lastIndexOf('.')
      if (dotIdx > 0) {
        filename = `${filename.slice(0, dotIdx)}_${count + 1}${filename.slice(dotIdx)}`
      } else {
        filename = `${filename}_${count + 1}`
      }
    }

    blocks.push({ filename, content, language })
  }

  return blocks
}

/**
 * 从文本中提取 tool_call 块
 */
export function extractToolCalls(text: string): { name: string; args: any }[] {
  const calls: { name: string; args: any }[] = []
  const regex = /```tool_call\n([\s\S]*?)```/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1])
      calls.push({ name: parsed.name, args: parsed.args })
    } catch {
      // Skip malformed tool_call blocks
    }
  }

  return calls
}
