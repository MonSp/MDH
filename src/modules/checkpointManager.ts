export interface Checkpoint {
  id: string
  taskId: string
  stepIndex: number
  stateSnapshot: Record<string, unknown>
  createdAt: number
}

export class CheckpointManager {
  private checkpoints: Map<string, Checkpoint[]>
  private maxCheckpointsPerTask: number

  constructor(maxCheckpointsPerTask?: number) {
    this.checkpoints = new Map()
    this.maxCheckpointsPerTask = maxCheckpointsPerTask ?? 10
  }

  saveCheckpoint(
    taskId: string,
    stepIndex: number,
    state: Record<string, unknown>
  ): Checkpoint {
    const checkpoint: Checkpoint = {
      id: crypto.randomUUID(),
      taskId,
      stepIndex,
      stateSnapshot: structuredClone(state),
      createdAt: Date.now(),
    }

    const existing = this.checkpoints.get(taskId) ?? []
    existing.push(checkpoint)

    if (existing.length > this.maxCheckpointsPerTask) {
      const sorted = existing.sort((a, b) => a.stepIndex - b.stepIndex)
      const trimmed = sorted.slice(sorted.length - this.maxCheckpointsPerTask)
      this.checkpoints.set(taskId, trimmed)
    } else {
      this.checkpoints.set(taskId, existing)
    }

    return checkpoint
  }

  getLatestCheckpoint(taskId: string): Checkpoint | null {
    const taskCheckpoints = this.checkpoints.get(taskId)
    if (!taskCheckpoints || taskCheckpoints.length === 0) {
      return null
    }

    return taskCheckpoints.reduce((latest, current) =>
      current.stepIndex > latest.stepIndex ? current : latest
    )
  }

  getCheckpoint(checkpointId: string): Checkpoint | null {
    for (const taskCheckpoints of this.checkpoints.values()) {
      const found = taskCheckpoints.find(cp => cp.id === checkpointId)
      if (found) {
        return found
      }
    }
    return null
  }

  getCheckpointsForTask(taskId: string): Checkpoint[] {
    const taskCheckpoints = this.checkpoints.get(taskId)
    if (!taskCheckpoints) {
      return []
    }
    return [...taskCheckpoints].sort((a, b) => a.stepIndex - b.stepIndex)
  }

  restoreCheckpoint(checkpointId: string): Record<string, unknown> | null {
    const checkpoint = this.getCheckpoint(checkpointId)
    if (!checkpoint) {
      return null
    }
    return structuredClone(checkpoint.stateSnapshot)
  }

  deleteCheckpoint(checkpointId: string): boolean {
    for (const [taskId, taskCheckpoints] of this.checkpoints) {
      const index = taskCheckpoints.findIndex(cp => cp.id === checkpointId)
      if (index !== -1) {
        taskCheckpoints.splice(index, 1)
        if (taskCheckpoints.length === 0) {
          this.checkpoints.delete(taskId)
        }
        return true
      }
    }
    return false
  }

  deleteCheckpointsForTask(taskId: string): number {
    const taskCheckpoints = this.checkpoints.get(taskId)
    if (!taskCheckpoints) {
      return 0
    }
    const count = taskCheckpoints.length
    this.checkpoints.delete(taskId)
    return count
  }

  clear(): void {
    this.checkpoints.clear()
  }
}
