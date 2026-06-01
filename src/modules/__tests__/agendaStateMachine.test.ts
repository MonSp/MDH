import { AgendaStateMachine } from '../agendaStateMachine'
import type { AgendaEvent, AgendaPhase, AgendaSnapshot, StateTimeoutConfig } from '../agendaStateMachine'

describe('AgendaStateMachine', () => {
  let sm: AgendaStateMachine

  afterEach(() => {
    sm?.destroy()
    vi.restoreAllMocks()
  })

  describe('state transitions', () => {
    beforeEach(() => {
      sm = new AgendaStateMachine()
    })

    it('should start in idle phase', () => {
      expect(sm.getPhase()).toBe('idle')
    })

    it('idle → open_topic via openTopic()', () => {
      expect(sm.openTopic('test topic')).toBe(true)
      expect(sm.getPhase()).toBe('open_topic')
    })

    it('open_topic → discussion via startDiscussion()', () => {
      sm.openTopic('test')
      expect(sm.startDiscussion()).toBe(true)
      expect(sm.getPhase()).toBe('discussion')
    })

    it('discussion → proposal via propose()', () => {
      sm.openTopic('test')
      sm.startDiscussion()
      expect(sm.propose('prop-1')).toBe(true)
      expect(sm.getPhase()).toBe('proposal')
    })

    it('proposal → voting via startVoting()', () => {
      sm.openTopic('test')
      sm.startDiscussion()
      sm.propose('prop-1')
      expect(sm.startVoting()).toBe(true)
      expect(sm.getPhase()).toBe('voting')
    })

    it('voting → accepted via accept()', () => {
      sm.openTopic('test')
      sm.startDiscussion()
      sm.propose('prop-1')
      sm.startVoting()
      expect(sm.accept()).toBe(true)
      expect(sm.getPhase()).toBe('accepted')
    })

    it('accepted → closed via close()', () => {
      sm.openTopic('test')
      sm.startDiscussion()
      sm.propose('prop-1')
      sm.startVoting()
      sm.accept()
      expect(sm.close()).toBe(true)
      expect(sm.getPhase()).toBe('closed')
    })

    it('full normal path: idle → open_topic → discussion → proposal → voting → accepted → closed', () => {
      expect(sm.openTopic('topic')).toBe(true)
      expect(sm.startDiscussion()).toBe(true)
      expect(sm.propose('p1')).toBe(true)
      expect(sm.startVoting()).toBe(true)
      expect(sm.accept()).toBe(true)
      expect(sm.close()).toBe(true)
      expect(sm.getPhase()).toBe('closed')
    })

    it('should return false for invalid transition idle → voting', () => {
      expect(sm.startVoting()).toBe(false)
      expect(sm.getPhase()).toBe('idle')
    })

    it('should return false for invalid transition idle → discussion', () => {
      expect(sm.startDiscussion()).toBe(false)
      expect(sm.getPhase()).toBe('idle')
    })

    it('should return false for invalid transition idle → proposal', () => {
      expect(sm.propose('p1')).toBe(false)
      expect(sm.getPhase()).toBe('idle')
    })

    it('should return false for invalid transition idle → accepted', () => {
      expect(sm.accept()).toBe(false)
      expect(sm.getPhase()).toBe('idle')
    })

    it('should return false for invalid transition idle → closed', () => {
      expect(sm.close()).toBe(false)
      expect(sm.getPhase()).toBe('idle')
    })

    it('should record phase_change events in history', () => {
      sm.openTopic('t')
      const history = sm.getEventHistory()
      expect(history).toHaveLength(1)
      expect(history[0].type).toBe('phase_change')
      expect(history[0].from).toBe('idle')
      expect(history[0].to).toBe('open_topic')
    })

    it('should store topic on openTopic()', () => {
      sm.openTopic('my topic')
      const snapshot = sm.serialize()
      expect(snapshot.topic).toBe('my topic')
    })
  })

  describe('state timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('should emit state_timeout event when timeout expires', () => {
      const timeouts: StateTimeoutConfig = { discussion: 50 }
      sm = new AgendaStateMachine(timeouts)
      const events: AgendaEvent[] = []
      sm.addListener((e) => events.push(e))

      sm.openTopic('t')
      sm.startDiscussion()

      vi.advanceTimersByTime(60)
      sm.getPhase()

      const timeoutEvent = events.find((e) => e.type === 'state_timeout')
      expect(timeoutEvent).toBeDefined()
      expect(timeoutEvent!.to).toBe('discussion')
    })

    it('should emit state_timeout with correct phase', () => {
      const timeouts: StateTimeoutConfig = { voting: 30 }
      sm = new AgendaStateMachine(timeouts)
      const events: AgendaEvent[] = []
      sm.addListener((e) => events.push(e))

      sm.openTopic('t')
      sm.startDiscussion()
      sm.propose('p1')
      sm.startVoting()

      vi.advanceTimersByTime(40)
      sm.getPhase()

      const timeoutEvent = events.find((e) => e.type === 'state_timeout')
      expect(timeoutEvent).toBeDefined()
      expect(timeoutEvent!.to).toBe('voting')
    })

    it('should not emit state_timeout before timeout expires', () => {
      const timeouts: StateTimeoutConfig = { discussion: 1000 }
      sm = new AgendaStateMachine(timeouts)
      const events: AgendaEvent[] = []
      sm.addListener((e) => events.push(e))

      sm.openTopic('t')
      sm.startDiscussion()

      vi.advanceTimersByTime(50)
      sm.getPhase()

      const timeoutEvent = events.find((e) => e.type === 'state_timeout')
      expect(timeoutEvent).toBeUndefined()
    })

    it('should only fire state_timeout once per state entry', () => {
      const timeouts: StateTimeoutConfig = { discussion: 50 }
      sm = new AgendaStateMachine(timeouts)
      const events: AgendaEvent[] = []
      sm.addListener((e) => events.push(e))

      sm.openTopic('t')
      sm.startDiscussion()

      vi.advanceTimersByTime(60)
      sm.getPhase()
      sm.getPhase()
      sm.getPhase()

      const timeoutEvents = events.filter((e) => e.type === 'state_timeout')
      expect(timeoutEvents).toHaveLength(1)
    })
  })

  describe('getRemainingTime()', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('should return approximately full timeout immediately after transition', () => {
      const timeouts: StateTimeoutConfig = { discussion: 1000 }
      sm = new AgendaStateMachine(timeouts)

      sm.openTopic('t')
      sm.startDiscussion()

      const remaining = sm.getRemainingTime()
      expect(remaining).toBeGreaterThanOrEqual(990)
      expect(remaining).toBeLessThanOrEqual(1000)
    })

    it('should decrease as time passes', () => {
      const timeouts: StateTimeoutConfig = { discussion: 1000 }
      sm = new AgendaStateMachine(timeouts)

      sm.openTopic('t')
      sm.startDiscussion()

      const before = sm.getRemainingTime()

      vi.advanceTimersByTime(300)

      const after = sm.getRemainingTime()
      expect(after).toBeLessThan(before)
      expect(after).toBeGreaterThanOrEqual(690)
      expect(after).toBeLessThanOrEqual(710)
    })

    it('should return 0 when timeout has expired', () => {
      const timeouts: StateTimeoutConfig = { discussion: 100 }
      sm = new AgendaStateMachine(timeouts)

      sm.openTopic('t')
      sm.startDiscussion()

      vi.advanceTimersByTime(150)

      expect(sm.getRemainingTime()).toBe(0)
    })

    it('should return 0 when no timeout is configured for the phase', () => {
      const timeouts: StateTimeoutConfig = {}
      sm = new AgendaStateMachine(timeouts)

      expect(sm.getRemainingTime()).toBe(0)
    })
  })

  describe('resetTimer()', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('should reset remaining time to full timeout', () => {
      const timeouts: StateTimeoutConfig = { discussion: 1000 }
      sm = new AgendaStateMachine(timeouts)

      sm.openTopic('t')
      sm.startDiscussion()

      vi.advanceTimersByTime(700)
      expect(sm.getRemainingTime()).toBeLessThan(400)

      sm.resetTimer()

      const remaining = sm.getRemainingTime()
      expect(remaining).toBeGreaterThanOrEqual(990)
      expect(remaining).toBeLessThanOrEqual(1000)
    })

    it('should allow state_timeout to fire again after reset', () => {
      const timeouts: StateTimeoutConfig = { discussion: 50 }
      sm = new AgendaStateMachine(timeouts)
      const events: AgendaEvent[] = []
      sm.addListener((e) => events.push(e))

      sm.openTopic('t')
      sm.startDiscussion()

      vi.advanceTimersByTime(60)
      sm.getPhase()

      sm.resetTimer()

      vi.advanceTimersByTime(60)
      sm.getPhase()

      const timeoutEvents = events.filter((e) => e.type === 'state_timeout')
      expect(timeoutEvents).toHaveLength(2)
    })
  })

  describe('serialize() / deserialize()', () => {
    it('should serialize current state to snapshot', () => {
      sm = new AgendaStateMachine(undefined, 5000)
      sm.openTopic('serialize test')
      sm.startDiscussion()
      sm.requestToken('agent-1', 0.9)

      const snapshot = sm.serialize()

      expect(snapshot.phase).toBe('discussion')
      expect(snapshot.topic).toBe('serialize test')
      expect(snapshot.currentToken).not.toBeNull()
      expect(snapshot.currentToken!.agentId).toBe('agent-1')
      expect(snapshot.tokenDurationMs).toBe(5000)
      expect(snapshot.eventHistory.length).toBeGreaterThan(0)
    })

    it('should restore state from snapshot via deserialize()', () => {
      sm = new AgendaStateMachine(undefined, 5000)
      sm.openTopic('deserialize test')
      sm.startDiscussion()
      sm.requestToken('agent-1', 0.8)
      sm.requestToken('agent-2', 0.5)

      const snapshot = sm.serialize()
      sm.destroy()

      const restored = AgendaStateMachine.deserialize(snapshot)
      sm = restored

      expect(restored.getPhase()).toBe('discussion')
      expect(restored.serialize().topic).toBe('deserialize test')
      expect(restored.getCurrentSpeaker()).toBe('agent-1')
      expect(restored.getTokenQueue()).toHaveLength(1)
      expect(restored.getTokenQueue()[0].agentId).toBe('agent-2')
    })

    it('should preserve event history through serialize/deserialize', () => {
      sm = new AgendaStateMachine()
      sm.openTopic('t')
      sm.startDiscussion()
      sm.propose('p1')

      const originalHistory = sm.getEventHistory()
      const snapshot = sm.serialize()
      sm.destroy()

      const restored = AgendaStateMachine.deserialize(snapshot)
      sm = restored

      const restoredHistory = restored.getEventHistory()
      expect(restoredHistory).toHaveLength(originalHistory.length)
      for (let i = 0; i < originalHistory.length; i++) {
        expect(restoredHistory[i].type).toBe(originalHistory[i].type)
        expect(restoredHistory[i].from).toBe(originalHistory[i].from)
        expect(restoredHistory[i].to).toBe(originalHistory[i].to)
      }
    })

    it('should handle null currentToken in snapshot', () => {
      sm = new AgendaStateMachine()
      sm.openTopic('t')

      const snapshot = sm.serialize()
      expect(snapshot.currentToken).toBeNull()

      sm.destroy()
      const restored = AgendaStateMachine.deserialize(snapshot)
      sm = restored

      expect(restored.getCurrentSpeaker()).toBeNull()
    })

    it('should preserve stateEnteredAt and stateTimeoutFired through roundtrip', () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })

      const timeouts: StateTimeoutConfig = { discussion: 1000 }
      sm = new AgendaStateMachine(timeouts)
      sm.openTopic('t')
      sm.startDiscussion()

      vi.advanceTimersByTime(300)

      const snapshot = sm.serialize()
      sm.destroy()

      const restored = AgendaStateMachine.deserialize(snapshot, timeouts)
      sm = restored

      const remaining = restored.getRemainingTime()
      expect(remaining).toBeGreaterThanOrEqual(690)
      expect(remaining).toBeLessThanOrEqual(710)
    })
  })

  describe('token management', () => {
    beforeEach(() => {
      sm = new AgendaStateMachine(undefined, 10000)
    })

    it('requestToken() grants token when none is held', () => {
      const result = sm.requestToken('agent-1', 0.8)
      expect(result).toBe(true)
      expect(sm.getCurrentSpeaker()).toBe('agent-1')
    })

    it('requestToken() queues when token is already held', () => {
      sm.requestToken('agent-1', 0.8)
      sm.requestToken('agent-2', 0.5)

      expect(sm.getCurrentSpeaker()).toBe('agent-1')
      expect(sm.getTokenQueue()).toHaveLength(1)
      expect(sm.getTokenQueue()[0].agentId).toBe('agent-2')
    })

    it('requestToken() sorts queue by relevance score descending', () => {
      sm.requestToken('agent-1', 0.8)
      sm.requestToken('agent-2', 0.3)
      sm.requestToken('agent-3', 0.9)

      const queue = sm.getTokenQueue()
      expect(queue).toHaveLength(2)
      expect(queue[0].agentId).toBe('agent-3')
      expect(queue[1].agentId).toBe('agent-2')
    })

    it('releaseToken() releases current holder and promotes next from queue', () => {
      sm.requestToken('agent-1', 0.8)
      sm.requestToken('agent-2', 0.5)

      sm.releaseToken()

      expect(sm.getCurrentSpeaker()).toBe('agent-2')
      expect(sm.getTokenQueue()).toHaveLength(0)
    })

    it('releaseToken() sets speaker to null when queue is empty', () => {
      sm.requestToken('agent-1', 0.8)
      sm.releaseToken()

      expect(sm.getCurrentSpeaker()).toBeNull()
    })

    it('releaseToken() does nothing when no token is held', () => {
      sm.releaseToken()
      expect(sm.getCurrentSpeaker()).toBeNull()
    })

    it('releaseToken() emits token_granted event for promoted agent', () => {
      const events: AgendaEvent[] = []
      sm.addListener((e) => events.push(e))

      sm.requestToken('agent-1', 0.8)
      sm.requestToken('agent-2', 0.5)

      events.length = 0
      sm.releaseToken()

      const grantEvent = events.find(
        (e) => e.type === 'token_granted' && e.agentId === 'agent-2',
      )
      expect(grantEvent).toBeDefined()
    })

    it('forceToken() takes over from current holder', () => {
      const events: AgendaEvent[] = []
      sm.addListener((e) => events.push(e))

      sm.requestToken('agent-1', 0.8)
      sm.forceToken('agent-3', 'priority override')

      expect(sm.getCurrentSpeaker()).toBe('agent-3')
    })

    it('forceToken() emits token_revoked for previous holder', () => {
      const events: AgendaEvent[] = []
      sm.addListener((e) => events.push(e))

      sm.requestToken('agent-1', 0.8)
      sm.forceToken('agent-3', 'priority override')

      const revokeEvent = events.find(
        (e) => e.type === 'token_revoked' && e.agentId === 'agent-1',
      )
      expect(revokeEvent).toBeDefined()
      expect(revokeEvent!.reason).toBe('priority override')
    })

    it('forceToken() removes forced agent from queue if queued', () => {
      sm.requestToken('agent-1', 0.8)
      sm.requestToken('agent-2', 0.5)
      sm.requestToken('agent-3', 0.9)

      sm.forceToken('agent-2', 'override')

      expect(sm.getCurrentSpeaker()).toBe('agent-2')
      const queue = sm.getTokenQueue()
      expect(queue.find((t) => t.agentId === 'agent-2')).toBeUndefined()
    })

    it('requestToken() emits token_granted event', () => {
      const events: AgendaEvent[] = []
      sm.addListener((e) => events.push(e))

      sm.requestToken('agent-1', 0.8)

      const grantEvent = events.find(
        (e) => e.type === 'token_granted' && e.agentId === 'agent-1',
      )
      expect(grantEvent).toBeDefined()
    })
  })
})
