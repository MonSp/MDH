/**
 * Electron API 拦截器
 *
 * 在 Electron 环境下拦截 fetch 调用，将 API 请求重定向到 IPC
 * 这样所有现有的 fetch('/api/...') 调用都能正常工作，无需修改组件代码
 */

// API 路径 → IPC 通道映射
const API_TO_IPC: Record<string, string> = {
  '/api/roles/config': 'mdh:getRolesConfig',
  '/api/skills/list': 'mdh:getSkillsList',
};

// 原始 fetch 保存
let originalFetch: typeof window.fetch | null = null;

function getElectron(): any {
  return typeof window !== 'undefined' ? (window as any).mdh : undefined;
}

// 拦截后的 fetch
async function interceptedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const mdh = getElectron();

  // 检查是否需要拦截（每次调用时动态检测）
  if (mdh?.isElectron && API_TO_IPC[url] && (!init || !init.method || init.method === 'GET')) {
    console.log('[Electron] Intercepting:', url, '→ IPC:', API_TO_IPC[url]);
    try {
      const result = await mdh.invoke(API_TO_IPC[url]);
      console.log('[Electron] IPC result for', url, ':', result);

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

  // 使用原始 fetch
  return (originalFetch || window.fetch)(input, init);
}

/**
 * 安装 Electron API 拦截器
 * 在应用启动时调用一次即可
 */
export function installElectronApiInterceptor() {
  const mdh = getElectron();
  if (!mdh?.isElectron) {
    console.log('[Electron] Not in Electron mode, skipping interceptor');
    return;
  }

  // 保存并替换全局 fetch
  originalFetch = window.fetch;
  window.fetch = interceptedFetch;
  console.log('[Electron] API interceptor installed successfully');
}
