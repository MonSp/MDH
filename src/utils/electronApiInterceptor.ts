/**
 * Electron API 拦截器
 *
 * 在 Electron 环境下拦截 fetch 调用，将 API 请求重定向到 IPC
 * 这样所有现有的 fetch('/api/...') 调用都能正常工作，无需修改组件代码
 */

const isElectron = typeof window !== 'undefined' && (window as any).mdh?.isElectron === true;

// API 路径 → IPC 通道映射
const API_TO_IPC: Record<string, string> = {
  '/api/roles/config': 'mdh:getRolesConfig',
  '/api/skills/list': 'mdh:getSkillsList',
};

// 原始 fetch 保存
const originalFetch = window.fetch;

// 拦截后的 fetch
async function interceptedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

  // 检查是否需要拦截
  if (isElectron && API_TO_IPC[url] && (!init || !init.method || init.method === 'GET')) {
    try {
      const result = await (window as any).mdh.invoke(API_TO_IPC[url]);

      // 构造一个模拟的 Response 对象
      const body = JSON.stringify(result);
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (e) {
      console.warn('[Electron] IPC intercept failed for', url, e);
      // 回退到原始 fetch
    }
  }

  return originalFetch(input, init);
}

/**
 * 安装 Electron API 拦截器
 * 在应用启动时调用一次即可
 */
export function installElectronApiInterceptor() {
  if (!isElectron) return;

  // 替换全局 fetch
  window.fetch = interceptedFetch;
  console.log('[Electron] API interceptor installed');
}
