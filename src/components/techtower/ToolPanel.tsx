import React from 'react'
import type { ToolInfo, ImportToolForm } from './types'
import { headerStyle, closeBtn, btn, inputStyle, selectStyle } from './SidePanel.styles'

export interface ToolPanelProps {
  tools: Record<string, ToolInfo>
  onClose: () => void
  handleImportTool: (data: ImportToolForm) => Promise<string | null>
  handleDeleteTool: (id: string) => void
}

function ToolPanel({
  tools, onClose,
  handleImportTool, handleDeleteTool,
}: ToolPanelProps) {
  const [selectedToolCategory, setSelectedToolCategory] = React.useState<string | null>(null)
  const [showImportTool, setShowImportTool] = React.useState(false)
  const [importToolForm, setImportToolForm] = React.useState({ id: '', name: '', description: '', category: 'general', dangerous: false })
  const [importError, setImportError] = React.useState('')

  const catLabel: Record<string, string> = { file: '📁 文件操作', shell: '💻 命令执行', git: '🔀 Git操作', search: '🔍 搜索', test: '🧪 测试', general: '⚙️ 通用', document: '📄 文档', design: '🎨 设计', data: '📊 数据', ai: '🤖 AI', content: '✍️ 内容' }

  // 导入表单视图
  if (showImportTool) {
    return (
      <>
        <div style={headerStyle}>
          <button onClick={() => setShowImportTool(false)} style={{ background: 'none', border: 'none', color: '#bf5af2', cursor: 'pointer', fontSize: 13 }}>← 取消</button>
          <button style={closeBtn} onClick={onClose} autoFocus>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 2px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#e0e8f0', marginBottom: 12 }}>新增工具</div>
          {importError && <div style={{ padding: '6px 10px', marginBottom: 10, background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 4, color: '#ff453a', fontSize: 11 }}>{importError}</div>}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>工具ID *</div>
            <input value={importToolForm.id} onChange={e => setImportToolForm({ ...importToolForm, id: e.target.value })} placeholder="deploy_k8s" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>名称 *</div>
            <input value={importToolForm.name} onChange={e => setImportToolForm({ ...importToolForm, name: e.target.value })} placeholder="部署到K8s" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>描述</div>
            <input value={importToolForm.description} onChange={e => setImportToolForm({ ...importToolForm, description: e.target.value })} placeholder="部署应用到Kubernetes集群" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>分类</div>
            <select value={importToolForm.category} onChange={e => setImportToolForm({ ...importToolForm, category: e.target.value })} style={selectStyle}>
              {Object.entries(catLabel).map(([id, label]) => <option key={id} value={id} style={{ background: '#1a1a2e' }}>{label}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#c8d6e5', cursor: 'pointer' }}>
              <input type="checkbox" checked={importToolForm.dangerous} onChange={e => setImportToolForm({ ...importToolForm, dangerous: e.target.checked })} />
              标记为危险操作
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={async () => { const err = await handleImportTool(importToolForm); if (err) setImportError(err); else { setShowImportTool(false); setImportToolForm({ id: '', name: '', description: '', category: 'general', dangerous: false }) } }} style={{ flex: 1, padding: '8px 0', background: '#bf5af2', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>添加</button>
            <button onClick={() => setShowImportTool(false)} style={{ flex: 1, padding: '8px 0', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#8899aa', fontSize: 12, cursor: 'pointer' }}>取消</button>
          </div>
        </div>
      </>
    )
  }

  // 列表视图
  return (
    <>
      <div style={headerStyle}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0' }}>🔧 工具包管理</span>
        <button style={closeBtn} onClick={onClose} autoFocus>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <button onClick={() => { setShowImportTool(true); setImportError('') }} style={{ ...btn('#bf5af2'), marginTop: 0, fontSize: 12, padding: '8px 0', marginBottom: 12 }}>+ 新增工具</button>
        {Object.entries(catLabel).map(([cat, label]) => {
          const catTools = Object.entries(tools).filter(([, t]) => t.category === cat)
          if (catTools.length === 0) return null
          return (
            <div key={cat} style={{ marginBottom: 4 }}>
              <div
                onClick={() => setSelectedToolCategory(selectedToolCategory === cat ? null : cat)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                <span style={{ fontSize: 12, color: '#8899aa', fontWeight: 500 }}>{label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: '#556', padding: '1px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>{catTools.length}</span>
                  <span style={{ fontSize: 10, color: '#444', transform: selectedToolCategory === cat ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
                </div>
              </div>
              {selectedToolCategory === cat && (
                <div style={{ paddingLeft: 12 }}>
                  {catTools.map(([id, tool]) => (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 2 }}>
                      <span style={{ fontSize: 10, color: tool.dangerous ? '#ff9f0a' : '#30d158' }}>{tool.dangerous ? '⚠' : '✓'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: '#c8d6e5' }}>{tool.name}</div>
                        <div style={{ fontSize: 10, color: '#556' }}>{tool.description}</div>
                      </div>
                      <button onClick={() => handleDeleteTool(id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff453a', fontSize: 14, opacity: 0.4 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

export default ToolPanel
