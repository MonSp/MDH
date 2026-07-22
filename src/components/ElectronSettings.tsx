import React, { useState, useEffect, useCallback } from 'react';
import { isElectron, useConfig, useWorkspace } from '../hooks/useIpcBridge';

interface ElectronSettingsProps {
  open: boolean;
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

export default function ElectronSettings({ open, onClose }: ElectronSettingsProps) {
  const { getFullConfig, setLlmConfig, getHealth } = useConfig();
  const { selectWorkspace } = useWorkspace();

  const [provider, setProvider] = useState('deepseek');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // 加载当前配置
  useEffect(() => {
    if (!open || !isElectron()) return;

    const loadConfig = async () => {
      const config = (await getFullConfig()) as Record<string, string> | null;
      if (config) {
        setProvider(config.provider || 'deepseek');
        setApiKey(config.apiKey || '');
        setBaseUrl(config.baseUrl || '');
        setModel(config.model || '');
        setWorkspace(config.workspace || '');
      }

      const h = (await getHealth()) as Record<string, unknown> | null;
      if (h) setHealth(h);
    };

    loadConfig();
  }, [open, getFullConfig, getHealth]);

  // 保存配置
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await setLlmConfig({ provider, apiKey, baseUrl, model });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [provider, apiKey, baseUrl, model, setLlmConfig]);

  // 选择工作区
  const handleSelectWorkspace = useCallback(async () => {
    const result = (await selectWorkspace()) as { canceled: boolean; path?: string } | null;
    if (result && !result.canceled && result.path) {
      setWorkspace(result.path);
    }
  }, [selectWorkspace]);

  if (!open || !isElectron()) return null;

  return (
    <div className="settings-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings-panel" style={{ maxWidth: 520 }}>
        <h3>⚙ MDH 设置</h3>

        {/* 状态指示 */}
        {health && (
          <div style={{
            padding: '8px 12px',
            marginBottom: 16,
            background: 'rgba(0,255,136,0.1)',
            borderRadius: 6,
            fontSize: 12,
            color: '#0f8',
          }}>
            ✓ 运行正常 | 平台: {String(health.platform)} |
            加密: {health.encryptionAvailable ? '可用' : '不可用'} |
            API Key: {health.hasApiKey ? '已配置' : '未配置'}
          </div>
        )}

        {/* 模型提供商 */}
        <div className="settings-group">
          <label>模型提供商</label>
          <select value={provider} onChange={e => setProvider(e.target.value)}>
            {providers.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* API Key */}
        <div className="settings-group">
          <label>
            API Key
            <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>
              (使用系统钥匙串加密存储)
            </span>
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-..."
          />
        </div>

        {/* Base URL */}
        <div className="settings-group">
          <label>Base URL (可选)</label>
          <input
            type="text"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder="自定义 API 端点地址"
          />
        </div>

        {/* 模型名称 */}
        <div className="settings-group">
          <label>模型名称 (可选)</label>
          <input
            type="text"
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder="留空则使用默认模型"
          />
        </div>

        {/* 工作区 */}
        <div className="settings-group">
          <label>工作区目录</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={workspace}
              readOnly
              style={{ flex: 1, opacity: 0.7 }}
            />
            <button
              className="btn-secondary"
              onClick={handleSelectWorkspace}
              style={{ whiteSpace: 'nowrap' }}
            >
              选择...
            </button>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="settings-actions">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '保存中...' : saved ? '✓ 已保存' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
