// Electron 环境下不使用 WebSocket
const isElectron = typeof window !== 'undefined' && (window as any).mdh?.isElectron === true;
export const AGENT_URL_DEFAULT = isElectron ? '' : `ws://${window.location.host}/ws/`;

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

export const BRIDGE = {
  PARENT_ORIGIN: 'chrome://ai-automation-side-panel.top-chrome',
  PROTOCOL_VERSION: '1.3',
  MIN_SUPPORTED_VERSION: '1.1',
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
