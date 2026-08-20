import React from 'react'

interface ToggleItem {
  label: string
  active: boolean
  toggle: () => void
}

interface SceneControlsPanelProps {
  toggles: ToggleItem[]
  controlsExpanded: boolean
  onToggleExpanded: () => void
}

export default function SceneControlsPanel({ toggles, controlsExpanded, onToggleExpanded }: SceneControlsPanelProps) {
  return (
    <div style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
      {controlsExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'rgba(5,5,15,0.85)', borderRadius: 8, padding: 10, border: '1px solid rgba(0,238,255,0.2)', backdropFilter: 'blur(12px)' }}>
          <div style={{ color: '#00eeff', fontSize: 11, fontFamily: 'monospace', marginBottom: 4, opacity: 0.7 }}>SCENE CONTROLS</div>
          {toggles.map(btn => (
            <button
              key={btn.label}
              onClick={btn.toggle}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px',
                border: `1px solid ${btn.active ? 'rgba(0,238,255,0.5)' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: 4,
                background: btn.active ? 'rgba(0,238,255,0.1)' : 'rgba(0,0,0,0.4)',
                color: btn.active ? '#00eeff' : 'rgba(255,255,255,0.5)',
                cursor: 'pointer', fontSize: 12, fontFamily: 'monospace',
                transition: 'all 0.2s', userSelect: 'none', whiteSpace: 'nowrap',
              }}
            >
              {btn.active ? '◈' : '◇'} {btn.label}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={onToggleExpanded}
        style={{
          width: 36, height: 36, borderRadius: 6,
          border: '1px solid rgba(0,238,255,0.4)',
          background: 'rgba(0,0,0,0.6)', color: '#00eeff',
          cursor: 'pointer', fontSize: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(8px)',
        }}
        title="Scene Controls"
      >
        {controlsExpanded ? '×' : '⚙'}
      </button>
    </div>
  )
}
