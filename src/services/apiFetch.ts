// 共享 API fetch helper：后端统一 _ok(data)/_fail(error) 包装（{ success, data, error }）。
// _fail 不传播 500（HTTP 200 + success:false + data:null）——apiFetch 直接抛错，调用方进 catch 显示 error。
// 从 AssetBrowserPanel.apiGet 模式提炼，供前端各面板复用。

export interface ApiEnvelope<T> {
  success: boolean
  data: T | null
  error?: string | null
}

export const apiFetch = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const res = init ? await fetch(url, init) : await fetch(url)
  if (!res.ok) throw new Error(`API ${res.status}`)
  const body = (await res.json()) as ApiEnvelope<T>
  if (body.success === false) throw new Error(body.error || 'API error')
  return body.data as T
}

/** GET with automatic JSON parsing and error handling */
export const apiGet = <T,>(path: string): Promise<T> =>
  apiFetch<T>(path.startsWith('/api') ? path : `/api${path}`)

/** POST with JSON body */
export const apiPost = <T,>(path: string, body?: unknown): Promise<T> =>
  apiFetch<T>(path.startsWith('/api') ? path : `/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })

/** PUT with JSON body */
export const apiPut = <T,>(path: string, body?: unknown): Promise<T> =>
  apiFetch<T>(path.startsWith('/api') ? path : `/api${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })

/** DELETE */
export const apiDelete = <T,>(path: string): Promise<T> =>
  apiFetch<T>(path.startsWith('/api') ? path : `/api${path}`, {
    method: 'DELETE',
  })

export default apiFetch
