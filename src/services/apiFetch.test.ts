import { describe, it, expect, vi, afterEach } from 'vitest'
import { apiFetch } from './apiFetch'

// _ok 包装响应：{ success, data, error }
function jsonResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  } as Response)
}

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('_ok 解包：success=true 时返回 body.data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ success: true, data: { id: 1, name: 'x' }, error: null }))
    )
    await expect(apiFetch<{ id: number }>('/api/x')).resolves.toEqual({ id: 1, name: 'x' })
  })

  it('success=false 时抛 body.error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ success: false, data: null, error: 'bad' }))
    )
    await expect(apiFetch('/api/x')).rejects.toThrow('bad')
  })

  it('!res.ok 时抛 API 状态', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 500 }))))
    await expect(apiFetch('/api/x')).rejects.toThrow('API 500')
  })
})
