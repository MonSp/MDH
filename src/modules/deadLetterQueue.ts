export interface DeadLetterMessage {
  messageId: string
  topic: string
  payload: unknown
  error: string
  retryCount: number
  maxRetries: number
  timestamp: number
}

export class DeadLetterQueue {
  private queue: DeadLetterMessage[] = []
  private threshold = 100
  private onThresholdExceeded: ((count: number) => void) | null = null

  enqueue(message: DeadLetterMessage): void {
    this.queue.push(message)
    if (this.queue.length > this.threshold && this.onThresholdExceeded) {
      this.onThresholdExceeded(this.queue.length)
    }
  }

  dequeue(): DeadLetterMessage | null {
    return this.queue.shift() ?? null
  }

  peek(): DeadLetterMessage | null {
    return this.queue.length > 0 ? this.queue[0] : null
  }

  size(): number {
    return this.queue.length
  }

  getAll(): DeadLetterMessage[] {
    return [...this.queue]
  }

  clear(): void {
    this.queue = []
  }

  setThreshold(threshold: number): void {
    this.threshold = threshold
  }

  setOnThresholdExceeded(callback: (count: number) => void): void {
    this.onThresholdExceeded = callback
  }
}
