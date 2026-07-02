import { describe, it, expect } from 'vitest'
import * as modules from '../index'

describe('modules/index', () => {
  it('should export core modules', () => {
    expect(modules).toBeDefined()
    // Check some key exports exist
    expect(Object.keys(modules).length).toBeGreaterThan(0)
  })
})
