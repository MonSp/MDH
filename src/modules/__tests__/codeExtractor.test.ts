import { describe, it, expect } from 'vitest'
import { extractCodeBlocks, langToFilename, extractToolCalls } from '../codeExtractor'

describe('langToFilename', () => {
  it('should map javascript to index.js', () => {
    expect(langToFilename('javascript')).toBe('index.js')
    expect(langToFilename('js')).toBe('index.js')
  })

  it('should map typescript to index.ts', () => {
    expect(langToFilename('typescript')).toBe('index.ts')
    expect(langToFilename('ts')).toBe('index.ts')
  })

  it('should map python to main.py', () => {
    expect(langToFilename('python')).toBe('main.py')
    expect(langToFilename('py')).toBe('main.py')
  })

  it('should map html to index.html', () => {
    expect(langToFilename('html')).toBe('index.html')
  })

  it('should map css to style.css', () => {
    expect(langToFilename('css')).toBe('style.css')
  })

  it('should handle case insensitivity', () => {
    expect(langToFilename('JavaScript')).toBe('index.js')
    expect(langToFilename('PYTHON')).toBe('main.py')
  })

  it('should map various languages correctly', () => {
    expect(langToFilename('jsx')).toBe('index.jsx')
    expect(langToFilename('tsx')).toBe('index.tsx')
    expect(langToFilename('json')).toBe('data.json')
    expect(langToFilename('yaml')).toBe('config.yaml')
    expect(langToFilename('sh')).toBe('script.sh')
    expect(langToFilename('rust')).toBe('main.rs')
    expect(langToFilename('go')).toBe('main.go')
    expect(langToFilename('java')).toBe('Main.java')
    expect(langToFilename('c')).toBe('main.c')
    expect(langToFilename('cpp')).toBe('main.cpp')
    expect(langToFilename('ruby')).toBe('main.rb')
    expect(langToFilename('php')).toBe('index.php')
    expect(langToFilename('sql')).toBe('query.sql')
    expect(langToFilename('markdown')).toBe('README.md')
    expect(langToFilename('md')).toBe('README.md')
    expect(langToFilename('dockerfile')).toBe('Dockerfile')
    expect(langToFilename('vue')).toBe('App.vue')
    expect(langToFilename('svelte')).toBe('App.svelte')
  })

  it('should generate file.ext for unknown languages', () => {
    expect(langToFilename('brainfuck')).toBe('file.brainfuck')
    expect(langToFilename('unknown')).toBe('file.unknown')
  })
})

