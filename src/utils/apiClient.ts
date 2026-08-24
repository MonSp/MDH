/**
 * API 客户端 — 自动切换 Electron IPC / HTTP fetch
 *
 * 在 Electron 环境下通过 IPC 获取数据（不需要 Python 后端）
 * 在浏览器环境下通过统一的 apiGet 获取数据
 */

import { isElectron, getMdH } from '../constants';
import { apiFetch as serviceApiFetch } from '../services/apiFetch';

const isElectronMode = isElectron();

// Electron IPC 映射：API 路径 → IPC 通道
const IPC_MAP: Record<string, string> = {
  '/api/roles/config': 'mdh:getRolesConfig',
  '/api/skills/list': 'mdh:getSkillsList',
};

/**
 * 统一的 API 请求函数（不自动解包 envelope，返回原始 JSON）
 * Electron 模式下自动路由到 IPC，浏览器模式下使用 fetch
 *
 * 注意：与 services/apiFetch 不同，此函数返回完整的 API envelope
 * 供 dynamicRouter / experienceExtractor / careerDevelopment 等模块使用。
 */
export async function apiFetch<T = any>(url: string, options?: RequestInit): Promise<T> {
  if (isElectronMode && IPC_MAP[url] && (!options || options.method === 'GET' || !options.method)) {
    try {
      const result = await getMdH()?.invoke(IPC_MAP[url]);
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
  if (isElectronMode) {
    try {
      const result = await getMdH()?.invoke('mdh:getRolesConfig');
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

  return serviceApiFetch('/api/roles/config');
}

/**
 * 加载技能包列表
 */
export async function loadSkillsList(): Promise<any[]> {
  if (isElectronMode) {
    try {
      const result = await getMdH()?.invoke('mdh:getSkillsList');
      if (result?.success && result?.skills) {
        return result.skills;
      }
    } catch (e) {
      console.warn('[loadSkillsList] IPC failed:', e);
    }
  }

  const data = await serviceApiFetch<any>('/api/skills/list');
  return data.skills || data;
}
