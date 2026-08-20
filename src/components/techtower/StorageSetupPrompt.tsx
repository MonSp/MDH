import React from 'react'

interface StorageSetupPromptProps {
  /** 需要授权访问已保存目录 */
  needPermission?: boolean
  /** File System API 支持 */
  isSupported?: boolean
  /** 已选择目录 */
  dirName?: string | null
  /** 授权访问回调 */
  onGrantAccess?: () => void
  /** 初始化存储回调 */
  onInitStorage?: () => void
  /** 跳过设置 */
  onSkip: () => void
  /** 2D 回退视图 */
  canvasError?: boolean
  /** Canvas 回退内容 */
  fallbackContent?: React.ReactNode
}

const containerStyle: React.CSSProperties = {
  width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 20,
  background: '#080818', color: '#e2e8f0',
}

const skipButtonStyle: React.CSSProperties = {
  padding: '8px 20px', borderRadius: 8, cursor: 'pointer',
  fontSize: 12, border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.05)', color: '#9ca3af',
  transition: 'all 0.2s',
}

export default function StorageSetupPrompt(props: StorageSetupPromptProps) {
  const { needPermission, isSupported, dirName, onGrantAccess, onInitStorage, onSkip, canvasError, fallbackContent } = props

  // Canvas 错误回退
  if (canvasError && fallbackContent) {
    return <>{fallbackContent}</>
  }

  // 需要授权访问已保存的目录
  if (isSupported && needPermission) {
    return (
      <div style={containerStyle}>
        <div style={{ fontSize: 48 }}>🔐</div>
        <h2 style={{ margin: 0, fontSize: 20 }}>需要访问存储目录</h2>
        <p style={{ color: '#9ca3af', fontSize: 14, maxWidth: 400, textAlign: 'center', lineHeight: 1.6 }}>
          检测到之前选择的存储目录，需要你授权访问以加载项目数据。
        </p>
        <button
          onClick={onGrantAccess}
          style={{
            padding: '12px 32px', borderRadius: 10, cursor: 'pointer',
            fontSize: 15, fontWeight: 600, border: 'none',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: '#fff', boxShadow: '0 4px 20px rgba(16,185,129,0.4)',
            transition: 'all 0.2s',
          }}
        >
          🔓 授权访问
        </button>
        <button onClick={onSkip} style={skipButtonStyle}>
          选择其他目录
        </button>
      </div>
    )
  }

  // 不支持 File System API 或未选择目录
  if (isSupported && !dirName) {
    return (
      <div style={containerStyle}>
        <div style={{ fontSize: 48 }}>📁</div>
        <h2 style={{ margin: 0, fontSize: 20 }}>选择数据存储目录</h2>
        <p style={{ color: '#9ca3af', fontSize: 14, maxWidth: 400, textAlign: 'center', lineHeight: 1.6 }}>
          项目数据将存储在你选择的本地目录中，所有文件以 JSON 格式保存，方便备份和管理。
        </p>
        <button
          onClick={onInitStorage}
          style={{
            padding: '12px 32px', borderRadius: 10, cursor: 'pointer',
            fontSize: 15, fontWeight: 600, border: 'none',
            background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
            color: '#fff', boxShadow: '0 4px 20px rgba(139,92,246,0.4)',
            transition: 'all 0.2s',
          }}
        >
          📂 选择存储目录
        </button>
        <button onClick={onSkip} style={skipButtonStyle}>
          跳过，使用浏览器本地存储
        </button>
      </div>
    )
  }

  return null
}