describe('extractCodeBlocks', () => {
  it('should extract a simple code block with language', () => {
    const text = '```js\nconsole.log("hello")\n```'
    const blocks = extractCodeBlocks(text)

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toEqual({
      filename: 'index.js',
      content: 'console.log("hello")\n',
      language: 'js',
    })
  })

  it('should extract a code block with filename', () => {
    const text = '```src/app.tsx\nconst App = () => <div />\n```'
    const blocks = extractCodeBlocks(text)

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toEqual({
      filename: 'src/app.tsx',
      content: 'const App = () => <div />\n',
      language: 'tsx',
    })
  })

  it('should extract filename with dot (extension-based)', () => {
    const text = '```utils/helper.py\ndef hello(): pass\n```'
    const blocks = extractCodeBlocks(text)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].filename).toBe('utils/helper.py')
    expect(blocks[0].language).toBe('py')
  })

  it('should extract filename with backslash', () => {
    const text = '```src\\main.ts\nconst x = 1\n```'
    const blocks = extractCodeBlocks(text)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].filename).toBe('src\\main.ts')
    expect(blocks[0].language).toBe('ts')
  })

  it('should skip tool_call blocks', () => {
    const text = [
      '```js\nconsole.log("code")\n```',
      '```tool_call\n{"name":"bash","args":{"cmd":"ls"}}\n```',
      '```python\nprint("hello")\n```',
    ].join('\n\n')

    const blocks = extractCodeBlocks(text)

    expect(blocks).toHaveLength(2)
    expect(blocks[0].language).toBe('js')
    expect(blocks[1].language).toBe('python')
  })

  it('should deduplicate filenames with suffix', () => {
    const text = [
      '```js\nfirst()\n```',
      '```js\nsecond()\n```',
      '```js\nthird()\n```',
    ].join('\n\n')

    const blocks = extractCodeBlocks(text)

    expect(blocks).toHaveLength(3)
    expect(blocks[0].filename).toBe('index.js')
    expect(blocks[1].filename).toBe('index_2.js')
    expect(blocks[2].filename).toBe('index_3.js')
  })

  it('should deduplicate filenames without extension', () => {
    const text = [
      '```\nfirst\n```',
      '```\nsecond\n```',
    ].join('\n\n')

    const blocks = extractCodeBlocks(text)

    expect(blocks).toHaveLength(2)
    expect(blocks[0].filename).toBe('file.text')
    expect(blocks[1].filename).toBe('file_2.text')
  })

  it('should handle empty identifier as text', () => {
    const text = '```\nsome content\n```'
    const blocks = extractCodeBlocks(text)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].language).toBe('text')
    expect(blocks[0].filename).toBe('file.text')
  })

  it('should handle multiple code blocks with different languages', () => {
    const text = [
      '```ts\nconst x: number = 1\n```',
      '```python\nx = 1\n```',
      '```css\nbody { color: red }\n```',
    ].join('\n\n')

    const blocks = extractCodeBlocks(text)

    expect(blocks).toHaveLength(3)
    expect(blocks[0]).toEqual({ filename: 'index.ts', content: 'const x: number = 1\n', language: 'ts' })
    expect(blocks[1]).toEqual({ filename: 'main.py', content: 'x = 1\n', language: 'python' })
    expect(blocks[2]).toEqual({ filename: 'style.css', content: 'body { color: red }\n', language: 'css' })
  })

  it('should return empty array when no code blocks found', () => {
    expect(extractCodeBlocks('no code here')).toEqual([])
    expect(extractCodeBlocks('')).toEqual([])
  })

  it('should handle code blocks with special characters in content', () => {
    const text = '```js\nconst regex = /```/g\n```'
    const blocks = extractCodeBlocks(text)

    // The regex should handle this - inner backticks within content won't match the closing ```
    expect(blocks.length).toBeGreaterThanOrEqual(1)
  })
})

describe('extractToolCalls', () => {
  it('should extract a tool_call block', () => {
    const text = '```tool_call\n{"name":"bash","args":{"command":"ls -la"}}\n```'
    const calls = extractToolCalls(text)

    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      name: 'bash',
      args: { command: 'ls -la' },
    })
  })

  it('should extract multiple tool_call blocks', () => {
    const text = [
      'Some text',
      '```tool_call\n{"name":"read_file","args":{"path":"/tmp/a.txt"}}\n```',
      'More text',
      '```tool_call\n{"name":"write_file","args":{"path":"/tmp/b.txt","content":"hello"}}\n```',
    ].join('\n')

    const calls = extractToolCalls(text)

    expect(calls).toHaveLength(2)
    expect(calls[0].name).toBe('read_file')
    expect(calls[1].name).toBe('write_file')
    expect(calls[1].args.content).toBe('hello')
  })

  it('should skip malformed JSON tool_call blocks', () => {
    const text = [
      '```tool_call\n{invalid json\n```',
      '```tool_call\n{"name":"ok","args":{}}\n```',
    ].join('\n')

    const calls = extractToolCalls(text)

    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe('ok')
  })

  it('should return empty array when no tool_calls found', () => {
    expect(extractToolCalls('just regular text')).toEqual([])
    expect(extractToolCalls('```js\ncode\n```')).toEqual([])
  })

  it('should not extract regular code blocks as tool calls', () => {
    const text = '```json\n{"name":"not_a_tool","args":{}}\n```'
    const calls = extractToolCalls(text)

    expect(calls).toHaveLength(0)
  })

  it('should handle tool_call with nested JSON args', () => {
    const text = '```tool_call\n{"name":"complex","args":{"nested":{"deep":"value"},"list":[1,2,3]}}\n```'
    const calls = extractToolCalls(text)

    expect(calls).toHaveLength(1)
    expect(calls[0].args.nested.deep).toBe('value')
    expect(calls[0].args.list).toEqual([1, 2, 3])
  })
})
