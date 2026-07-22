import React from 'react';
import { isElectron, useAutoUpdate, type UpdateStatus } from '../hooks/useIpcBridge';

interface UpdateNotificationProps {
  onOpenSettings?: () => void;
}

export default function UpdateNotification({ onOpenSettings }: UpdateNotificationProps) {
  const { updateStatus, downloadUpdate, installUpdate } = useAutoUpdate();

  if (!isElectron() || !updateStatus) return null;

  // 只在有可用更新或下载完成时显示
  if (updateStatus.status !== 'available' && updateStatus.status !== 'downloaded' && updateStatus.status !== 'downloading') {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: 16,
      right: 16,
      zIndex: 10000,
      background: 'rgba(20, 20, 30, 0.95)',
      border: '1px solid rgba(100, 200, 255, 0.3)',
      borderRadius: 8,
      padding: '12px 16px',
      maxWidth: 320,
      color: '#e0e0e0',
      fontSize: 13,
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    }}>
      {updateStatus.status === 'available' && (
        <>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            🆕 新版本可用: v{updateStatus.version}
          </div>
          <button
            onClick={() => downloadUpdate()}
            style={{
              background: 'linear-gradient(135deg, #0af, #08f)',
              border: 'none',
              borderRadius: 4,
              padding: '6px 16px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            下载更新
          </button>
        </>
      )}

      {updateStatus.status === 'downloading' && (
        <>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            ⬇️ 下载中... {updateStatus.percent?.toFixed(1)}%
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.1)',
            borderRadius: 4,
            height: 6,
            overflow: 'hidden',
          }}>
            <div style={{
              background: 'linear-gradient(90deg, #0af, #08f)',
              height: '100%',
              width: `${updateStatus.percent || 0}%`,
              transition: 'width 0.3s',
            }} />
          </div>
        </>
      )}

      {updateStatus.status === 'downloaded' && (
        <>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            ✅ 更新已下载: v{updateStatus.version}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => installUpdate()}
              style={{
                background: 'linear-gradient(135deg, #0a8, #080)',
                border: 'none',
                borderRadius: 4,
                padding: '6px 16px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              重启安装
            </button>
            <button
              onClick={() => {}}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 4,
                padding: '6px 16px',
                color: '#aaa',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              稍后
            </button>
          </div>
        </>
      )}
    </div>
  );
}
