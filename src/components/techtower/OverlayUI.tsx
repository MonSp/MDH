import React from 'react'
import { VIEW_PRESETS } from './constants'
import { isElectron } from '../../constants'

/* ───────── 视角书签 ───────── */

export function ViewBookmarks({ onNavigate }: { onNavigate: (pos: [number, number, number], target: [number, number, number]) => void }) {
  return (
    <div style={{
      position: 'absolute', bottom: 16, left: 16,
      display: 'flex', flexDirection: 'column', gap: 8, zIndex: 10,
    }}>
      {VIEW_PRESETS.map((v) => (
        <button
          key={v.label}
          onClick={() => onNavigate(v.pos, v.target)}
          style={{
            width: 40, height: 40, borderRadius: 8,
            background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(100,210,255,0.2)',
            color: '#64d2ff', fontSize: 10, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', backdropFilter: 'blur(8px)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(100,210,255,0.6)'; e.currentTarget.style.background = 'rgba(100,210,255,0.1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(100,210,255,0.2)'; e.currentTarget.style.background = 'rgba(0,0,0,0.5)' }}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}

/* ───────── 按钮覆盖层 ───────── */

export function OverlayButtons({ onStartMeeting, onBackToSingle }: {
  onStartMeeting: () => void; onBackToSingle: () => void
}) {
  // Electron 模式是独立应用，无"返回单智能体"入口，隐藏返回按钮
  const isElectronMode = isElectron()

  return (
    <div style={{
      position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', gap: 12, zIndex: 10,
    }}>
      {!isElectronMode && (
        <button onClick={onBackToSingle} style={{
          padding: '10px 20px',
          background: 'rgba(0,0,0,0.7)',
          border: '1px solid rgba(191,90,242,0.4)',
          borderRadius: 10,
          color: '#8899b4',
          fontSize: 13,
          cursor: 'pointer',
          fontFamily: 'inherit',
          backdropFilter: 'blur(10px)',
          transition: 'all 0.2s',
        }}>
          ← 返回
        </button>
      )}
      <button onClick={onStartMeeting} style={{
        padding: '10px 24px',
        background: 'linear-gradient(135deg, rgba(191,90,242,0.8), rgba(94,92,230,0.8))',
        border: '1px solid rgba(191,90,242,0.6)',
        borderRadius: 10,
        color: '#ffffff',
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        fontFamily: 'inherit',
        boxShadow: '0 0 20px rgba(191,90,242,0.3), 0 4px 16px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(10px)',
        transition: 'all 0.2s',
      }}>
        🚀 启动AI会议
      </button>
    </div>
  )
}
