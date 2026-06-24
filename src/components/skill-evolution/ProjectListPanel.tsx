import React, { useState, useEffect } from 'react'
import { listProjects, getProjectStatus, archiveProject } from '../../modules/projectManager'
import type { Project, ProjectStatus } from '../../modules/agentTypes'

interface Props {
  onProjectSelect?: (project: Project) => void
}

const statusConfig: Record<string, { bg: string; color: string; label: string }> = {
  created: { bg: 'rgba(107,114,128,0.15)', color: '#9ca3af', label: '已创建' },
  instantiating: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: '实例化中' },
  running: { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', label: '运行中' },
  archiving: { bg: 'rgba(99,102,241,0.15)', color: '#818cf8', label: '归档中' },
  archived: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: '已归档' },
  failed: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: '失败' },
}

export function ProjectListPanel({ onProjectSelect }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [projectStatus, setProjectStatus] = useState<ProjectStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [archiving, setArchiving] = useState<string | null>(null)

  const loadProjects = async () => {
    setLoading(true)
    setError(null)
    try { setProjects(await listProjects()) }
    catch (e: any) { setError(e.message || '加载失败') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadProjects() }, [])

  const handleSelect = async (p: Project) => {
    setSelectedProject(p)
    onProjectSelect?.(p)
    try { setProjectStatus(await getProjectStatus(p.project_id)) }
    catch { setProjectStatus(null) }
  }

  const handleArchive = async (id: string) => {
    setArchiving(id)
    try {
      await archiveProject(id)
      await loadProjects()
      if (selectedProject?.project_id === id) { setSelectedProject(null); setProjectStatus(null) }
    } catch (e: any) { setError(e.message || '归档失败') }
    finally { setArchiving(null) }
  }

  const fmt = (iso: string) => {
    try { return new Date(iso).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
    catch { return iso }
  }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={s.headerIcon}>📁</span>
          <div>
            <div style={s.title}>项目管理</div>
            <div style={s.subtitle}>查看和管理已创建的项目</div>
          </div>
        </div>
        <button style={s.refreshBtn} onClick={loadProjects} disabled={loading}>
          {loading ? '加载中...' : '刷新'}
        </button>
      </div>

      {error && <div style={s.error}>{error}</div>}

      <div style={s.list}>
        {loading ? (
          <div style={s.empty}>加载中...</div>
        ) : projects.length === 0 ? (
          <div style={s.empty}>暂无项目</div>
        ) : (
          projects.map(p => {
            const st = statusConfig[p.status] || statusConfig.created
            const isSel = selectedProject?.project_id === p.project_id
            return (
              <div key={p.project_id} style={{ ...s.card, borderColor: isSel ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.06)' }} onClick={() => handleSelect(p)}>
                <div style={s.cardTop}>
                  <span style={s.cardName}>{p.name}</span>
                  <span style={{ ...s.statusTag, background: st.bg, color: st.color }}>{st.label}</span>
                </div>
                <div style={s.cardMeta}>
                  员工 {p.employees.length} · 技能包 {p.skill_packages.length} · {fmt(p.created_at)}
                </div>
                {p.skill_packages.length > 0 && (
                  <div style={s.tagList}>
                    {p.skill_packages.map(sp => <span key={sp.skill_id} style={s.tag}>{sp.name}</span>)}
                  </div>
                )}
                {p.status !== 'archived' && (
                  <div style={s.cardActions}>
                    <button style={s.detailBtn} onClick={e => { e.stopPropagation(); handleSelect(p) }}>状态详情</button>
                    <button style={s.archiveBtn} onClick={e => { e.stopPropagation(); handleArchive(p.project_id) }} disabled={archiving === p.project_id}>
                      {archiving === p.project_id ? '归档中...' : '归档'}
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {selectedProject && projectStatus && (
        <div style={s.detailPanel}>
          <div style={s.detailTitle}>{projectStatus.name} - 运行状态</div>
          <div style={s.statGrid}>
            <div style={s.statBox}><div style={s.statNum}>{projectStatus.employee_count}</div><div style={s.statLabel}>员工数</div></div>
            <div style={s.statBox}><div style={s.statNum}>{projectStatus.task_stats.total}</div><div style={s.statLabel}>任务总数</div></div>
            <div style={s.statBox}><div style={s.statNum}>{projectStatus.iteration_stats.total_iterations}</div><div style={s.statLabel}>迭代轮次</div></div>
          </div>
          <div style={s.detailInfo}>
            <div>任务完成: <span style={{ color: '#10b981', fontWeight: 600 }}>{projectStatus.task_stats.completed}</span> / 失败: <span style={{ color: '#ef4444', fontWeight: 600 }}>{projectStatus.task_stats.failed}</span></div>
            <div>平均迭代: {projectStatus.iteration_stats.avg_iterations_per_task.toFixed(1)}</div>
            <div>经验规则: {projectStatus.skill_increment_stats.total_rules} 条 (已批准 {projectStatus.skill_increment_stats.approved_rules})</div>
          </div>
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(0,0,0,0.2)', fontFamily: "'Noto Sans SC', sans-serif" },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.15)' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  headerIcon: { fontSize: 20, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16,185,129,0.2)', borderRadius: 8 },
  title: { fontSize: 14, fontWeight: 700, color: '#e2e8f0' },
  subtitle: { fontSize: 11, color: '#6b7280' },
  refreshBtn: { padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#9ca3af', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  error: { padding: '8px 16px', color: '#ef4444', fontSize: 12, background: 'rgba(239,68,68,0.1)' },
  list: { flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  empty: { padding: 40, textAlign: 'center', color: '#6b7280', fontSize: 13 },
  card: { padding: '12px 14px', borderRadius: 10, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'border-color 0.15s' },
  cardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  cardName: { fontSize: 14, fontWeight: 600, color: '#e2e8f0' },
  statusTag: { padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600 },
  cardMeta: { fontSize: 11, color: '#6b7280', marginBottom: 6 },
  tagList: { display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginBottom: 8 },
  tag: { padding: '2px 8px', borderRadius: 4, fontSize: 10, background: 'rgba(59,130,246,0.1)', color: '#60a5fa' },
  cardActions: { display: 'flex', gap: 8, marginTop: 8 },
  detailBtn: { padding: '3px 10px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#9ca3af', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },
  archiveBtn: { padding: '3px 10px', borderRadius: 4, border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },
  detailPanel: { padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.15)' },
  detailTitle: { fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 10 },
  statGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 },
  statBox: { padding: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' as const },
  statNum: { fontSize: 18, fontWeight: 700, color: '#e2e8f0' },
  statLabel: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  detailInfo: { fontSize: 12, color: '#9ca3af', lineHeight: 1.8 },
}
