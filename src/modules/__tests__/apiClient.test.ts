import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApiClient } from '../apiClient'

describe('ApiClient', () => {
  let client: InstanceType<typeof ApiClient>
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    fetchSpy = vi.fn()
    global.fetch = fetchSpy
    client = new ApiClient()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should initialize with default config', () => {
    expect(client).toBeDefined()
  })

  it('should initialize with custom config', () => {
    const custom = new ApiClient({ baseUrl: '/custom', timeout: 5000 })
    expect(custom).toBeDefined()
  })

  it('should have get method', () => {
    expect(typeof client.get).toBe('function')
  })

  it('should have post method', () => {
    expect(typeof client.post).toBe('function')
  })

  it('should have put method', () => {
    expect(typeof client.put).toBe('function')
  })

  it('should have delete method', () => {
    expect(typeof client.delete).toBe('function')
  })
})
