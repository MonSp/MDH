import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { ExperienceRulePanel } from '../ExperienceRulePanel'

const mockFetch = vi.fn()
global.fetch = mockFetch

const RULES = [
  {
    rule_id: 'r1',
    trigger_condition: 'task_type is software-dev',
    action: '建议事件驱动',
    note: '',
    rule_type: 'success_pattern',
    status: 'pending_review',
    keywords: ['executor'],
    created_at: '2026-10-01T00:00:00Z',
    source_task_type: 'software-dev',
    source_task_id: 'task-0001',
    usage_count: 0,
    effectiveness_score: 0.5,
  },
]

const ok = (data: unknown) => ({
  ok: true,
  json: () => Promise.resolve({ success: true, data }),
})

describe('ExperienceRulePanel (read-only, program-pivot M3)', () => {
  it('renders rules without approve/reject write buttons', async () => {
    // StrictMode 双跑 effect：按 URL 路由 mock，不依赖调用次序
    mockFetch.mockImplementation((url: string) => {
      const u = String(url)
      if (u.includes('demotion-log')) {
        return Promise.resolve(ok({ summary: { recent_24h: 0 }, entries: [] }))
      }
      if (u.includes('demotion-stats')) {
        return Promise.resolve(ok(null))
      }
      return Promise.resolve(ok(RULES))
    })
    render(<ExperienceRulePanel />)
    await waitFor(() => {
      expect(screen.getByText(/建议事件驱动/)).toBeDefined()
    })
    // 写操作（批准/拒绝按钮）已随迁移移除
    expect(screen.queryByRole('button', { name: /^✓ 批准$/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^✕ 拒绝$/ })).toBeNull()
    expect(screen.getByText(/写入已随 program-pivot 迁移关停/)).toBeDefined()
  })
})
