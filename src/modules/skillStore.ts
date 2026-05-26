import { reactive } from 'vue'

export interface SkillParam {
  key: string
  label: string
  defaultValue: string
}

export interface SkillInfo {
  name: string
  description: string
  dir: string
}

export const skillStore = reactive<{ list: SkillInfo[] }>({
  list: [],
})

export function setSkills(skills: SkillInfo[]): void {
  skillStore.list = skills
}
