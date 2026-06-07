/**
 * 统一API客户端
 * 所有后端API调用通过此客户端进行
 */

export interface ApiResponse<T = unknown> {
  success: boolean
  data: T | null
  error: string | null
}

export interface ApiClientConfig {
  baseUrl?: string
  timeout?: number
}

const DEFAULT_CONFIG: ApiClientConfig = {
  baseUrl: '/api',
  timeout: 30000,
}

export class ApiClient {
  private config: ApiClientConfig

  constructor(config?: Partial<ApiClientConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    const url = `${this.config.baseUrl}${endpoint}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      return data as ApiResponse<T>
    } catch (error) {
      if (error instanceof Error) {
        return {
          success: false,
          data: null,
          error: error.message,
        }
      }
      return {
        success: false,
        data: null,
        error: 'Unknown error occurred',
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' })
  }

  async post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  async put<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' })
  }
}

// 默认API客户端实例
export const apiClient = new ApiClient()