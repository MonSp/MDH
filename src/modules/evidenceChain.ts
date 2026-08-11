/**
 * Evidence Chain
 * Tracks evidence items across stages of a workflow, maintaining
 * traceability and auditability.
 */

export interface Evidence {
  evidenceId: string
  traceId: string
  stage: string
  content: string
  source: string
  timestamp: number
}

export class EvidenceChain {
  private chain: Evidence[] = []

  /**
   * Add an evidence item to the chain.
   */
  addEvidence(evidence: Evidence): void {
    this.chain.push({ ...evidence })
  }

  /**
   * Get the full chain of evidence, optionally filtered by traceId.
   */
  getChain(traceId?: string): Evidence[] {
    if (traceId) {
      return this.chain.filter(e => e.traceId === traceId)
    }
    return [...this.chain]
  }

  /**
   * Get unique stages in the chain, optionally filtered by traceId.
   */
  getStages(traceId?: string): string[] {
    const items = traceId
      ? this.chain.filter(e => e.traceId === traceId)
      : this.chain
    return [...new Set(items.map(e => e.stage))]
  }

  /**
   * Check whether an evidence item with the given ID exists.
   */
  hasEvidence(evidenceId: string): boolean {
    return this.chain.some(e => e.evidenceId === evidenceId)
  }

  /**
   * Export the chain as a JSON string.
   */
  exportChain(traceId?: string): string {
    const items = traceId
      ? this.chain.filter(e => e.traceId === traceId)
      : this.chain
    return JSON.stringify(items)
  }

  /**
   * Clear all evidence from the chain.
   */
  clear(): void {
    this.chain = []
  }
}
