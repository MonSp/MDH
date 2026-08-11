export interface DiscussionResultLocal {
  agentId: string
  agentName: string
  role: string
  content: string
  stance: string
  confidence: number
  round: number
  duration: number
}

export type AgentCallFn = (agentId: string, prompt: string) => Promise<string>

export class ParallelDiscussionManagerLocal {
  private maxConcurrent: number
  private timeout: number

  constructor(maxConcurrent = 5, timeout = 30_000) {
    this.maxConcurrent = maxConcurrent
    this.timeout = timeout
  }

  async runDiscussion(
    topic: string,
    agents: Array<{ agentId: string; agentName: string; role: string }>,
    agentCall: AgentCallFn,
    maxRounds = 3,
    onMessage?: (result: DiscussionResultLocal) => void
  ): Promise<DiscussionResultLocal[]> {
    const allResults: DiscussionResultLocal[] = []

    for (let round = 1; round <= maxRounds; round++) {
      const roundResults = await this.runRound(
        topic,
        agents,
        agentCall,
        round,
        allResults,
        onMessage
      )
      allResults.push(...roundResults)

      if (this.evaluateConvergence(roundResults)) {
        break
      }
    }

    return allResults
  }

  summarizeDiscussion(results: DiscussionResultLocal[]): string {
    if (results.length === 0) return 'No discussion results.'

    const byRound = new Map<number, DiscussionResultLocal[]>()
    for (const r of results) {
      const arr = byRound.get(r.round) ?? []
      arr.push(r)
      byRound.set(r.round, arr)
    }

    const lines: string[] = []
    lines.push(`Discussion Summary (${results.length} responses across ${byRound.size} round(s))`)
    lines.push('')

    for (const [round, roundResults] of [...byRound.entries()].sort((a, b) => a[0] - b[0])) {
      lines.push(`--- Round ${round} ---`)
      for (const r of roundResults) {
        lines.push(`[${r.role}/${r.agentName}] STANCE: ${r.stance} (confidence: ${r.confidence})`)
        lines.push(`  ${r.content.substring(0, 200)}`)
      }
      lines.push('')
    }

    const stances = results.map(r => r.stance)
    const stanceCounts = new Map<string, number>()
    for (const s of stances) {
      stanceCounts.set(s, (stanceCounts.get(s) ?? 0) + 1)
    }

    lines.push('Stance Distribution:')
    for (const [stance, count] of stanceCounts) {
      lines.push(`  ${stance}: ${count}`)
    }

    return lines.join('\n')
  }

  private async runRound(
    topic: string,
    agents: Array<{ agentId: string; agentName: string; role: string }>,
    agentCall: AgentCallFn,
    round: number,
    previousResults: DiscussionResultLocal[],
    onMessage?: (result: DiscussionResultLocal) => void
  ): Promise<DiscussionResultLocal[]> {
    const batches = this.createBatches(agents, this.maxConcurrent)
    const results: DiscussionResultLocal[] = []

    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(async agent => {
          const prompt = this.buildPrompt(topic, agent, round, previousResults)
          const start = Date.now()

          try {
            const response = await Promise.race([
              agentCall(agent.agentId, prompt),
              this.timeoutPromise(),
            ])

            const duration = Date.now() - start
            const parsed = this.parseResponse(response)

            const result: DiscussionResultLocal = {
              agentId: agent.agentId,
              agentName: agent.agentName,
              role: agent.role,
              content: parsed.content,
              stance: parsed.stance,
              confidence: parsed.confidence,
              round,
              duration,
            }

            onMessage?.(result)
            return result
          } catch {
            const duration = Date.now() - start
            const result: DiscussionResultLocal = {
              agentId: agent.agentId,
              agentName: agent.agentName,
              role: agent.role,
              content: '[timeout or error]',
              stance: 'neutral',
              confidence: 0,
              round,
              duration,
            }
            onMessage?.(result)
            return result
          }
        })
      )

      results.push(...batchResults)
    }

    return results
  }

  private createBatches<T>(items: T[], size: number): T[][] {
    const batches: T[][] = []
    for (let i = 0; i < items.length; i += size) {
      batches.push(items.slice(i, i + size))
    }
    return batches
  }

  private buildPrompt(
    topic: string,
    agent: { agentId: string; agentName: string; role: string },
    round: number,
    previousResults: DiscussionResultLocal[]
  ): string {
    let prompt = `Discussion Topic: ${topic}\nRound: ${round}\nYour role: ${agent.role}\n\n`

    if (previousResults.length > 0) {
      prompt += 'Previous responses:\n'
      for (const prev of previousResults) {
        prompt += `- [${prev.role}/${prev.agentName}] ${prev.content.substring(0, 100)}\n`
      }
      prompt += '\n'
    }

    prompt += 'Please respond with your analysis. Include:\n'
    prompt += '[STANCE: support|oppose|neutral|suggest]\n'
    prompt += '[CONFIDENCE: 0-100]\n'
    prompt += 'Then your detailed response.'

    return prompt
  }

  private parseResponse(response: string): {
    content: string
    stance: string
    confidence: number
  } {
    const stanceMatch = response.match(/\[STANCE:\s*(\w+)\]/i)
    const confidenceMatch = response.match(/\[CONFIDENCE:\s*(\d+)\]/i)

    const stance = stanceMatch?.[1]?.toLowerCase() ?? 'neutral'
    const confidence = confidenceMatch ? Math.min(100, Math.max(0, parseInt(confidenceMatch[1], 10))) : 50

    const content = response
      .replace(/\[STANCE:\s*\w+\]/gi, '')
      .replace(/\[CONFIDENCE:\s*\d+\]/gi, '')
      .trim()

    return { content, stance, confidence }
  }

  private evaluateConvergence(roundResults: DiscussionResultLocal[]): boolean {
    if (roundResults.length < 2) return false

    const stances = roundResults.map(r => r.stance)
    const uniqueStances = new Set(stances)

    // Converged if all agents agree
    if (uniqueStances.size === 1) return true

    // Converged if average confidence is high enough
    const avgConfidence =
      roundResults.reduce((sum, r) => sum + r.confidence, 0) / roundResults.length
    if (avgConfidence >= 85) return true

    return false
  }

  private timeoutPromise(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Agent call timeout')), this.timeout)
    })
  }
}
