import { describe, it, expect } from 'vitest'
import { listSkills, registerSkill, cloneSkill, getSkillVersions, getSkill } from '../skillRegistry'

describe('skillRegistry', () => {
  it('should export API functions', () => {
    expect(typeof listSkills).toBe('function')
    expect(typeof registerSkill).toBe('function')
    expect(typeof cloneSkill).toBe('function')
    expect(typeof getSkillVersions).toBe('function')
    expect(typeof getSkill).toBe('function')
  })
})
