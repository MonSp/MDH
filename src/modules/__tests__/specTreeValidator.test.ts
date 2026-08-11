import { describe, it, expect } from 'vitest'
import { SpecTreeValidator, SpecTreeNodeType } from '../specTreeValidator'
import type { SpecTree, SpecTreeNode } from '../specTreeValidator'

function makeNode(id: string, type: SpecTreeNodeType, parentId?: string, children?: string[]): SpecTreeNode {
  return {
    id,
    type,
    title: `Node ${id}`,
    description: `Description for ${id}`,
    parentId,
    children,
  }
}

function makeValidTree(): SpecTree {
  return {
    nodes: [
      makeNode('root', SpecTreeNodeType.ROOT, undefined, ['feat1', 'feat2']),
      makeNode('feat1', SpecTreeNodeType.FEATURE, 'root', ['req1']),
      makeNode('feat2', SpecTreeNodeType.FEATURE, 'root', ['req2']),
      makeNode('req1', SpecTreeNodeType.REQUIREMENT, 'feat1'),
      makeNode('req2', SpecTreeNodeType.REQUIREMENT, 'feat2'),
    ],
  }
}

describe('SpecTreeValidator', () => {
  const validator = new SpecTreeValidator()

  describe('node count', () => {
    it('should reject tree with fewer than 3 nodes', () => {
      const tree: SpecTree = {
        nodes: [
          makeNode('root', SpecTreeNodeType.ROOT, undefined, ['a']),
          makeNode('a', SpecTreeNodeType.FEATURE, 'root'),
        ],
      }
      const result = validator.validate(tree)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('at least 3'))).toBe(true)
    })

    it('should accept tree with 3 nodes', () => {
      const tree: SpecTree = {
        nodes: [
          makeNode('root', SpecTreeNodeType.ROOT, undefined, ['a', 'b']),
          makeNode('a', SpecTreeNodeType.FEATURE, 'root'),
          makeNode('b', SpecTreeNodeType.FEATURE, 'root'),
        ],
      }
      const result = validator.validate(tree)
      // should pass the node count check (may fail on other rules)
      expect(result.errors.filter(e => e.includes('at least'))).toHaveLength(0)
    })

    it('should reject tree with more than 60 nodes', () => {
      const nodes: SpecTreeNode[] = [
        makeNode('root', SpecTreeNodeType.ROOT, undefined, ['f1']),
      ]
      for (let i = 1; i <= 61; i++) {
        nodes.push(makeNode(`n${i}`, SpecTreeNodeType.FEATURE, 'root'))
      }
      // fix root children
      nodes[0].children = nodes.slice(1).map(n => n.id)
      const tree: SpecTree = { nodes }
      const result = validator.validate(tree)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('at most 60'))).toBe(true)
    })
  })

  describe('unique IDs', () => {
    it('should reject duplicate node IDs', () => {
      const tree: SpecTree = {
        nodes: [
          makeNode('root', SpecTreeNodeType.ROOT, undefined, ['dup']),
          makeNode('dup', SpecTreeNodeType.FEATURE, 'root', ['dup']),
          makeNode('dup', SpecTreeNodeType.REQUIREMENT, 'root'),
        ],
      }
      const result = validator.validate(tree)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('Duplicate node ID'))).toBe(true)
    })
  })

  describe('single root', () => {
    it('should reject tree with no root', () => {
      const tree: SpecTree = {
        nodes: [
          makeNode('a', SpecTreeNodeType.FEATURE, 'b'),
          makeNode('b', SpecTreeNodeType.FEATURE, 'c'),
          makeNode('c', SpecTreeNodeType.FEATURE, 'a'),
        ],
      }
      const result = validator.validate(tree)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('root'))).toBe(true)
    })

    it('should reject tree with multiple roots', () => {
      const tree: SpecTree = {
        nodes: [
          makeNode('root1', SpecTreeNodeType.ROOT),
          makeNode('root2', SpecTreeNodeType.ROOT),
          makeNode('child', SpecTreeNodeType.FEATURE, 'root1'),
        ],
      }
      const result = validator.validate(tree)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('exactly 1 root'))).toBe(true)
    })
  })

  describe('parent reachability', () => {
    it('should reject node with non-existent parent', () => {
      const tree = makeValidTree()
      tree.nodes.push(makeNode('orphan', SpecTreeNodeType.FEATURE, 'nonexistent'))
      const result = validator.validate(tree)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('non-existent parent'))).toBe(true)
    })
  })

  describe('cycle detection', () => {
    it('should detect a cycle via DFS', () => {
      const tree: SpecTree = {
        nodes: [
          makeNode('a', SpecTreeNodeType.ROOT, undefined, ['b']),
          makeNode('b', SpecTreeNodeType.FEATURE, 'a', ['c']),
          makeNode('c', SpecTreeNodeType.FEATURE, 'b', ['a']),
        ],
      }
      const result = validator.validate(tree)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('cycle'))).toBe(true)
    })

    it('should not flag acyclic tree', () => {
      const result = validator.validate(makeValidTree())
      expect(result.errors.filter(e => e.includes('cycle'))).toHaveLength(0)
    })
  })

  describe('max depth', () => {
    it('should reject tree exceeding depth 4', () => {
      const tree: SpecTree = {
        nodes: [
          makeNode('root', SpecTreeNodeType.ROOT, undefined, ['l1']),
          makeNode('l1', SpecTreeNodeType.FEATURE, 'root', ['l2']),
          makeNode('l2', SpecTreeNodeType.REQUIREMENT, 'l1', ['l3']),
          makeNode('l3', SpecTreeNodeType.SUB_REQUIREMENT, 'l2', ['l4']),
          makeNode('l4', SpecTreeNodeType.ACCEPTANCE_CRITERION, 'l3', ['l5']),
          makeNode('l5', SpecTreeNodeType.ACCEPTANCE_CRITERION, 'l4'),
        ],
      }
      const result = validator.validate(tree)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('depth'))).toBe(true)
    })

    it('should accept tree at exactly depth 4', () => {
      const tree: SpecTree = {
        nodes: [
          makeNode('root', SpecTreeNodeType.ROOT, undefined, ['l1']),
          makeNode('l1', SpecTreeNodeType.FEATURE, 'root', ['l2']),
          makeNode('l2', SpecTreeNodeType.REQUIREMENT, 'l1', ['l3']),
          makeNode('l3', SpecTreeNodeType.SUB_REQUIREMENT, 'l2'),
        ],
      }
      const result = validator.validate(tree)
      expect(result.errors.filter(e => e.includes('depth'))).toHaveLength(0)
    })
  })

  describe('provenance', () => {
    it('should reject provenance with empty source', () => {
      const tree = makeValidTree()
      tree.nodes[0].provenance = { source: '' }
      const result = validator.validate(tree)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('empty source'))).toBe(true)
    })

    it('should accept valid provenance', () => {
      const tree = makeValidTree()
      tree.nodes[0].provenance = { source: 'requirements-v1.md', version: '1.0' }
      const result = validator.validate(tree)
      expect(result.errors.filter(e => e.includes('provenance'))).toHaveLength(0)
    })
  })

  describe('valid tree', () => {
    it('should accept a well-formed tree', () => {
      const result = validator.validate(makeValidTree())
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject null/undefined tree', () => {
      const result = validator.validate(null as any)
      expect(result.valid).toBe(false)
    })
  })
})
