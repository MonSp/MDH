import React, { useState, useEffect } from 'react'
import { listSkills, getSkillVersions, cloneSkill } from '../../modules/skillRegistry'
import type { SkillPackage } from '../../modules/agentTypes'

interface Props {
  onSkillSelect?: (skill: SkillPackage) => void
}

export function SkillRegistryPanel({ onSkillSelect }: Props) {
  const [skills, setSkills] = useState<SkillPackage[]>([])
  const [selectedSkill, setSelectedSkill] = useState<SkillPackage | null>(null)
  const [versions, setVersions] = useState<Array<{ version: string; created_at: string; changelog: string }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cloneTarget, setCloneTarget] = useState('')
  const [cloning, setCloning] = useState(false)

  const loadSkills = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listSkills()
      setSkills(data)
    } catch (e: any) {
      setError(e.message || '加载技能列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSkills()
  }, [])

  const handleSelectSkill = async (skill: SkillPackage) => {
    setSelectedSkill(skill)
    onSkillSelect?.(skill)
    try {
      const data = await getSkillVersions(skill.skill_id)
      setVersions(data)
    } catch {
      setVersions([])
    }
  }

  const handleClone = async () => {
    if (!selectedSkill || !cloneTarget.trim()) return
    setCloning(true)
    try {
      await cloneSkill(selectedSkill.skill_id, cloneTarget.trim())
      setCloneTarget('')
      await loadSkills()
    } catch (e: any) {
      setError(e.message || '克隆失败')
    } finally {
      setCloning(false)
    }
  }

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('zh-CN')
    } catch {
      return iso
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>📦 技能包管理</h3>
        <button
          onClick={loadSkills}
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

      {error && <div style={{ color: '#ef4444', marginBottom: 8, fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div style={{ color: '#6b7280', padding: 20, textAlign: 'center' }}>加载中...</div>
      ) : skills.length === 0 ? (
        <div style={{ color: '#9ca3af', padding: 20, textAlign: 'center' }}>暂无技能包</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
              <th style={{ padding: '8px 6px' }}>名称</th>
              <th style={{ padding: '8px 6px' }}>版本</th>
              <th style={{ padding: '8px 6px' }}>描述</th>
              <th style={{ padding: '8px 6px' }}>创建时间</th>
              <th style={{ padding: '8px 6px' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {skills.map((skill) => (
              <tr
                key={skill.skill_id}
                style={{
                  borderBottom: '1px solid #f3f4f6',
                  backgroundColor: selectedSkill?.skill_id === skill.skill_id ? '#eff6ff' : 'transparent',
                  cursor: 'pointer',
                }}
                onClick={() => handleSelectSkill(skill)}
              >
                <td style={{ padding: '8px 6px', fontWeight: 500 }}>{skill.name}</td>
                <td style={{ padding: '8px 6px' }}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 10,
                    fontSize: 11,
                    background: '#dbeafe',
                    color: '#2563eb',
                  }}>
                    v{skill.version}
                  </span>
                </td>
                <td style={{ padding: '8px 6px', color: '#6b7280', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {skill.description || '-'}
                </td>
                <td style={{ padding: '8px 6px', color: '#9ca3af', fontSize: 12 }}>
                  {formatDate(skill.created_at)}
                </td>
                <td style={{ padding: '8px 6px' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSelectSkill(skill)
                    }}
                    style={{
                      padding: '2px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: 4,
                      background: '#fff',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    详情
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selectedSkill && (
        <div style={{ marginTop: 16, padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fafafa' }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: 14 }}>
            {selectedSkill.name} - 版本历史
          </h4>

          {selectedSkill.dependencies.length > 0 && (
            <div style={{ marginBottom: 8, fontSize: 12, color: '#6b7280' }}>
              依赖: {selectedSkill.dependencies.join(', ')}
            </div>
          )}
          {selectedSkill.required_env.length > 0 && (
            <div style={{ marginBottom: 8, fontSize: 12, color: '#6b7280' }}>
              环境变量: {selectedSkill.required_env.join(', ')}
            </div>
          )}

          {versions.length === 0 ? (
            <div style={{ color: '#9ca3af', fontSize: 13 }}>暂无版本历史</div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              {versions.map((v, i) => (
                <div
                  key={i}
                  style={{
                    padding: '6px 8px',
                    borderLeft: '3px solid #3b82f6',
                    marginBottom: 6,
                    background: '#fff',
                    fontSize: 12,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>v{v.version}</span>
                  <span style={{ color: '#9ca3af', marginLeft: 8 }}>{formatDate(v.created_at)}</span>
                  {v.changelog && <div style={{ color: '#6b7280', marginTop: 2 }}>{v.changelog}</div>}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={cloneTarget}
              onChange={(e) => setCloneTarget(e.target.value)}
              placeholder="输入克隆目标目录"
              style={{
                flex: 1,
                padding: '4px 8px',
                border: '1px solid #d1d5db',
                borderRadius: 4,
                fontSize: 13,
              }}
            />
            <button
              onClick={handleClone}
              disabled={cloning || !cloneTarget.trim()}
              style={{
                padding: '4px 12px',
                border: '1px solid #10b981',
                borderRadius: 4,
                background: cloning ? '#d1fae5' : '#ecfdf5',
                color: '#065f46',
                cursor: cloning ? 'wait' : 'pointer',
                fontSize: 13,
              }}
            >
              {cloning ? '克隆中...' : '克隆'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
