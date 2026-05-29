import React from 'react';

interface SettingsConfig {
  agentUrl: string;
  provider: string;
  modelName: string;
  apiKey: string;
  baseUrl: string;
}

interface SettingsPanelProps {
  open: boolean;
  settingsCfg: SettingsConfig;
  onChangeCfg: (cfg: SettingsConfig) => void;
  onSave: () => void;
  onClose: () => void;
}

const providers = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'dashscope', label: 'DashScope (通义)' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'moonshot', label: 'Moonshot (月之暗面)' },
  { value: 'ollama', label: 'Ollama (本地)' },
  { value: 'custom', label: '自定义 (OpenAI 兼容)' },
];

export default function SettingsPanel({
  open,
  settingsCfg,
  onChangeCfg,
  onSave,
  onClose,
}: SettingsPanelProps) {
  if (!open) return null;

  const updateField = (field: keyof SettingsConfig, value: string) => {
    onChangeCfg({ ...settingsCfg, [field]: value });
  };

  return (
    <div className="settings-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings-panel">
        <h3>⚙ 后端配置</h3>
        <div className="settings-group">
          <label>AgentScope 后端地址</label>
          <input
            type="text"
            value={settingsCfg.agentUrl}
            onChange={e => updateField('agentUrl', e.target.value)}
            placeholder="ws://localhost:8765/ws"
          />
        </div>
        <div className="settings-group">
          <label>模型提供商</label>
          <select value={settingsCfg.provider} onChange={e => updateField('provider', e.target.value)}>
            {providers.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <div className="settings-group">
          <label>模型名称</label>
          <input
            type="text"
            value={settingsCfg.modelName}
            onChange={e => updateField('modelName', e.target.value)}
            placeholder="留空则使用后端默认模型"
          />
        </div>
        <div className="settings-group">
          <label>API KEY</label>
          <input
            type="password"
            value={settingsCfg.apiKey}
            onChange={e => updateField('apiKey', e.target.value)}
            placeholder="sk-..."
          />
        </div>
        <div className="settings-group">
          <label>BASE URL</label>
          <input
            type="text"
            value={settingsCfg.baseUrl}
            onChange={e => updateField('baseUrl', e.target.value)}
            placeholder="自定义 API 端点地址（可选）"
          />
        </div>
        <div className="settings-actions">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={onSave}>保存</button>
        </div>
      </div>
    </div>
  );
}
