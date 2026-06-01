export interface PageContext {
  url: string
  title: string
  tools: Array<{ tool: string; label: string }>
}

type PageContextSubscriber = (context: PageContext) => void

const subscribers: PageContextSubscriber[] = []

function notify() {
  for (const cb of subscribers) {
    cb({ ...pageContext })
  }
}

const pageContext: PageContext = { url: '', title: '', tools: [] }

export function usePageContext() {
  function handleEvent(msg: any) {
    if (msg.command === 'manifest_push' || msg.command === 'manifest_update') {
      const meta = msg.payload?.page_metadata
      if (meta) {
        pageContext.url = meta.url || meta.page_url || ''
        pageContext.title = meta.title || meta.page_title || ''
      }
      if (msg.payload?.tools) {
        pageContext.tools = msg.payload.tools.map((t: any) => ({
          tool: t.tool,
          label: t.label,
        }))
      }
      notify()
    } else if (msg.command === 'page_changed') {
      if (msg.payload?.new_url) {
        pageContext.url = msg.payload.new_url
        notify()
      }
    }
  }

  return { pageContext, handleEvent }
}

export function subscribe(callback: PageContextSubscriber): () => void {
  subscribers.push(callback)
  return () => {
    const idx = subscribers.indexOf(callback)
    if (idx !== -1) subscribers.splice(idx, 1)
  }
}
