import { describe, it, expect } from 'vitest'
import { EarsValidator } from '../earsValidator'

describe('EarsValidator', () => {
  const validator = new EarsValidator()

  describe('validate', () => {
    it('should accept a valid EARS sentence', () => {
      const result = validator.validate('WHEN the user clicks submit, the system SHALL validate the form')
      expect(result.valid).toBe(true)
      expect(result.violations).toHaveLength(0)
    })

    it('should accept IF...SHALL pattern', () => {
      const result = validator.validate('IF the login fails, the system SHALL display an error message')
      expect(result.valid).toBe(true)
    })

    it('should accept Chinese trigger and response words', () => {
      const result = validator.validate('当用户点击提交时，系统应当验证表单')
      expect(result.valid).toBe(true)
    })

    it('should reject empty sentence', () => {
      const result = validator.validate('')
      expect(result.valid).toBe(false)
      expect(result.violations).toHaveLength(1)
      expect(result.violations[0].rule).toBe('non_empty')
    })

    it('should reject whitespace-only sentence', () => {
      const result = validator.validate('   ')
      expect(result.valid).toBe(false)
      expect(result.violations[0].rule).toBe('non_empty')
    })

    it('should reject sentence without trigger word', () => {
      const result = validator.validate('the system SHALL validate the form')
      expect(result.valid).toBe(false)
      expect(result.violations.some(v => v.rule === 'trigger_word')).toBe(true)
    })

    it('should reject sentence without response word', () => {
      const result = validator.validate('WHEN the user clicks submit, the system validates the form')
      expect(result.valid).toBe(false)
      expect(result.violations.some(v => v.rule === 'response_word')).toBe(true)
    })

    it('should reject when trigger appears after response', () => {
      const result = validator.validate('the system SHALL validate WHEN the user clicks')
      expect(result.valid).toBe(false)
      expect(result.violations.some(v => v.rule === 'trigger_before_response')).toBe(true)
    })

    it('should reject vague words', () => {
      const result = validator.validate('WHEN the user clicks, the system SHALL respond etc')
      expect(result.valid).toBe(false)
      expect(result.violations.some(v => v.rule === 'no_vague_words')).toBe(true)
    })

    it('should detect multiple vague words', () => {
      const result = validator.validate('WHEN the user acts, the system SHALL handle it somehow maybe')
      expect(result.valid).toBe(false)
      const vagueViolation = result.violations.find(v => v.rule === 'no_vague_words')
      expect(vagueViolation).toBeDefined()
      expect(vagueViolation!.message).toContain('somehow')
      expect(vagueViolation!.message).toContain('maybe')
    })

    it('should report multiple violations at once', () => {
      // no trigger, no response, vague word
      const result = validator.validate('the system handles things etc')
      expect(result.valid).toBe(false)
      expect(result.violations.length).toBeGreaterThanOrEqual(2)
    })

    it('should validate lowercase if/when', () => {
      const result = validator.validate('when the user clicks, the system shall respond')
      expect(result.valid).toBe(true)
    })
  })

  describe('validateBatch', () => {
    it('should validate multiple sentences', () => {
      const results = validator.validateBatch([
        'WHEN the user submits, the system SHALL save the data',
        'no trigger or response here',
        'IF the timer expires, the system SHALL send a notification',
      ])
      expect(results).toHaveLength(3)
      expect(results[0].valid).toBe(true)
      expect(results[1].valid).toBe(false)
      expect(results[2].valid).toBe(true)
    })

    it('should return empty array for empty input', () => {
      const results = validator.validateBatch([])
      expect(results).toHaveLength(0)
    })

    it('should report all failures in a batch', () => {
      const results = validator.validateBatch([
        'bad sentence',
        'another bad one',
      ])
      expect(results.every(r => !r.valid)).toBe(true)
    })
  })
})
