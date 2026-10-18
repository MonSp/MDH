import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import React from 'react'
import { ProgramRegistryPanel } from '../ProgramRegistryPanel'

const mockFetch = vi.fn()
global.fetch = mockFetch

const PROGRAMS = [
  {
    program_id: 'deploy_report',
    version: '1.1.0',
    description: '部署报告程序',
    kind: 'program',
    status: 'promoted',
    trigger: { keywords: ['部署报告'] },
    last_validated_model: 'deepseek-chat',
    last_validated_at: '2026-10-17T00:00:00+00:00',
    consecutive_gate_failures: 0,
  },
  {
    program_id: 'draft_prog',
    version: '0.1.0',
    description: '候选草稿',
    kind: 'program',
    status: 'candidate',
    trigger: { keywords: [] },
    last_validated_model: null,
    last_validated_at: null,
    consecutive_gate_failures: 2,
  },
]

const DETAIL = {
  ...PROGRAMS[0],
  lineage: [
    { event: 'create', from: null, to: 'candidate', at: '2026-10-16T10:00:00+00:00' },
    { event: 'gate_passed', passed: true, tests_modified: false, at: '2026-10-16T10:05:00+00:00' },
    { event: 'promote', from: 'candidate', to: 'promoted', at: '2026-10-16T10:05:01+00:00' },
    { event: 'upgrade_requested', issues: ['输出缺字段'], previous_version: '1.0.0', new_version: '1.1.0', snapshot: '.revisions/rev_0001', at: '2026-10-17T01:00:00+00:00' },
  ],
}

const ok = (data: unknown) => ({
  ok: true,
  json: () => Promise.resolve({ success: true, data }),
})

function routeFetch(listData: unknown = PROGRAMS, detailData: unknown = DETAIL) {
  mockFetch.mockImplementation((url: string) => {
    if (String(url).includes('/api/programs/')) return Promise.resolve(ok(detailData))
    return Promise.resolve(ok(listData))
  })
}

describe('ProgramRegistryPanel', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('renders panel title', async () => {
    routeFetch([])
    render(<ProgramRegistryPanel />)
    expect(await screen.findByText(/程序库（ProgramRegistry）/)).toBeDefined()
  })

  it('lists programs with status badges', async () => {
    routeFetch()
    render(<ProgramRegistryPanel />)
    await waitFor(() => {
      const promotedRow = screen.getByTestId('program-row-deploy_report')
      expect(within(promotedRow).getByText('已晋升')).toBeDefined()
      const candidateRow = screen.getByTestId('program-row-draft_prog')
      expect(within(candidateRow).getByText('候选')).toBeDefined()
      expect(within(candidateRow).getByText(/连续失败 2/)).toBeDefined()
    })
  })

  it('filters by status via filter buttons', async () => {
    routeFetch()
    render(<ProgramRegistryPanel />)
    await waitFor(() => expect(screen.getByTestId('program-row-draft_prog')).toBeDefined())
    // 角色限定：filter 是 button，badge 是 span——避免"已晋升"多义
    fireEvent.click(screen.getByRole('button', { name: '已晋升' }))
    await waitFor(() => {
      expect(screen.getByTestId('program-row-deploy_report')).toBeDefined()
      expect(screen.queryByTestId('program-row-draft_prog')).toBeNull()
    })
  })

  it('expands row to show lineage', async () => {
    routeFetch()
    render(<ProgramRegistryPanel />)
    await waitFor(() => expect(screen.getByTestId('program-row-deploy_report')).toBeDefined())
    fireEvent.click(screen.getByTestId('program-row-deploy_report'))
    await waitFor(() => {
      expect(screen.getByTestId('program-detail-deploy_report')).toBeDefined()
      expect(screen.getByText(/血缘（lineage）· 共 4 条/)).toBeDefined()
      expect(screen.getByText('晋升')).toBeDefined()
      expect(screen.getByText(/输出缺字段/)).toBeDefined()
    })
  })

  it('shows error when load fails', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false, error: '后端错误' }),
    })
    render(<ProgramRegistryPanel />)
    await waitFor(() => {
      expect(screen.getByText(/后端错误/)).toBeDefined()
    })
  })
})
