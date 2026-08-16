import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AssetBrowserPanel from './AssetBrowserPanel'

// mock 全局 fetch：组件用 fetch('/api/...') 拉取——按 URL 路由返回 _ok 包装响应
function jsonResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  } as Response)
}

// 资产列表：artifact 2 个（一个有 judge_score、一个没有）+ template 1 个（approved）
const assetList = [
  {
    asset_id: 'art-1', type: 'artifact', title: '登录页设计稿',
    content: '登录页高保真设计稿', status: 'approved',
    approved_by: '', created_at: '2026-08-01', judge_score: null,
  },
  {
    asset_id: 'art-2', type: 'artifact', title: '接口文档',
    content: 'REST API 文档', status: 'approved',
    approved_by: '', created_at: '2026-08-01', judge_score: 92,
  },
  {
    asset_id: 'tpl-1', type: 'template', title: '会议纪要模板',
    content: '纪要模板', status: 'approved',
    approved_by: '', created_at: '2026-08-01', judge_score: null,
  },
]

const searchResult = {
  artifacts: [],
  templates: [],
  rules: [
    { rule_id: 'rule-1', trigger_condition: 'task_type is meeting-minutes', action: '建议复用纪要模板' },
  ],
}

describe('AssetBrowserPanel', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn((url: string) => {
      if (url.startsWith('/api/assets/search')) {
        return jsonResponse({ success: true, data: searchResult, error: null })
      }
      if (url.startsWith('/api/assets')) {
        return jsonResponse({ success: true, data: assetList, error: null })
      }
      if (url.startsWith('/api/employees')) {
        return jsonResponse({ success: true, data: [], error: null })
      }
      return jsonResponse({ success: false, data: null, error: 'not found' })
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('挂载时拉取默认团队资产列表，渲染产出物/模板与状态徽章', async () => {
    const { container, unmount } = render(<AssetBrowserPanel />)
    // 默认团队 team-x 拉取列表
    expect(fetchMock).toHaveBeenCalledWith('/api/assets?team_id=team-x')

    await waitFor(() => {
      expect(container.textContent).toContain('登录页设计稿')
    })
    expect(container.textContent).toContain('接口文档')
    expect(container.textContent).toContain('会议纪要模板')
    // 产出物 judge_score 有则显示评测
    expect(container.textContent).toContain('评测 92')
    // 无 judge_score 的产出物不显示评测
    expect(container.textContent).not.toContain('评测 0')
    // 模板状态徽章（approved → 已固化）
    expect(container.textContent).toContain('已固化')
    // 未检索时技能规则不渲染
    expect(container.textContent).not.toContain('建议复用纪要模板')
    unmount()
  })

  it('检索提交后调用 search 端点并渲染技能规则 action', async () => {
    const { container, unmount } = render(<AssetBrowserPanel />)
    await waitFor(() => {
      expect(container.textContent).toContain('登录页设计稿')
    })
    fetchMock.mockClear()

    fireEvent.change(screen.getByPlaceholderText('检索资产'), { target: { value: '纪要' } })
    fireEvent.click(screen.getByText('检索'))

    await waitFor(() => {
      expect(container.textContent).toContain('建议复用纪要模板')
    })
    // 检索命中 /api/assets/search 且携带团队参数
    const searchCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/assets/search'))
    expect(searchCall).toBeTruthy()
    expect(String(searchCall![0])).toContain('team_id=team-x')
    unmount()
  })

  it('空资产时显示空态"暂无资产"', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith('/api/assets')) {
        return jsonResponse({ success: true, data: [], error: null })
      }
      return jsonResponse({ success: true, data: [], error: null })
    })
    const { container, unmount } = render(<AssetBrowserPanel />)
    await waitFor(() => {
      expect(container.textContent).toContain('暂无资产')
    })
    unmount()
  })

  it('后端 _fail（success=false）时渲染 error 且面板不崩溃', async () => {
    // 所有资产端点错误转 _fail：HTTP 200 + { success:false, data:null, error }
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith('/api/assets')) {
        return jsonResponse({ success: false, data: null, error: 'bad team' })
      }
      return jsonResponse({ success: true, data: [], error: null })
    })
    const { container, unmount } = render(<AssetBrowserPanel />)
    await waitFor(() => {
      expect(container.textContent).toContain('bad team')
    })
    // 不崩溃：error 之外空态仍正常渲染（assets 保持 []，不因 null data 抛 TypeError）
    expect(container.textContent).toContain('暂无资产')
    unmount()
  })

  it('切换团队时重置检索结果（旧团队规则不再显示）', async () => {
    const { container, unmount } = render(<AssetBrowserPanel />)
    await waitFor(() => {
      expect(container.textContent).toContain('登录页设计稿')
    })
    // 在 team-x 上下文下检索出规则
    fireEvent.change(screen.getByPlaceholderText('检索资产'), { target: { value: '纪要' } })
    fireEvent.click(screen.getByText('检索'))
    await waitFor(() => {
      expect(container.textContent).toContain('建议复用纪要模板')
    })
    // 切换团队 → search 必须重置，旧规则消失（per-team 查询契约：不留陈旧数据）
    fireEvent.change(screen.getByDisplayValue('team-x'), { target: { value: 'team-b' } })
    await waitFor(() => {
      expect(container.textContent).not.toContain('建议复用纪要模板')
    })
    unmount()
  })

  it('展示补全：产出物/模板行显示审批人、创建时间与类型徽章', async () => {
    const assetsWithMeta = [
      {
        asset_id: 'art-1', type: 'artifact', title: '登录页设计稿',
        content: '内容', status: 'approved',
        approved_by: 'emp-001', created_at: '2026-08-01', judge_score: null,
      },
      {
        asset_id: 'tpl-1', type: 'template', title: '会议纪要模板',
        content: '', status: 'approved',
        approved_by: 'emp-002', created_at: '2026-08-02', judge_score: null,
      },
    ]
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith('/api/assets')) {
        return jsonResponse({ success: true, data: assetsWithMeta, error: null })
      }
      return jsonResponse({ success: true, data: [], error: null })
    })
    const { container, unmount } = render(<AssetBrowserPanel />)
    await waitFor(() => {
      expect(container.textContent).toContain('登录页设计稿')
    })
    // 审批人（有 approved_by 才渲染"审批人"）
    expect(container.textContent).toContain('审批人 emp-001')
    expect(container.textContent).toContain('审批人 emp-002')
    // 创建时间
    expect(container.textContent).toContain('2026-08-01')
    expect(container.textContent).toContain('2026-08-02')
    // 类型徽章（产出物/模板）
    const badges = screen.getAllByTestId('asset-type-badge')
    expect(badges.map((b) => b.textContent)).toEqual(expect.arrayContaining(['产出物', '模板']))
    unmount()
  })

  it('搜索参数化：task_type/keywords 输入后搜索请求带参', async () => {
    const { container, unmount } = render(<AssetBrowserPanel />)
    await waitFor(() => {
      expect(container.textContent).toContain('登录页设计稿')
    })
    fetchMock.mockClear()

    fireEvent.change(screen.getByPlaceholderText('任务类型'), { target: { value: 'minutes' } })
    fireEvent.change(screen.getByPlaceholderText('关键词'), { target: { value: '纪要' } })
    fireEvent.click(screen.getByText('检索'))

    await waitFor(() => {
      const searchCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/assets/search'))
      expect(searchCall).toBeTruthy()
      const url = String(searchCall![0])
      expect(url).toContain('task_type=minutes')
      expect(url).toContain('keywords=')
      expect(url).toContain('team_id=team-x')
    })
    unmount()
  })

  it('搜索参数化：task_type/keywords 为空时不发参且 rules 为空', async () => {
    // mock 按后端语义（asset_search.py:48）：仅当 task_type 与 keywords 均非空才返回 rules
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith('/api/assets/search')) {
        const u = String(url)
        const hasParams = u.includes('task_type=') && u.includes('keywords=')
        return jsonResponse({
          success: true,
          data: {
            artifacts: [],
            templates: [],
            rules: hasParams
              ? [{ rule_id: 'rule-1', trigger_condition: 't', action: 'a' }]
              : [],
          },
          error: null,
        })
      }
      if (url.startsWith('/api/assets')) {
        return jsonResponse({ success: true, data: assetList, error: null })
      }
      return jsonResponse({ success: true, data: [], error: null })
    })
    const { container, unmount } = render(<AssetBrowserPanel />)
    await waitFor(() => {
      expect(container.textContent).toContain('登录页设计稿')
    })
    fetchMock.mockClear()
    fireEvent.click(screen.getByText('检索'))
    await waitFor(() => {
      expect(container.textContent).toContain('暂无匹配规则')
    })
    const searchCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/assets/search'))
    expect(searchCall).toBeTruthy()
    const url = String(searchCall![0])
    expect(url).not.toContain('task_type=')
    expect(url).not.toContain('keywords=')
    unmount()
  })

  it('search 合并：search.artifacts/templates 并入产出物/模板列表', async () => {
    const searchWithAssets = {
      artifacts: [
        {
          asset_id: 'sa-1', type: 'artifact', title: '搜索命中产出物',
          content: '', status: 'approved',
          approved_by: '', created_at: '2026-08-01', judge_score: null,
        },
      ],
      templates: [
        {
          asset_id: 'st-1', type: 'template', title: '搜索命中模板',
          content: '', status: 'approved',
          approved_by: '', created_at: '2026-08-01', judge_score: null,
        },
      ],
      rules: [],
    }
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith('/api/assets/search')) {
        return jsonResponse({ success: true, data: searchWithAssets, error: null })
      }
      if (url.startsWith('/api/assets')) {
        return jsonResponse({ success: true, data: assetList, error: null })
      }
      return jsonResponse({ success: true, data: [], error: null })
    })
    const { container, unmount } = render(<AssetBrowserPanel />)
    await waitFor(() => {
      expect(container.textContent).toContain('登录页设计稿')
    })
    fireEvent.change(screen.getByPlaceholderText('检索资产'), { target: { value: '搜索' } })
    fireEvent.click(screen.getByText('检索'))
    await waitFor(() => {
      expect(container.textContent).toContain('搜索命中产出物')
    })
    expect(container.textContent).toContain('搜索命中模板')
    unmount()
  })

  it('团队 select：渲染演示团队选项并可切换', async () => {
    const { container, unmount } = render(<AssetBrowserPanel />)
    await waitFor(() => {
      expect(container.textContent).toContain('登录页设计稿')
    })
    const select = screen.getByRole('combobox')
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent)
    expect(options).toContain('team-x')
    expect(options).toContain('team-y')
    fetchMock.mockClear()
    fireEvent.change(select, { target: { value: 'team-y' } })
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/assets?team_id=team-y')
    })
    unmount()
  })

  it('团队切换 fetch 失败时清空旧列表', async () => {
    const { container, unmount } = render(<AssetBrowserPanel />)
    await waitFor(() => {
      expect(container.textContent).toContain('登录页设计稿')
    })
    // 之后所有 fetch 失败 → effect 顶部 setAssets([]) 清空旧列表，不再残留
    fetchMock.mockImplementation(() => Promise.reject(new Error('network down')))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'team-y' } })
    await waitFor(() => {
      expect(container.textContent).not.toContain('登录页设计稿')
    })
    expect(container.textContent).toContain('network down')
    unmount()
  })

  it('judge_score 为 0 时显示"评测 0"（!= null 边界）', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith('/api/assets')) {
        return jsonResponse({
          success: true,
          data: [
            {
              asset_id: 'art-0', type: 'artifact', title: '零分产出物',
              content: '', status: 'approved',
              approved_by: '', created_at: '2026-08-01', judge_score: 0,
            },
          ],
          error: null,
        })
      }
      return jsonResponse({ success: true, data: [], error: null })
    })
    const { container, unmount } = render(<AssetBrowserPanel />)
    await waitFor(() => {
      expect(container.textContent).toContain('零分产出物')
    })
    expect(container.textContent).toContain('评测 0')
    unmount()
  })
})
