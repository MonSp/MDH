import React, { useState, useEffect } from 'react'
import { listProjects, getProjectStatus, archiveProject } from '../../modules/projectManager'
import type { Project, ProjectStatus } from '../../modules/agentTypes'

interface Props {
  onProjectSelect?: (project: Project) => void
}

const statusColorMap: Record<string, { bg: string; text: string; label: string }> = {
  created: { bg: '#f3f4f6', text: '#6b7280', label: '已创建' },
  instantiating: { bg: '#fef3c7', text: '#92400e', label: '实例化中' },
  running: { bg: '#dbeafe', text: '#1d4ed8', label: '运行中' },
  archiving: { bg: '#e0e7ff', text: '#4338ca', label: '归档中' },
  archived: { bg: '#d1fae5', text: '#065f46', label: '已归档' },
  failed: { bg: '#fee2e2', text: '#dc2626', label: '失败' },
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
    try {
      const data = await listProjects()
      setProjects(data)
    } catch (e: any) {
      setError(e.message || '加载项目列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProjects()
  }, [])

  const handleSelectProject = async (project: Project) => {
    setSelectedProject(project)
    onProjectSelect?.(project)
    try {
      const status = await getProjectStatus(project.project_id)
      setProjectStatus(status)
    } catch {
      setProjectStatus(null)
    }
  }

  const handleArchive = async (projectId: string) => {
    setArchiving(projectId)
    try {
      await archiveProject(projectId)
      await loadProjects()
      if (selectedProject?.project_id === projectId) {
        setSelectedProject(null)
        setProjectStatus(null)
      }
    } catch (e: any) {
      setError(e.message || '归档失败')
    } finally {
      setArchiving(null)
    }
  }

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('zh-CN')
    } catch {
      return iso
    }
  }

  const getStatusStyle = (status: string) => {
    return statusColorMap[status] || statusColorMap.created
  }

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>📁 项目管理</h3>
        <button
          onClick={loadProjects}
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
      ) : projects.length === 0 ? (
        <div style={{ color: '#9ca3af', padding: 20, textAlign: 'center' }}>暂无项目</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {projects.map((project) => {
            const statusStyle = getStatusStyle(project.status)
            return (
              <div
                key={project.project_id}
                onClick={() => handleSelectProject(project)}
                style={{
                  padding: 12,
                  border: `1px solid ${selectedProject?.project_id === project.project_id ? '#3b82f6' : '#e5e7eb'}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: selectedProject?.project_id === project.project_id ? '#eff6ff' : '#fff',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{project.name}</span>
                  <span style={{
                    padding: '2px 10px',
                    borderRadius: 10,
                    fontSize: 11,
                    background: statusStyle.bg,
                    color: statusStyle.text,
                  }}>
                    {statusStyle.label}
                  </span>
                </div>

                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                  员工: {project.employees.length} 人 | 技能包: {project.skill_packages.length} 个 | 创建: {formatDate(project.created_at)}
                </div>

                {project.skill_packages.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                    {project.skill_packages.map((sp) => (
                      <span
                        key={sp.skill_id}
                        style={{
                          padding: '1px 6px',
                          borderRadius: 3,
                          fontSize: 11,
                          background: '#f3f4f6',
                          color: '#374151',
                        }}
                      >
                        {sp.name}
                      </span>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSelectProject(project)
                    }}
                    style={{
                      padding: '2px 10px',
                      border: '1px solid #d1d5db',
                      borderRadius: 4,
                      background: '#fff',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    状态详情
                  </button>
                  {project.status !== 'archived' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleArchive(project.project_id)
                      }}
                      disabled={archiving === project.project_id}
                      style={{
                        padding: '2px 10px',
                        border: '1px solid #f59e0b',
                        borderRadius: 4,
                        background: '#fffbeb',
                        color: '#92400e',
                        cursor: archiving === project.project_id ? 'wait' : 'pointer',
                        fontSize: 12,
                      }}
                    >
                      {archiving === project.project_id ? '归档中...' : '归档'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {selectedProject && projectStatus && (
        <div style={{ marginTop: 16, padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fafafa' }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: 14 }}>
            {projectStatus.name} - 运行状态
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div style={{ padding: 8, background: '#fff', borderRadius: 6, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>员工数</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{projectStatus.employee_count}</div>
            </div>
            <div style={{ padding: 8, background: '#fff', borderRadius: 6, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>任务总数</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{projectStatus.task_stats.total}</div>
            </div>
            <div style={{ padding: 8, background: '#fff', borderRadius: 6, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>迭代轮次</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{projectStatus.iteration_stats.total_iterations}</div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.8 }}>
            <div>任务完成: <span style={{ color: '#10b981', fontWeight: 600 }}>{projectStatus.task_stats.completed}</span> / 失败: <span style={{ color: '#ef4444', fontWeight: 600 }}>{projectStatus.task_stats.failed}</span></div>
            <div>平均迭代次数: {projectStatus.iteration_stats.avg_iterations_per_task.toFixed(1)}</div>
            <div>经验规则: 总计 {projectStatus.skill_increment_stats.total_rules} 条, 已批准 {projectStatus.skill_increment_stats.approved_rules} 条</div>
          </div>
        </div>
      )}
    </div>
  )
}
