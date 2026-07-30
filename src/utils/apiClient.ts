/**
 * API 客户端 — 自动切换 Electron IPC / HTTP fetch
 *
 * 在 Electron 环境下通过 IPC 获取数据（不需要 Python 后端）
 * 在浏览器环境下通过 HTTP fetch 获取数据
 */

const isElectron = typeof window !== 'undefined' && (window as any).mdh?.isElectron === true;

// Electron IPC 映射：API 路径 → IPC 通道
const IPC_MAP: Record<string, string> = {
  '/api/roles/config': 'mdh:getRolesConfig',
  '/api/skills/list': 'mdh:getSkillsList',
};

/**
 * 统一的 API 请求函数
 * Electron 模式下自动路由到 IPC，浏览器模式下使用 fetch
 */
export async function apiFetch<T = any>(url: string, options?: RequestInit): Promise<T> {
  if (isElectron && IPC_MAP[url] && (!options || options.method === 'GET' || !options.method)) {
    try {
      const result = await (window as any).mdh.invoke(IPC_MAP[url]);
      return result as T;
    } catch (e) {
      console.warn('[apiFetch] IPC failed, falling back to fetch:', e);
    }
  }

  // 回退到标准 fetch
  const res = await fetch(url, options);
  return res.json();
}

/**
 * 加载角色配置
 */
export async function loadRolesConfig(): Promise<any> {
  if (isElectron) {
    try {
      const result = await (window as any).mdh.invoke('mdh:getRolesConfig');
      if (result?.success && result?.data) {
        return result.data;
      }
      if (result?.success && result?.yaml) {
        // 需要 YAML 解析器，暂时返回空
        console.warn('[loadRolesConfig] YAML parsing not implemented in Electron mode');
        return null;
      }
    } catch (e) {
      console.warn('[loadRolesConfig] IPC failed:', e);
    }
  }

  const res = await fetch('/api/roles/config');
  return res.json();
}

/**
 * 加载技能包列表
 */
export async function loadSkillsList(): Promise<any[]> {
  if (isElectron) {
    try {
      const result = await (window as any).mdh.invoke('mdh:getSkillsList');
      if (result?.success && result?.skills) {
        return result.skills;
      }
    } catch (e) {
      console.warn('[loadSkillsList] IPC failed:', e);
    }
  }

  const res = await fetch('/api/skills/list');
  const data = await res.json();
  return data.skills || data;
}
