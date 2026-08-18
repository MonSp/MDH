import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import McpConfigPanel from '../McpConfigPanel'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('McpConfigPanel', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('renders MCP config panel title', () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, servers: [] }),
    })
    render(<McpConfigPanel />)
    expect(screen.getByText(/MCP 服务器配置/)).toBeDefined()
  })

  it('displays servers list when loaded', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        success: true,
        servers: [
          { name: 'test-server', transport: 'stdio', command: 'echo', args: [], url: '', env: {}, enabled: true, status: 'connected', tools_count: 3, last_connected: '', error_message: '' },
        ],
      }),
    })
    render(<McpConfigPanel />)
    await waitFor(() => {
      expect(screen.getByText(/test-server/)).toBeDefined()
    })
  })

  it('shows add server button', () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, servers: [] }),
    })
    render(<McpConfigPanel />)
    expect(screen.getByText(/添加/)).toBeDefined()
  })

  it('shows empty state when no servers', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, servers: [] }),
    })
    render(<McpConfigPanel />)
    await waitFor(() => {
      expect(screen.getByText(/暂无配置的 MCP 服务器/)).toBeDefined()
    })
  })

  it('displays server status', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({
        success: true,
        servers: [
          { name: 'my-server', transport: 'stdio', command: 'node', args: ['server.js'], url: '', env: {}, enabled: true, status: 'connected', tools_count: 5, last_connected: '2024-01-01', error_message: '' },
        ],
      }),
    })
    render(<McpConfigPanel />)
    await waitFor(() => {
      expect(screen.getByText(/my-server/)).toBeDefined()
      expect(screen.getByText(/5 个工具/)).toBeDefined()
    })
  })
})
