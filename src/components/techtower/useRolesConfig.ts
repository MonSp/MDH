/**
 * useRolesConfig — 角色/技能/工具配置管理 hook
 *
 * 从 SidePanel 提取的配置加载和 CRUD 逻辑。
 */

import { useState, useCallback } from 'react'
import { STORAGE_KEYS } from '../../constants'
import type { RoleConfig, ToolInfo, SkillInfo, EditRoleForm, ImportSkillForm, ImportToolForm, GenerateSkillResult } from './types'

export type CustomRoleConfig = RoleConfig & { base_role?: string; extra_tools?: string[]; extra_skills?: string[]; custom_prompt?: string }

export interface RolesConfigState {
  roles: Record<string, RoleConfig>
  customRoles: Record<string, CustomRoleConfig>
  tools: Record<string, ToolInfo>
  skills: Record<string, SkillInfo>
  loading: boolean
}

export interface RolesConfigActions {
  loadRolesConfig: () => Promise<void>
  handleSaveRole: (roleId: string, editForm?: EditRoleForm) => Promise<void>
  handleCreateRole: (form?: CustomRoleConfig) => Promise<void>
  handleDeleteRole: (roleId: string) => Promise<void>
  handleImportSkill: (form?: ImportSkillForm) => Promise<string | null>
  handleDeleteSkill: (skillId: string) => Promise<void>
  handleGenerateSkill: (prompt?: string) => Promise<GenerateSkillResult>
  handleImportTool: (form?: ImportToolForm) => Promise<string | null>
  handleDeleteTool: (toolId: string) => Promise<void>
}

export function useRolesConfig(): RolesConfigState & RolesConfigActions {
  const [roles, setRoles] = useState<Record<string, RoleConfig>>({})
  const [customRoles, setCustomRoles] = useState<Record<string, CustomRoleConfig>>({})
  const [tools, setTools] = useState<Record<string, ToolInfo>>({})
  const [skills, setSkills] = useState<Record<string, SkillInfo>>({})
  const [loading, setLoading] = useState(false)

  const loadRolesConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/roles/config')
      if (!res.ok) { console.error('API请求失败:', res.status, res.statusText); return }
      const data = await res.json()
      if (data.success && data.data) {
        setRoles(data.data.base_roles || {})
        setCustomRoles(data.data.custom_roles || {})
        setTools(data.data.tools || {})
      }
      try {
        const skillsRes = await fetch('/api/skills/list')
        if (skillsRes.ok) {
          const skillsData = await skillsRes.json()
          const packs = skillsData?.data?.skills || skillsData?.skills || []
          const skillsMap: Record<string, SkillInfo> = {}
          for (const pack of packs) {
            skillsMap[pack.name] = { name: pack.name, description: pack.description || '', methodology: pack.methodology || '', category: pack.category || '', required_tools: pack.tools || [] }
          }
          setSkills(skillsMap)
        }
      } catch (e) { console.error('加载技能包失败:', e) }
    } catch (e) { console.error('加载配置失败:', e) }
    finally { setLoading(false) }
  }, [])

  const handleSaveRole = useCallback(async (roleId: string, editForm: EditRoleForm) => {
    try {
      await fetch(`/api/roles/${roleId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm) })
      await loadRolesConfig()
    } catch (e) { console.error('保存失败:', e) }
  }, [loadRolesConfig])

  const handleCreateRole = useCallback(async (form: CustomRoleConfig) => {
    const roleId = form.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    if (!roleId) return
    try {
      await fetch(`/api/roles/${roleId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      await loadRolesConfig()
    } catch (e) { console.error('创建失败:', e) }
  }, [loadRolesConfig])

  const handleDeleteRole = useCallback(async (roleId: string) => {
    try { await fetch(`/api/roles/${roleId}`, { method: 'DELETE' }); await loadRolesConfig() }
    catch (e) { console.error('删除失败:', e) }
  }, [loadRolesConfig])

  const handleGenerateSkill = useCallback(async (prompt: string): Promise<GenerateSkillResult> => {
    const res = await fetch('/api/roles/skills/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: prompt, api_key: localStorage.getItem(STORAGE_KEYS.API_KEY) || undefined, base_url: localStorage.getItem(STORAGE_KEYS.BASE_URL) || undefined }),
    })
    const data = await res.json()
    if (data.success && data.data) return data.data
    throw new Error(data.error || 'AI生成失败')
  }, [])

  const handleImportSkill = useCallback(async (form: ImportSkillForm): Promise<string | null> => {
    const id = form.id.trim()
    if (!id) return '请输入技能ID'
    try {
      const res = await fetch(`/api/roles/skills/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json()
      if (data.success) { await loadRolesConfig(); return null }
      return data.error || '导入失败'
    } catch (e) { return '导入失败' }
  }, [loadRolesConfig])

  const handleDeleteSkill = useCallback(async (skillId: string) => {
    try { await fetch(`/api/roles/skills/${skillId}`, { method: 'DELETE' }); await loadRolesConfig() }
    catch (e) { console.error('删除失败:', e) }
  }, [loadRolesConfig])

  const handleImportTool = useCallback(async (form: ImportToolForm): Promise<string | null> => {
    const id = form.id.trim()
    if (!id) return '请输入工具ID'
    try {
      const res = await fetch(`/api/roles/tools/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json()
      if (data.success) { await loadRolesConfig(); return null }
      return data.error || '导入失败'
    } catch (e) { return '导入失败' }
  }, [loadRolesConfig])

  const handleDeleteTool = useCallback(async (toolId: string) => {
    try { await fetch(`/api/roles/tools/${toolId}`, { method: 'DELETE' }); await loadRolesConfig() }
    catch (e) { console.error('删除失败:', e) }
  }, [loadRolesConfig])

  return {
    roles, customRoles, tools, skills, loading,
    loadRolesConfig, handleSaveRole, handleCreateRole, handleDeleteRole,
    handleImportSkill, handleDeleteSkill, handleGenerateSkill,
    handleImportTool, handleDeleteTool,
  }
}
