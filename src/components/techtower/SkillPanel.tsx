import React from 'react'
import type { ToolInfo, SkillInfo } from './types'
import { headerStyle, closeBtn, btn, inputStyle, tagStyle } from './SidePanel'

export interface SkillPanelProps {
  skills: Record<string, SkillInfo>
  tools: Record<string, ToolInfo>
  onClose: () => void
  handleGenerateSkill: (prompt: string) => Promise<any>
  handleImportSkill: (data: any) => Promise<string | null>
  handleDeleteSkill: (id: string) => void
}

function SkillPanel({
  skills, tools, onClose,
  handleGenerateSkill, handleImportSkill, handleDeleteSkill,
}: SkillPanelProps) {
  const [selectedSkill, setSelectedSkill] = React.useState<string | null>(null)
  const [selectedSkillCategory, setSelectedSkillCategory] = React.useState<string | null>(null)
  const [showImportSkill, setShowImportSkill] = React.useState(false)
  const [importSkillForm, setImportSkillForm] = React.useState({ id: '', name: '', description: '', category: '', methodology: '', practices: [] as string[], workflow: {} as Record<string, string>, required_tools: [] as string[] })
  const [importError, setImportError] = React.useState('')
  const [aiPrompt, setAiPrompt] = React.useState('')
  const [aiGenerating, setAiGenerating] = React.useState(false)

  const selected = selectedSkill ? skills[selectedSkill] : null

  // 详情视图
  if (selectedSkill && selected && !showImportSkill) {
    return (
      <>
        <div style={headerStyle}>
          <button onClick={() => setSelectedSkill(null)} style={{ background: 'none', border: 'none', color: '#0a84ff', cursor: 'pointer', fontSize: 13 }}>← 返回列表</button>
          <button style={closeBtn} onClick={onClose} autoFocus>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 2px' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0', marginBottom: 4 }}>{selected.name}</div>
          <div style={{ fontSize: 11, color: '#556', fontFamily: 'monospace', marginBottom: 12 }}>{selectedSkill}</div>
          <p style={{ fontSize: 12, color: '#8899aa', margin: '0 0 16px' }}>{selected.description}</p>
          {selected.methodology && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 6, fontWeight: 600 }}>📐 方法论</div>
              <div style={{ padding: '8px 12px', background: 'rgba(100,210,255,0.06)', borderRadius: 6, fontSize: 12, color: '#c8d6e5', lineHeight: 1.6 }}>{selected.methodology}</div>
            </div>
          )}
          {selected.practices && selected.practices.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 6, fontWeight: 600 }}>✅ 最佳实践</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {selected.practices.map((p, i) => (
                  <div key={i} style={{ padding: '6px 12px', background: 'rgba(48,209,88,0.06)', borderRadius: 6, fontSize: 11, color: '#a0b0c0', lineHeight: 1.5, borderLeft: '2px solid rgba(48,209,88,0.3)' }}>{p}</div>
                ))}
              </div>
            </div>
          )}
          {selected.workflow && Object.keys(selected.workflow).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 6, fontWeight: 600 }}>🔄 工作流</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {Object.entries(selected.workflow).sort(([a], [b]) => Number(a) - Number(b)).map(([step, desc]) => (
                  <div key={step} style={{ padding: '6px 12px', background: 'rgba(255,159,10,0.06)', borderRadius: 6, fontSize: 11, color: '#a0b0c0', lineHeight: 1.5, display: 'flex', gap: 8 }}>
                    <span style={{ color: '#ff9f0a', fontWeight: 600, minWidth: 16 }}>{step}.</span>
                    <span>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ fontSize: 11, color: '#667', marginBottom: 6, fontWeight: 600 }}>依赖工具</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(selected.required_tools || []).map(t => {
              const tool = tools[t]
              return (
                <div key={t} style={{ padding: '6px 10px', background: 'rgba(100,210,255,0.06)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: tool?.dangerous ? '#ff9f0a' : '#64d2ff' }}>{tool?.dangerous ? '⚠' : '✓'}</span>
                  <span style={{ fontSize: 12, color: '#c8d6e5' }}>{tool?.name || t}</span>
                  {tool?.description && <span style={{ fontSize: 10, color: '#556', marginLeft: 'auto' }}>{tool.description}</span>}
                </div>
              )
            })}
          </div>
        </div>
      </>
    )
  }

  // 导入表单视图
  if (showImportSkill) {
    return (
      <>
        <div style={headerStyle}>
          <button onClick={() => { setShowImportSkill(false); setAiPrompt('') }} style={{ background: 'none', border: 'none', color: '#0a84ff', cursor: 'pointer', fontSize: 13 }}>← 取消</button>
          <button style={closeBtn} onClick={onClose} autoFocus>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 2px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#e0e8f0', marginBottom: 12 }}>新增技能包</div>
          {importError && <div style={{ padding: '6px 10px', marginBottom: 10, background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 4, color: '#ff453a', fontSize: 11 }}>{importError}</div>}
          {/* AI生成区域 */}
          <div style={{ marginBottom: 16, padding: '12px', background: 'rgba(100,210,255,0.04)', borderRadius: 8, border: '1px solid rgba(100,210,255,0.15)' }}>
            <div style={{ fontSize: 11, color: '#64d2ff', marginBottom: 8, fontWeight: 600 }}>🤖 AI智能生成</div>
            <div style={{ fontSize: 10, color: '#667', marginBottom: 8 }}>描述你需要的技能，AI自动生成完整配置（方法论、最佳实践、工作流）</div>
            <textarea
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              placeholder="例如：我需要一个前端性能优化的技能，包括Core Web Vitals优化、代码分割、懒加载等..."
              style={{ ...inputStyle, minHeight: 70, resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
            />
            <button
              onClick={async () => {
                if (!aiPrompt.trim()) { setImportError('请描述你需要的技能'); return }
                setAiGenerating(true); setImportError('')
                try {
                  const d = await handleGenerateSkill(aiPrompt)
                  if (d) setImportSkillForm({ id: d.id || '', name: d.name || '', description: d.description || '', category: d.category || '', methodology: d.methodology || '', practices: d.practices || [], workflow: d.workflow || {}, required_tools: d.required_tools || [] })
                  else setImportError('AI生成失败')
                } catch { setImportError('AI生成请求失败') }
                finally { setAiGenerating(false) }
              }}
              disabled={aiGenerating || !aiPrompt.trim()}
              style={{
                marginTop: 8, padding: '8px 16px', background: aiGenerating ? 'rgba(100,210,255,0.3)' : '#0a84ff',
                border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: aiGenerating ? 'not-allowed' : 'pointer',
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
              }}
            >
              {aiGenerating ? '⏳ AI生成中...' : '✨ AI生成技能配置'}
            </button>
          </div>
          {/* 分隔线 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
            <span style={{ fontSize: 10, color: '#556' }}>或手动填写</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>技能ID *</div>
            <input value={importSkillForm.id} onChange={e => setImportSkillForm({ ...importSkillForm, id: e.target.value })} placeholder="frontend_dev" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>名称 *</div>
            <input value={importSkillForm.name} onChange={e => setImportSkillForm({ ...importSkillForm, name: e.target.value })} placeholder="前端开发" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>描述</div>
            <input value={importSkillForm.description} onChange={e => setImportSkillForm({ ...importSkillForm, description: e.target.value })} placeholder="React组件开发" style={inputStyle} />
          </div>
          {importSkillForm.methodology && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>📐 方法论</div>
              <div style={{ padding: '8px 12px', background: 'rgba(100,210,255,0.06)', borderRadius: 6, fontSize: 11, color: '#c8d6e5', lineHeight: 1.5 }}>{importSkillForm.methodology}</div>
            </div>
          )}
          {importSkillForm.practices.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>✅ 最佳实践</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {importSkillForm.practices.map((p, i) => (
                  <div key={i} style={{ padding: '4px 10px', background: 'rgba(48,209,88,0.06)', borderRadius: 4, fontSize: 10, color: '#a0b0c0', borderLeft: '2px solid rgba(48,209,88,0.3)' }}>{p}</div>
                ))}
              </div>
            </div>
          )}
          {Object.keys(importSkillForm.workflow).length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>🔄 工作流</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {Object.entries(importSkillForm.workflow).sort(([a], [b]) => Number(a) - Number(b)).map(([step, desc]) => (
                  <div key={step} style={{ padding: '4px 10px', background: 'rgba(255,159,10,0.06)', borderRadius: 4, fontSize: 10, color: '#a0b0c0', display: 'flex', gap: 6 }}>
                    <span style={{ color: '#ff9f0a', fontWeight: 600 }}>{step}.</span>
                    <span>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#667', marginBottom: 4 }}>依赖工具</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {Object.entries(tools).map(([id, tool]) => {
                const active = importSkillForm.required_tools.includes(id)
                return <span key={id} onClick={() => setImportSkillForm({ ...importSkillForm, required_tools: active ? importSkillForm.required_tools.filter(t => t !== id) : [...importSkillForm.required_tools, id] })} style={tagStyle(active, '#64d2ff')}>{tool.name}</span>
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={async () => { const err = await handleImportSkill(importSkillForm); if (err) setImportError(err); else { setShowImportSkill(false); setImportSkillForm({ id: '', name: '', description: '', category: '', methodology: '', practices: [], workflow: {}, required_tools: [] }); setAiPrompt('') } }} style={{ flex: 1, padding: '8px 0', background: '#0a84ff', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>添加</button>
            <button onClick={() => { setShowImportSkill(false); setAiPrompt('') }} style={{ flex: 1, padding: '8px 0', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#8899aa', fontSize: 12, cursor: 'pointer' }}>取消</button>
          </div>
        </div>
      </>
    )
  }

  // 列表视图
  const skillCategories: Record<string, { label: string; icon: string; match: (name: string) => boolean }> = {
    dev: { label: '开发技能', icon: '💻', match: n => /开发|Dev|前端|后端|全栈|API|数据库/.test(n) },
    data: { label: '数据技能', icon: '📊', match: n => /数据|Data|ML|机器学习|ETL|可视化/.test(n) },
    content: { label: '内容技能', icon: '✍️', match: n => /内容|写作|文案|编辑|SEO/.test(n) },
    design: { label: '设计技能', icon: '🎨', match: n => /设计|品牌|平面|UI/.test(n) },
    testing: { label: '测试技能', icon: '🧪', match: n => /测试|审查|安全审计|性能/.test(n) },
    ops: { label: '运维技能', icon: '⚙️', match: n => /运维|DevOps|部署|监控/.test(n) },
    ux: { label: '用户研究', icon: '🔬', match: n => /用户|UX|可用性|画像/.test(n) },
    sales: { label: '销售技能', icon: '💰', match: n => /销售|竞争|赋能/.test(n) },
    general: { label: '通用技能', icon: '📋', match: () => true },
  }

  const categorizeSkill = (name: string): string => {
    for (const [cat, config] of Object.entries(skillCategories)) {
      if (cat !== 'general' && config.match(name)) return cat
    }
    return 'general'
  }

  const skillGroups: Record<string, Array<[string, SkillInfo]>> = {}
  Object.entries(skills).forEach(([id, skill]) => {
    const cat = categorizeSkill(skill.name)
    if (!skillGroups[cat]) skillGroups[cat] = []
    skillGroups[cat].push([id, skill])
  })

  return (
    <>
      <div style={headerStyle}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#e0e8f0' }}>📦 技能包管理</span>
        <button style={closeBtn} onClick={onClose} autoFocus>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <button onClick={() => { setShowImportSkill(true); setImportError(''); setSelectedSkill(null) }} style={{ ...btn('#0a84ff'), marginTop: 0, fontSize: 12, padding: '8px 0', marginBottom: 12 }}>+ 新增技能包</button>
        {Object.entries(skillCategories).map(([cat, config]) => {
          const catSkills = skillGroups[cat] || []
          if (catSkills.length === 0) return null
          const isExpanded = selectedSkillCategory === cat
          return (
            <div key={cat} style={{ marginBottom: 4 }}>
              <div
                onClick={() => setSelectedSkillCategory(isExpanded ? null : cat)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                <span style={{ fontSize: 12, color: '#8899aa', fontWeight: 500 }}>{config.icon} {config.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: '#556', padding: '1px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>{catSkills.length}</span>
                  <span style={{ fontSize: 10, color: '#444', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
                </div>
              </div>
              {isExpanded && (
                <div style={{ paddingLeft: 12 }}>
                  {catSkills.map(([id, skill]) => (
                    <div key={id} onClick={() => setSelectedSkill(id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 2, borderRadius: 4, cursor: 'pointer' }}>
                      <span style={{ fontSize: 10, color: '#0a84ff' }}>📦</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: '#c8d6e5' }}>{skill.name}</div>
                        <div style={{ fontSize: 10, color: '#556' }}>{skill.description}</div>
                        {skill.methodology && <div style={{ fontSize: 10, color: '#64d2ff', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>📐 {skill.methodology}</div>}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteSkill(id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff453a', fontSize: 14, opacity: 0.4 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {Object.keys(skills).length === 0 && (
          <div style={{ textAlign: 'center', padding: 24, color: '#556', fontSize: 12 }}>暂无技能包</div>
        )}
      </div>
    </>
  )
}

export default SkillPanel
