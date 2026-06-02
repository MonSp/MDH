import type { PackageResult } from './agentTypes'

const API_BASE = '/api/skills/package'

/** 打包技能增量并生成发布产物 */
export async function packageSkills(params: {
  base_skill_path: string
  incremental_path: string
  project_id: string
  skill_name: string
}): Promise<PackageResult> {
  const res = await fetch(`${API_BASE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error)
  return data.data
}

/** 预览打包差异 */
export async function previewPackage(baseSkillPath: string, incrementalPath: string): Promise<{
  structure_tree: string
  diff_summary: Record<string, any>
  new_rules: Record<string, any>[]
  modified_files: string[]
}> {
  const res = await fetch(`${API_BASE}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_skill_path: baseSkillPath, incremental_path: incrementalPath }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error)
  return data.data
}
