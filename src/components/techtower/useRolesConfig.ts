/**
 * useRolesConfig — 角色/技能/工具配置管理 hook
 *
 * 从 SidePanel 提取的配置加载和 CRUD 逻辑。
 */

import { useState, useCallback } from 'react'
import { STORAGE_KEYS } from '../../constants'
import { apiGet, apiPost, apiPut, apiDelete } from '../../services/apiFetch'
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
      const data = await apiGet<{ base_roles?: Record<string, RoleConfig>; custom_roles?: Record<string, CustomRoleConfig>; tools?: Record<string, ToolInfo> }>('/api/roles/config')
      if (data) {
        setRoles(data.base_roles || {})
        setCustomRoles(data.custom_roles || {})
        setTools(data.tools || {})
      }
      try {
        const skillsData = await apiGet<{ skills?: any[]; data?: { skills?: any[] } }>('/api/skills/list')
        const packs = skillsData?.data?.skills || skillsData?.skills || []
        const skillsMap: Record<string, SkillInfo> = {}
        for (const pack of packs) {
          skillsMap[pack.name] = { name: pack.name, description: pack.description || '', methodology: pack.methodology || '', category: pack.category || '', required_tools: pack.tools || [] }
        }
        setSkills(skillsMap)
      } catch (e) { console.error('加载技能包失败:', e) }
    } catch (e) { console.error('加载配置失败:', e) }
    finally { setLoading(false) }
  }, [])

  const handleSaveRole = useCallback(async (roleId: string, editForm: EditRoleForm) => {
    try {
      await apiPut(`/api/roles/${roleId}`, editForm)
      await loadRolesConfig()
    } catch (e) { console.error('保存失败:', e) }
  }, [loadRolesConfig])

  const handleCreateRole = useCallback(async (form: CustomRoleConfig) => {
    const roleId = form.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    if (!roleId) return
    try {
      await apiPost(`/api/roles/${roleId}`, form)
      await loadRolesConfig()
    } catch (e) { console.error('创建失败:', e) }
  }, [loadRolesConfig])

  const handleDeleteRole = useCallback(async (roleId: string) => {
    try { await apiDelete(`/api/roles/${roleId}`); await loadRolesConfig() }
    catch (e) { console.error('删除失败:', e) }
  }, [loadRolesConfig])

  const handleGenerateSkill = useCallback(async (prompt: string): Promise<GenerateSkillResult> => {
    const data = await apiPost<{ success?: boolean; data?: GenerateSkillResult; error?: string }>('/api/roles/skills/generate', {
      description: prompt, api_key: localStorage.getItem(STORAGE_KEYS.API_KEY) || undefined, base_url: localStorage.getItem(STORAGE_KEYS.BASE_URL) || undefined,
    })
    if (data?.data) return data.data
    throw new Error(data?.error || 'AI生成失败')
  }, [])

  const handleImportSkill = useCallback(async (form: ImportSkillForm): Promise<string | null> => {
    const id = form.id.trim()
    if (!id) return '请输入技能ID'
    try {
      await apiPost(`/api/roles/skills/${id}`, form)
      await loadRolesConfig()
      return null
    } catch (e: any) { return e.message || '导入失败' }
  }, [loadRolesConfig])

  const handleDeleteSkill = useCallback(async (skillId: string) => {
    try { await apiDelete(`/api/roles/skills/${skillId}`); await loadRolesConfig() }
    catch (e) { console.error('删除失败:', e) }
  }, [loadRolesConfig])

  const handleImportTool = useCallback(async (form: ImportToolForm): Promise<string | null> => {
    const id = form.id.trim()
    if (!id) return '请输入工具ID'
    try {
      await apiPost(`/api/roles/tools/${id}`, form)
      await loadRolesConfig()
      return null
    } catch (e: any) { return e.message || '导入失败' }
  }, [loadRolesConfig])

  const handleDeleteTool = useCallback(async (toolId: string) => {
    try { await apiDelete(`/api/roles/tools/${toolId}`); await loadRolesConfig() }
    catch (e) { console.error('删除失败:', e) }
  }, [loadRolesConfig])

  return {
    roles, customRoles, tools, skills, loading,
    loadRolesConfig, handleSaveRole, handleCreateRole, handleDeleteRole,
    handleImportSkill, handleDeleteSkill, handleGenerateSkill,
    handleImportTool, handleDeleteTool,
  }
}
