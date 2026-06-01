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

type SkillSubscriber = (skills: SkillInfo[]) => void

const subscribers: SkillSubscriber[] = []

export const skillStore: { list: SkillInfo[] } = {
  list: [],
}

export function setSkills(skills: SkillInfo[]): void {
  skillStore.list = skills
  for (const cb of subscribers) {
    cb(skills)
  }
}

export function subscribe(callback: SkillSubscriber): () => void {
  subscribers.push(callback)
  return () => {
    const idx = subscribers.indexOf(callback)
    if (idx !== -1) subscribers.splice(idx, 1)
  }
}
