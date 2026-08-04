import { describe, it, expect } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { existsSync, rmSync, readFileSync } from 'fs'
import { buildPptx, type PptSpec } from '../../services/pptxBuilder'

function makeWorkspace(): string {
  const dir = join(tmpdir(), `mdh-pptx-${Date.now()}-${Math.floor(Math.random() * 10000)}`)
  return dir
}

describe('buildPptx', () => {
  it('生成默认演示文稿（无 slides 时回退 1 页 bullets）', async () => {
    const ws = makeWorkspace()
    const out = await buildPptx(ws, { title: '测试演示' })
    expect(existsSync(out)).toBe(true)
    expect(out.startsWith(ws)).toBe(true)
    // .pptx 是 zip 格式（PK 魔数）
    const buf = readFileSync(out)
    expect(buf[0]).toBe(0x50) // 'P'
    expect(buf[1]).toBe(0x4b) // 'K'
    rmSync(ws, { recursive: true, force: true })
  })

  it('支持 cover 布局（标题 + 副标题）', async () => {
    const ws = makeWorkspace()
    const spec: PptSpec = {
      path: 'deck.pptx',
      title: '年度汇报',
      slides: [{ title: '封面', subtitle: '2026 年度', layout: 'cover' }],
    }
    const out = await buildPptx(ws, spec)
    expect(existsSync(out)).toBe(true)
    expect(out.endsWith('deck.pptx')).toBe(true)
    rmSync(ws, { recursive: true, force: true })
  })

  it('支持 bullets 布局（多要点）', async () => {
    const ws = makeWorkspace()
    const spec: PptSpec = {
      slides: [{ title: '要点', bullets: ['第一点', '第二点', '第三点'], layout: 'bullets' }],
    }
    const out = await buildPptx(ws, spec)
    expect(existsSync(out)).toBe(true)
    rmSync(ws, { recursive: true, force: true })
  })

  it('支持 chart 布局（bar 图）', async () => {
    const ws = makeWorkspace()
    const spec: PptSpec = {
      slides: [{
        title: '数据对比',
        layout: 'chart',
        chart: { type: 'bar', labels: ['A', 'B', 'C'], values: [30, 50, 20] },
      }],
    }
    const out = await buildPptx(ws, spec)
    expect(existsSync(out)).toBe(true)
    rmSync(ws, { recursive: true, force: true })
  })

  it('支持 chart 布局（pie 图）', async () => {
    const ws = makeWorkspace()
    const spec: PptSpec = {
      slides: [{
        title: '占比',
        layout: 'chart',
        chart: { type: 'pie', labels: ['X', 'Y'], values: [60, 40] },
      }],
    }
    const out = await buildPptx(ws, spec)
    expect(existsSync(out)).toBe(true)
    rmSync(ws, { recursive: true, force: true })
  })

  it('多页幻灯片全部生成', async () => {
    const ws = makeWorkspace()
    const spec: PptSpec = {
      slides: [
        { title: '封面', subtitle: '副标题', layout: 'cover' },
        { title: '要点', bullets: ['a', 'b'], layout: 'bullets' },
        { title: '图表', layout: 'chart', chart: { type: 'bar', labels: ['1'], values: [100] } },
      ],
    }
    const out = await buildPptx(ws, spec)
    expect(existsSync(out)).toBe(true)
    rmSync(ws, { recursive: true, force: true })
  })

  it('自定义主题色生效', async () => {
    const ws = makeWorkspace()
    const spec: PptSpec = {
      theme: { background: '0D1117', accent: '58A6FF' },
      slides: [{ title: '深色主题', bullets: ['ok'], layout: 'bullets' }],
    }
    const out = await buildPptx(ws, spec)
    expect(existsSync(out)).toBe(true)
    rmSync(ws, { recursive: true, force: true })
  })

  it('路径越界时抛错', async () => {
    const ws = makeWorkspace()
    const spec: PptSpec = { path: '../evil.pptx', slides: [] }
    await expect(buildPptx(ws, spec)).rejects.toThrow('路径越界')
    // 未写入越界文件
    expect(existsSync(join(ws, '..', 'evil.pptx'))).toBe(false)
    rmSync(ws, { recursive: true, force: true })
  })
})
