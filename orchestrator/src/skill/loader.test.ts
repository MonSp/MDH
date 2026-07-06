import { describe, it, expect, beforeEach } from 'vitest';
import { resolve } from 'node:path';
import { loadSkillPacks, getSkillPack, resetCache } from './loader.js';

const PACKS_DIR = resolve('/home/test/MDH/skill_packs');

beforeEach(() => {
  resetCache();
});

describe('loadSkillPacks', () => {
  it('loads all packs from the skill_packs directory', async () => {
    const packs = await loadSkillPacks(PACKS_DIR);
    expect(packs.size).toBe(5);
    expect(packs.has('frontend_dev')).toBe(true);
    expect(packs.has('backend_dev')).toBe(true);
    expect(packs.has('code_review')).toBe(true);
    expect(packs.has('task_decomposition')).toBe(true);
    expect(packs.has('testing')).toBe(true);
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
    expect(pack!.knowledgeDir).toBeDefined();
    expect(pack!.rulesDir).toBeDefined();
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
