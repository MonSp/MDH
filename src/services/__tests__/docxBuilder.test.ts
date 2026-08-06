import { describe, it, expect } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { existsSync, rmSync, readFileSync } from 'fs'
import { buildDocx, type DocxSpec } from '../docxBuilder'

function makeWorkspace(): string {
  return join(tmpdir(), `mdh-docx-${Date.now()}-${Math.floor(Math.random() * 10000)}`)
}

describe('buildDocx', () => {
  it('生成默认文档（无 sections 时为空文档占位）', async () => {
    const ws = makeWorkspace()
    const out = await buildDocx(ws, { title: '测试文档' })
    expect(existsSync(out)).toBe(true)
    expect(out.startsWith(ws)).toBe(true)
    const buf = readFileSync(out)
    expect(buf[0]).toBe(0x50) // 'P'
    expect(buf[1]).toBe(0x4b) // 'K'
    rmSync(ws, { recursive: true, force: true })
  })

  it('支持 paragraphs 正文段落', async () => {
    const ws = makeWorkspace()
    const spec: DocxSpec = {
      path: 'report.docx',
      title: '周报',
      sections: [{ paragraphs: ['本周完成事项', '下周计划'] }],
    }
    const out = await buildDocx(ws, spec)
    expect(existsSync(out)).toBe(true)
    expect(out.endsWith('report.docx')).toBe(true)
    rmSync(ws, { recursive: true, force: true })
  })

  it('支持 heading + bullets + numbered', async () => {
    const ws = makeWorkspace()
    const spec: DocxSpec = {
      sections: [
        { heading: '第一章', bullets: ['要点A', '要点B'] },
        { heading: '第二章', numbered: ['步骤1', '步骤2'] },
      ],
    }
    const out = await buildDocx(ws, spec)
    expect(existsSync(out)).toBe(true)
    rmSync(ws, { recursive: true, force: true })
  })

  it('支持 table 表格', async () => {
    const ws = makeWorkspace()
    const spec: DocxSpec = {
      sections: [{
        heading: '数据表',
        table: { headers: ['名称', '数量'], rows: [['A', '10'], ['B', '20']] },
      }],
    }
    const out = await buildDocx(ws, spec)
    expect(existsSync(out)).toBe(true)
    rmSync(ws, { recursive: true, force: true })
  })

  it('多 sections 全部生成', async () => {
    const ws = makeWorkspace()
    const spec: DocxSpec = {
      title: '完整文档',
      sections: [
        { paragraphs: ['开头'] },
        { heading: '章节', bullets: ['x'] },
        { table: { headers: ['h'], rows: [['1']] } },
      ],
    }
    const out = await buildDocx(ws, spec)
    expect(existsSync(out)).toBe(true)
    rmSync(ws, { recursive: true, force: true })
  })

  it('路径越界时抛错（../ 逃逸）', async () => {
    const ws = makeWorkspace()
    const spec: DocxSpec = { path: '../evil.docx', sections: [] }
    await expect(buildDocx(ws, spec)).rejects.toThrow('路径越界')
    expect(existsSync(join(ws, '..', 'evil.docx'))).toBe(false)
    rmSync(ws, { recursive: true, force: true })
  })

  it('sibling-prefix 绕过被拒绝', async () => {
    const ws = makeWorkspace()
    const spec: DocxSpec = { path: '../evil-ws/x.docx', sections: [] }
    await expect(buildDocx(ws, spec)).rejects.toThrow('路径越界')
    expect(existsSync(join(ws, '..', 'evil-ws', 'x.docx'))).toBe(false)
    rmSync(ws, { recursive: true, force: true })
  })

  it('绝对路径被拒绝', async () => {
    const ws = makeWorkspace()
    const spec: DocxSpec = { path: '/tmp/evil-abs.docx', sections: [] }
    await expect(buildDocx(ws, spec)).rejects.toThrow('路径越界')
    rmSync(ws, { recursive: true, force: true })
  })

  it('自定义文件名生效', async () => {
    const ws = makeWorkspace()
    const spec: DocxSpec = { path: '子目录/文档.docx', sections: [{ paragraphs: ['嵌套路径'] }] }
    const out = await buildDocx(ws, spec)
    expect(existsSync(out)).toBe(true)
    expect(out.includes('子目录')).toBe(true)
    rmSync(ws, { recursive: true, force: true })
  })
})
