/**
 * Scenario Registry — 全系统覆盖元数据
 *
 * 18 个场景覆盖 MDH 的所有子系统。
 * 每个 ScenarioMeta 描述场景的元信息，不包含执行逻辑。
 * 执行逻辑在 orchestrator/src/loop/loop.ts 的 SCENARIOS 数组中。
 */

export interface ScenarioMeta {
  id: string;
  name: string;
  subsystem: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  source: 'original' | 'expanded';
  filesExpected: number;
  agentsExpected: number;
}

export const SCENARIO_REGISTRY: ScenarioMeta[] = [
  // ===== 原始 10 个场景 =====
  {
    id: 'agent-single',
    name: '单Agent直接执行',
    subsystem: 'agent-core',
    difficulty: 'easy',
    tags: ['single-agent', 'basic'],
    source: 'original',
    filesExpected: 1,
    agentsExpected: 1,
  },
  {
    id: 'team-collab-module',
    name: '多Agent协作开发模块',
    subsystem: 'meeting',
    difficulty: 'medium',
    tags: ['multi-agent', 'collaboration', 'auth'],
    source: 'original',
    filesExpected: 3,
    agentsExpected: 4,
  },
  {
    id: 'tool-exec-bash',
    name: '工具执行: Shell命令',
    subsystem: 'tool-executor',
    difficulty: 'easy',
    tags: ['shell', 'bash'],
    source: 'original',
    filesExpected: 1,
    agentsExpected: 1,
  },
  {
    id: 'tool-exec-files',
    name: '工具执行: 文件操作',
    subsystem: 'tool-executor',
    difficulty: 'easy',
    tags: ['filesystem', 'json'],
    source: 'original',
    filesExpected: 2,
    agentsExpected: 1,
  },
  {
    id: 'skill-reusable',
    name: '技能: 可复用工具函数',
    subsystem: 'skill',
    difficulty: 'medium',
    tags: ['reusable', 'decorators', 'utils'],
    source: 'original',
    filesExpected: 2,
    agentsExpected: 4,
  },
  {
    id: 'quality-review',
    name: '质量: 代码审查流程',
    subsystem: 'review-pipeline',
    difficulty: 'medium',
    tags: ['review', 'testing', 'calculator'],
    source: 'original',
    filesExpected: 2,
    agentsExpected: 4,
  },
  {
    id: 'workflow-pipeline',
    name: '工作流: 多步骤数据处理',
    subsystem: 'workflow',
    difficulty: 'medium',
    tags: ['pipeline', 'csv', 'data'],
    source: 'original',
    filesExpected: 3,
    agentsExpected: 4,
  },
  {
    id: 'routing-task',
    name: '路由: 根据任务类型分发',
    subsystem: 'dynamic-router',
    difficulty: 'medium',
    tags: ['routing', 'dispatch'],
    source: 'original',
    filesExpected: 2,
    agentsExpected: 3,
  },
  {
    id: 'security-validation',
    name: '安全: 输入验证与防护',
    subsystem: 'security',
    difficulty: 'hard',
    tags: ['security', 'validation', 'sanitization'],
    source: 'original',
    filesExpected: 2,
    agentsExpected: 4,
  },
  {
    id: 'fallback-recovery',
    name: '降级: 错误恢复机制',
    subsystem: 'fallback',
    difficulty: 'hard',
    tags: ['resilience', 'fallback', 'error-handling'],
    source: 'original',
    filesExpected: 2,
    agentsExpected: 4,
  },

  // ===== 新增 8 个场景 =====
  {
    id: 'git-workflow',
    name: 'Git: 提交工作流',
    subsystem: 'tool-executor',
    difficulty: 'medium',
    tags: ['git', 'commit', 'version-control'],
    source: 'expanded',
    filesExpected: 3,
    agentsExpected: 2,
  },
  {
    id: 'api-endpoint',
    name: 'API: FastAPI 端点开发',
    subsystem: 'workflow',
    difficulty: 'hard',
    tags: ['api', 'fastapi', 'rest', 'http'],
    source: 'expanded',
    filesExpected: 4,
    agentsExpected: 4,
  },
  {
    id: 'multi-file-project',
    name: '大项目: 6文件工程',
    subsystem: 'agent-core',
    difficulty: 'hard',
    tags: ['large-context', 'multi-file', 'architecture'],
    source: 'expanded',
    filesExpected: 6,
    agentsExpected: 4,
  },
  {
    id: 'database-persistence',
    name: '数据库: SQLite 持久化',
    subsystem: 'workflow',
    difficulty: 'hard',
    tags: ['database', 'sqlite', 'persistence', 'crud'],
    source: 'expanded',
    filesExpected: 4,
    agentsExpected: 4,
  },
  {
    id: 'role-selection',
    name: '角色: 自动角色选择',
    subsystem: 'dynamic-router',
    difficulty: 'medium',
    tags: ['roles', 'auto-selection', 'empty-roles'],
    source: 'expanded',
    filesExpected: 2,
    agentsExpected: 3,
  },
  {
    id: 'frontend-gen',
    name: '前端: HTML/CSS 生成',
    subsystem: 'workflow',
    difficulty: 'medium',
    tags: ['frontend', 'html', 'css', 'ui'],
    source: 'expanded',
    filesExpected: 3,
    agentsExpected: 3,
  },
  {
    id: 'concurrency',
    name: '并发: 多任务并行处理',
    subsystem: 'agent-core',
    difficulty: 'hard',
    tags: ['concurrency', 'parallel', 'async', 'threading'],
    source: 'expanded',
    filesExpected: 3,
    agentsExpected: 4,
  },
  {
    id: 'refactor-quality',
    name: '重构: 代码质量提升',
    subsystem: 'review-pipeline',
    difficulty: 'hard',
    tags: ['refactor', 'code-smells', 'quality'],
    source: 'expanded',
    filesExpected: 3,
    agentsExpected: 4,
  },
];

