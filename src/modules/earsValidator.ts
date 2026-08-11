/**
 * EARS (Event-Driven Acceptance Requirements) Validator
 * Validates acceptance criteria sentences for proper EARS syntax.
 */

export interface EarsViolation {
  rule: string
  message: string
}

export interface EarsValidationResult {
  valid: boolean
  violations: EarsViolation[]
}

const TRIGGER_WORDS = [
  'WHEN', 'IF', 'when', 'if',
  '当', '当……时', '如果', '若',
]

const RESPONSE_WORDS = [
  'SHALL', 'shall',
  '应当', '应该', '必须', '需要', '会',
]

const VAGUE_WORDS = [
  'etc', 'and/or', 'as appropriate', 'as required',
  'if applicable', 'if necessary', 'somehow', 'maybe',
  'possibly', 'might', 'could be', 'should be',
  '适当', '合适', '等等', '相关',
]

export class EarsValidator {
  /**
   * Validate a single EARS sentence.
   */
  validate(sentence: string): EarsValidationResult {
    const violations: EarsViolation[] = []

    if (!sentence || sentence.trim().length === 0) {
      violations.push({
        rule: 'non_empty',
        message: 'Sentence must not be empty',
      })
      return { valid: false, violations }
    }

    // Rule 1: Must contain a trigger word
    const hasTrigger = TRIGGER_WORDS.some(w => sentence.includes(w))
    if (!hasTrigger) {
      violations.push({
        rule: 'trigger_word',
        message: 'Sentence must contain a trigger word (WHEN/IF or Chinese equivalents)',
      })
    }

    // Rule 2: Must contain a response word
    const hasResponse = RESPONSE_WORDS.some(w => sentence.includes(w))
    if (!hasResponse) {
      violations.push({
        rule: 'response_word',
        message: 'Sentence must contain a response word (SHALL or Chinese equivalents)',
      })
    }

    // Rule 3: Trigger must come before response
    if (hasTrigger && hasResponse) {
      const triggerIdx = this.findFirstIndex(sentence, TRIGGER_WORDS)
      const responseIdx = this.findFirstIndex(sentence, RESPONSE_WORDS)
      if (triggerIdx >= responseIdx) {
        violations.push({
          rule: 'trigger_before_response',
          message: 'Trigger word must appear before response word',
        })
      }
    }

    // Rule 4: No vague words
    const foundVague = VAGUE_WORDS.filter(w =>
      sentence.toLowerCase().includes(w.toLowerCase())
    )
    if (foundVague.length > 0) {
      violations.push({
        rule: 'no_vague_words',
        message: `Sentence contains vague words: ${foundVague.join(', ')}`,
      })
    }

    return { valid: violations.length === 0, violations }
  }

  /**
   * Validate multiple EARS sentences.
   */
  validateBatch(sentences: string[]): EarsValidationResult[] {
    return sentences.map(s => this.validate(s))
  }

  private findFirstIndex(sentence: string, words: string[]): number {
    let minIdx = Infinity
    for (const w of words) {
      const idx = sentence.indexOf(w)
      if (idx !== -1 && idx < minIdx) {
        minIdx = idx
      }
    }
    return minIdx
  }
}
