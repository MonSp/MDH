import React, { useState, useEffect } from 'react'
import { previewPackage } from '../../modules/skillPackager'

interface Props {
  baseSkillPath: string
  incrementalPath: string
}

export function SkillPackagePreview({ baseSkillPath, incrementalPath }: Props) {
  const [preview, setPreview] = useState<{
    structure_tree: string
    diff_summary: Record<string, any>
    new_rules: Record<string, any>[]
    modified_files: string[]
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPreview = async () => {
    if (!baseSkillPath || !incrementalPath) return
    setLoading(true)
    setError(null)
    try {
      const data = await previewPackage(baseSkillPath, incrementalPath)
      setPreview(data)
    } catch (e: any) {
      setError(e.message || '加载预览失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPreview()
  }, [baseSkillPath, incrementalPath])

  const renderTree = (treeStr: string) => {
    if (!treeStr) return null
    return treeStr.split('\n').map((line, i) => {
      const indent = line.search(/\S/)
      const content = line.trim()
      if (!content) return null
      const isDir = content.endsWith('/') || content.endsWith(':')
      return (
        <div
          key={i}
          style={{
            paddingLeft: indent * 8,
            fontFamily: 'monospace',
            fontSize: 12,
            lineHeight: 1.6,
            color: isDir ? '#1d4ed8' : '#374151',
            fontWeight: isDir ? 600 : 400,
          }}
        >
          {content}
        </div>
      )
    })
  }

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>🔍 技能包预览</h3>
        <button
          onClick={loadPreview}
          disabled={loading}
          style={{
            padding: '4px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 4,
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          刷新
        </button>
      </div>

      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>
        基础路径: {baseSkillPath}<br />
        增量路径: {incrementalPath}
      </div>

      {error && <div style={{ color: '#ef4444', marginBottom: 8, fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div style={{ color: '#6b7280', padding: 20, textAlign: 'center' }}>加载预览中...</div>
      ) : !preview ? (
        <div style={{ color: '#9ca3af', padding: 20, textAlign: 'center' }}>暂无预览数据</div>
      ) : (
        <div>
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 14 }}>📂 目录结构</h4>
            <div style={{
              padding: 10,
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              maxHeight: 240,
              overflow: 'auto',
            }}>
              {renderTree(preview.structure_tree)}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 14 }}>📊 变更摘要</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div style={{ padding: 10, background: '#ecfdf5', borderRadius: 6, border: '1px solid #a7f3d0', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#065f46' }}>新增文件</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#059669' }}>
                  {preview.diff_summary?.new_files_count ?? preview.new_rules?.length ?? 0}
                </div>
              </div>
              <div style={{ padding: 10, background: '#eff6ff', borderRadius: 6, border: '1px solid #bfdbfe', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#1e40af' }}>修改文件</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#2563eb' }}>
                  {preview.modified_files?.length ?? 0}
                </div>
              </div>
              <div style={{ padding: 10, background: '#fef3c7', borderRadius: 6, border: '1px solid #fde68a', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#92400e' }}>新增规则</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#d97706' }}>
                  {preview.new_rules?.length ?? 0}
                </div>
              </div>
            </div>
          </div>

          {preview.modified_files && preview.modified_files.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: 14 }}>📝 修改的文件</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {preview.modified_files.map((f, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '4px 8px',
                      background: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: 4,
                      fontFamily: 'monospace',
                      fontSize: 12,
                      color: '#374151',
                    }}
                  >
                    {f}
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview.new_rules && preview.new_rules.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: 14 }}>💡 新增规则</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {preview.new_rules.map((rule, i) => (
                  <div
                    key={i}
                    style={{
                      padding: 8,
                      background: '#fff',
                      border: '1px solid #e5e7eb',
                      borderLeft: '3px solid #f59e0b',
                      borderRadius: 4,
                      fontSize: 12,
                    }}
                  >
                    {rule.trigger_condition && (
                      <div style={{ fontWeight: 500, marginBottom: 2 }}>{rule.trigger_condition}</div>
                    )}
                    {rule.action && (
                      <div style={{ color: '#6b7280' }}>→ {rule.action}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
