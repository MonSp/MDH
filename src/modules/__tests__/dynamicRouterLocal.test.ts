import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DynamicRouterLocal, tokenize, type RouteEntryLocal } from '../dynamicRouterLocal'

describe('DynamicRouterLocal', () => {
  let router: DynamicRouterLocal

  beforeEach(() => {
    router = new DynamicRouterLocal()
  })

  // ------------------------------------------------------------------
  // tokenize
  // ------------------------------------------------------------------

  describe('tokenize', () => {
    it('should extract English words', () => {
      const tokens = tokenize('Hello World test_case')
      expect(tokens.has('hello')).toBe(true)
      expect(tokens.has('world')).toBe(true)
      expect(tokens.has('test_case')).toBe(true)
    })

    it('should extract Chinese characters and ngrams', () => {
      const tokens = tokenize('前端开发')
      expect(tokens.has('前')).toBe(true)
      expect(tokens.has('端')).toBe(true)
      expect(tokens.has('前端')).toBe(true)
      expect(tokens.has('前端开')).toBe(true)
      expect(tokens.has('前端开发')).toBe(true)
      expect(tokens.has('端开发')).toBe(true)
    })

    it('should handle mixed Chinese and English', () => {
      const tokens = tokenize('React前端开发')
      expect(tokens.has('react')).toBe(true)
      expect(tokens.has('前端')).toBe(true)
    })

    it('should return empty set for empty string', () => {
      const tokens = tokenize('')
      expect(tokens.size).toBe(0)
    })

    it('should lowercase English tokens', () => {
      const tokens = tokenize('JavaScript TypeScript')
      expect(tokens.has('javascript')).toBe(true)
      expect(tokens.has('typescript')).toBe(true)
    })

    it('should generate 2, 3, and 4-char Chinese ngrams', () => {
      const tokens = tokenize('数据分析部')
      expect(tokens.has('数据')).toBe(true)        // 2-char
      expect(tokens.has('数据分析')).toBe(true)      // 4-char
      expect(tokens.has('数据分析部')).toBe(false)    // 5-char NOT generated (max 4)
      // but 4-gram window from index 1
      expect(tokens.has('据分析部')).toBe(true)
    })
  })

  // ------------------------------------------------------------------
  // constructor / defaults
  // ------------------------------------------------------------------

  describe('constructor', () => {
    it('should initialize with 7 default departments', () => {
      const table = router.getRouteTable()
      expect(table).toHaveLength(7)
      const ids = table.map(e => e.deptId)
      expect(ids).toContain('frontend')
      expect(ids).toContain('backend')
      expect(ids).toContain('fullstack')
      expect(ids).toContain('qa')
      expect(ids).toContain('devops')
      expect(ids).toContain('data')
      expect(ids).toContain('docs')
    })

    it('should have zero stats for all default departments', () => {
      for (const entry of router.getRouteTable()) {
        expect(entry.totalTasks).toBe(0)
        expect(entry.successfulTasks).toBe(0)
        expect(entry.successRate).toBe(0)
      }
    })
  })

  // ------------------------------------------------------------------
  // ruleMatch
  // ------------------------------------------------------------------

  describe('ruleMatch', () => {
    it('should return all departments for empty input', () => {
      const results = router.ruleMatch('')
      expect(results).toHaveLength(7)
    })

    it('should match frontend keywords', () => {
      const results = router.ruleMatch('开发一个React组件')
      const ids = results.map(e => e.deptId)
      expect(ids).toContain('frontend')
    })

    it('should match backend keywords', () => {
      const results = router.ruleMatch('设计API数据库接口')
      const ids = results.map(e => e.deptId)
      expect(ids).toContain('backend')
    })

    it('should match QA keywords', () => {
      const results = router.ruleMatch('编写自动化测试用例')
      const ids = results.map(e => e.deptId)
      expect(ids).toContain('qa')
    })

    it('should boost matching with task type', () => {
      const withoutType = router.ruleMatch('代码')
      const withType = router.ruleMatch('代码', 'testing')
      // with type boost, qa should appear
      const idsWithType = withType.map(e => e.deptId)
      expect(idsWithType).toContain('qa')
    })

    it('should return all entries when no keywords match', () => {
      const results = router.ruleMatch('xyzzy 不存在的输入')
      expect(results).toHaveLength(7)
    })

    it('should match English keywords case-insensitively', () => {
      const results = router.ruleMatch('Build a REACT application')
      const ids = results.map(e => e.deptId)
      expect(ids).toContain('frontend')
    })
  })

  // ------------------------------------------------------------------
  // semanticRank
  // ------------------------------------------------------------------

  describe('semanticRank', () => {
    it('should return empty for empty candidates', () => {
      const results = router.semanticRank([], 'test')
      expect(results).toHaveLength(0)
    })

    it('should rank candidates by semantic similarity', () => {
      const all = router.getRouteTable()
      const results = router.semanticRank(all, '前端界面开发 React 组件')
      expect(results.length).toBeGreaterThan(0)
      // frontend should rank highest
      expect(results[0].entry.deptId).toBe('frontend')
    })

    it('should return scores between 0 and 1', () => {
      const all = router.getRouteTable()
      const results = router.semanticRank(all, '数据可视化报表')
      for (const r of results) {
        expect(r.score).toBeGreaterThanOrEqual(0)
        expect(r.score).toBeLessThanOrEqual(1)
      }
    })

    it('should return sorted results (descending)', () => {
      const all = router.getRouteTable()
      const results = router.semanticRank(all, '部署 Docker 容器')
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
      }
    })
  })

  // ------------------------------------------------------------------
  // route
  // ------------------------------------------------------------------

  describe('route', () => {
    it('should return empty decision when table is empty', () => {
      for (const entry of router.getRouteTable()) {
        router.removeRouteEntry(entry.deptId)
      }
      const decision = router.route('任何输入')
      expect(decision.selectedDept).toBe('')
      expect(decision.confidence).toBe(0)
    })

    it('should route frontend tasks to frontend dept', () => {
      const decision = router.route('开发一个React前端界面组件')
      expect(decision.selectedDept).toBe('frontend')
      expect(decision.confidence).toBeGreaterThan(0)
      expect(decision.reason).toContain('前端开发部')
    })

    it('should route backend tasks to backend dept', () => {
      const decision = router.route('设计RESTful API接口和数据库表结构')
      expect(decision.selectedDept).toBe('backend')
      expect(decision.matchedKeywords.length).toBeGreaterThan(0)
    })

    it('should route testing tasks to QA dept', () => {
      const decision = router.route('编写单元测试和自动化测试')
      expect(decision.selectedDept).toBe('qa')
    })

    it('should route devops tasks correctly', () => {
      const decision = router.route('配置Docker容器部署和CI/CD流水线')
      expect(decision.selectedDept).toBe('devops')
    })

    it('should route data tasks to data dept', () => {
      const decision = router.route('数据统计分析和可视化图表')
      expect(decision.selectedDept).toBe('data')
    })

    it('should route documentation tasks to docs dept', () => {
      const decision = router.route('编写API文档和用户指南说明')
      expect(decision.selectedDept).toBe('docs')
    })

    it('should include task type boost', () => {
      const decision = router.route('编写代码', 'testing')
      // testing type should give QA an advantage
      expect(decision.selectedDept).toBe('qa')
    })

    it('should return candidate depts sorted by score', () => {
      const decision = router.route('全栈开发，前后端集成')
      expect(decision.candidateDepts.length).toBeGreaterThan(0)
      for (let i = 1; i < decision.candidateDepts.length; i++) {
        expect(decision.candidateDepts[i - 1].score).toBeGreaterThanOrEqual(
          decision.candidateDepts[i].score,
        )
      }
    })

    it('should clamp confidence between 0 and 1', () => {
      const decision = router.route('随便什么输入')
      expect(decision.confidence).toBeGreaterThanOrEqual(0)
      expect(decision.confidence).toBeLessThanOrEqual(1)
    })

    it('should handle English input', () => {
      const decision = router.route('Write unit tests for the backend API')
      // should match testing / backend keywords
      expect(['qa', 'backend']).toContain(decision.selectedDept)
    })
  })

  // ------------------------------------------------------------------
  // updateStats
  // ------------------------------------------------------------------

  describe('updateStats', () => {
    it('should increment totalTasks on success', () => {
      router.updateStats('frontend', true)
      const entry = router.getRouteTable().find(e => e.deptId === 'frontend')!
      expect(entry.totalTasks).toBe(1)
      expect(entry.successfulTasks).toBe(1)
      expect(entry.successRate).toBe(1)
    })

    it('should increment totalTasks on failure without incrementing successfulTasks', () => {
      router.updateStats('backend', false)
      const entry = router.getRouteTable().find(e => e.deptId === 'backend')!
      expect(entry.totalTasks).toBe(1)
      expect(entry.successfulTasks).toBe(0)
      expect(entry.successRate).toBe(0)
    })

    it('should compute correct success rate over multiple updates', () => {
      router.updateStats('qa', true)
      router.updateStats('qa', true)
      router.updateStats('qa', false)
      const entry = router.getRouteTable().find(e => e.deptId === 'qa')!
      expect(entry.totalTasks).toBe(3)
      expect(entry.successfulTasks).toBe(2)
      expect(entry.successRate).toBeCloseTo(2 / 3, 5)
    })

    it('should update lastActive timestamp', () => {
      vi.useFakeTimers()
      const before = router.getRouteTable().find(e => e.deptId === 'data')!.lastActive
      vi.advanceTimersByTime(1000)
      router.updateStats('data', true)
      const after = router.getRouteTable().find(e => e.deptId === 'data')!.lastActive
      expect(after).not.toBe(before)
      vi.useRealTimers()
    })

    it('should return false for non-existent dept', () => {
      expect(router.updateStats('nonexistent', true)).toBe(false)
    })

    it('should return true for valid dept', () => {
      expect(router.updateStats('frontend', true)).toBe(true)
    })
  })

  // ------------------------------------------------------------------
  // addRouteEntry / removeRouteEntry
  // ------------------------------------------------------------------

  describe('addRouteEntry', () => {
    it('should add a new entry', () => {
      const entry: RouteEntryLocal = {
        deptId: 'security',
        deptName: '安全组',
        capabilityDesc: '负责安全审计和渗透测试',
        capabilityKeywords: ['安全', 'security', '渗透'],
        tools: ['read_file', 'bash'],
        successRate: 0,
        totalTasks: 0,
        successfulTasks: 0,
        lastActive: '',
        priority: 3,
      }
      router.addRouteEntry(entry)
      expect(router.getRouteTable()).toHaveLength(8)
      expect(router.getRouteTable().find(e => e.deptId === 'security')).toBeDefined()
    })

    it('should overwrite existing entry with same deptId', () => {
      const entry: RouteEntryLocal = {
        deptId: 'frontend',
        deptName: '自定义前端',
        capabilityDesc: '自定义描述',
        capabilityKeywords: ['自定义'],
        tools: [],
        successRate: 0.9,
        totalTasks: 10,
        successfulTasks: 9,
        lastActive: '',
        priority: 10,
      }
      router.addRouteEntry(entry)
      expect(router.getRouteTable()).toHaveLength(7)
      expect(router.getRouteTable().find(e => e.deptId === 'frontend')!.deptName).toBe('自定义前端')
    })
  })

  describe('removeRouteEntry', () => {
    it('should remove an existing entry', () => {
      expect(router.removeRouteEntry('docs')).toBe(true)
      expect(router.getRouteTable()).toHaveLength(6)
      expect(router.getRouteTable().find(e => e.deptId === 'docs')).toBeUndefined()
    })

    it('should return false for non-existent entry', () => {
      expect(router.removeRouteEntry('nonexistent')).toBe(false)
    })
  })

  // ------------------------------------------------------------------
  // getRouteTable
  // ------------------------------------------------------------------

  describe('getRouteTable', () => {
    it('should return a copy of the table', () => {
      const table1 = router.getRouteTable()
      const table2 = router.getRouteTable()
      expect(table1).not.toBe(table2) // different array reference
      expect(table1).toEqual(table2)   // same content
    })

    it('should reflect modifications', () => {
      router.updateStats('frontend', true)
      const table = router.getRouteTable()
      const fe = table.find(e => e.deptId === 'frontend')!
      expect(fe.totalTasks).toBe(1)
    })
  })

  // ------------------------------------------------------------------
  // routing respects successRate (stats influence routing)
  // ------------------------------------------------------------------

  describe('routing with stats', () => {
    it('should prefer department with higher success rate', () => {
      // boost frontend success rate
      for (let i = 0; i < 20; i++) router.updateStats('frontend', true)
      // the input is ambiguous between frontend and backend
      const decision = router.route('开发界面和API')
      // frontend has higher successRate, so it should be preferred or at least score higher
      const feScore = decision.candidateDepts.find(d => d.deptId === 'frontend')?.score ?? 0
      const beScore = decision.candidateDepts.find(d => d.deptId === 'backend')?.score ?? 0
      expect(feScore).toBeGreaterThanOrEqual(beScore)
    })
  })
})
