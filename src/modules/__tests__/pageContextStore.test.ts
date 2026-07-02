import { describe, it, expect } from 'vitest'
import { usePageContext, subscribe } from '../pageContextStore'

describe('pageContextStore', () => {
  it('should return pageContext and handleEvent', () => {
    const { pageContext, handleEvent } = usePageContext()
    expect(pageContext).toBeDefined()
    expect(typeof handleEvent).toBe('function')
  })

  it('should update pageContext on manifest_push', () => {
    const { pageContext, handleEvent } = usePageContext()

    handleEvent({
      command: 'manifest_push',
      payload: {
        page_metadata: { url: 'https://example.com', title: 'Example' },
        tools: [{ tool: 'search', label: 'Search' }],
      },
    })

    expect(pageContext.url).toBe('https://example.com')
    expect(pageContext.title).toBe('Example')
    expect(pageContext.tools).toHaveLength(1)
  })

  it('should update url on page_changed', () => {
    const { pageContext, handleEvent } = usePageContext()

    handleEvent({
      command: 'page_changed',
      payload: { new_url: 'https://new.com' },
    })

    expect(pageContext.url).toBe('https://new.com')
  })

  it('should notify subscribers', () => {
    const received: any[] = []
    const unsub = subscribe(ctx => received.push({ ...ctx }))

    const { handleEvent } = usePageContext()
    handleEvent({
      command: 'manifest_push',
      payload: { page_metadata: { url: 'https://test.com', title: 'Test' } },
    })

    expect(received.length).toBeGreaterThan(0)
    unsub()
  })

  it('should ignore unknown commands', () => {
    const { pageContext, handleEvent } = usePageContext()
    const before = { ...pageContext }

    handleEvent({ command: 'unknown', payload: {} })

    expect(pageContext.url).toBe(before.url)
  })
})
