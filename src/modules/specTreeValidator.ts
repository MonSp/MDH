/**
 * Spec Tree Validator
 * Validates a hierarchical specification tree structure for consistency,
 * integrity, and structural constraints.
 */

export enum SpecTreeNodeType {
  ROOT = 'root',
  FEATURE = 'feature',
  REQUIREMENT = 'requirement',
  SUB_REQUIREMENT = 'sub_requirement',
  ACCEPTANCE_CRITERION = 'acceptance_criterion',
}

export interface Provenance {
  source: string
  version?: string
  lastUpdated?: string
}

export interface SuccessCriterion {
  id: string
  description: string
  measurable: boolean
}

export interface SpecTreeNode {
  id: string
  type: SpecTreeNodeType
  title: string
  description?: string
  parentId?: string
  children?: string[]
  provenance?: Provenance
  successCriteria?: SuccessCriterion[]
}

export interface SpecTree {
  nodes: SpecTreeNode[]
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export class SpecTreeValidator {
  private static readonly MIN_NODES = 3
  private static readonly MAX_NODES = 60
  private static readonly MAX_DEPTH = 4

  /**
   * Validate a spec tree against all structural rules.
   */
  validate(tree: SpecTree): ValidationResult {
    const errors: string[] = []

    if (!tree || !tree.nodes) {
      return { valid: false, errors: ['Tree or nodes array is null/undefined'] }
    }

    // Rule 1: Node count between 3 and 60
    if (tree.nodes.length < SpecTreeValidator.MIN_NODES) {
      errors.push(`Tree must have at least ${SpecTreeValidator.MIN_NODES} nodes, found ${tree.nodes.length}`)
    }
    if (tree.nodes.length > SpecTreeValidator.MAX_NODES) {
      errors.push(`Tree must have at most ${SpecTreeValidator.MAX_NODES} nodes, found ${tree.nodes.length}`)
    }

    // Build ID set for uniqueness and reachability checks
    const idSet = new Set<string>()
    for (const node of tree.nodes) {
      if (idSet.has(node.id)) {
        errors.push(`Duplicate node ID: ${node.id}`)
      }
      idSet.add(node.id)
    }

    // Rule 2: Unique IDs
    // (handled above)

    // Rule 3: Single root (exactly one node with type ROOT or no parentId)
    const roots = tree.nodes.filter(n => n.type === SpecTreeNodeType.ROOT || !n.parentId)
    if (roots.length !== 1) {
      errors.push(`Expected exactly 1 root node, found ${roots.length}`)
    }

    // Rule 4: Parent reachability - every non-root node's parentId must exist
    for (const node of tree.nodes) {
      if (node.parentId && !idSet.has(node.parentId)) {
        errors.push(`Node ${node.id} references non-existent parent ${node.parentId}`)
      }
    }

    // Rule 5: Cycle detection (DFS)
    if (this.hasCycle(tree.nodes)) {
      errors.push('Tree contains a cycle')
    }

    // Rule 6: Max depth (BFS)
    if (roots.length === 1) {
      const depth = this.computeMaxDepth(tree.nodes, roots[0].id)
      if (depth > SpecTreeValidator.MAX_DEPTH) {
        errors.push(`Tree depth ${depth} exceeds maximum allowed depth of ${SpecTreeValidator.MAX_DEPTH}`)
      }
    }

    // Rule 7: Valid provenance source
    for (const node of tree.nodes) {
      if (node.provenance) {
        if (!node.provenance.source || node.provenance.source.trim().length === 0) {
          errors.push(`Node ${node.id} has provenance with empty source`)
        }
      }
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * Detect cycles using DFS with a visited + recursion-stack approach.
   */
  private hasCycle(nodes: SpecTreeNode[]): boolean {
    const adjacency = new Map<string, string[]>()
    for (const node of nodes) {
      adjacency.set(node.id, node.children ?? [])
    }

    const WHITE = 0, GRAY = 1, BLACK = 2
    const color = new Map<string, number>()
    for (const node of nodes) {
      color.set(node.id, WHITE)
    }

    const dfs = (nodeId: string): boolean => {
      color.set(nodeId, GRAY)
      const neighbors = adjacency.get(nodeId) ?? []
      for (const neighbor of neighbors) {
        if (!color.has(neighbor)) continue // skip external refs
        const c = color.get(neighbor)!
        if (c === GRAY) return true // back edge → cycle
        if (c === WHITE && dfs(neighbor)) return true
      }
      color.set(nodeId, BLACK)
      return false
    }

    for (const node of nodes) {
      if (color.get(node.id) === WHITE) {
        if (dfs(node.id)) return true
      }
    }
    return false
  }

  /**
   * Compute max depth using BFS from the root.
   */
  private computeMaxDepth(nodes: SpecTreeNode[], rootId: string): number {
    const childrenMap = new Map<string, string[]>()
    for (const node of nodes) {
      childrenMap.set(node.id, node.children ?? [])
    }

    let maxDepth = 1
    const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 1 }]
    const visited = new Set<string>()

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      maxDepth = Math.max(maxDepth, depth)
      const children = childrenMap.get(id) ?? []
      for (const child of children) {
        if (!visited.has(child)) {
          queue.push({ id: child, depth: depth + 1 })
        }
      }
    }

    return maxDepth
  }
}
