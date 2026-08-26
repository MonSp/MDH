import { describe, it, expect, beforeEach } from 'vitest';
import { resolve } from 'node:path';
import { loadSkillPacks, getSkillPack, resetCache, loadSkillContent, loadIncrementalArea, parseYaml } from './loader.js';

const PACKS_DIR = resolve(import.meta.dirname, '..', '..', '..', 'skill_packs');
const FIXTURES_DIR = resolve(import.meta.dirname, '__fixtures__');

beforeEach(() => {
  resetCache();
});

describe('loadSkillPacks', () => {
  it('loads all packs from the skill_packs directory', async () => {
    const packs = await loadSkillPacks(PACKS_DIR);
    expect(packs.size).toBeGreaterThanOrEqual(42);
    expect(packs.has('frontend_dev')).toBe(true);
    expect(packs.has('backend_dev')).toBe(true);
    expect(packs.has('code_review')).toBe(true);
    expect(packs.has('task_decomposition')).toBe(true);
    expect(packs.has('testing')).toBe(true);
    expect(packs.has('architecture')).toBe(true);
    expect(packs.has('security_audit')).toBe(true);
  });

  it('populates SkillPack fields correctly', async () => {
    await loadSkillPacks(PACKS_DIR);
    const pack = getSkillPack('frontend_dev');
    expect(pack).not.toBeNull();
    expect(pack!.name).toBe('frontend_dev');
    expect(pack!.version).toBe('1.0.0');
    expect(pack!.category).toBe('dev');
    expect(pack!.requiredTools).toContain('read_file');
    expect(pack!.systemPrompt).toContain('前端开发');
    // knowledgeDir may be undefined if no references/ directory exists
    // rulesDir may be undefined if no rules/ directory exists
  });
});

describe('getSkillPack', () => {
  it('returns null for unknown id', async () => {
    await loadSkillPacks(PACKS_DIR);
    expect(getSkillPack('nonexistent')).toBeNull();
  });
});

describe('resetCache', () => {
  it('clears the cache so getSkillPack returns null', async () => {
    await loadSkillPacks(PACKS_DIR);
    expect(getSkillPack('frontend_dev')).not.toBeNull();
    resetCache();
    expect(getSkillPack('frontend_dev')).toBeNull();
  });
});

describe('loadSkillContent', () => {
  it('returns empty strings when knowledgeDir and rulesDir are undefined', async () => {
    const pack = {
      id: 'empty', name: 'empty', version: '1.0.0', description: '',
      category: '', requiredTools: [], systemPrompt: '',
    };
    const result = await loadSkillContent(pack);
    expect(result.knowledge).toBe('');
    expect(result.rules).toBe('');
  });

  it('loads knowledge from .md and .txt files with headings', async () => {
    await loadSkillPacks(FIXTURES_DIR);
    const pack = getSkillPack('test_pack');
    expect(pack).not.toBeNull();

    const { knowledge } = await loadSkillContent(pack!);
    expect(knowledge).toContain('### best practices');
    expect(knowledge).toContain('TypeScript strict mode');
    expect(knowledge).toContain('### performance tips');
    expect(knowledge).toContain('React.memo');
  });

  it('loads rules from single-rule yaml and multi-rule yaml', async () => {
    await loadSkillPacks(FIXTURES_DIR);
    const pack = getSkillPack('test_pack');
    expect(pack).not.toBeNull();

    const { rules } = await loadSkillContent(pack!);
    // Single rule from success.yaml
    expect(rules).toContain('触发条件: task involves API endpoint creation');
    expect(rules).toContain('建议动作: Use RESTful conventions');
    expect(rules).toContain('补充说明: From project X success pattern');
    // Multi rules from multi-rules.yaml
    expect(rules).toContain('database migration needed');
    expect(rules).toContain('Always create rollback script');
    expect(rules).toContain('CSS modules instead of inline styles');
  });

  it('returns empty strings when directories exist but have no matching files', async () => {
    await loadSkillPacks(PACKS_DIR);
    const pack = getSkillPack('frontend_dev');
    expect(pack).not.toBeNull();

    const { knowledge, rules } = await loadSkillContent(pack!);
    expect(knowledge).toBe('');
    expect(rules).toBe('');
  });

  it('handles non-existent directories gracefully', async () => {
    const pack = {
      id: 'fake', name: 'fake', version: '1.0.0', description: '',
      category: '', requiredTools: [], systemPrompt: '',
      knowledgeDir: '/nonexistent/path/knowledge',
      rulesDir: '/nonexistent/path/rules',
    };
    const result = await loadSkillContent(pack);
    expect(result.knowledge).toBe('');
    expect(result.rules).toBe('');
  });
});

describe('loadIncrementalArea', () => {
  it('loads addon, rules, and knowledge from incremental dir', async () => {
    const incDir = resolve(FIXTURES_DIR, 'test-incremental');
    const result = await loadIncrementalArea(incDir);

    expect(result.addon).toContain('Additional instructions');
    expect(result.addon).toContain('run tests before committing');

    expect(result.rules).toHaveLength(1);
    expect(result.rules[0]).toContain('commit without tests');
    expect(result.rules[0]).toContain('Run test suite first');

    expect(result.knowledge).toHaveLength(1);
    expect(result.knowledge[0]).toContain('server components');
  });

  it('returns empty results for non-existent directory', async () => {
    const result = await loadIncrementalArea('/nonexistent/incremental');
    expect(result.addon).toBe('');
    expect(result.rules).toEqual([]);
    expect(result.knowledge).toEqual([]);
  });

  it('skips rejected and pending_review rules', async () => {
    const { mkdtemp, writeFile, mkdir } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const dir = await mkdtemp(join(tmpdir(), 'inc-test-'));
    const rulesDir = join(dir, 'rules');
    await mkdir(rulesDir, { recursive: true });

    await writeFile(join(rulesDir, 'good.yaml'),
      'trigger_condition: "deploy check"\naction: "run tests"\n', 'utf-8');
    await writeFile(join(rulesDir, 'bad.yaml'),
      'trigger_condition: "hotfix"\naction: "skip tests"\nstatus: rejected\n', 'utf-8');
    await writeFile(join(rulesDir, 'pending.yaml'),
      'trigger_condition: "refactor"\naction: "write tests first"\nstatus: pending_review\n', 'utf-8');

    const result = await loadIncrementalArea(dir);
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0]).toContain('deploy check');
    expect(result.rules[0]).toContain('run tests');
  });
});

describe('parseYaml', () => {
  it('parses simple key-value pairs', () => {
    const result = parseYaml('name: test\nversion: 1.0.0');
    expect(result.name).toBe('test');
    expect(result.version).toBe('1.0.0');
  });

  it('parses list values', () => {
    const result = parseYaml('tools:\n  - read_file\n  - write_file');
    expect(result.tools).toEqual(['read_file', 'write_file']);
  });

  it('handles quoted values', () => {
    const result = parseYaml('name: "quoted value"');
    expect(result.name).toBe('quoted value');
  });
});
