import { describe, it, expect } from 'vitest'
import { skillStore, setSkills, subscribe } from '../skillStore'

describe('skillStore', () => {
  it('should initialize with empty list', () => {
    expect(skillStore.list).toEqual([])
  })

  it('should set skills and notify subscribers', () => {
    const received: any[] = []
    const unsub = subscribe(skills => received.push(skills))

    setSkills([
      { name: 'skill-a', description: 'Test A', dir: '/a' },
      { name: 'skill-b', description: 'Test B', dir: '/b' },
    ])

    expect(skillStore.list).toHaveLength(2)
    expect(skillStore.list[0].name).toBe('skill-a')
    expect(received).toHaveLength(1)

    unsub()
  })

  it('should unsubscribe correctly', () => {
    const received: any[] = []
    const unsub = subscribe(skills => received.push(skills))

    setSkills([{ name: 'x', description: 'X', dir: '/x' }])
    expect(received).toHaveLength(1)

    unsub()
    setSkills([{ name: 'y', description: 'Y', dir: '/y' }])
    expect(received).toHaveLength(1) // not called again
  })
})
