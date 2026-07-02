import { describe, it, expect } from 'vitest'
import { extractSkillParams, stepsToServerFormat, buildSkillPrompt, formatStepArgs, getParamLabel } from '../skillParser'

describe('skillParser', () => {
  describe('extractSkillParams', () => {
    it('should extract parameterizable values', () => {
      const steps = [
        { command: 'navigate', payload: { url: 'https://example.com' } },
        { command: 'search', payload: { query: 'test search' } },
      ]
      const params = extractSkillParams(steps)
      expect(params.length).toBeGreaterThanOrEqual(2)
      expect(params.find(p => p.key === 'url')).toBeDefined()
      expect(params.find(p => p.key === 'query')).toBeDefined()
    })

    it('should skip fixed commands', () => {
      const steps = [
        { command: 'wait', payload: { duration: 5000 } },
        { command: 'get_screenshot', payload: {} },
        { command: 'navigate', payload: { url: 'https://example.com' } },
      ]
      const params = extractSkillParams(steps)
      expect(params.every(p => p.key !== 'duration')).toBe(true)
    })

    it('should skip short strings and small numbers', () => {
      const steps = [
        { command: 'click', payload: { x: 5, y: 10, label: 'a', count: 3 } },
      ]
      const params = extractSkillParams(steps)
      // x/y/count are numbers <= 100, label is string length 1
      expect(params).toHaveLength(0)
    })

    it('should deduplicate keys', () => {
      const steps = [
        { command: 'navigate', payload: { url: 'https://a.com' } },
        { command: 'navigate', payload: { url: 'https://b.com' } },
      ]
      const params = extractSkillParams(steps)
      expect(params.filter(p => p.key === 'url')).toHaveLength(1)
    })
  })

  describe('stepsToServerFormat', () => {
    it('should convert steps to server format', () => {
      const steps = [
        { command: 'navigate', payload: { url: 'https://example.com' } },
        { name: 'click', args: { button_label: 'Submit' } },
      ]
      const result = stepsToServerFormat(steps)
      expect(result).toHaveLength(2)
      expect(result[0].command).toBe('navigate')
      expect(result[1].command).toBe('click')
    })

    it('should filter out steps without command or name', () => {
      const steps = [
        { payload: { url: 'test' } },
        { command: 'navigate', payload: { url: 'test' } },
      ]
      const result = stepsToServerFormat(steps)
      expect(result).toHaveLength(1)
    })
  })

  describe('buildSkillPrompt', () => {
    it('should build prompt with skill name', () => {
      expect(buildSkillPrompt('my-skill')).toBe('请使用技能 "my-skill" 帮我执行任务')
    })
  })

  describe('formatStepArgs', () => {
    it('should format args as key=value', () => {
      expect(formatStepArgs({ a: 1, b: 'test' })).toBe('a=1, b=test')
    })

    it('should truncate long strings', () => {
      const long = 'a'.repeat(50)
      const result = formatStepArgs({ key: long })
      expect(result).toContain('...')
      expect(result.length).toBeLessThan(long.length + 20)
    })
  })

  describe('getParamLabel', () => {
    it('should return known labels', () => {
      expect(getParamLabel('url')).toBe('URL')
      expect(getParamLabel('query')).toBe('搜索关键词')
      expect(getParamLabel('username')).toBe('用户名')
    })

    it('should return key for unknown labels', () => {
      expect(getParamLabel('unknown')).toBe('unknown')
    })
  })
})
