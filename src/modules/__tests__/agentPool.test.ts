import { describe, it, expect, beforeEach } from 'vitest'
import { AgentPool } from '../agentPool'

describe('AgentPool', () => {
  let pool: AgentPool

  beforeEach(() => {
    pool = new AgentPool()
  })

  describe('createTeam', () => {
    it('should create agents from template', () => {
      const agents = pool.createTeam({
        name: 'dev-team',
        roles: [
          { role: 'executor', count: 2 },
          { role: 'reviewer', count: 1 },
        ],
      })

      expect(agents).toHaveLength(3)
      expect(agents.filter(a => a.role === 'executor')).toHaveLength(2)
      expect(agents.filter(a => a.role === 'reviewer')).toHaveLength(1)
    })

    it('should set all created agents to idle status', () => {
      const agents = pool.createTeam({
        name: 'test',
        roles: [{ role: 'dev', count: 3 }],
      })

      for (const agent of agents) {
        expect(agent.status).toBe('idle')
        expect(agent.useCount).toBe(0)
        expect(agent.errorCount).toBe(0)
      }
    })

    it('should generate unique instanceIds', () => {
      const agents = pool.createTeam({
        name: 'test',
        roles: [{ role: 'dev', count: 5 }],
      })

      const ids = new Set(agents.map(a => a.instanceId))
      expect(ids.size).toBe(5)
    })
  })

  describe('getAgentByRole', () => {
    it('should return agent matching role', () => {
      pool.createTeam({
        name: 'test',
        roles: [{ role: 'executor', count: 2 }],
      })

      const agent = pool.getAgentByRole('executor')
      expect(agent).not.toBeNull()
      expect(agent!.role).toBe('executor')
    })

    it('should return null for non-existent role', () => {
      pool.createTeam({
        name: 'test',
        roles: [{ role: 'executor', count: 1 }],
      })

      expect(pool.getAgentByRole('reviewer')).toBeNull()
    })

    it('should round-robin through agents of same role', () => {
      pool.createTeam({
        name: 'test',
        roles: [{ role: 'executor', count: 3 }],
      })

      const first = pool.getAgentByRole('executor')
      const second = pool.getAgentByRole('executor')
      const third = pool.getAgentByRole('executor')
      const fourth = pool.getAgentByRole('executor')

      expect(first!.instanceId).not.toBe(second!.instanceId)
      expect(second!.instanceId).not.toBe(third!.instanceId)
      // Fourth should wrap around to first
      expect(fourth!.instanceId).toBe(first!.instanceId)
    })

    it('should mark returned agent as busy and increment useCount', () => {
      pool.createTeam({
        name: 'test',
        roles: [{ role: 'executor', count: 1 }],
      })

      const agent = pool.getAgentByRole('executor')
      expect(agent!.status).toBe('busy')
      expect(agent!.useCount).toBe(1)
    })

    it('should skip unhealthy agents', () => {
      const agents = pool.createTeam({
        name: 'test',
        roles: [{ role: 'executor', count: 2 }],
      })

      pool.markUnhealthy(agents[0].instanceId)

      const agent = pool.getAgentByRole('executor')
      expect(agent!.instanceId).toBe(agents[1].instanceId)
    })
  })

  describe('getAllAgents', () => {
    it('should return all agents', () => {
      pool.createTeam({
        name: 'test',
        roles: [
          { role: 'a', count: 2 },
          { role: 'b', count: 3 },
        ],
      })

      expect(pool.getAllAgents()).toHaveLength(5)
    })

    it('should return empty array when no agents', () => {
      expect(pool.getAllAgents()).toHaveLength(0)
    })
  })

  describe('getPoolStatus', () => {
    it('should return correct status counts', () => {
      const agents = pool.createTeam({
        name: 'test',
        roles: [
          { role: 'executor', count: 2 },
          { role: 'reviewer', count: 1 },
        ],
      })

      pool.getAgentByRole('executor')
      pool.markUnhealthy(agents[2].instanceId)

      const status = pool.getPoolStatus()
      expect(status.total).toBe(3)
      expect(status.idle).toBe(1)
      expect(status.busy).toBe(1)
      expect(status.unhealthy).toBe(1)
      expect(status.roles.executor).toBe(2)
      expect(status.roles.reviewer).toBe(1)
    })

    it('should return zero counts for empty pool', () => {
      const status = pool.getPoolStatus()
      expect(status.total).toBe(0)
      expect(status.idle).toBe(0)
      expect(status.busy).toBe(0)
      expect(status.unhealthy).toBe(0)
      expect(status.offline).toBe(0)
    })
  })

  describe('markUnhealthy', () => {
    it('should mark agent as unhealthy', () => {
      const agents = pool.createTeam({
        name: 'test',
        roles: [{ role: 'executor', count: 1 }],
      })

      const result = pool.markUnhealthy(agents[0].instanceId)
      expect(result).toBe(true)
      expect(pool.getAllAgents()[0].status).toBe('unhealthy')
      expect(pool.getAllAgents()[0].errorCount).toBe(1)
    })

    it('should return false for non-existent agent', () => {
      expect(pool.markUnhealthy('non-existent')).toBe(false)
    })
  })

  describe('scaleUp', () => {
    it('should add agents to pool', () => {
      pool.createTeam({ name: 'test', roles: [{ role: 'executor', count: 1 }] })
      const added = pool.scaleUp('executor', 2)

      expect(added).toHaveLength(2)
      expect(pool.getPoolStatus().total).toBe(3)
    })
  })

  describe('scaleDown', () => {
    it('should remove idle agents', () => {
      pool.createTeam({ name: 'test', roles: [{ role: 'executor', count: 3 }] })
      pool.getAgentByRole('executor') // mark one as busy

      const removed = pool.scaleDown('executor', 2)
      expect(removed).toHaveLength(2)
      expect(pool.getPoolStatus().total).toBe(1)
    })

    it('should not remove busy or unhealthy agents', () => {
      pool.createTeam({ name: 'test', roles: [{ role: 'executor', count: 3 }] })
      pool.getAgentByRole('executor')

      const removed = pool.scaleDown('executor', 5)
      expect(removed).toHaveLength(2) // only the 2 idle ones
    })

    it('should return empty if no idle agents', () => {
      pool.createTeam({ name: 'test', roles: [{ role: 'executor', count: 1 }] })
      pool.getAgentByRole('executor')

      const removed = pool.scaleDown('executor', 1)
      expect(removed).toHaveLength(0)
    })
  })

  describe('clear', () => {
    it('should remove all agents', () => {
      pool.createTeam({
        name: 'test',
        roles: [
          { role: 'a', count: 2 },
          { role: 'b', count: 3 },
        ],
      })

      pool.clear()
      expect(pool.getAllAgents()).toHaveLength(0)
      expect(pool.getPoolStatus().total).toBe(0)
    })
  })
})
