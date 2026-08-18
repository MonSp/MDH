// Electron 环境检测
export function isElectron(): boolean {
  return typeof window !== 'undefined' && (window as any).mdh?.isElectron === true;
}

// 获取 Electron mdh API 对象（非 Electron 环境返回 undefined）
export function getMdH(): { isElectron?: boolean; invoke: (channel: string, ...args: any[]) => Promise<any>; on: (channel: string, handler: (...args: any[]) => void) => void; off: (channel: string, handler: (...args: any[]) => void) => void } | undefined {
  return typeof window !== 'undefined' ? (window as any).mdh : undefined;
}

// 向后兼容的常量版本
const _isElectron = isElectron();
export const AGENT_URL_DEFAULT = _isElectron ? '' : `ws://${window.location.host}/ws/`;

export const STORAGE_KEYS = {
  AGENT_URL: 'agentscope_url',
  API_KEY: 'deepseek_api_key',
  BASE_URL: 'deepseek_base_url',
  PROVIDER: 'llm_provider',
  MODEL_NAME: 'llm_model_name',
  MULTIMODAL: 'llm_multimodal',
  CONVERSATIONS: 'agent_conversations',
  THEME: 'app_theme',
  BACKEND_TOKEN: 'backend_token',
} as const;

export const SSO_KEYS = {
  TOKEN: 'sso_auth_token',
  USERNAME: 'sso_auth_username',
} as const;

export interface SettingsConfig {
  agentUrl: string;
  provider: string;
  modelName: string;
  apiKey: string;
  baseUrl: string;
  multimodal: boolean;
  backendToken: string;
}

export interface SkillInfo {
  name: string;
  description: string;
  dir: string;
  type?: string;
}

export interface EditingSkill {
  name: string;
  description: string;
  params: Array<{ key: string; label: string; defaultValue: string }>;
  steps: Array<{ command: string; payload: Record<string, any> }>;
  skillType: string;
  generating: boolean;
}

export type AppMode = 'single' | 'team';
