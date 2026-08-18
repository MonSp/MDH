import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import CeoChatPanel from '../CeoChatPanel'

// Mock scrollIntoView
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

// Mock wsRef
const mockWsRef = { current: null }

describe('CeoChatPanel', () => {
  it('renders CEO chat panel with send button', () => {
    render(
      <CeoChatPanel
        wsRef={mockWsRef}
        onEnterProject={() => {}}
        onProjectCreated={() => {}}
      />
    )
    expect(screen.getByText(/发送/)).toBeDefined()
  })

  it('renders without crashing', () => {
    const { container } = render(
      <CeoChatPanel
        wsRef={mockWsRef}
        onEnterProject={() => {}}
        onProjectCreated={() => {}}
      />
    )
    expect(container.firstChild).toBeDefined()
  })
})