/**
 * 子系统覆盖报告
 *
 * 统计每个子系统被多少场景覆盖，并计算整体覆盖率。
 */
export function getCoverageReport(): void {
  const subsystems = new Set<string>();
  const bySubsystem = new Map<string, ScenarioMeta[]>();

  for (const s of SCENARIO_REGISTRY) {
    subsystems.add(s.subsystem);
    if (!bySubsystem.has(s.subsystem)) bySubsystem.set(s.subsystem, []);
    bySubsystem.get(s.subsystem)!.push(s);
  }

  const ALL_SUBSYSTEMS = [
    'agent-core',
    'meeting',
    'tool-executor',
    'skill',
    'review-pipeline',
    'workflow',
    'dynamic-router',
    'security',
    'fallback',
  ];

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Scenario Coverage Report                            ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\n  Total scenarios: ${SCENARIO_REGISTRY.length}`);
  console.log(`  Original: ${SCENARIO_REGISTRY.filter(s => s.source === 'original').length}`);
  console.log(`  Expanded: ${SCENARIO_REGISTRY.filter(s => s.source === 'expanded').length}`);
  console.log(`  Subsystems covered: ${subsystems.size}/${ALL_SUBSYSTEMS.length}\n`);

  console.log('  ┌─────────────────────┬────────┬───────────────────────────────┐');
  console.log('  │ Subsystem           │ Count  │ Scenarios                     │');
  console.log('  ├─────────────────────┼────────┼───────────────────────────────┤');

  for (const sub of ALL_SUBSYSTEMS) {
    const scenarios = bySubsystem.get(sub) || [];
    const count = scenarios.length;
    const ids = scenarios.map(s => s.id).join(', ');
    const paddedSub = sub.padEnd(19);
    const paddedCount = String(count).padStart(4).padEnd(6);
    console.log(`  │ ${paddedSub} │${paddedCount} │ ${ids.substring(0, 29).padEnd(29)} │`);
  }

  console.log('  └─────────────────────┴────────┴───────────────────────────────┘');

  const uncovered = ALL_SUBSYSTEMS.filter(s => !subsystems.has(s));
  if (uncovered.length > 0) {
    console.log(`\n  ⚠ Uncovered subsystems: ${uncovered.join(', ')}`);
  } else {
    console.log('\n  ✓ All subsystems covered');
  }

  // Difficulty distribution
  const byDifficulty = { easy: 0, medium: 0, hard: 0 };
  for (const s of SCENARIO_REGISTRY) byDifficulty[s.difficulty]++;
  console.log(`\n  Difficulty: easy=${byDifficulty.easy} medium=${byDifficulty.medium} hard=${byDifficulty.hard}`);
}
