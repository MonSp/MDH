import { reactive } from 'vue'

export interface PageContext {
  url: string
  title: string
}

export function usePageContext() {
  const pageContext = reactive<PageContext>({ url: '', title: '' })

  function handleEvent(msg: any) {
    if (msg.command === 'manifest_push' || msg.command === 'manifest_update') {
      const meta = msg.payload?.page_metadata
      if (meta) {
        pageContext.url = meta.url || meta.page_url || ''
        pageContext.title = meta.title || meta.page_title || ''
      }
    } else if (msg.command === 'page_changed') {
      if (msg.payload?.new_url) {
        pageContext.url = msg.payload.new_url
      }
    }
  }

  return { pageContext, handleEvent }
}
