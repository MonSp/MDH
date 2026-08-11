/**
 * Gate Manager
 * Manages quality gates for spec validation. Ships with built-in
 * EARS and SpecTree gates; supports registering custom gates.
 */

import { EarsValidator } from './earsValidator'
import type { EarsValidationResult } from './earsValidator'
import { SpecTreeValidator } from './specTreeValidator'
import type { SpecTree, ValidationResult } from './specTreeValidator'

export type GateResult = {
  gateName: string
  passed: boolean
  details: EarsValidationResult | ValidationResult | Record<string, unknown>
  timestamp: number
}

export type GateFn = (input: unknown) => { passed: boolean; details: unknown }

export class GateManager {
  private gates = new Map<string, GateFn>()
  private ledger: GateResult[] = []
  private earsValidator: EarsValidator
  private specTreeValidator: SpecTreeValidator

  constructor() {
    this.earsValidator = new EarsValidator()
    this.specTreeValidator = new SpecTreeValidator()

    // Built-in: EARS gate
    this.gates.set('ears', (input: unknown) => {
      const sentences = input as string[]
      const results = this.earsValidator.validateBatch(sentences)
      const allValid = results.every(r => r.valid)
      return { passed: allValid, details: results }
    })

    // Built-in: SpecTree gate
    this.gates.set('specTree', (input: unknown) => {
      const tree = input as SpecTree
      const result = this.specTreeValidator.validate(tree)
      return { passed: result.valid, details: result }
    })
  }

  /**
   * Register a custom gate.
   */
  registerGate(name: string, fn: GateFn): void {
    this.gates.set(name, fn)
  }

  /**
   * Run a named gate with the given input.
   */
  runGate(name: string, input: unknown): GateResult {
    const gate = this.gates.get(name)
    if (!gate) {
      const result: GateResult = {
        gateName: name,
        passed: false,
        details: { error: `Gate "${name}" not found` },
        timestamp: Date.now(),
      }
      this.ledger.push(result)
      return result
    }

    const { passed, details } = gate(input)
    const result: GateResult = {
      gateName: name,
      passed,
      details: details as any,
      timestamp: Date.now(),
    }
    this.ledger.push(result)
    return result
  }

  /**
   * Get the full ledger of gate run results.
   */
  getLedger(): GateResult[] {
    return [...this.ledger]
  }

  /**
   * Get a summary of gate run results.
   */
  getSummary(): { total: number; passed: number; failed: number; byGate: Record<string, { passed: number; failed: number }> } {
    const byGate: Record<string, { passed: number; failed: number }> = {}
    let passed = 0
    let failed = 0

    for (const entry of this.ledger) {
      if (!byGate[entry.gateName]) {
        byGate[entry.gateName] = { passed: 0, failed: 0 }
      }
      if (entry.passed) {
        passed++
        byGate[entry.gateName].passed++
      } else {
        failed++
        byGate[entry.gateName].failed++
      }
    }

    return { total: this.ledger.length, passed, failed, byGate }
  }
}
