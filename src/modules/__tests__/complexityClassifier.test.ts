import { describe, it, expect } from 'vitest'
import { ComplexityClassifier, complexityClassifier } from '../complexityClassifier'

describe('ComplexityClassifier', () => {
  let classifier: ComplexityClassifier

  beforeEach(() => {
    classifier = new ComplexityClassifier()
  })

  describe('simple tasks', () => {
    it('should classify browser open tasks as simple', () => {
      const result = classifier.classify('打开网页 https://example.com')
      expect(result.level).toBe('simple')
      expect(result.method).toBe('rule_engine')
      expect(result.confidence).toBeGreaterThan(0.5)
    })

    it('should classify search tasks as simple', () => {
      const result = classifier.classify('搜索最新的AI论文信息')
      expect(result.level).toBe('simple')
    })

    it('should classify file read tasks as simple', () => {
      const result = classifier.classify('查看文件内容 /tmp/test.txt')
      expect(result.level).toBe('simple')
    })

    it('should classify file listing as simple', () => {
      const result = classifier.classify('列出目录 /home/user')
      expect(result.level).toBe('simple')
    })

    it('should classify file creation as simple', () => {
      const result = classifier.classify('创建文件 config.yaml')
      expect(result.level).toBe('simple')
    })

    it('should classify config update as simple', () => {
      const result = classifier.classify('修改配置文件中的数据库连接')
      expect(result.level).toBe('simple')
    })

    it('should classify status check as simple', () => {
      const result = classifier.classify('查看服务状态')
      expect(result.level).toBe('simple')
    })

    it('should classify list retrieval as simple', () => {
      const result = classifier.classify('获取用户列表')
      expect(result.level).toBe('simple')
    })

    it('should classify English simple patterns', () => {
      const result = classifier.classify('open url https://example.com')
      expect(result.level).toBe('simple')
    })

    it('should classify English read file as simple', () => {
      const result = classifier.classify('read file /tmp/test.txt')
      expect(result.level).toBe('simple')
    })
  })

  describe('complex tasks', () => {
    it('should classify architecture design as complex', () => {
      const result = classifier.classify('设计系统架构，需要前后端分离和微服务方案')
      expect(result.level).toBe('complex')
      expect(result.confidence).toBeGreaterThan(0.6)
    })

    it('should classify system implementation as complex', () => {
      const result = classifier.classify('实现用户认证系统，包括JWT和OAuth')
      expect(result.level).toBe('complex')
    })

    it('should classify refactoring as complex', () => {
      const result = classifier.classify('重构数据库模块，迁移到新的ORM框架')
      expect(result.level).toBe('complex')
    })

    it('should classify deployment tasks as complex', () => {
      const result = classifier.classify('部署生产环境的Docker容器')
      expect(result.level).toBe('complex')
    })

    it('should classify integration tasks as complex', () => {
      const result = classifier.classify('集成第三方支付接口')
      expect(result.level).toBe('complex')
    })

    it('should classify performance optimization as complex', () => {
      const result = classifier.classify('优化系统性能，减少API响应时间')
      expect(result.level).toBe('complex')
    })

    it('should classify cross-department collaboration as complex', () => {
      const result = classifier.classify('需要跨部门协作完成全流程开发')
      expect(result.level).toBe('complex')
    })

    it('should classify E2E testing as complex', () => {
      const result = classifier.classify('需要端到端测试覆盖整个用户流程')
      expect(result.level).toBe('complex')
    })

    it('should classify English complex patterns', () => {
      const result = classifier.classify('design architecture for a distributed microservice system')
      expect(result.level).toBe('complex')
    })

    it('should classify English deploy as complex', () => {
      const result = classifier.classify('deploy environment to Kubernetes cluster')
      expect(result.level).toBe('complex')
    })
  })

  describe('complexity keywords', () => {
    it('should boost complexity for architecture keywords', () => {
      const result = classifier.classify('需要设计一个微服务架构')
      expect(result.level).toBe('complex')
      expect(result.reason).toContain('关键词')
    })

    it('should detect CI/CD keyword', () => {
      const result = classifier.classify('设置CI/CD流水线')
      expect(result.level).toBe('complex')
    })

    it('should detect Kubernetes keyword', () => {
      const result = classifier.classify('配置Kubernetes集群')
      expect(result.level).toBe('complex')
    })

    it('should detect Docker keyword', () => {
      const result = classifier.classify('编写Docker配置')
      expect(result.level).toBe('complex')
    })

    it('should detect multiple keywords and increase confidence', () => {
      const result = classifier.classify('设计分布式微服务架构并部署到Docker')
      expect(result.level).toBe('complex')
      expect(result.confidence).toBeGreaterThan(0.7)
    })
  })

  describe('edge cases', () => {
    it('should handle empty string', () => {
      const result = classifier.classify('')
      expect(result.level).toBe('simple')
      expect(result.reason).toContain('空消息')
    })

    it('should handle whitespace-only string', () => {
      const result = classifier.classify('   ')
      expect(result.level).toBe('simple')
      expect(result.confidence).toBe(0.5)
    })

    it('should default to simple for unrecognized messages', () => {
      const result = classifier.classify('今天天气不错')
      expect(result.level).toBe('simple')
      expect(result.confidence).toBe(0.6)
    })

    it('should handle messages with mixed signals', () => {
      // Has simple pattern but also complex keywords
      const result = classifier.classify('打开网页查看微服务架构设计文档')
      // The complex keyword should dominate
      expect(result.level).toBe('complex')
    })

    it('should boost confidence for long messages', () => {
      const longMessage = '这是一个很长的消息'.repeat(30) + '设计架构'
      const result = classifier.classify(longMessage)
      expect(result.level).toBe('complex')
    })
  })

  describe('result structure', () => {
    it('should return correct result structure', () => {
      const result = classifier.classify('打开网页')
      expect(result).toHaveProperty('level')
      expect(result).toHaveProperty('confidence')
      expect(result).toHaveProperty('reason')
      expect(result).toHaveProperty('method')
      expect(result.method).toBe('rule_engine')
    })

    it('should have confidence between 0 and 1', () => {
      const result = classifier.classify('设计一个完整的分布式系统架构')
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
    })
  })

  describe('singleton', () => {
    it('should export a singleton instance', () => {
      expect(complexityClassifier).toBeInstanceOf(ComplexityClassifier)
    })
  })
})
