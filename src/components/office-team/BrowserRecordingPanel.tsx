/**
 * BrowserRecordingPanel — 浏览器录制回放面板
 *
 * 功能：
 * - 开始/停止录制
 * - 查看录制步骤
 * - 导出为 JSON
 * - 导入并回放
 */

import React, { useState, useRef, useCallback } from 'react'

interface RecordingStep {
  timestamp: number
  action: string
  selector?: string
  value?: string
  url?: string
}

interface BrowserRecordingPanelProps {
  onStartRecording?: () => void
  onStopRecording?: () => void
  onReplay?: (steps: RecordingStep[]) => void
  onExport?: (steps: RecordingStep[]) => void
}

export default function BrowserRecordingPanel({
  onStartRecording,
  onStopRecording,
  onReplay,
  onExport,
}: BrowserRecordingPanelProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [steps, setSteps] = useState<RecordingStep[]>([])
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleStartRecording = useCallback(() => {
    setIsRecording(true)
    setSteps([])
    onStartRecording?.()
  }, [onStartRecording])

  const handleStopRecording = useCallback(() => {
    setIsRecording(false)
    onStopRecording?.()
  }, [onStopRecording])

  const handleReplay = useCallback(() => {
    if (steps.length > 0) {
      onReplay?.(steps)
    }
  }, [steps, onReplay])

  const handleExport = useCallback(() => {
    if (steps.length > 0) {
      onExport?.(steps)
      const blob = new Blob([JSON.stringify(steps, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `browser-recording-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    }
  }, [steps, onExport])

  const handleImport = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string) as RecordingStep[]
        setSteps(imported)
        setImportError(null)
      } catch {
        setImportError('Invalid JSON file')
      }
    }
    reader.readAsText(file)
  }, [])

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleTimeString()
  }

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'navigate': return '🔗'
      case 'click': return '👆'
      case 'fill': return '✏️'
      case 'type': return '⌨️'
      case 'press': return '⏎'
      case 'hover': return '👆'
      case 'wait': return '⏳'
      case 'screenshot': return '📸'
      default: return '🔧'
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>🎬 浏览器录制</span>
        <span style={styles.badge}>{steps.length} 步</span>
      </div>

      <div style={styles.controls}>
        {!isRecording ? (
          <button style={styles.recordBtn} onClick={handleStartRecording}>
            ⏺ 开始录制
          </button>
        ) : (
          <button style={styles.stopBtn} onClick={handleStopRecording}>
            ⏹ 停止录制
          </button>
        )}
        <button
          style={styles.btn}
          onClick={handleReplay}
          disabled={steps.length === 0}
        >
          ▶ 回放
        </button>
        <button
          style={styles.btn}
          onClick={handleExport}
          disabled={steps.length === 0}
        >
          📤 导出
        </button>
        <button style={styles.btn} onClick={handleImport}>
          📥 导入
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      {importError && (
        <div style={styles.error}>{importError}</div>
      )}

      {isRecording && (
        <div style={styles.recordingIndicator}>
          <span style={styles.recordingDot}>●</span>
          <span>录制中...</span>
        </div>
      )}

      <div style={styles.stepsList}>
        {steps.length === 0 ? (
          <div style={styles.empty}>暂无录制步骤</div>
        ) : (
          steps.map((step, index) => (
            <div key={index} style={styles.stepItem}>
              <span style={styles.stepIndex}>{index + 1}</span>
              <span style={styles.stepIcon}>{getActionIcon(step.action)}</span>
              <div style={styles.stepContent}>
                <div style={styles.stepAction}>{step.action}</div>
                {step.selector && (
                  <div style={styles.stepSelector}>{step.selector}</div>
                )}
                {step.value && (
                  <div style={styles.stepValue}>{step.value}</div>
                )}
                {step.url && (
                  <div style={styles.stepUrl}>{step.url}</div>
                )}
              </div>
              <span style={styles.stepTime}>{formatTimestamp(step.timestamp)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  badge: {
    fontSize: '11px',
    color: '#94a3b8',
    background: 'rgba(255, 255, 255, 0.05)',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  controls: {
    display: 'flex',
    gap: '8px',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  },
  recordBtn: {
    padding: '6px 16px',
    background: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  stopBtn: {
    padding: '6px 16px',
    background: '#6b7280',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  btn: {
    padding: '6px 12px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    color: '#e2e8f0',
    fontSize: '12px',
    cursor: 'pointer',
  },
  error: {
    padding: '8px 16px',
    background: 'rgba(239, 68, 68, 0.1)',
    color: '#ef4444',
    fontSize: '12px',
  },
  recordingIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    background: 'rgba(239, 68, 68, 0.1)',
    color: '#ef4444',
    fontSize: '12px',
    fontWeight: 600,
  },
  recordingDot: {
    color: '#ef4444',
    animation: 'blink 1s infinite',
  },
  stepsList: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px',
  },
  empty: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: '12px',
    padding: '40px',
  },
  stepItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    marginBottom: '4px',
    borderRadius: '6px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
  },
  stepIndex: {
    fontSize: '10px',
    color: '#6b7280',
    minWidth: '20px',
  },
  stepIcon: {
    fontSize: '14px',
  },
  stepContent: {
    flex: 1,
    overflow: 'hidden',
  },
  stepAction: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  stepSelector: {
    fontSize: '10px',
    color: '#94a3b8',
    fontFamily: 'monospace',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  stepValue: {
    fontSize: '10px',
    color: '#6b7280',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  stepUrl: {
    fontSize: '10px',
    color: '#3b82f6',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  stepTime: {
    fontSize: '10px',
    color: '#6b7280',
  },
}
